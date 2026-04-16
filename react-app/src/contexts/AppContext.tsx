import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { loadConfig, getConfig } from '../lib/config'
import type { AppConfig } from '../lib/config'
import { initSupabase, fetchCgmData, fetchDailyRecords, fetchAllCgmGlucose, fetchMedications } from '../lib/supabase'
import type { CgmReading, DailyRecord, MedicationRecord } from '../lib/supabase'
import { loadSession, saveSession, clearSession } from '../lib/auth'
import type { User } from '../lib/auth'

interface AppState {
  config: AppConfig | null
  loading: boolean
  user: User | null
  activePage: string
  chatOpen: boolean
  cgmData: CgmReading[]
  dailyRecords: DailyRecord[]
  medications: MedicationRecord[]
  gmi: number | null
  connected: boolean
}

interface AppContextType extends AppState {
  onLogin: (user: User) => void
  lock: () => void
  setActivePage: (page: string) => void
  setChatOpen: (open: boolean) => void
  refreshData: () => Promise<void>
  refreshMeds: () => Promise<void>
}

const AppContext = createContext<AppContextType>(null!)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    config: null, loading: true, user: null,
    activePage: 'dashboard', chatOpen: false, cgmData: [], dailyRecords: [],
    gmi: null, connected: false,
  })

  // Keep a ref to user so refreshData always sees latest
  const userRef = useRef<User | null>(null)
  userRef.current = state.user

  useEffect(() => {
    loadConfig().then(cfg => {
      setState(s => ({ ...s, config: cfg, loading: false }))
      if (cfg.supabase_url && cfg.supabase_key) {
        const sb = initSupabase()
        if (sb) setState(s => ({ ...s, connected: true }))
      }
    })
  }, [])

  const refreshData = useCallback(async () => {
    const user = userRef.current
    if (!getConfig()?.supabase_url || !user) return
    const [cgm, daily, allGlucose] = await Promise.all([
      fetchCgmData(user.id), fetchDailyRecords(user.id), fetchAllCgmGlucose(user.id)
    ])
    let gmi: number | null = null
    if (allGlucose.length) {
      const mean = allGlucose.reduce((a, b) => a + b, 0) / allGlucose.length
      gmi = Math.round((3.31 + 0.02392 * mean) * 10) / 10
    }
    setState(s => ({ ...s, cgmData: cgm, dailyRecords: daily, gmi }))
  }, [])

  const onLogin = useCallback((user: User) => {
    saveSession(user)
    userRef.current = user
    setState(s => ({ ...s, user }))
  }, [])

  // Auto-load data when user changes
  useEffect(() => {
    if (state.user && state.connected) {
      refreshData()
    }
  }, [state.user, state.connected, refreshData])

  const lock = useCallback(() => {
    clearSession()
    setState(s => ({ ...s, user: null, activePage: 'dashboard', cgmData: [], dailyRecords: [], gmi: null }))
  }, [])

  const setActivePage = useCallback((page: string) => {
    setState(s => ({ ...s, activePage: page }))
  }, [])

  const setChatOpen = useCallback((open: boolean) => {
    setState(s => ({ ...s, chatOpen: open }))
  }, [])

  // Restore session on load
  useEffect(() => {
    if (!state.loading && !state.user) {
      const cached = loadSession()
      if (cached) onLogin(cached)
    }
  }, [state.loading, state.user, onLogin])

  return (
    <AppContext.Provider value={{ ...state, onLogin, lock, setActivePage, setChatOpen, refreshData }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
