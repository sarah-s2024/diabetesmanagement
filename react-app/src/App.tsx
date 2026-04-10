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
        <div className="w-8 h-8 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LockScreen />

  const PageComponent = pages[activePage] || Dashboard

  return (
    <div className="pb-[calc(72px+env(safe-area-inset-bottom,0px))]">
      {/* App bar — Oura style minimal */}
      <div className="sticky top-0 z-50 bg-bg/90 backdrop-blur-[20px]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <span className="text-sm font-semibold tracking-tight text-gold">
            血糖管理
          </span>
          <div className="flex gap-3 items-center">
            <span className={`text-[10px] ${connected ? 'text-green' : 'text-muted2'}`}>
              {connected ? '● 已连接' : '○ 未连接'}
            </span>
            <span className="text-[11px] text-muted font-medium">{user.display_name || user.username}</span>
            <button onClick={lock}
              className="px-3 py-1.5 rounded-xl cursor-pointer bg-surface2 text-muted text-[11px] border border-border transition-all duration-200 hover:text-gold hover:border-gold/20">
              退出
            </button>
          </div>
        </div>
      </div>

      {/* Page content */}
      <main className="px-5 max-w-[640px] mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <PageComponent />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
      <AgentChat />
    </div>
  )
}
