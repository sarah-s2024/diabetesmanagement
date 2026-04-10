import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Chart as ChartJS, registerables } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import Card from '../components/Card'
import { useApp } from '../contexts/AppContext'
import { getConfig } from '../lib/config'
import { getActiveMeds } from '../lib/storage'
import { WEEK_PLAN } from '../lib/constants'

ChartJS.register(...registerables)

function getGreeting() {
  const h = new Date().getHours()
  return h < 6 ? '夜深了，注意休息' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
}

export default function Dashboard() {
  const { cgmData, dailyRecords, gmi, setActivePage, user } = useApp()
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
    return { weightLbs, bmi, hba1c, fasting }
  }, [dailyRecords, cfg])

  const meds = useMemo(() => getActiveMeds(), [])

  const tirState = stats ? (
    stats.tir >= 90 ? { text: '优秀', color: 'text-green', label: '血糖控制优秀' }
    : stats.tir >= 70 ? { text: '良好', color: 'text-gold', label: '血糖控制良好' }
    : { text: '需关注', color: 'text-red', label: '需要关注' }
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
      <div className="pt-6 pb-2">
        <div className="text-[13px] text-muted font-medium">{getGreeting()}</div>
        <div className="text-2xl font-semibold tracking-tight mt-0.5">{user?.display_name || user?.username}</div>
      </div>

      {/* TIR Ring — Oura style */}
      <div className="flex flex-col items-center py-6 relative">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gold/[0.03] blur-[80px] pointer-events-none" />
        <div className="relative w-[200px] h-[200px] z-[1]">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 210 210">
            <defs>
              <linearGradient id="tirGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c8a97d" />
                <stop offset="60%" stopColor="#a08560" />
                <stop offset="100%" stopColor="#5cb88a" />
              </linearGradient>
            </defs>
            <circle cx="105" cy="105" r="91" fill="none" stroke="rgba(200,169,125,0.08)" strokeWidth="10" />
            <motion.circle
              cx="105" cy="105" r="91" fill="none" stroke="url(#tirGrad)" strokeWidth="10" strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${ringDash.toFixed(1)} ${circ.toFixed(1)}` }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[52px] font-light tracking-[-2px] leading-none text-text">
              {stats ? stats.tir : '--'}
            </div>
            <div className="text-[11px] text-muted tracking-wider mt-1">TIR %</div>
          </div>
        </div>
        {tirState && (
          <div className={`mt-4 text-xs font-medium ${tirState.color}`}>{tirState.label}</div>
        )}
      </div>

      {/* Metric cards — horizontal scroll */}
      {stats && (
        <div className="flex gap-2.5 overflow-x-auto pb-3 mb-2 scrollbar-none">
          {[
            { label: 'CGM 均值', val: stats.avg, unit: 'mg/dL', status: stats.avg <= 140 ? 'text-green' : stats.avg <= 180 ? 'text-gold' : 'text-red' },
            gmi ? { label: 'GMI', val: gmi, unit: '%', status: gmi < 6 ? 'text-green' : gmi < 7 ? 'text-gold' : 'text-red' } : null,
            { label: '变异度', val: stats.sd, unit: 'SD', status: stats.sd <= 30 ? 'text-green' : stats.sd <= 50 ? 'text-gold' : 'text-red' },
            bodyMetrics.hba1c ? { label: 'HbA1c', val: bodyMetrics.hba1c, unit: '%', status: bodyMetrics.hba1c < 6 ? 'text-green' : bodyMetrics.hba1c < 7 ? 'text-gold' : 'text-red' } : null,
          ].filter(Boolean).map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="flex-shrink-0 w-[110px] bg-surface border border-border rounded-2xl p-4"
            >
              <div className={`text-[26px] font-light tracking-tight ${c!.status}`}>{c!.val}</div>
              <div className="text-[10px] text-muted mt-1 tracking-wider">{c!.label}</div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Current medications */}
      {meds.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-muted uppercase tracking-[0.08em] font-medium mb-2 px-0.5">用药</div>
          <div className="flex gap-2 flex-wrap">
            {meds.map(m => (
              <div key={m.id} className="inline-flex items-center gap-2 bg-surface border border-border rounded-full py-1.5 px-3.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                <span className="text-text">{m.drug.length > 14 ? m.drug.slice(0,14)+'…' : m.drug}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current glucose reading */}
      {lastVal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-surface border border-border rounded-2xl p-5 mb-3 relative overflow-hidden"
        >
          {/* Top gold line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

          <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] text-muted uppercase tracking-[0.08em] font-medium">当前血糖</span>
            <span className="text-[11px] text-muted">
              {new Date(stats!.last.device_timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex items-end gap-2 mb-4">
            <span className={`text-[48px] font-light tracking-[-2px] leading-none ${glucoseColor}`}>{lastVal}</span>
            <span className="text-xs text-muted pb-2">mg/dL</span>
            {trend && <span className={`text-xl pb-1.5 ${lastVal! - stats!.prev! > 5 ? 'text-amber' : lastVal! - stats!.prev! < -5 ? 'text-blue' : 'text-muted'}`}>{trend}</span>}
          </div>

          {/* Range bar */}
          <div className="relative h-1.5 bg-surface3 rounded-full overflow-visible">
            <div className="absolute inset-0 flex rounded-full overflow-hidden">
              <div className="w-[14.3%] bg-red/25" />
              <div className="w-[55.3%] bg-green/15" />
              <div className="flex-1 bg-amber/20" />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-bg shadow-lg transition-all duration-500 z-[2]"
              style={{ left: pointerPct + '%', backgroundColor: lastVal < 70 ? 'var(--color-red)' : lastVal > 180 ? 'var(--color-amber)' : 'var(--color-green)' }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {['55','70','目标范围','180','250'].map(l => <span key={l} className="text-[9px] text-muted2">{l}</span>)}
          </div>
        </motion.div>
      )}

      {/* TIR distribution bar */}
      {stats && (
        <Card title="TIR 分布">
          <div className="flex h-2 rounded-full gap-[2px] mb-3">
            <div className="rounded-full bg-red/60 transition-all duration-700" style={{ width: stats.lowPct + '%', minWidth: stats.lowPct > 0 ? 3 : 0 }} />
            <div className="rounded-full bg-green/50 transition-all duration-700" style={{ width: stats.tir + '%', minWidth: 3 }} />
            <div className="rounded-full bg-amber/50 transition-all duration-700" style={{ width: stats.highPct + '%', minWidth: stats.highPct > 0 ? 3 : 0 }} />
          </div>
          <div className="flex gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red/60" />低 {stats.lowPct}%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green/50" />达标 {stats.tir}%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber/50" />偏高 {stats.highPct}%</span>
          </div>
        </Card>
      )}

      {/* Body metrics */}
      {bodyMetrics.bmi && (
        <Card title="身体指标">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'BMI', val: bodyMetrics.bmi.toFixed(1), col: bodyMetrics.bmi < 25 ? 'text-green' : bodyMetrics.bmi < 30 ? 'text-amber' : 'text-red' },
              { label: '体重', val: (bodyMetrics.weightLbs || '--') + ' lbs', col: '' },
              { label: 'HbA1c', val: bodyMetrics.hba1c ? bodyMetrics.hba1c + '%' : '--', col: '' },
              { label: '空腹血糖', val: bodyMetrics.fasting ? bodyMetrics.fasting + '' : '--', col: '' },
            ].map(m => (
              <div key={m.label} className="bg-surface2 border border-border rounded-xl p-4">
                <div className="text-[10px] text-muted uppercase tracking-[0.08em] font-medium mb-1.5">{m.label}</div>
                <div className={`text-xl font-light tracking-tight ${m.col || 'text-text'}`}>{m.val}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Meal & Exercise tabs */}
      <MealExerciseCard />

      {/* AI Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-surface border border-gold/10 rounded-2xl p-5 mb-3 cursor-pointer group"
        onClick={() => setActivePage('ai')}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-lg">✨</div>
          <div className="flex-1">
            <div className="text-sm font-medium text-text group-hover:text-gold transition-colors">AI 健康分析</div>
            <div className="text-[11px] text-muted mt-0.5">基于你的数据，获取个性化建议</div>
          </div>
          <svg className="w-4 h-4 text-muted2 group-hover:text-gold transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </motion.div>
    </div>
  )
}

/* ── Meal Plan & Exercise Card ── */
const MEALS = [
  { name: '早餐', time: '08:00', kcal: 360, p: 26, f: 18, c: 24, tag: '蛋白质优先',
    foods: '2全蛋 + 额外2蛋白 · 牛油果⅓个 · 全麦面包1片 · 菠菜/番茄' },
  { name: '加餐', time: '10:30', kcal: 175, p: 26, f: 7, c: 4, tag: '补充蛋白',
    foods: '蛋白粉1勺（30g）· 混合坚果10g' },
  { name: '午餐', time: '13:00', kcal: 443, p: 54, f: 10, c: 36, tag: '碳水高峰',
    foods: '鸡胸肉150g · 糙米饭100g · 西兰花150g · 橄榄油1茶匙' },
  { name: '加餐', time: '14:30', kcal: 156, p: 33, f: 2, c: 3, tag: '双倍蛋白',
    foods: '蛋白粉1勺 · 胶原蛋白肽1勺' },
  { name: '晚餐', time: '17:30', kcal: 428, p: 42, f: 17, c: 28, tag: '控碳稳糖',
    foods: '三文鱼130g · 烤红薯80g · 芦笋150g · 嫩豆腐80g' },
]

const TYPE_COLORS: Record<string, string> = {
  strength: 'rgba(200,169,125,0.7)',
  cardio: 'rgba(92,184,138,0.6)',
  yoga: 'rgba(107,159,212,0.6)',
  rest: 'rgba(255,255,255,0.04)',
}

function MealExerciseCard() {
  const [tab, setTab] = useState<'meal' | 'exercise'>('meal')
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const todayDow = new Date().getDay()

  // Auto-expand today
  useEffect(() => {
    if (tab === 'exercise') {
      const idx = WEEK_PLAN.findIndex(d => d.dow === todayDow)
      if (idx >= 0 && WEEK_PLAN[idx].exercises.length) setExpandedDay(idx)
    }
  }, [tab, todayDow])

  const mealChartData = {
    labels: MEALS.map(m => m.name),
    datasets: [
      { label: '蛋白质', data: MEALS.map(m => m.p), backgroundColor: 'rgba(200,169,125,0.75)', borderRadius: 4, stack: 'm' },
      { label: '脂肪', data: MEALS.map(m => m.f), backgroundColor: 'rgba(212,168,75,0.6)', borderRadius: 0, stack: 'm' },
      { label: '碳水', data: MEALS.map(m => m.c), backgroundColor: 'rgba(107,159,212,0.6)', borderRadius: 4, stack: 'm' },
    ]
  }

  const exerciseChartData = {
    labels: WEEK_PLAN.map(d => d.name),
    datasets: [{
      data: WEEK_PLAN.map(d => d.duration || 5),
      backgroundColor: WEEK_PLAN.map(d => TYPE_COLORS[d.type]),
      borderRadius: 8, barPercentage: 0.6,
    }]
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: tab === 'meal' ? { display: true, position: 'top' as const, labels: { color: '#7a756b', font: { size: 10 }, boxWidth: 8, padding: 12 } } : { display: false },
    },
    scales: {
      y: { stacked: tab === 'meal', ticks: { color: '#7a756b', font: { size: 10 }, callback: (v: number) => v + (tab === 'meal' ? 'g' : '分') }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false } },
      x: { stacked: tab === 'meal', ticks: { color: '#7a756b', font: { size: 10 } }, grid: { display: false } },
    }
  }

  const totalKcal = MEALS.reduce((s, m) => s + m.kcal, 0)
  const totalP = MEALS.reduce((s, m) => s + m.p, 0)

  return (
    <Card>
      {/* Tab */}
      <div className="flex mb-4 border-b border-border">
        {[{id: 'meal' as const, label: '膳食计划'}, {id: 'exercise' as const, label: '运动日历'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 pb-2.5 text-xs border-none bg-transparent cursor-pointer transition-all duration-300
              ${tab === t.id ? 'text-gold font-medium' : 'text-muted'}`}
            style={tab === t.id ? { borderBottom: '2px solid var(--color-gold)', marginBottom: '-1px' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'meal' ? (
        <>
          <div className="text-[11px] text-muted mb-3">全日 ~{totalKcal} kcal · 蛋白 ~{totalP}g</div>
          <div className="h-[200px]">
            <Bar data={mealChartData} options={chartOpts as any} />
          </div>
          {/* Macro strip */}
          <div className="flex gap-4 mt-3 mb-4 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-gold/75" />蛋白 {totalP}g</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-amber/60" />脂肪 {MEALS.reduce((s,m)=>s+m.f,0)}g</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-blue/60" />碳水 {MEALS.reduce((s,m)=>s+m.c,0)}g</span>
          </div>
          {/* Meal cards */}
          <div className="space-y-2">
            {MEALS.map((m, i) => (
              <div key={i} className="bg-surface2 border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-[10px] text-muted bg-surface3 px-2 py-0.5 rounded-md">{m.time}</span>
                    <span className="text-[10px] text-gold/80 bg-gold/8 px-2 py-0.5 rounded-md">{m.tag}</span>
                  </div>
                  <span className="text-xs font-medium text-gold">{m.kcal} kcal</span>
                </div>
                <div className="text-[11px] text-muted leading-relaxed">{m.foods}</div>
                <div className="flex gap-3 mt-2 text-[10px]">
                  <span className="text-gold/80">蛋白 {m.p}g</span>
                  <span className="text-amber/80">脂肪 {m.f}g</span>
                  <span className="text-blue/80">碳水 {m.c}g</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="h-[160px] mb-3">
            <Bar data={exerciseChartData} options={{ ...chartOpts, plugins: { legend: { display: false } } } as any} />
          </div>
          {/* Legend */}
          <div className="flex gap-3 mb-4 text-[10px] text-muted flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-gold/70" />力量训练</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-green/60" />有氧恢复</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-blue/60" />主动恢复</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-surface3 border border-border" />休息</span>
          </div>
          {/* Day list */}
          <div>
            {WEEK_PLAN.map((day, idx) => {
              const isToday = day.dow === todayDow
              const open = expandedDay === idx
              return (
                <div key={idx}>
                  <div
                    onClick={() => day.exercises.length && setExpandedDay(open ? null : idx)}
                    className={`flex items-center gap-3 py-3 border-b border-border2 cursor-pointer transition-colors ${day.exercises.length ? 'hover:bg-surface2' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                      style={{ background: TYPE_COLORS[day.type] + '20' }}>{day.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {day.name}
                        {isToday && <span className="text-[9px] text-gold bg-gold/10 px-2 py-0.5 rounded font-semibold">今日</span>}
                      </div>
                      <div className="text-[11px] text-muted">{day.label}{day.intensity !== '—' ? ' · ' + day.intensity : ''}</div>
                    </div>
                    <span className="text-xs text-muted">{day.duration ? day.duration + '分' : '—'}</span>
                    {day.exercises.length > 0 && (
                      <span className={`text-muted text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
                    )}
                  </div>
                  {open && day.exercises.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="pl-12 pb-2 overflow-hidden"
                    >
                      <div className="text-[11px] text-muted mb-2 leading-relaxed">{day.desc}</div>
                      {day.exercises.map((ex, ei) => (
                        <div key={ei} className="flex items-center justify-between py-2 border-b border-border2 last:border-b-0">
                          <div>
                            <div className="text-xs font-medium">{ex.name}</div>
                            <div className="text-[10px] text-muted">{ex.detail}</div>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
