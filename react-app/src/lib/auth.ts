import CryptoJS from 'crypto-js'
import { getSupabase } from './supabase'

export interface User {
  id: number
  username: string
  display_name: string
  height_cm: number
  created_at: string
}

function hashPassword(password: string): string {
  return CryptoJS.SHA256(password).toString()
}

export async function register(username: string, password: string, displayName?: string): Promise<User> {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库未连接')

  if (!username.trim() || !password.trim()) throw new Error('用户名和密码不能为空')
  if (password.length < 4) throw new Error('密码至少 4 位')

  const hash = hashPassword(password)
  const { data, error } = await sb.from('users').insert({
    username: username.trim(),
    password_hash: hash,
    display_name: displayName?.trim() || username.trim(),
  }).select().single()

  if (error) {
    if (error.code === '23505') throw new Error('用户名已存在')
    throw new Error(error.message)
  }
  return data as User
}

export async function login(username: string, password: string): Promise<User> {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库未连接')

  if (!username.trim() || !password.trim()) throw new Error('请输入用户名和密码')

  const hash = hashPassword(password)
  const { data, error } = await sb.from('users')
    .select('id, username, display_name, height_cm, created_at')
    .eq('username', username.trim())
    .eq('password_hash', hash)
    .single()

  if (error || !data) throw new Error('用户名或密码错误')
  return data as User
}

export async function updateUser(id: number, updates: Partial<Pick<User, 'display_name' | 'height_cm'>>): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库未连接')
  const { error } = await sb.from('users').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

const SESSION_KEY = 'dm_user_session'

export function saveSession(user: User) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function loadSession(): User | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
