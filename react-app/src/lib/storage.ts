import CryptoJS from 'crypto-js'

const SECRET = import.meta.env.VITE_SECRET_KEY || 'fallback-key'

export function encryptSet(key: string, value: string) {
  const encrypted = CryptoJS.AES.encrypt(value, SECRET).toString()
  localStorage.setItem(key, encrypted)
}

export function decryptGet(key: string): string | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const bytes = CryptoJS.AES.decrypt(raw, SECRET)
    return bytes.toString(CryptoJS.enc.Utf8) || null
  } catch {
    return null
  }
}

// Medications stored encrypted
export interface Medication {
  id: number
  cat: string
  drug: string
  dose: string
  startDate: string
  stopDate?: string
}

const MEDS_KEY = 'dm_medications'
const HEIGHT_KEY = 'dm_height_cm'

export function getMeds(): Medication[] {
  const raw = decryptGet(MEDS_KEY)
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function saveMeds(meds: Medication[]) {
  encryptSet(MEDS_KEY, JSON.stringify(meds))
}

export function getActiveMeds(): Medication[] {
  const today = new Date().toISOString().slice(0, 10)
  return getMeds().filter(m => !m.stopDate || m.stopDate >= today)
}

export function getHeight(): number {
  const h = decryptGet(HEIGHT_KEY)
  return h ? parseFloat(h) : 0
}

export function setHeight(cm: number) {
  encryptSet(HEIGHT_KEY, String(cm))
}
