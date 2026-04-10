import { motion } from 'framer-motion'
import { useApp } from '../contexts/AppContext'

const tabs = [
  { id: 'dashboard', label: '今日', icon: (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )},
  { id: 'cgm', label: 'CGM', icon: (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
  { id: 'record', label: '记录', icon: (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  )},
  { id: 'history', label: '历史', icon: (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )},
  { id: 'more', label: '更多', icon: (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
    </svg>
  )},
]

export default function BottomNav() {
  const { activePage, setActivePage } = useApp()

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-[rgba(10,12,20,0.95)] backdrop-blur-[24px] border-t border-border flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom,0)] z-[100]">
      {tabs.map(tab => {
        const active = activePage === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id)}
            className={`flex flex-col items-center gap-1 py-2 px-2.5 border-none bg-transparent cursor-pointer text-[10px] font-medium tracking-wider transition-colors duration-200 rounded-[14px] min-w-[50px] ${active ? 'text-accent' : 'text-muted'}`}
          >
            <span className={active ? 'text-accent' : 'text-muted'}>{tab.icon}</span>
            {tab.label}
            {active && (
              <motion.span
                layoutId="navDot"
                className="w-1 h-1 rounded-full bg-accent mt-0.5"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
