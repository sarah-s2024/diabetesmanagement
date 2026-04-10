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

/* ── Tool definitions (unchanged) ── */
const TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'query_cgm_readings', description: '查询CGM血糖数据', parameters: { type: 'object', properties: { from_date: { type: 'string', description: '开始日期 YYYY-MM-DD' }, to_date: { type: 'string', description: '结束日期 YYYY-MM-DD' }, limit: { type: 'number', description: '上限，默认500' } } } } },
  { type: 'function', function: { name: 'query_daily_records', description: '查询每日健康记录', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' }, limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_medications', description: '获取当前用药列表', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'compute_cgm_stats', description: '计算CGM统计：TIR、均值、标准差等', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' } } } } },
]

interface Msg { role: 'user' | 'assistant' | 'tool'; content: string }

/* ── Suggestion cards for empty state ── */
const SUGGESTIONS = [
  { icon: '📊', text: '最近一周血糖控制如何？' },
  { icon: '🎯', text: '我的 TIR 达标率是多少？' },
  { icon: '💊', text: '查看我的用药记录' },
  { icon: '📈', text: '分析最近的体重变化趋势' },
]

/* ── Tool executor (unchanged) ── */
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

/* ── Group sessions by date ── */
function groupSessionsByDate(sessions: ChatSession[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const todayItems: ChatSession[] = []
  const yesterdayItems: ChatSession[] = []
  const weekItems: ChatSession[] = []
  const olderItems: ChatSession[] = []

  for (const s of sessions) {
    const d = new Date(s.updated_at)
    if (d >= today) todayItems.push(s)
    else if (d >= yesterday) yesterdayItems.push(s)
    else if (d >= weekAgo) weekItems.push(s)
    else olderItems.push(s)
  }

  const groups: { label: string; items: ChatSession[] }[] = []
  if (todayItems.length) groups.push({ label: '今天', items: todayItems })
  if (yesterdayItems.length) groups.push({ label: '昨天', items: yesterdayItems })
  if (weekItems.length) groups.push({ label: '最近 7 天', items: weekItems })
  if (olderItems.length) groups.push({ label: '更早', items: olderItems })
  return groups
}

/* ══════════════════════════════════════════════════
   AgentChat — Claude.ai inspired design
   ══════════════════════════════════════════════════ */
export default function AgentChat() {
  const { user, chatOpen: open, setChatOpen: setOpen } = useApp()
  const [showSidebar, setShowSidebar] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState('')
  const msgEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<any[]>([])

  const showWelcome = messages.length === 0 && !busy

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px' }
  }, [input])

  /* Load sessions */
  const refreshSessions = useCallback(async () => {
    if (!user) return
    const list = await listSessions(user.id)
    setSessions(list)
  }, [user])

  useEffect(() => { if (open && user) refreshSessions() }, [open, user, refreshSessions])

  /* Load messages when switching session */
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); historyRef.current = []; return }
    loadMessages(activeSessionId).then(rows => {
      if (!rows.length) { setMessages([]); historyRef.current = []; return }
      setMessages(rows.map(r => ({ role: r.role as Msg['role'], content: r.content })))
      historyRef.current = rows
        .filter(r => r.role === 'user' || r.role === 'assistant')
        .map(r => ({ role: r.role, content: r.content }))
    })
  }, [activeSessionId])

  /* Auto-scroll to bottom */
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  const startNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
    historyRef.current = []
    setShowSidebar(false)
  }

  const selectSession = (s: ChatSession) => { setActiveSessionId(s.id); setShowSidebar(false) }

  const removeSession = async (id: number) => {
    await deleteSession(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); historyRef.current = [] }
  }

  /* ── Send message ── */
  const send = async (overrideText?: string) => {
    const text = (overrideText || input).trim()
    if (busy || !text || !user) return
    if (!getAiProvider()) { setMessages(m => [...m, { role: 'assistant', content: '请先在设置中配置 API Key' }]); return }
    if (!overrideText) setInput('')

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
            if (sessions.find(s => s.id === sid)?.title === '新对话') {
              const title = reply.slice(0, 30).replace(/\n/g, ' ')
              updateSessionTitle(sid!, title)
              setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s))
            }
          }
          break
        } else {
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

  const sessionGroups = groupSessionsByDate(sessions)

  return (
    <>
      {/* ═══ Full-screen Chat ═══ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[900] flex flex-col bg-bg"
          >
            {/* ── Header ── */}
            <header className="flex items-center justify-between px-3 h-13 shrink-0 border-b border-border bg-bg/80 backdrop-blur-xl">
              {/* Left */}
              <button
                onClick={() => setShowSidebar(true)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer bg-transparent border-none"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>

              {/* Center */}
              <div className="flex-1 text-center">
                <span className="text-[13px] font-medium text-text/90 truncate">
                  {activeSessionId
                    ? sessions.find(s => s.id === activeSessionId)?.title || 'AI 助手'
                    : '新对话'}
                </span>
              </div>

              {/* Right */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={startNewChat}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer bg-transparent border-none"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z" />
                  </svg>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer bg-transparent border-none"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </header>

            {/* ── Body ── */}
            <div className="flex-1 overflow-hidden relative">

              {/* Sidebar overlay */}
              <AnimatePresence>
                {showSidebar && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setShowSidebar(false)}
                      className="absolute inset-0 bg-black/50 z-30 backdrop-blur-[2px]"
                    />
                    <motion.aside
                      initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                      transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                      className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-surface z-40 flex flex-col shadow-[8px_0_32px_rgba(0,0,0,0.4)]"
                    >
                      {/* Sidebar header */}
                      <div className="flex items-center justify-between px-4 h-13 border-b border-border shrink-0">
                        <span className="text-[13px] font-semibold text-text">对话历史</span>
                        <button
                          onClick={() => setShowSidebar(false)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text cursor-pointer bg-transparent border-none"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {/* New chat in sidebar */}
                      <div className="px-3 pt-3 pb-1">
                        <button
                          onClick={startNewChat}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border bg-transparent text-sm text-text/80 cursor-pointer hover:bg-surface2 hover:border-gold/15 transition-all"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          开始新对话
                        </button>
                      </div>

                      {/* Session list */}
                      <div className="flex-1 overflow-y-auto px-2 py-2">
                        {sessions.length === 0 ? (
                          <div className="text-sm text-muted text-center py-16 px-4 leading-relaxed">
                            还没有对话记录<br />
                            <span className="text-xs text-muted/60">开始你的第一次对话吧</span>
                          </div>
                        ) : sessionGroups.map(group => (
                          <div key={group.label} className="mb-3">
                            <div className="text-[11px] text-muted/60 font-medium px-3 py-2 tracking-wider">
                              {group.label}
                            </div>
                            {group.items.map(s => (
                              <div
                                key={s.id}
                                onClick={() => selectSession(s)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer mb-0.5 group transition-all duration-150
                                  ${s.id === activeSessionId
                                    ? 'bg-gold/8 text-gold'
                                    : 'text-text/70 hover:bg-surface2 hover:text-text/90'}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] truncate leading-snug">{s.title}</div>
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); removeSession(s.id) }}
                                  className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-transparent border-none text-muted hover:text-red cursor-pointer flex items-center justify-center flex-shrink-0 transition-all"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>

              {/* ── Main chat area ── */}
              <div className="h-full overflow-y-auto scroll-smooth">
                {showWelcome ? (
                  /* ═══ Welcome State ═══ */
                  <div className="flex flex-col items-center justify-center min-h-full px-6 pb-8">
                    {/* AI Avatar */}
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/10 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(200,169,125,0.08)]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gold">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" opacity="0.2" />
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <h2 className="text-[22px] font-light text-text tracking-tight mb-1.5">
                      有什么我可以帮你的？
                    </h2>
                    <p className="text-sm text-muted mb-10 text-center leading-relaxed">
                      我可以分析你的血糖数据、查看健康记录和用药信息
                    </p>

                    {/* Suggestion cards */}
                    <div className="grid grid-cols-2 gap-2.5 w-full max-w-[360px]">
                      {SUGGESTIONS.map((s, i) => (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => send(s.text)}
                          className="flex flex-col gap-2.5 p-4 rounded-2xl bg-surface border border-border text-left cursor-pointer hover:border-gold/15 hover:bg-surface2 transition-all duration-200 group"
                        >
                          <span className="text-base">{s.icon}</span>
                          <span className="text-[12px] text-muted/80 group-hover:text-text/70 transition-colors leading-relaxed">
                            {s.text}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ═══ Messages ═══ */
                  <div className="flex flex-col px-4 py-5 max-w-[680px] mx-auto">
                    {messages.map((m, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      >
                        {m.role === 'user' ? (
                          /* User message */
                          <div className="flex justify-end mb-5">
                            <div className="max-w-[82%] bg-gold/12 border border-gold/8 text-text rounded-[20px] rounded-br-md px-4 py-3 text-[14px] leading-relaxed">
                              {m.content}
                            </div>
                          </div>
                        ) : m.role === 'tool' ? (
                          /* Tool indicator — minimal inline */
                          <div className="flex items-center gap-2 ml-1 mb-2">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface2/60 text-[11px] text-muted/50">
                              <span className="w-1 h-1 rounded-full bg-gold/50" />
                              {m.content}
                            </div>
                          </div>
                        ) : (
                          /* Assistant message — no bubble, like Claude.ai */
                          <div className="mb-6 pl-1">
                            <div className="text-[14px] text-text/85 leading-[1.75] whitespace-pre-wrap">
                              {m.content}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {/* Typing indicator */}
                    {typing && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 pl-1 mb-4"
                      >
                        <div className="flex items-center gap-[5px]">
                          <span className="w-[6px] h-[6px] rounded-full bg-gold/50 animate-[blink_1.4s_infinite]" />
                          <span className="w-[6px] h-[6px] rounded-full bg-gold/50 animate-[blink_1.4s_infinite_0.2s]" />
                          <span className="w-[6px] h-[6px] rounded-full bg-gold/50 animate-[blink_1.4s_infinite_0.4s]" />
                        </div>
                        <span className="text-xs text-muted/60">{typing}</span>
                      </motion.div>
                    )}

                    <div ref={msgEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Input Area ── */}
            <div className="shrink-0 px-4 pt-2 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
              <div className="flex items-end gap-2 bg-surface border border-border rounded-2xl pl-4 pr-2 py-2 max-w-[680px] mx-auto transition-colors focus-within:border-gold/20 shadow-[0_-2px_16px_rgba(0,0,0,0.15)]">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="给 AI 助手发消息..."
                  rows={1}
                  disabled={busy}
                  className="flex-1 bg-transparent border-none text-text text-[14px] resize-none min-h-[28px] max-h-[150px] leading-[1.5] outline-none placeholder:text-muted/40 disabled:opacity-50 py-1"
                />
                <button
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  className="w-9 h-9 rounded-xl bg-gold text-bg flex items-center justify-center cursor-pointer border-none flex-shrink-0 disabled:opacity-20 disabled:cursor-default transition-all duration-150 hover:brightness-110 active:scale-93"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>

              {/* Model label */}
              <p className="text-center text-[10px] text-muted/30 mt-2 tracking-wide">
                Claude Sonnet · 数据仅用于分析
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
