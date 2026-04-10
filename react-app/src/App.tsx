import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from './contexts/AppContext'
import LockScreen from './components/LockScreen'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import CgmPage from './pages/CgmPage'
import RecordPage from './pages/RecordPage'
import HistoryPage from './pages/HistoryPage'
import MorePage from './pages/MorePage'
import AiAnalysisPage from './pages/AiAnalysisPage'
import AgentChat from './features/agent/AgentChat'

const pages: Record<string, React.FC> = {
  dashboard: Dashboard,
  cgm: CgmPage,
  record: RecordPage,
  history: HistoryPage,
  more: MorePage,
  ai: AiAnalysisPage,
}

export default function App() {
  const { loading, user, activePage, lock, connected } = useApp()

  if (loading) {
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LockScreen />

  const PageComponent = pages[activePage] || Dashboard

  return (
    <div className="pb-[calc(72px+env(safe-area-inset-bottom,0px))]">
      {/* App bar */}
      <div className="sticky top-0 z-50 bg-[rgba(6,8,15,0.88)] backdrop-blur-[16px]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-base font-bold bg-gradient-to-r from-purple-300 to-green bg-clip-text text-transparent">
            血糖管理
          </span>
          <div className="flex gap-2 items-center">
            <span className={`text-[11px] ${connected ? 'text-green' : 'text-muted'}`}>
              {connected ? '✓ 已连接' : '未连接'}
            </span>
            <span className="text-[11px] text-accent font-medium">{user.display_name || user.username}</span>
            <button onClick={lock} className="px-2.5 py-1 border border-border rounded-lg cursor-pointer bg-surface2 text-muted text-xs transition-all hover:text-text hover:border-white/15">
              退出
            </button>
          </div>
        </div>
      </div>

      {/* Page content */}
      <main className="px-[18px] max-w-[640px] mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <PageComponent />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      <BottomNav />

      {/* Agent FAB + Chat */}
      <AgentChat />
    </div>
  )
}
