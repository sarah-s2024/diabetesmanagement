import CryptoJS from 'crypto-js'
import yaml from 'js-yaml'

const SECRET = import.meta.env.VITE_SECRET_KEY || ''

export interface AppConfig {
  supabase_url: string
  supabase_key: string
  claude_key: string
  openrouter_key: string
  app_password: string
  height_cm: number
}

let cached: AppConfig | null = null

function decrypt(ciphertext: string): string {
  if (!ciphertext || !SECRET) return ''
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch {
    return ''
  }
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached
  try {
    const res = await fetch('/config.yaml')
    if (!res.ok) throw new Error('config.yaml not found')
    const text = await res.text()
    const raw = yaml.load(text) as Record<string, string>
    cached = {
      supabase_url: decrypt(raw.supabase_url),
      supabase_key: decrypt(raw.supabase_key),
      claude_key: decrypt(raw.claude_key),
      openrouter_key: decrypt(raw.openrouter_key),
      app_password: decrypt(raw.app_password),
      height_cm: parseFloat(decrypt(raw.height_cm)) || 170,
    }
  } catch {
    // Fallback: no config.yaml yet, return empty
    cached = {
      supabase_url: '', supabase_key: '', claude_key: '',
      openrouter_key: '', app_password: '', height_cm: 170,
    }
  }
  return cached
}

export function getConfig(): AppConfig | null {
  return cached
}

export function clearConfigCache() {
  cached = null
}
