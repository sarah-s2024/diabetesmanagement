import { getSupabase } from './supabase'

export interface ChatSession {
  id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  session_id: number
  role: string
  content: string
  created_at: string
}

export async function listSessions(userId: number): Promise<ChatSession[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb.from('chat_sessions')
    .select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(50)
  return (data || []) as ChatSession[]
}

export async function createSession(userId: number, title?: string): Promise<ChatSession> {
  const sb = getSupabase()
  if (!sb) throw new Error('未连接')
  const { data, error } = await sb.from('chat_sessions')
    .insert({ user_id: userId, title: title || '新对话' })
    .select().single()
  if (error) throw error
  return data as ChatSession
}

export async function updateSessionTitle(sessionId: number, title: string) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('chat_sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId)
}

export async function deleteSession(sessionId: number) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('chat_sessions').delete().eq('id', sessionId)
}

export async function loadMessages(sessionId: number): Promise<ChatMessage[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb.from('chat_messages')
    .select('*').eq('session_id', sessionId)
    .order('created_at', { ascending: true }).limit(200)
  return (data || []) as ChatMessage[]
}

export async function saveMessage(sessionId: number, role: string, content: string): Promise<ChatMessage> {
  const sb = getSupabase()
  if (!sb) throw new Error('未连接')
  // Also bump session updated_at
  await sb.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
  const { data, error } = await sb.from('chat_messages')
    .insert({ session_id: sessionId, role, content })
    .select().single()
  if (error) throw error
  return data as ChatMessage
}
