import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../contexts/AppContext'
import { login, register } from '../lib/auth'

type Tab = 'login' | 'register'

export default function LockScreen() {
  const { onLogin } = useApp()
  const [tab, setTab] = useState<Tab>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  const showError = (msg: string) => {
    setError(msg); setShake(true); setTimeout(() => setShake(false), 500)
  }

  const handleSubmit = async () => {
    setLoading(true); setError('')
    try {
      const user = tab === 'login'
        ? await login(username, password)
        : await register(username, password, displayName)
      onLogin(user)
    } catch (e: any) { showError(e.message) }
    setLoading(false)
  }

  const inputCls = "w-full p-3.5 border border-border rounded-2xl text-sm bg-surface2 text-text outline-none transition-all duration-300 placeholder:text-muted2 focus:border-gold/40 focus:bg-surface3 focus:shadow-[0_0_0_3px_rgba(200,169,125,0.08)]"

  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center z-[999]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-gold/[0.04] blur-[150px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0, x: shake ? [0, -8, 8, -8, 8, 0] : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[340px]"
      >
        <div className="flex justify-center mb-8">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-full h-full">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(200,169,125,0.15)" strokeWidth="3" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="url(#lockGold)" strokeWidth="3"
                strokeDasharray="160 214" strokeLinecap="round" className="origin-center -rotate-90" />
              <defs>
                <linearGradient id="lockGold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#c8a97d" />
                  <stop offset="100%" stopColor="#8b7355" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-2xl">💉</div>
          </div>
        </div>

        <h2 className="text-center text-xl font-semibold tracking-tight text-text mb-1">血糖管理</h2>
        <p className="text-center text-xs text-muted mb-8">个人健康数据平台</p>

        <div className="flex mb-6 border-b border-border">
          {(['login', 'register'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className={`flex-1 pb-3 text-sm border-none bg-transparent cursor-pointer transition-all duration-300
                ${tab === t ? 'text-gold font-medium' : 'text-muted'}`}
              style={tab === t ? { borderBottom: '2px solid var(--color-gold)', marginBottom: '-1px' } : {}}>
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-3.5">
            <input value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="用户名" className={inputCls} />
            {tab === 'register' && (
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="显示名称（可选）" className={inputCls} />
            )}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={tab === 'register' ? '密码（至少 4 位）' : '密码'} className={inputCls} />
          </motion.div>
        </AnimatePresence>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-6 p-3.5 bg-gradient-to-r from-gold to-[#a08560] text-bg border-none rounded-2xl text-sm font-semibold cursor-pointer shadow-[0_8px_32px_rgba(200,169,125,0.25)] transition-all duration-300 active:scale-[0.98] hover:shadow-[0_12px_40px_rgba(200,169,125,0.35)] disabled:opacity-50">
          {loading ? '请稍候...' : tab === 'login' ? '登录' : '注册并登录'}
        </button>

        {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-red text-xs mt-3.5 text-center">{error}</motion.p>}

        <p className="text-[11px] text-muted2 text-center mt-6">
          {tab === 'login' ? '没有账户？切换到「注册」' : '已有账户？切换到「登录」'}
        </p>
      </motion.div>
    </div>
  )
}
