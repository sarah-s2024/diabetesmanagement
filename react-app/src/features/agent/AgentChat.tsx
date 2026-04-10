import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { callAi, getAiProvider } from '../../lib/ai-client'
import type { ToolDef } from '../../lib/ai-client'
import { getSupabase } from '../../lib/supabase'
import { getActiveMeds } from '../../lib/storage'
import { useApp } from '../../contexts/AppContext'
import {
  listSessions, createSession, deleteSession, updateSessionTitle,
  loadMessages, saveMessage
} from '../../lib/chat'
import type { ChatSession } from '../../lib/chat'

const TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'query_cgm_readings', description: '查询CGM血糖数据', parameters: { type: 'object', properties: { from_date: { type: 'string', description: '开始日期 YYYY-MM-DD' }, to_date: { type: 'string', description: '结束日期 YYYY-MM-DD' }, limit: { type: 'number', description: '上限，默认500' } } } } },
  { type: 'function', function: { name: 'query_daily_records', description: '查询每日健康记录', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' }, limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_medications', description: '获取当前用药列表', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'compute_cgm_stats', description: '计算CGM统计：TIR、均值、标准差等', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' } } } } },
]

interface Msg { role: 'user' | 'assistant' | 'tool'; content: string }

const WELCOME: Msg = { role: 'assistant', content: '你好！我是你的 AI 健康助手。\n\n试试问我：\n- 最近一周的血糖控制怎么样？\n- 我的 TIR 达标率是多少？\n- 帮我分析最近的体重变化趋势' }

async function execTool(name: string, args: Record<string, any>, userId: number): Promise<any> {
  const sb = getSupabase()
  if (!sb) return { error: 'Supabase 未连接' }
  if (name === 'query_cgm_readings') {
    let q = sb.from('cgm_readings').select('device_timestamp,glucose_mg_dl').eq('user_id', userId).not('glucose_mg_dl', 'is', null).order('device_timestamp', { ascending: false }).limit(args.limit || 500)
    if (args.from_date) q = q.gte('device_timestamp', args.from_date)
    if (args.to_date) q = q.lte('device_timestamp', args.to_date + 'T23:59:59')
    const { data, error } = await q
    if (error) return { error: error.message }
    return { count: data!.length, readings: data!.reverse() }
  }
  if (name === 'query_daily_records') {
    let q = sb.from('daily_records').select('*').eq('user_id', userId).order('record_date', { ascending: false }).limit(args.limit || 60)
    if (args.from_date) q = q.gte('record_date', args.from_date)
    if (args.to_date) q = q.lte('record_date', args.to_date)
    const { data, error } = await q
    if (error) return { error: error.message }
    return { count: data!.length, records: data }
  }
  if (name === 'get_medications') return { medications: getActiveMeds() }
  if (name === 'compute_cgm_stats') {
    let q = sb.from('cgm_readings').select('glucose_mg_dl').eq('user_id', userId).not('glucose_mg_dl', 'is', null)
    if (args.from_date) q = q.gte('device_timestamp', args.from_date)
    if (args.to_date) q = q.lte('device_timestamp', args.to_date + 'T23:59:59')
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data?.length) return { error: '该时间段无数据' }
    const vals = data.map((d: any) => d.glucose_mg_dl)
    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / vals.length)
    const inRange = vals.filter((v: number) => v >= 70 && v <= 180).length
    return { count: vals.length, avg: Math.round(avg * 10) / 10, sd: Math.round(sd * 10) / 10, tir: Math.round(inRange / vals.length * 100 * 10) / 10, min: Math.min(...vals), max: Math.max(...vals) }
  }
  return { error: '未知工具' }
}

export default function AgentChat() {
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState('')
  const msgEndRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<any[]>([])

  // Load sessions when chat opens
  const refreshSessions = useCallback(async () => {
    if (!user) return
    const list = await listSessions(user.id)
    setSessions(list)
  }, [user])

  useEffect(() => {
    if (open && user) refreshSessions()
  }, [open, user, refreshSessions])

  // Load messages when switching session
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([WELCOME])
      historyRef.current = []
      return
    }
    loadMessages(activeSessionId).then(rows => {
      if (!rows.length) { setMessages([WELCOME]); historyRef.current = []; return }
      const msgs: Msg[] = rows.map(r => ({ role: r.role as Msg['role'], content: r.content }))
      setMessages(msgs)
      // Rebuild AI history (only user + assistant for context)
      historyRef.current = rows
        .filter(r => r.role === 'user' || r.role === 'assistant')
        .map(r => ({ role: r.role, content: r.content }))
    })
  }, [activeSessionId])

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const startNewChat = async () => {
    if (!user) return
    const s = await createSession(user.id)
    setSessions(prev => [s, ...prev])
    setActiveSessionId(s.id)
    setShowSidebar(false)
  }

  const selectSession = (s: ChatSession) => {
    setActiveSessionId(s.id)
    setShowSidebar(false)
  }

  const removeSession = async (id: number) => {
    await deleteSession(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) { setActiveSessionId(null) }
  }

  const send = async () => {
    if (busy || !input.trim() || !user) return
    if (!getAiProvider()) { setMessages(m => [...m, { role: 'assistant', content: '请先配置 API Key' }]); return }

    const text = input.trim()
    setInput('')

    // Auto-create session if none active
    let sid = activeSessionId
    if (!sid) {
      const s = await createSession(user.id, text.slice(0, 30))
      setSessions(prev => [s, ...prev])
      sid = s.id
      setActiveSessionId(s.id)
    }

    setMessages(m => [...m, { role: 'user', content: text }])
    historyRef.current.push({ role: 'user', content: text })
    await saveMessage(sid, 'user', text)
    setBusy(true)

    const sys = `你是糖尿病健康数据助手。今天是${new Date().toISOString().slice(0, 10)}。通过工具查询数据后给出分析。用中文回答。`

    try {
      for (let round = 0; round < 6; round++) {
        setTyping(round === 0 ? '思考中...' : '分析数据...')
        const r = await callAi({ model: 'claude-sonnet-4-6', system: sys, messages: historyRef.current, max_tokens: 1500, tools: TOOLS })
        if (!r || !r.res.ok) throw new Error(`HTTP ${r?.res?.status}`)
        const data = await r.res.json()

        if (r.format === 'openai') {
          const msg = data.choices?.[0]?.message
          if (msg?.tool_calls?.length) {
            historyRef.current.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls })
            for (const tc of msg.tool_calls) {
              const args = JSON.parse(tc.function.arguments || '{}')
              setTyping(`查询 ${tc.function.name}...`)
              const toolLabel = `🔧 ${tc.function.name}(${JSON.stringify(args)})`
              setMessages(m => [...m, { role: 'tool', content: toolLabel }])
              await saveMessage(sid!, 'tool', toolLabel)
              const result = await execTool(tc.function.name, args, user.id)
              historyRef.current.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
              const resultLabel = `📊 返回 ${result.count !== undefined ? result.count + ' 条数据' : JSON.stringify(result).slice(0, 100)}`
              setMessages(m => [...m, { role: 'tool', content: resultLabel }])
              await saveMessage(sid!, 'tool', resultLabel)
            }
            continue
          }
          const reply = msg?.content || ''
          if (reply) {
            historyRef.current.push({ role: 'assistant', content: reply })
            setMessages(m => [...m, { role: 'assistant', content: reply }])
            await saveMessage(sid!, 'assistant', reply)
            // Auto-update session title from first assistant reply
            if (sessions.find(s => s.id === sid)?.title === '新对话') {
              const title = reply.slice(0, 30).replace(/\n/g, ' ')
              updateSessionTitle(sid!, title)
              setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s))
            }
          }
          break
        } else {
          // Anthropic format
          const contents = data.content || []
          const toolUses = contents.filter((c: any) => c.type === 'tool_use')
          const textParts = contents.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
          if (toolUses.length) {
            historyRef.current.push({ role: 'assistant', content: contents })
            for (const tu of toolUses) {
              setTyping(`查询 ${tu.name}...`)
              const toolLabel = `🔧 ${tu.name}`
              setMessages(m => [...m, { role: 'tool', content: toolLabel }])
              await saveMessage(sid!, 'tool', toolLabel)
              const result = await execTool(tu.name, tu.input, user.id)
              historyRef.current.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) }] })
            }
            continue
          }
          if (textParts) {
            historyRef.current.push({ role: 'assistant', content: textParts })
            setMessages(m => [...m, { role: 'assistant', content: textParts }])
            await saveMessage(sid!, 'assistant', textParts)
          }
          break
        }
      }
    } catch (e: any) {
      const errMsg = '请求失败：' + e.message
      setMessages(m => [...m, { role: 'assistant', content: errMsg }])
      await saveMessage(sid!, 'assistant', errMsg)
    }
    setBusy(false); setTyping('')
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px)+16px)] right-4 w-[52px] h-[52px] rounded-full border border-gold/20 bg-surface text-gold shadow-[0_4px_24px_rgba(200,169,125,0.15)] cursor-pointer z-[800] flex items-center justify-center active:scale-90 transition-transform hover:bg-surface2"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed inset-0 z-[900] flex flex-col bg-bg"
          >
            {/* Header */}
            <div className="flex items-center px-4 py-3 gap-2 bg-surface border-b border-border">
              <button onClick={() => setShowSidebar(!showSidebar)}
                className="w-8 h-8 rounded-lg bg-surface2 border border-border text-muted flex items-center justify-center cursor-pointer text-sm flex-shrink-0 hover:text-text">
                ☰
              </button>
              <h3 className="flex-1 text-sm font-semibold truncate">
                {activeSessionId ? sessions.find(s => s.id === activeSessionId)?.title || 'AI 健康助手' : 'AI 健康助手'}
              </h3>
              <button onClick={startNewChat}
                className="px-2.5 py-1 rounded-lg bg-gold/10 text-gold text-xs font-medium cursor-pointer border-none hover:bg-gold/20">
                + 新对话
              </button>
              <button onClick={() => setOpen(false)}
                className="bg-transparent border-none text-muted text-xl cursor-pointer p-1 leading-none">×</button>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
              {/* Sidebar */}
              <AnimatePresence>
                {showSidebar && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setShowSidebar(false)}
                      className="absolute inset-0 bg-black/30 z-10"
                    />
                    <motion.div
                      initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                      className="absolute left-0 top-0 bottom-0 w-[260px] bg-surface border-r border-border z-20 flex flex-col"
                    >
                      <div className="p-3 border-b border-border">
                        <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">历史对话</div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {sessions.length === 0 ? (
                          <div className="text-sm text-muted text-center py-8">暂无历史对话</div>
                        ) : sessions.map(s => (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border2 transition-colors group
                              ${s.id === activeSessionId ? 'bg-gold/10' : 'hover:bg-surface2'}`}
                          >
                            <div className="flex-1 min-w-0" onClick={() => selectSession(s)}>
                              <div className={`text-sm truncate ${s.id === activeSessionId ? 'font-semibold text-gold' : 'text-text'}`}>
                                {s.title}
                              </div>
                              <div className="text-[10px] text-muted mt-0.5">{formatTime(s.updated_at)}</div>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); removeSession(s.id) }}
                              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded bg-red-dim text-red text-xs border-none cursor-pointer flex items-center justify-center flex-shrink-0 transition-opacity"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div key={i} className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                    ${m.role === 'user' ? 'self-end bg-gold/90 text-bg rounded-br-sm' :
                      m.role === 'tool' ? 'self-start bg-surface3 text-muted text-[11px] border-l-[3px] border-gold/40 px-2.5 py-1.5 font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto max-w-[92%]' :
                      'self-start bg-surface2 text-text rounded-bl-sm'}`}
                  >
                    {m.role === 'assistant' ? <div className="whitespace-pre-wrap">{m.content}</div> : m.content}
                  </div>
                ))}
                {typing && (
                  <div className="self-start text-muted text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted animate-[blink_1.4s_infinite]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted animate-[blink_1.4s_infinite_0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted animate-[blink_1.4s_infinite_0.4s]" />
                    <span className="ml-1">{typing}</span>
                  </div>
                )}
                <div ref={msgEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="flex gap-2 p-4 bg-surface border-t border-border pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="输入你的问题..."
                rows={1}
                className="flex-1 bg-surface2 border border-border rounded-xl text-text py-2.5 px-3 text-sm resize-none min-h-[40px] max-h-[120px] font-inherit leading-normal outline-none"
              />
              <button onClick={send} disabled={busy}
                className="w-10 h-10 rounded-full border-none bg-gold text-bg text-lg cursor-pointer flex-shrink-0 flex items-center justify-center self-end disabled:opacity-40">
                ↑
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
