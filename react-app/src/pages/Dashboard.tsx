import { useMemo, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Chart as ChartJS, registerables } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import Card from '../components/Card'
import { useApp } from '../contexts/AppContext'
import { getConfig } from '../lib/config'
import { getActiveMeds, getRee, getWeightGoalLbs } from '../lib/storage'
import { WEEK_PLAN } from '../lib/constants'
import { callAi, getAiProvider, parseAiStream } from '../lib/ai-client'

ChartJS.register(...registerables)

function getGreeting() {
  const h = new Date().getHours()
  return h < 6 ? '夜深了，注意休息' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
}

/* ── AI Nutrition Plan ── */
interface AiWeekDay {
  dow: number
  type: 'strength' | 'cardio' | 'yoga' | 'rest'
  duration: number
  intensity: string
  label: string
}

interface NutritionPlan {
  kcal: number; proteinG: number; fatG: number; carbG: number
  mealNote?: string; exerciseFocus?: string; aiGenerated?: boolean; date?: string
  weekPlan?: AiWeekDay[]
}

async function loadAiNutritionPlan(snap: {
  weightKg: number; heightCm: number; bmi: number
  avg: number; tir: number; sd: number; hba1c?: number
  meds: string; kcalTarget: number; tdee: number; deficit: number
  ree?: number; weeklyGoalLbs?: number
}): Promise<NutritionPlan | null> {
  if (!getAiProvider()) return null
  const today = new Date().toISOString().slice(0, 10)
  const cached = JSON.parse(localStorage.getItem('dm_ai_nutrition') || 'null')
  if (cached?.date === today) return cached

  const reeSection = snap.ree
    ? `静息能量消耗(REE)：${snap.ree} kcal/天 → 估算TDEE约 ${snap.tdee} kcal（REE×1.35）`
    : `估算TDEE：${snap.tdee} kcal`
  const goalSection = snap.weeklyGoalLbs
    ? `每周减重目标：${snap.weeklyGoalLbs} lbs（热量缺口约 ${snap.deficit} kcal/天）`
    : ''

  const prompt = `你是糖尿病营养与运动顾问。根据以下健康数据，仅返回一行JSON，不含任何说明文字：
体重${snap.weightKg.toFixed(1)}kg 身高${snap.heightCm}cm BMI${snap.bmi.toFixed(1)}
${reeSection}
${goalSection}
目标每日热量：${snap.kcalTarget} kcal
近7日CGM均值${snap.avg}mg/dL TIR${snap.tir}% 血糖标准差${snap.sd}
${snap.hba1c ? `HbA1c: ${snap.hba1c}%` : ''}
当前用药：${snap.meds}

要求：蛋白质≥体重kg×1.6g；控制碳水以稳定血糖；weekPlan结合减重目标与用药安排7天运动，type只能用strength/cardio/yoga/rest

返回格式（一行JSON，无其他文字）：
{"kcal":数字,"proteinG":数字,"fatG":数字,"carbG":数字,"mealNote":"≤25字","exerciseFocus":"≤35字","weekPlan":[{"dow":1,"type":"strength","duration":35,"intensity":"中等","label":"上肢力量"},{"dow":2,"type":"cardio","duration":30,"intensity":"中低","label":"快走有氧"},{"dow":3,"type":"strength","duration":35,"intensity":"中等","label":"下肢力量"},{"dow":4,"type":"cardio","duration":25,"intensity":"低","label":"恢复步行"},{"dow":5,"type":"strength","duration":30,"intensity":"中等","label":"全身训练"},{"dow":6,"type":"yoga","duration":30,"intensity":"低","label":"拉伸恢复"},{"dow":0,"type":"rest","duration":0,"intensity":"—","label":"完全休息"}]}`

  try {
    const r = await callAi({
      model: 'claude-haiku-4-5-20251001', max_tokens: 500, stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
    if (!r) return null
    let text = ''
    for await (const ev of parseAiStream(r.res, r.format)) {
      if (ev.type === 'text') text += ev.text
      if (ev.type === 'done') break
    }
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const plan: NutritionPlan = { ...JSON.parse(m[0]), aiGenerated: true, date: today }
    localStorage.setItem('dm_ai_nutrition', JSON.stringify(plan))
    return plan
  } catch { return null }
}

function buildDefaultPlan(kcal: number, kg: number): NutritionPlan {
  const pG = Math.round(Math.min(kg * 1.8, kcal * 0.35 / 4))
  const fG = Math.round(kcal * 0.30 / 9)
  const cG = Math.max(80, Math.round((kcal - pG * 4 - fG * 9) / 4))
  return { kcal, proteinG: pG, fatG: fG, carbG: cG }
}

/* ── Insights ── */
interface Insight { icon: string; title: string; desc: string }
function buildInsights(tirPct: number | null, _avg: number | null, sd: number | null, fasting: number | null, hba1c: number | null): Insight[] {
  const items: Insight[] = []
  if (tirPct == null) { items.push({ icon: '📡', title: '等待数据', desc: '请上传 CGM CSV 文件以获取分析' }); return items }
  if (tirPct >= 90) items.push({ icon: '🎯', title: '血糖控制优秀', desc: `TIR ${tirPct}%，持续保持！` })
  else if (tirPct >= 70) items.push({ icon: '💪', title: '控糖良好', desc: `TIR ${tirPct}%，继续努力` })
  else items.push({ icon: '⚠️', title: '需要关注', desc: `TIR ${tirPct}%，建议调整方案并咨询医生` })
  // SD >30 is concerning for non-diabetics (normal healthy SD typically <20)
  if (sd != null && sd > 30) items.push({ icon: '〰️', title: '血糖波动偏大', desc: `标准差 ${sd} mg/dL（正常人参考 <20），注意饮食规律` })
  if (hba1c) {
    // ADA: <5.7% normal, 5.7–6.4% pre-diabetic, ≥6.5% diabetic
    if (hba1c < 5.7) items.push({ icon: '🌟', title: 'HbA1c 正常', desc: `${hba1c}%，处于正常范围（<5.7%），继续保持` })
    else if (hba1c < 6.5) items.push({ icon: '⚠️', title: 'HbA1c 偏高', desc: `${hba1c}%，属前驱糖尿病范围（5.7–6.4%），建议加强饮食控制` })
    else items.push({ icon: '🩸', title: 'HbA1c 过高', desc: `${hba1c}%，已达糖尿病诊断标准（≥6.5%），请尽快就诊` })
  }
  if (fasting) {
    // ADA fasting: <100 normal, 100–125 pre-diabetic, ≥126 diabetic
    if (fasting <= 99) items.push({ icon: '🌙', title: '空腹血糖正常', desc: `${fasting} mg/dL，处于正常范围（70–99）` })
    else if (fasting <= 125) items.push({ icon: '🌤️', title: '空腹血糖偏高', desc: `${fasting} mg/dL，属前驱糖尿病范围，建议减少精制碳水` })
    else items.push({ icon: '🌡️', title: '空腹血糖过高', desc: `${fasting} mg/dL，已达糖尿病诊断标准，请及时就诊` })
  }
  const h = new Date().getHours()
  if (h >= 14 && h <= 16) items.push({ icon: '🏃', title: '下午是运动好时机', desc: '饭后 1–2 小时有氧运动有助于降低血糖' })
  return items
}

/* ── BMI Gauge ── */
function BmiGauge({ bmi }: { bmi: number }) {
  const label = bmi < 18.5 ? '偏轻' : bmi < 25 ? '正常' : bmi < 30 ? '超重' : '肥胖'
  const color = bmi < 18.5 ? '#6b9fd4' : bmi < 25 ? '#5cb88a' : bmi < 30 ? '#d4a84b' : '#e06464'
  const r = 60, cx = 80, cy = 68
  // pos 0 = left end, 90 = top, 180 = right end — semicircle through the top
  const toXY = (pos: number) => {
    const rad = (180 - pos) * Math.PI / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }
  const arc = (from: number, to: number, clr: string) => {
    const s = toXY(from), e = toXY(to)
    return <path d={`M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`}
      fill="none" stroke={clr} strokeWidth="10" strokeLinecap="butt" />
  }
  const needlePos = Math.min(Math.max((bmi - 15) / (40 - 15) * 180, 0), 180)
  const tip = toXY(needlePos)
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <svg width="160" height="76" viewBox="0 0 160 76">
        {arc(0, 45, '#6b9fd4')}
        {arc(45, 90, '#5cb88a')}
        {arc(90, 135, '#d4a84b')}
        {arc(135, 180, '#e06464')}
        <line x1={cx} y1={cy} x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={color} />
        <text x={cx} y={cy - 14} textAnchor="middle" fill={color} fontSize="14" fontWeight="700">{bmi.toFixed(1)}</text>
      </svg>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const { cgmData, dailyRecords, gmi, setActivePage, setChatOpen, user } = useApp()
  const cfg = getConfig()
  const [nutritionPlan, setNutritionPlan] = useState<NutritionPlan | null>(null)
  const planLoaded = useRef(false)

  const stats = useMemo(() => {
    if (!cgmData.length) return null
    const lastTs = new Date(cgmData[cgmData.length - 1].device_timestamp).getTime()
    const week = cgmData.filter(d => new Date(d.device_timestamp).getTime() >= lastTs - 7 * 86400000)
    const vals = week.length ? week.map(d => d.glucose_mg_dl) : cgmData.map(d => d.glucose_mg_dl)
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const inRange = vals.filter(v => v >= 70 && v <= 180).length
    const low = vals.filter(v => v < 70).length
    const high = vals.filter(v => v > 180).length
    const tir = Math.round(inRange / vals.length * 100)
    const lowPct = Math.round(low / vals.length * 100)
    const highPct = Math.round(high / vals.length * 100)
    const sd = Math.round(Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length))
    const last = cgmData[cgmData.length - 1]
    const prev = cgmData.length >= 2 ? cgmData[cgmData.length - 2].glucose_mg_dl : null
    return { avg, tir, lowPct, highPct, sd, last, prev }
  }, [cgmData])

  // 24h mini chart data (relative to most recent reading)
  const h24 = useMemo(() => {
    if (!cgmData.length) return []
    const lastTs = new Date(cgmData[cgmData.length - 1].device_timestamp).getTime()
    return cgmData.filter(d => new Date(d.device_timestamp).getTime() >= lastTs - 86400000)
  }, [cgmData])

  // Consecutive days with TIR >= 70%
  const streak = useMemo(() => {
    if (!cgmData.length) return 0
    const byDate: Record<string, number[]> = {}
    cgmData.forEach(d => {
      const date = d.device_timestamp.slice(0, 10)
      if (!byDate[date]) byDate[date] = []
      byDate[date].push(d.glucose_mg_dl)
    })
    let count = 0
    for (const date of Object.keys(byDate).sort().reverse()) {
      const vals = byDate[date]
      const tir = vals.filter(v => v >= 70 && v <= 180).length / vals.length * 100
      if (tir >= 70) count++; else break
    }
    return count
  }, [cgmData])

  const bodyMetrics = useMemo(() => {
    const heightCm = parseInt(localStorage.getItem('dm_height_cm') || '0') || cfg?.height_cm || 170
    const weightRec = dailyRecords.find(r => r.weight_lbs)
    const weightLbs = weightRec?.weight_lbs ?? null
    const weightKg = weightLbs ? weightLbs * 0.453592 : null
    const bmi = weightKg ? weightKg / (heightCm / 100) ** 2 : null
    const hba1c = dailyRecords.find(r => r.hba1c)?.hba1c ?? null
    const fasting = dailyRecords[0]?.fasting_glucose ?? null
    const ree = getRee()
    const weeklyGoalLbs = getWeightGoalLbs()
    const tdee = ree
      ? Math.round(ree * 1.35)
      : (weightKg ? Math.round(weightKg * 25) : 1800)
    const deficit = weeklyGoalLbs ? Math.round(weeklyGoalLbs * 500) : 0
    const totalKcal = Math.max(1200, Math.round((tdee - deficit) / 100) * 100)
    return { weightLbs, weightKg, bmi, hba1c, fasting, heightCm, totalKcal, ree, weeklyGoalLbs, tdee, deficit }
  }, [dailyRecords, cfg])

  const meds = useMemo(() => getActiveMeds(), [])

  // AI nutrition plan: show default immediately, update when AI returns
  useEffect(() => {
    if (planLoaded.current) return
    const { weightKg, heightCm, bmi, totalKcal } = bodyMetrics
    if (!weightKg || !bmi || !stats) return
    planLoaded.current = true
    setNutritionPlan(buildDefaultPlan(totalKcal, weightKg))
    loadAiNutritionPlan({
      weightKg, heightCm, bmi,
      avg: stats.avg, tir: stats.tir, sd: stats.sd,
      hba1c: bodyMetrics.hba1c ?? undefined,
      meds: meds.map(m => `${m.drug}${m.dose ? ' ' + m.dose : ''}`).join('；') || '无',
      kcalTarget: totalKcal,
      tdee: bodyMetrics.tdee,
      deficit: bodyMetrics.deficit,
      ree: bodyMetrics.ree || undefined,
      weeklyGoalLbs: bodyMetrics.weeklyGoalLbs || undefined,
    }).then(plan => { if (plan) setNutritionPlan(plan) })
  }, [bodyMetrics, stats, meds])

  const tirState = stats ? (
    stats.tir >= 90 ? { text: '优秀控糖 🎯', color: 'text-green' }
    : stats.tir >= 70 ? { text: '继续保持 💪', color: 'text-gold' }
    : { text: '请联系医生 ⚠️', color: 'text-red' }
  ) : null

  const ringDash = stats ? (stats.tir / 100) * (2 * Math.PI * 91) : 0
  const circ = 2 * Math.PI * 91
  const lastVal = stats?.last?.glucose_mg_dl ?? null
  const glucoseColor = !lastVal ? 'text-muted' : lastVal < 70 ? 'text-red' : lastVal > 180 ? 'text-amber' : 'text-green'
  const pointerPct = lastVal ? Math.max(0, Math.min(100, (lastVal - 55) / (250 - 55) * 100)) : 50
  const trend = stats?.prev != null && lastVal != null
    ? (lastVal - stats.prev > 5 ? '↑' : lastVal - stats.prev < -5 ? '↓' : '→') : ''

  const insights = buildInsights(stats?.tir ?? null, stats?.avg ?? null, stats?.sd ?? null, bodyMetrics.fasting, bodyMetrics.hba1c)

  const miniChartData = {
    labels: h24.map(d => new Date(d.device_timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
    datasets: [
      { data: h24.map(d => Math.round(d.glucose_mg_dl)), borderColor: '#5cb88a', backgroundColor: 'rgba(92,184,138,0.07)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
      { data: Array(h24.length).fill(70), borderColor: 'rgba(224,100,100,0.4)', borderDash: [4, 4] as number[], borderWidth: 1, pointRadius: 0, fill: false },
      { data: Array(h24.length).fill(180), borderColor: 'rgba(212,168,75,0.4)', borderDash: [4, 4] as number[], borderWidth: 1, pointRadius: 0, fill: false },
    ]
  }
  const miniChartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 60, max: 220, ticks: { color: '#7a756b', font: { size: 9 } }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false } },
      x: { ticks: { maxTicksLimit: 6, color: '#7a756b', font: { size: 9 } }, grid: { display: false } },
    }
  }

  return (
    <div className="pb-4">
      {/* Greeting */}
      <div className="pt-6 pb-2">
        <div className="text-[13px] text-muted font-medium">{getGreeting()}</div>
        <div className="text-2xl font-semibold tracking-tight mt-0.5">{user?.display_name || user?.username}</div>
      </div>

      {/* TIR Ring */}
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
            <motion.circle cx="105" cy="105" r="91" fill="none" stroke="url(#tirGrad)" strokeWidth="10" strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${ringDash.toFixed(1)} ${circ.toFixed(1)}` }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[52px] font-light tracking-[-2px] leading-none text-text">{stats ? stats.tir : '--'}</div>
            <div className="text-[11px] text-muted tracking-wider mt-1">TIR %</div>
            {tirState && <div className={`text-xs font-medium mt-1.5 ${tirState.color}`}>{tirState.text}</div>}
          </div>
        </div>
      </div>

      {/* Streak + state pills */}
      {(tirState || streak > 1) && (
        <div className="flex gap-2 justify-center mb-4 flex-wrap">
          {tirState && (
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: stats!.tir >= 90 ? 'var(--color-green)' : stats!.tir >= 70 ? 'var(--color-gold)' : 'var(--color-red)' }} />
              <span className="text-xs text-text">{tirState.text}</span>
            </div>
          )}
          {streak > 1 && (
            <div className="flex items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5">
              <span className="text-xs">🔥</span>
              <span className="text-xs text-text">{streak} 天达标</span>
            </div>
          )}
        </div>
      )}

      {/* Metric cards — horizontal scroll */}
      {stats && (
        <>
          <div className="text-[10px] text-muted uppercase tracking-[0.08em] font-semibold mb-2 px-0.5">各项指标</div>
          <div className="flex gap-2.5 overflow-x-auto pb-3 mb-2 scrollbar-none">
            {[
              {
                // Normal non-diabetic CGM avg: ≤100 normal, 101–115 borderline, >115 elevated
                icon: '📊', label: 'CGM 均值', val: stats.avg, unit: 'mg/dL',
                statusCls: stats.avg <= 100 ? 'text-green' : stats.avg <= 115 ? 'text-gold' : 'text-red',
                dotCls: stats.avg <= 100 ? 'bg-green' : stats.avg <= 115 ? 'bg-gold' : 'bg-red',
                statusText: stats.avg <= 100 ? '正常' : stats.avg <= 115 ? '关注' : '偏高',
              },
              gmi ? {
                // GMI = estimated HbA1c; <5.7% normal, 5.7–6.4% pre-diabetic, ≥6.5% diabetic
                icon: '🧮', label: 'GMI', val: gmi, unit: '%',
                statusCls: gmi < 5.7 ? 'text-green' : gmi < 6.5 ? 'text-gold' : 'text-red',
                dotCls: gmi < 5.7 ? 'bg-green' : gmi < 6.5 ? 'bg-gold' : 'bg-red',
                statusText: gmi < 5.7 ? '理想' : gmi < 6.5 ? '关注' : '偏高',
              } : null,
              {
                // SD in healthy non-diabetics typically <20; ≤20 low, ≤30 moderate, >30 high
                icon: '〰️', label: '血糖变异', val: stats.sd, unit: 'SD',
                statusCls: stats.sd <= 20 ? 'text-green' : stats.sd <= 30 ? 'text-gold' : 'text-red',
                dotCls: stats.sd <= 20 ? 'bg-green' : stats.sd <= 30 ? 'bg-gold' : 'bg-red',
                statusText: stats.sd <= 20 ? '波动低' : stats.sd <= 30 ? '波动中' : '波动高',
              },
              bodyMetrics.hba1c ? {
                // ADA: <5.7% normal, 5.7–6.4% pre-diabetic, ≥6.5% diabetic
                icon: '🩸', label: 'HbA1c', val: bodyMetrics.hba1c, unit: '%',
                statusCls: bodyMetrics.hba1c < 5.7 ? 'text-green' : bodyMetrics.hba1c < 6.5 ? 'text-gold' : 'text-red',
                dotCls: bodyMetrics.hba1c < 5.7 ? 'bg-green' : bodyMetrics.hba1c < 6.5 ? 'bg-gold' : 'bg-red',
                statusText: bodyMetrics.hba1c < 5.7 ? '理想' : bodyMetrics.hba1c < 6.5 ? '关注' : '偏高',
              } : null,
            ].filter(Boolean).map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                className="flex-shrink-0 w-[120px] bg-surface border border-border rounded-2xl p-4">
                <div className="text-xl mb-2">{c!.icon}</div>
                <div className={`text-[26px] font-light tracking-tight leading-none ${c!.statusCls}`}>{c!.val}</div>
                <div className="text-[10px] text-muted mt-1.5 tracking-wider">{c!.label}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c!.dotCls}`} />
                  <span className={`text-[10px] font-medium ${c!.statusCls}`}>{c!.statusText}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Current medications */}
      {meds.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-muted uppercase tracking-[0.08em] font-medium mb-2 px-0.5">当前用药</div>
          <div className="flex gap-2 flex-wrap">
            {meds.map(m => (
              <div key={m.id} className="inline-flex items-center gap-2 bg-surface border border-border rounded-full py-1.5 px-3.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                <span className="text-text">{m.drug.length > 14 ? m.drug.slice(0, 14) + '…' : m.drug}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current glucose reading */}
      {lastVal != null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-surface border border-border rounded-2xl p-5 mb-3 relative overflow-hidden">
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
            {trend && <span className={`text-xl pb-1.5 ${lastVal - (stats?.prev ?? lastVal) > 5 ? 'text-amber' : lastVal - (stats?.prev ?? lastVal) < -5 ? 'text-blue' : 'text-muted'}`}>{trend}</span>}
          </div>
          <div className="relative h-1.5 bg-surface3 rounded-full overflow-visible mb-2">
            <div className="absolute inset-0 flex rounded-full overflow-hidden">
              <div className="w-[14.3%] bg-red/25" />
              <div className="w-[55.3%] bg-green/15" />
              <div className="flex-1 bg-amber/20" />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-bg shadow-lg transition-all duration-500 z-[2]"
              style={{ left: pointerPct + '%', backgroundColor: lastVal < 70 ? 'var(--color-red)' : lastVal > 180 ? 'var(--color-amber)' : 'var(--color-green)' }} />
          </div>
          <div className="flex justify-between">
            {['55', '70', '目标范围', '180', '250'].map(l => <span key={l} className="text-[9px] text-muted2">{l}</span>)}
          </div>
        </motion.div>
      )}

      {/* 24h CGM mini chart */}
      {h24.length > 0 && (
        <Card>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">近24小时趋势</span>
            {stats && (
              <div className="flex gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-red/70"><span className="w-1.5 h-1.5 rounded-full bg-red/60" />低 {stats.lowPct}%</span>
                <span className="flex items-center gap-1 text-green/80"><span className="w-1.5 h-1.5 rounded-full bg-green/50" />达标 {stats.tir}%</span>
                <span className="flex items-center gap-1 text-amber/70"><span className="w-1.5 h-1.5 rounded-full bg-amber/50" />高 {stats.highPct}%</span>
              </div>
            )}
          </div>
          <div className="h-[160px]">
            <Line data={miniChartData} options={miniChartOpts as any} />
          </div>
          {stats && (
            <div className="flex h-1.5 rounded-full gap-[2px] mt-3">
              <div className="rounded-full bg-red/60 transition-all" style={{ width: stats.lowPct + '%', minWidth: stats.lowPct > 0 ? 3 : 0 }} />
              <div className="rounded-full bg-green/50 transition-all" style={{ width: stats.tir + '%', minWidth: 3 }} />
              <div className="rounded-full bg-amber/50 transition-all" style={{ width: stats.highPct + '%', minWidth: stats.highPct > 0 ? 3 : 0 }} />
            </div>
          )}
        </Card>
      )}

      {/* Auto insights */}
      {insights.length > 0 && (
        <Card title="智能洞察">
          <div className="space-y-3">
            {insights.map((ins, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-xl flex-shrink-0 mt-0.5">{ins.icon}</span>
                <div>
                  <div className="text-sm font-medium">{ins.title}</div>
                  <div className="text-xs text-muted mt-0.5 leading-relaxed">{ins.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Body metrics with BMI gauge */}
      {(bodyMetrics.bmi != null || bodyMetrics.weightLbs != null) && (
        <Card title="身体指标">
          {/* Target range pills — normal (non-diabetic) standards */}
          <div className="flex gap-2 mb-4">
            <span className="text-[11px] font-medium text-green bg-green/10 border border-green/20 px-3 py-1 rounded-full">空腹 70–99</span>
            <span className="text-[11px] font-medium text-green bg-green/10 border border-green/20 px-3 py-1 rounded-full">餐后 &lt;140</span>
          </div>
          <div className="flex items-start gap-4">
            {/* BMI gauge + label */}
            {bodyMetrics.bmi != null && (
              <div className="flex flex-col items-center flex-shrink-0">
                <BmiGauge bmi={bodyMetrics.bmi} />
                <div className="text-[10px] text-muted mt-1 text-center">
                  BMI 分类：<span style={{ color: bodyMetrics.bmi < 18.5 ? '#6b9fd4' : bodyMetrics.bmi < 25 ? '#5cb88a' : bodyMetrics.bmi < 30 ? '#d4a84b' : '#e06464' }}>
                    {bodyMetrics.bmi < 18.5 ? '偏轻' : bodyMetrics.bmi < 25 ? '正常' : bodyMetrics.bmi < 30 ? '超重' : '肥胖'}
                  </span>
                </div>
              </div>
            )}
            {/* Metrics list */}
            <div className="flex-1 space-y-2.5 min-w-0">
              {[
                { label: 'BMI', val: bodyMetrics.bmi != null ? bodyMetrics.bmi.toFixed(1) : '--', col: bodyMetrics.bmi != null ? (bodyMetrics.bmi < 18.5 ? 'text-blue' : bodyMetrics.bmi < 25 ? 'text-green' : bodyMetrics.bmi < 30 ? 'text-gold' : 'text-red') : '' },
                { label: '体重', val: bodyMetrics.weightLbs ? bodyMetrics.weightLbs + ' lbs' : '--', col: '' },
                { label: 'HbA1c', val: bodyMetrics.hba1c ? bodyMetrics.hba1c + '%' : '--', col: bodyMetrics.hba1c ? (bodyMetrics.hba1c < 5.7 ? 'text-green' : bodyMetrics.hba1c < 6.5 ? 'text-gold' : 'text-red') : '' },
                { label: '热量预算', val: bodyMetrics.totalKcal + ' kcal', col: '' },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between py-1.5 border-b border-border2 last:border-0">
                  <span className="text-[11px] text-muted">{m.label}</span>
                  <span className={`text-sm font-semibold ${m.col || 'text-text'}`}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Meal & Exercise tabs */}
      <MealExerciseCard plan={nutritionPlan} />

      {/* AI buttons */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-surface border border-gold/10 rounded-2xl p-4 cursor-pointer group" onClick={() => setChatOpen(true)}>
          <div className="text-2xl mb-2">💬</div>
          <div className="text-sm font-medium text-text group-hover:text-gold transition-colors">AI 助手</div>
          <div className="text-[11px] text-muted mt-0.5">对话式数据分析</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="bg-surface border border-gold/10 rounded-2xl p-4 cursor-pointer group" onClick={() => setActivePage('ai')}>
          <div className="text-2xl mb-2">✨</div>
          <div className="text-sm font-medium text-text group-hover:text-gold transition-colors">深度分析</div>
          <div className="text-[11px] text-muted mt-0.5">自定义分析报告</div>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Meal/Exercise card ── */
const BASE_MEALS = [
  { name: '早餐', time: '08:00', kcal: 360, p: 26, f: 18, c: 24, tag: '蛋白质优先', foods: '2全蛋 + 额外2蛋白 · 牛油果⅓个 · 全麦面包1片 · 菠菜/番茄 · 黑咖啡', note: '进食顺序：蛋白质 → 蔬菜 → 碳水' },
  { name: '上午加餐', time: '10:30', kcal: 175, p: 26, f: 7, c: 4, tag: '补充蛋白', foods: '蛋白粉1勺（30g）· 混合坚果10g（杏仁/核桃）', note: '搭配 Sunfiber 膳食纤维冲服，增加饱腹感' },
  { name: '午餐', time: '13:00', kcal: 443, p: 54, f: 10, c: 36, tag: '碳水高峰', foods: '鸡胸肉150g · 糙米饭100g · 西兰花150g · 混合生菜 · 橄榄油1茶匙', note: '胰岛素敏感性最高，可替换：三文鱼120g / 瘦牛肉150g；糙米→红薯100g或藜麦80g' },
  { name: '下午加餐', time: '14:30', kcal: 156, p: 33, f: 2, c: 3, tag: '双倍蛋白', foods: '蛋白粉1勺 · 胶原蛋白肽1勺（10g）' },
  { name: '晚餐', time: '17:30', kcal: 428, p: 42, f: 17, c: 28, tag: '控碳稳糖', foods: '三文鱼130g · 烤红薯80g · 芦笋150g · 嫩豆腐80g · 味噌汤', note: '可替换：虾仁150g / 鸡腿去皮130g；红薯→南瓜100g（碳水更低）' },
  { name: '晚间可选', time: '21:30', kcal: 35, p: 3, f: 1, c: 4, tag: '可选', foods: '花草茶 / 温脱脂牛奶100ml' },
]
const BASE_KCAL = BASE_MEALS.reduce((s, m) => s + m.kcal, 0)
const BASE_P = BASE_MEALS.reduce((s, m) => s + m.p, 0)
const BASE_F = BASE_MEALS.reduce((s, m) => s + m.f, 0)
const BASE_C = BASE_MEALS.reduce((s, m) => s + m.c, 0)

const TYPE_COLORS: Record<string, string> = {
  strength: 'rgba(200,169,125,0.7)', cardio: 'rgba(92,184,138,0.6)',
  yoga: 'rgba(107,159,212,0.6)', rest: 'rgba(255,255,255,0.04)',
}
const TYPE_ICONS: Record<string, string> = {
  strength: '🏋️', cardio: '🚶', yoga: '🧘', rest: '🛌',
}

function MealExerciseCard({ plan }: { plan: NutritionPlan | null }) {
  const [tab, setTab] = useState<'meal' | 'exercise'>('meal')
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const todayDow = new Date().getDay()

  // Merge AI weekPlan with static WEEK_PLAN: AI provides schedule, static provides exercise details
  const activePlan = useMemo(() => {
    if (!plan?.weekPlan?.length) return WEEK_PLAN
    return WEEK_PLAN.map(staticDay => {
      const aiDay = plan.weekPlan!.find(d => d.dow === staticDay.dow)
      if (!aiDay) return staticDay
      return {
        ...staticDay,
        type: aiDay.type,
        duration: aiDay.duration,
        intensity: aiDay.intensity,
        label: aiDay.label,
        icon: TYPE_ICONS[aiDay.type] ?? staticDay.icon,
      }
    })
  }, [plan?.weekPlan])

  useEffect(() => {
    if (tab === 'exercise') {
      const idx = WEEK_PLAN.findIndex(d => d.dow === todayDow)
      if (idx >= 0 && WEEK_PLAN[idx].exercises.length) setExpandedDay(idx)
    }
  }, [tab, todayDow])

  const meals = useMemo(() => {
    if (!plan) return BASE_MEALS
    return BASE_MEALS.map(m => ({
      ...m,
      kcal: Math.round(m.kcal * plan.kcal / BASE_KCAL),
      p: Math.round(m.p * plan.proteinG / BASE_P),
      f: Math.round(m.f * plan.fatG / BASE_F),
      c: Math.round(m.c * plan.carbG / BASE_C),
    }))
  }, [plan])

  const totalKcal = meals.reduce((s, m) => s + m.kcal, 0)
  const totalP = meals.reduce((s, m) => s + m.p, 0)
  const totalF = meals.reduce((s, m) => s + m.f, 0)
  const totalC = meals.reduce((s, m) => s + m.c, 0)

  const mealChartData = {
    labels: meals.map(m => m.name),
    datasets: [
      { label: '蛋白质(g)', data: meals.map(m => m.p), backgroundColor: 'rgba(200,169,125,0.85)', borderRadius: 4, stack: 'm' },
      { label: '脂肪(g)', data: meals.map(m => m.f), backgroundColor: 'rgba(212,168,75,0.70)', borderRadius: 0, stack: 'm' },
      { label: '碳水(g)', data: meals.map(m => m.c), backgroundColor: 'rgba(107,159,212,0.75)', borderRadius: 4, stack: 'm' },
    ]
  }
  const exerciseChartData = {
    labels: activePlan.map(d => d.name),
    datasets: [{ data: activePlan.map(d => d.duration || 5), backgroundColor: activePlan.map(d => TYPE_COLORS[d.type]), borderRadius: 8, barPercentage: 0.6 }]
  }
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      y: { stacked: tab === 'meal', ticks: { color: '#7a756b', font: { size: 10 } }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false } },
      x: { stacked: tab === 'meal', ticks: { color: '#7a756b', font: { size: 10 } }, grid: { display: false } },
    }
  }

  return (
    <Card>
      <div className="flex mb-4 border-b border-border">
        {[{ id: 'meal' as const, label: '膳食计划' }, { id: 'exercise' as const, label: '运动日历' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 pb-2.5 text-xs border-none bg-transparent cursor-pointer transition-all ${tab === t.id ? 'text-gold font-medium' : 'text-muted'}`}
            style={tab === t.id ? { borderBottom: '2px solid var(--color-gold)', marginBottom: '-1px' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'meal' ? (
        <>
          {plan?.aiGenerated && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">✨ AI 今日定制</span>
            </div>
          )}
          {plan?.mealNote && (
            <div className="text-[11px] text-gold/80 bg-gold/6 border border-gold/15 rounded-xl px-3 py-2 mb-3">
              💡 {plan.mealNote}
            </div>
          )}
          <div className="text-[11px] text-muted mb-3">全日 ~{totalKcal} kcal · 蛋白 ~{totalP}g · 脂肪 ~{totalF}g · 碳水 ~{totalC}g</div>
          <div className="h-[200px]">
            <Bar data={mealChartData} options={{ ...baseOpts, plugins: { legend: { display: true, position: 'top' as const, labels: { color: '#a09882', font: { size: 10 }, boxWidth: 8, padding: 12 } } } } as any} />
          </div>
          <div className="flex gap-4 mt-3 mb-4 text-[11px] flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: 'rgba(200,169,125,0.85)' }} />蛋白 {totalP}g</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: 'rgba(212,168,75,0.70)' }} />脂肪 {totalF}g</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: 'rgba(107,159,212,0.75)' }} />碳水 {totalC}g</span>
          </div>
          <div className="space-y-2">
            {meals.map((m, i) => (
              <div key={i} className="bg-surface2 border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
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
                {m.note && (
                  <div className="mt-2 text-[10px] text-muted/70 leading-relaxed border-t border-border pt-2">
                    {m.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {plan?.exerciseFocus && (
            <div className="flex items-center gap-2 mb-3 text-[11px] bg-surface2 border-l-2 border-gold rounded-r-xl px-3 py-2.5">
              <span className="text-gold">🎯</span>
              <span className="text-muted">本周运动重点：</span>
              <span className="text-gold font-medium">{plan.exerciseFocus}</span>
            </div>
          )}
          <div className="h-[160px] mb-3">
            <Bar data={exerciseChartData} options={{ ...baseOpts, plugins: { legend: { display: false } } } as any} />
          </div>
          <div className="flex gap-3 mb-4 text-[10px] text-muted flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-gold/70" />力量训练</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-green/60" />有氧恢复</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-blue/60" />主动恢复</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded border border-border" style={{ background: 'rgba(255,255,255,0.04)' }} />休息</span>
          </div>
          <div>
            {WEEK_PLAN.map((day, idx) => {
              const isToday = day.dow === todayDow
              const open = expandedDay === idx
              return (
                <div key={idx}>
                  <div onClick={() => day.exercises.length && setExpandedDay(open ? null : idx)}
                    className={`flex items-center gap-3 py-3 border-b border-border2 transition-colors ${day.exercises.length ? 'cursor-pointer hover:bg-surface2/50 rounded-lg px-1' : ''}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: TYPE_COLORS[day.type] + '20' }}>{day.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {day.name}
                        {isToday && <span className="text-[9px] text-gold bg-gold/10 px-2 py-0.5 rounded font-semibold">今日</span>}
                      </div>
                      <div className="text-[11px] text-muted">{day.label}{day.intensity !== '—' ? ' · ' + day.intensity : ''}</div>
                    </div>
                    <span className="text-xs text-muted flex-shrink-0">{day.duration ? day.duration + '分' : '—'}</span>
                    {day.exercises.length > 0 && (
                      <span className={`text-muted text-sm transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-90' : ''}`}>›</span>
                    )}
                  </div>
                  {open && day.exercises.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pl-12 pb-3 overflow-hidden">
                      <div className="text-[11px] text-muted mb-2 leading-relaxed pt-2">{day.desc}</div>
                      {day.exercises.map((ex, ei) => (
                        <div key={ei} className="flex items-center justify-between py-2 border-b border-border2 last:border-b-0 gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium">{ex.name}</div>
                            <div className="text-[10px] text-muted mt-0.5">{ex.detail}</div>
                          </div>
                          {ex.youtube && (
                            <a href={ex.youtube} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex-shrink-0 flex items-center gap-1 text-[10px] font-medium text-gold/80 bg-gold/10 border border-gold/20 rounded-lg px-2.5 py-1.5 hover:bg-gold/20 hover:text-gold transition-colors no-underline">
                              <span className="text-[9px]">▶</span>
                              <span>示范</span>
                            </a>
                          )}
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
