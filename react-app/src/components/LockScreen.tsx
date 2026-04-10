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

  const handleLogin = async () => {
    setLoading(true); setError('')
    try {
      const user = await login(username, password)
      onLogin(user)
    } catch (e: any) {
      showError(e.message)
    }
    setLoading(false)
  }

  const handleRegister = async () => {
    setLoading(true); setError('')
    try {
      const user = await register(username, password, displayName)
      onLogin(user)
    } catch (e: any) {
      showError(e.message)
    }
    setLoading(false)
  }

  const handleSubmit = () => tab === 'login' ? handleLogin() : handleRegister()

  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center z-[999]">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-green/8 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1, x: shake ? [0, -10, 10, -10, 10, 0] : 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-[360px]"
      >
        <div className="bg-gradient-to-br from-surface/98 to-bg/99 border border-accent/20 rounded-[28px] p-10 shadow-2xl backdrop-blur-xl">
          {/* Icon + Title */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3 drop-shadow-[0_0_24px_rgba(139,92,246,0.6)]">💉</div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-300 via-accent to-green bg-clip-text text-transparent">
              血糖管理
            </h2>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-0.5 mb-5 bg-surface2 rounded-xl p-0.5">
            {(['login', 'register'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-2 text-sm rounded-[10px] border-none cursor-pointer font-medium transition-all
                  ${tab === t ? 'bg-surface text-text shadow-[0_1px_6px_rgba(0,0,0,0.35)]' : 'bg-transparent text-muted'}`}
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: tab === 'login' ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tab === 'login' ? 10 : -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1.5">用户名</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="输入用户名"
                  className="w-full p-3 border border-border rounded-[12px] text-sm bg-surface2 text-text outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1.5">显示名称（可选）</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="您的昵称"
                    className="w-full p-3 border border-border rounded-[12px] text-sm bg-surface2 text-text outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1.5">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder={tab === 'register' ? '至少 4 位' : '输入密码'}
                  className="w-full p-3 border border-border rounded-[12px] text-sm bg-surface2 text-text outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                />
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full mt-5 p-3.5 bg-gradient-to-r from-accent to-purple-700 text-white border-none rounded-[14px] text-[15px] font-semibold cursor-pointer shadow-[0_6px_24px_rgba(139,92,246,0.45)] transition-all duration-200 active:scale-[0.98] hover:shadow-[0_8px_32px_rgba(139,92,246,0.55)] disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {tab === 'login' ? '登录中...' : '注册中...'}
              </span>
            ) : (
              tab === 'login' ? '登录' : '注册并登录'
            )}
          </button>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red text-xs mt-3 text-center"
            >{error}</motion.p>
          )}

          {/* Footer hint */}
          <p className="text-[11px] text-muted2 text-center mt-5 leading-relaxed">
            {tab === 'login' ? '没有账户？点击上方「注册」创建' : '已有账户？点击上方「登录」'}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
