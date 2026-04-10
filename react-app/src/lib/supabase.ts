import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from './config'

let sb: SupabaseClient | null = null

export function initSupabase(): SupabaseClient | null {
  const cfg = getConfig()
  if (!cfg || !cfg.supabase_url || !cfg.supabase_key) return null
  if (!sb) sb = createClient(cfg.supabase_url, cfg.supabase_key)
  return sb
}

export function getSupabase(): SupabaseClient | null {
  return sb || initSupabase()
}

export interface CgmReading {
  device_timestamp: string
  glucose_mg_dl: number
}

export interface DailyRecord {
  record_date: string
  fasting_glucose: number | null
  post_meal_glucose: number | null
  systolic_bp: number | null
  diastolic_bp: number | null
  weight_lbs: number | null
  hba1c: number | null
  notes: string | null
}

export async function fetchCgmData(userId: number, from?: string, to?: string): Promise<CgmReading[]> {
  const sb = getSupabase()
  if (!sb) return []
  let q = sb.from('cgm_readings').select('device_timestamp,glucose_mg_dl')
    .eq('user_id', userId)
    .not('glucose_mg_dl', 'is', null)
    .order('device_timestamp', { ascending: false }).limit(8000)
  if (from) q = q.gte('device_timestamp', from)
  if (to) q = q.lte('device_timestamp', to)
  const { data, error } = await q
  if (error || !data) return []
  return (data as CgmReading[]).reverse()
}

export async function fetchDailyRecords(userId: number): Promise<DailyRecord[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.from('daily_records').select('*')
    .eq('user_id', userId)
    .order('record_date', { ascending: false }).limit(60)
  if (error || !data) return []
  return data as DailyRecord[]
}

export async function fetchAllCgmGlucose(userId: number): Promise<number[]> {
  const sb = getSupabase()
  if (!sb) return []
  const pageSize = 1000
  let all: number[] = [], from = 0
  while (true) {
    const { data, error } = await sb.from('cgm_readings')
      .select('glucose_mg_dl')
      .eq('user_id', userId)
      .not('glucose_mg_dl', 'is', null)
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    all.push(...data.map((d: { glucose_mg_dl: number }) => d.glucose_mg_dl))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function upsertDailyRecord(userId: number, record: Partial<DailyRecord>) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not connected')
  const { error } = await sb.from('daily_records').upsert(
    { ...record, user_id: userId },
    { onConflict: 'user_id,record_date' }
  )
  if (error) throw error
}

export async function upsertCgmBatch(userId: number, batch: { device_timestamp: string; glucose_mg_dl: number }[]) {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not connected')
  const rows = batch.map(r => ({ ...r, user_id: userId }))
  const { error } = await sb.from('cgm_readings').upsert(rows, { onConflict: 'user_id,device_timestamp', ignoreDuplicates: true })
  if (error) throw error
}
