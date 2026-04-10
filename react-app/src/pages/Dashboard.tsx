import { useMemo } from 'react'
import { motion } from 'framer-motion'
import Card from '../components/Card'
import { useApp } from '../contexts/AppContext'
import { getConfig } from '../lib/config'
import { getActiveMeds } from '../lib/storage'

function getGreeting() {
  const h = new Date().getHours()
  return h < 6 ? '夜深了，注意休息' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
}

function formatDate() {
  const now = new Date()
  const days = ['周日','周一','周二','周三','周四','周五','周六']
  return `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${days[now.getDay()]}`
}

export default function Dashboard() {
  const { cgmData, dailyRecords, gmi, setActivePage } = useApp()
  const cfg = getConfig()

  const stats = useMemo(() => {
    if (!cgmData.length) return null
    const vals = cgmData.map(d => d.glucose_mg_dl)
    const avg = Math.round(vals.reduce((a,b) => a+b, 0) / vals.length)
    const inRange = vals.filter(v => v >= 70 && v <= 180).length
    const low = vals.filter(v => v < 70).length
    const high = vals.filter(v => v > 180).length
    const tir = Math.round(inRange / vals.length * 100)
    const lowPct = Math.round(low / vals.length * 100)
    const highPct = Math.round(high / vals.length * 100)
    const sd = Math.round(Math.sqrt(vals.reduce((s,v) => s + (v-avg)**2, 0) / vals.length))
    const last = cgmData[cgmData.length - 1]
    const prev = cgmData.length >= 2 ? cgmData[cgmData.length - 2].glucose_mg_dl : null
    return { avg, tir, lowPct, highPct, sd, last, prev }
  }, [cgmData])

  const bodyMetrics = useMemo(() => {
    const latest = dailyRecords[0]
    const heightCm = cfg?.height_cm || 170
    const weightLbs = latest?.weight_lbs
    const weightKg = weightLbs ? weightLbs * 0.453592 : null
    const bmi = weightKg ? weightKg / (heightCm / 100) ** 2 : null
    const hba1c = dailyRecords.find(r => r.hba1c)?.hba1c
    const fasting = latest?.fasting_glucose
    return { weightLbs, weightKg, bmi, hba1c, fasting, heightCm }
  }, [dailyRecords, cfg])

  const meds = useMemo(() => getActiveMeds(), [])

  const tirState = stats ? (
    stats.tir >= 90 ? { text: '优秀', color: 'text-green', dot: 'bg-green', pill: '优秀控糖 🎯' }
    : stats.tir >= 70 ? { text: '良好', color: 'text-amber', dot: 'bg-amber', pill: '继续保持 💪' }
    : { text: '需关注', color: 'text-red', dot: 'bg-red', pill: '请联系医生 ⚠️' }
  ) : null

  const ringDash = stats ? (stats.tir / 100) * (2 * Math.PI * 91) : 0
  const circ = 2 * Math.PI * 91

  const lastVal = stats?.last?.glucose_mg_dl
  const glucoseColor = !lastVal ? 'text-muted' : lastVal < 70 ? 'text-red' : lastVal > 180 ? 'text-amber' : 'text-green'
  const pointerPct = lastVal ? Math.max(0, Math.min(100, (lastVal - 55) / (250 - 55) * 100)) : 50
  const trend = stats?.prev ? (lastVal! - stats.prev > 5 ? '↑' : lastVal! - stats.prev < -5 ? '↓' : '→') : ''

  return (
    <div className="pb-4">
      {/* Greeting */}
      <div className="pt-5 pb-1.5">
        <div className="text-sm text-muted font-medium mb-1">{formatDate()}</div>
        <div className="text-[26px] font-bold tracking-tight">{getGreeting()} 👋</div>
      </div>

      {/* TIR Ring */}
      <div className="flex flex-col items-center py-2 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-60 h-60 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.14),rgba(52,211,153,0.06)_50%,transparent_70%)] pointer-events-none" />
        <div className="relative w-[210px] h-[210px] z-[1]">
          <svg className="w-[210px] h-[210px] -rotate-90" viewBox="0 0 210 210">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa"/>
                <stop offset="50%" stopColor="#8b5cf6"/>
                <stop offset="100%" stopColor="#34d399"/>
              </linearGradient>
            </defs>
            <circle cx="105" cy="105" r="91" fill="none" stroke="var(--color-surface3)" strokeWidth="14"/>
            <motion.circle
              cx="105" cy="105" r="91" fill="none" stroke="url(#ringGrad)" strokeWidth="14" strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${ringDash.toFixed(1)} ${circ.toFixed(1)}` }}
              transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-0.5">
            <div className="text-[56px] font-extrabold tracking-[-3px] leading-none bg-gradient-to-br from-purple-300 via-accent to-green bg-clip-text text-transparent">
              {stats ? stats.tir + '%' : '--%'}
            </div>
            <div className="text-[11px] text-muted uppercase tracking-wider font-semibold">TIR 达标率</div>
            {tirState && <div className={`text-sm font-semibold mt-0.5 ${tirState.color}`}>{tirState.text}</div>}
          </div>
        </div>
      </div>

      {/* State pills */}
      {tirState && (
        <div className="flex justify-center gap-2 mt-3.5 mb-2.5">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-surface2 border border-border">
            <span className={`w-[7px] h-[7px] rounded-full ${tirState.dot}`} />
            {tirState.pill}
          </div>
        </div>
      )}

      {/* Metric cards */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 mb-3.5 scrollbar-none">
        {stats && [
          { icon: '📊', val: stats.avg, name: 'CGM均值', unit: 'mg/dL', col: stats.avg <= 140 ? 'text-green' : stats.avg <= 180 ? 'text-amber' : 'text-red' },
          gmi ? { icon: '🧮', val: gmi + '%', name: 'GMI', col: gmi < 6 ? 'text-green' : gmi < 7 ? 'text-amber' : 'text-red' } : null,
          { icon: '〰️', val: stats.sd, name: '血糖变异', unit: 'SD', col: stats.sd <= 30 ? 'text-green' : stats.sd <= 50 ? 'text-amber' : 'text-red' },
          bodyMetrics.hba1c ? { icon: '🩸', val: bodyMetrics.hba1c + '%', name: 'HbA1c', col: bodyMetrics.hba1c < 6 ? 'text-green' : bodyMetrics.hba1c < 7 ? 'text-amber' : 'text-red' } : null,
        ].filter(Boolean).map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex-shrink-0 w-[108px] bg-surface border border-border rounded-xl p-3.5 flex flex-col items-start gap-0.5"
          >
            <span className="text-base">{c!.icon}</span>
            <span className={`text-[22px] font-bold tracking-tight ${c!.col}`}>{c!.val}</span>
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">{c!.name}</span>
          </motion.div>
        ))}
      </div>

      {/* Medications inline */}
      {meds.length > 0 && (
        <div className="mb-3.5">
          <div className="text-[11px] text-muted font-semibold uppercase tracking-wider mb-2">当前用药</div>
          <div className="flex gap-2 flex-wrap">
            {meds.map(m => (
              <div key={m.id} className="inline-flex items-center gap-1.5 bg-surface2 border border-border rounded-full py-1 px-3 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-text">{m.drug.length > 12 ? m.drug.slice(0,12)+'…' : m.drug}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current glucose */}
      {lastVal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-gradient-to-r from-surface to-[rgba(16,20,29,1)] border border-border rounded-[18px] p-[18px] mb-3 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
          <div className="flex justify-between items-start mb-2.5">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">当前血糖</span>
            <span className="text-[11px] text-muted">
              {new Date(stats!.last.device_timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex items-end gap-1.5 mb-3.5">
            <span className={`text-[52px] font-extrabold tracking-[-2px] leading-none ${glucoseColor}`}>{lastVal}</span>
            <span className="text-sm text-muted pb-2 font-medium">mg/dL</span>
            {trend && <span className={`text-[22px] pb-1.5 font-semibold ${lastVal! - stats!.prev! > 5 ? 'text-amber' : lastVal! - stats!.prev! < -5 ? 'text-blue' : 'text-muted'}`}>{trend}</span>}
          </div>
          {/* Range bar */}
          <div className="relative h-2 bg-surface2 rounded overflow-visible mt-1">
            <div className="absolute inset-0 flex rounded overflow-hidden">
              <div className="w-[14.3%] bg-red/35" />
              <div className="w-[55.3%] bg-green/20" />
              <div className="flex-1 bg-amber/25" />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-text border-2 border-bg shadow-lg transition-all duration-500 z-[2]"
              style={{ left: pointerPct + '%' }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            {['55','70','目标范围','180','250'].map(l => <span key={l} className="text-[9px] text-muted2">{l}</span>)}
          </div>
        </motion.div>
      )}

      {/* TIR bar */}
      {stats && (
        <Card title="近期 CGM 概览">
          <div className="flex h-2 rounded gap-0.5 mb-2.5">
            <div className="rounded bg-red transition-all duration-500" style={{ width: stats.lowPct + '%', minWidth: stats.lowPct > 0 ? 2 : 0 }} />
            <div className="rounded bg-green transition-all duration-500" style={{ width: stats.tir + '%', minWidth: 2 }} />
            <div className="rounded bg-amber transition-all duration-500" style={{ width: stats.highPct + '%', minWidth: stats.highPct > 0 ? 2 : 0 }} />
          </div>
          <div className="flex gap-3 text-[10px] text-muted flex-wrap">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red" />低 {stats.lowPct}%</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green" />达标 {stats.tir}%</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber" />偏高 {stats.highPct}%</span>
          </div>
        </Card>
      )}

      {/* Body metrics */}
      {bodyMetrics.bmi && (
        <Card title="基础身体指标">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'BMI', val: bodyMetrics.bmi.toFixed(1), col: bodyMetrics.bmi < 25 ? 'text-green' : bodyMetrics.bmi < 30 ? 'text-amber' : 'text-red' },
              { label: '体重', val: (bodyMetrics.weightLbs || '--') + ' lbs' },
              { label: 'HbA1c', val: bodyMetrics.hba1c ? bodyMetrics.hba1c + '%' : '--' },
              { label: '空腹血糖', val: bodyMetrics.fasting ? bodyMetrics.fasting + '' : '--' },
            ].map(m => (
              <div key={m.label} className="bg-surface2 border border-border rounded-xl p-3.5">
                <div className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">{m.label}</div>
                <div className={`text-2xl font-bold tracking-tight ${m.col || 'text-text'}`}>{m.val}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI Analysis entry */}
      <Card title="AI 深度分析">
        <p className="text-xs text-muted mb-3 leading-relaxed">
          输入你想分析的方向，AI 将结合你的健康数据给出建议
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setActivePage('ai')}
            className="flex-1 py-3.5 bg-gradient-to-r from-accent to-purple-700 text-white border-none rounded-[14px] text-[15px] font-semibold cursor-pointer shadow-[0_6px_24px_rgba(139,92,246,0.35)] transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            ✨ AI 分析
          </button>
        </div>
      </Card>
    </div>
  )
}
