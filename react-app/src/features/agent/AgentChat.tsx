import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { callAi, getAiProvider, parseAiStream } from '../../lib/ai-client'
import type { ToolDef, StreamToolCall } from '../../lib/ai-client'
import { getSupabase } from '../../lib/supabase'
import { getActiveMeds } from '../../lib/storage'
import { useApp } from '../../contexts/AppContext'
import {
  listSessions, createSession, deleteSession, updateSessionTitle,
  loadMessages, saveMessage
} from '../../lib/chat'
import type { ChatSession } from '../../lib/chat'

/* ── Tool definitions ── */
const TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'query_cgm_readings', description: '查询CGM血糖数据', parameters: { type: 'object', properties: { from_date: { type: 'string', description: '开始日期 YYYY-MM-DD' }, to_date: { type: 'string', description: '结束日期 YYYY-MM-DD' }, limit: { type: 'number', description: '上限，默认500' } } } } },
  { type: 'function', function: { name: 'query_daily_records', description: '查询每日健康记录', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' }, limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_medications', description: '获取当前用药列表', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'compute_cgm_stats', description: '计算CGM统计：TIR、均值、标准差等', parameters: { type: 'object', properties: { from_date: { type: 'string' }, to_date: { type: 'string' } } } } },
]

interface Msg { role: 'user' | 'assistant' | 'tool'; content: string }

const SUGGESTIONS = [
  { icon: '📊', text: '最近一周血糖控制如何？' },
  { icon: '🎯', text: '我的 TIR 达标率是多少？' },
  { icon: '💊', text: '查看我的用药记录' },
  { icon: '📈', text: '分析最近的体重变化趋势' },
]

/* ── Tool executor ── */
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

/* ── Markdown renderer ── */
function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (props) => <p className="mb-3 last:mb-0 leading-[1.75]" {...props} />,
        h1: (props) => <h1 className="text-lg font-semibold text-text mb-2 mt-5 first:mt-0" {...props} />,
        h2: (props) => <h2 className="text-base font-semibold text-text mb-2 mt-4 first:mt-0" {...props} />,
        h3: (props) => <h3 className="text-[14px] font-semibold text-text mb-1.5 mt-3 first:mt-0" {...props} />,
        ul: (props) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
        ol: (props) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
        li: (props) => <li className="text-text/85 leading-[1.7]" {...props} />,
        strong: (props) => <strong className="font-semibold text-text" {...props} />,
        em: (props) => <em className="text-text/70" {...props} />,
        a: ({ href, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold underline underline-offset-2 decoration-gold/30 hover:decoration-gold/60 transition-colors" {...props} />,
        blockquote: (props) => <blockquote className="border-l-2 border-gold/25 pl-4 my-3 text-text/65 italic" {...props} />,
        hr: () => <hr className="border-border my-5" />,
        pre: (props) => <pre className="bg-surface2 border border-border rounded-xl p-4 my-3 overflow-x-auto text-[13px] leading-relaxed" {...props} />,
        code: ({ className, children: c, ...props }) => {
          const isBlock = className?.startsWith('language-') || (typeof (props.node as any)?.position?.start?.line === 'number' && (props.node as any)?.parent?.type === 'element')
          if (isBlock) return <code className="font-mono text-text/80" {...props}>{c}</code>
          return <code className="bg-surface3 text-gold/80 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>{c}</code>
        },
        table: (props) => <div className="overflow-x-auto my-3 rounded-lg border border-border"><table className="w-full text-[13px] border-collapse" {...props} /></div>,
        thead: (props) => <thead className="bg-surface2" {...props} />,
        th: (props) => <th className="border-b border-border px-3 py-2 text-left text-text/80 font-medium" {...props} />,
        td: (props) => <td className="border-b border-border px-3 py-2 text-text/70" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
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
  const [streamingText, setStreamingText] = useState('')
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
      // Rebuild AI history: keep user + assistant for context, skip tool display labels
      // (tool results were ephemeral and not stored in a way the API can reuse,
      //  so we only keep user/assistant turns for conversational continuity)
      historyRef.current = rows
        .filter(r => r.role === 'user' || r.role === 'assistant')
        .map(r => ({ role: r.role as string, content: r.content }))
    })
  }, [activeSessionId])

  /* Auto-scroll */
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing, streamingText])

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

  /* ── Send message (streaming) ── */
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

    const sys = `你是一个智能健康助手，可以陪用户聊天、回答各种问题，也可以通过工具查询用户的健康数据（血糖、日常记录、用药等）进行分析。

重要规则：
- 只有当用户明确要求查看或分析健康数据时，才使用工具查询。日常闲聊、知识问答等不需要调用工具。
- 用中文回答，善用 Markdown 格式（标题、列表、加粗、表格等）让回答结构清晰。
- 今天是 ${new Date().toISOString().slice(0, 10)}。
- 保持友好、专业的语气，像一个贴心的健康顾问。`

    try {
      for (let round = 0; round < 6; round++) {
        setTyping(round === 0 ? '思考中...' : '分析数据...')

        const r = await callAi({
          model: 'claude-sonnet-4-6', system: sys,
          messages: historyRef.current, max_tokens: 1500,
          tools: TOOLS, stream: true,
        })
        if (!r || !r.res.ok) {
          const errBody = await r?.res?.text().catch(() => '')
          throw new Error(errBody || `HTTP ${r?.res?.status}`)
        }

        /* Stream the response */
        setTyping('')
        let streamText = ''
        const toolCalls: StreamToolCall[] = []

        for await (const ev of parseAiStream(r.res, r.format)) {
          if (ev.type === 'text') {
            streamText += ev.text
            setStreamingText(streamText)
          } else if (ev.type === 'tool_call') {
            toolCalls.push(ev.toolCall)
          }
        }
        setStreamingText('')

        /* Handle tool calls */
        if (toolCalls.length > 0) {
          // Save any streamed text that preceded tool calls
          if (streamText) {
            setMessages(m => [...m, { role: 'assistant', content: streamText }])
            await saveMessage(sid!, 'assistant', streamText)
          }

          if (r.format === 'openai') {
            historyRef.current.push({
              role: 'assistant', content: streamText || null,
              tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }))
            })
            for (const tc of toolCalls) {
              setTyping(`查询 ${tc.name}...`)
              const toolLabel = `🔧 ${tc.name}(${JSON.stringify(tc.args)})`
              setMessages(m => [...m, { role: 'tool', content: toolLabel }])
              await saveMessage(sid!, 'tool', toolLabel)
              const result = await execTool(tc.name, tc.args, user.id)
              historyRef.current.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
              const resultLabel = `📊 返回 ${result.count !== undefined ? result.count + ' 条数据' : JSON.stringify(result).slice(0, 100)}`
              setMessages(m => [...m, { role: 'tool', content: resultLabel }])
              await saveMessage(sid!, 'tool', resultLabel)
            }
          } else {
            // Anthropic history format
            const blocks: any[] = []
            if (streamText) blocks.push({ type: 'text', text: streamText })
            for (const tc of toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
            historyRef.current.push({ role: 'assistant', content: blocks })

            for (const tc of toolCalls) {
              setTyping(`查询 ${tc.name}...`)
              const toolLabel = `🔧 ${tc.name}`
              setMessages(m => [...m, { role: 'tool', content: toolLabel }])
              await saveMessage(sid!, 'tool', toolLabel)
              const result = await execTool(tc.name, tc.args, user.id)
              historyRef.current.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result) }] })
            }
          }
          continue // next round
        }

        /* Text-only response — finalize */
        if (streamText) {
          historyRef.current.push({ role: 'assistant', content: streamText })
          setMessages(m => [...m, { role: 'assistant', content: streamText }])
          await saveMessage(sid!, 'assistant', streamText)
          if (sessions.find(s => s.id === sid)?.title === '新对话') {
            const title = streamText.slice(0, 30).replace(/\n/g, ' ')
            updateSessionTitle(sid!, title)
            setSessions(prev => prev.map(s => s.id === sid ? { ...s, title } : s))
          }
        }
        break
      }
    } catch (e: any) {
      setStreamingText('')
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
              <button
                onClick={() => setShowSidebar(true)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer bg-transparent border-none"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>

              <div className="flex-1 text-center">
                <span className="text-[13px] font-medium text-text/90 truncate">
                  {activeSessionId
                    ? sessions.find(s => s.id === activeSessionId)?.title || 'AI 助手'
                    : '新对话'}
                </span>
              </div>

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
              {/* Sidebar */}
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

              {/* ── Chat area ── */}
              <div className="h-full overflow-y-auto scroll-smooth">
                {showWelcome ? (
                  /* Welcome */
                  <div className="flex flex-col items-center justify-center min-h-full px-6 pb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/10 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(200,169,125,0.08)]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gold">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" opacity="0.2" />
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="text-[22px] font-light text-text tracking-tight mb-1.5">有什么我可以帮你的？</h2>
                    <p className="text-sm text-muted mb-10 text-center leading-relaxed">我可以分析你的血糖数据、查看健康记录和用药信息</p>
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
                          <span className="text-[12px] text-muted/80 group-hover:text-text/70 transition-colors leading-relaxed">{s.text}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Messages */
                  <div className="flex flex-col px-4 py-5 max-w-[680px] mx-auto">
                    {messages.map((m, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      >
                        {m.role === 'user' ? (
                          <div className="flex justify-end mb-5">
                            <div className="max-w-[82%] bg-gold/12 border border-gold/8 text-text rounded-[20px] rounded-br-md px-4 py-3 text-[14px] leading-relaxed">
                              {m.content}
                            </div>
                          </div>
                        ) : m.role === 'tool' ? (
                          <div className="flex items-center gap-2 ml-1 mb-2">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface2/60 text-[11px] text-muted/50">
                              <span className="w-1 h-1 rounded-full bg-gold/50" />
                              {m.content}
                            </div>
                          </div>
                        ) : (
                          <div className="mb-6 pl-1 text-[14px] text-text/85 leading-[1.75] markdown-body">
                            <Md>{m.content}</Md>
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {/* Streaming text (typewriter) */}
                    {streamingText && (
                      <div className="mb-6 pl-1 text-[14px] text-text/85 leading-[1.75] markdown-body">
                        <Md>{streamingText}</Md>
                        <span className="inline-block w-[2px] h-[18px] bg-gold/70 animate-[blink_1s_infinite] ml-0.5 align-text-bottom rounded-full" />
                      </div>
                    )}

                    {/* Typing indicator */}
                    {typing && !streamingText && (
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

            {/* ── Input ── */}
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
