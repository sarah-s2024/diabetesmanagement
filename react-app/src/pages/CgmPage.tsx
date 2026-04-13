import { useState, useEffect, useMemo } from 'react'
import { Chart as ChartJS, registerables } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import Card from '../components/Card'
import { useApp } from '../contexts/AppContext'
import { fetchCgmData } from '../lib/supabase'
import type { CgmReading } from '../lib/supabase'

ChartJS.register(...registerables)

export default function CgmPage() {
  const { cgmData: defaultData, user } = useApp()
  const [data, setData] = useState<CgmReading[]>(defaultData)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quick, setQuick] = useState('')

  useEffect(() => {
    if (!from && !to) { setData(defaultData); return }
    if (!user) return
    fetchCgmData(user.id, from || undefined, to ? to + 'T23:59:59' : undefined).then(setData)
  }, [from, to, defaultData, user])

  const applyQuick = (val: string) => {
    setQuick(val)
    if (!val || val === 'all') { setFrom(''); setTo(''); return }
    const d = new Date()
    setTo(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() - parseInt(val))
    setFrom(d.toISOString().slice(0, 10))
  }

  const stats = useMemo(() => {
    if (!data.length) return null
    const vals = data.map(d => d.glucose_mg_dl)
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const sd = Math.round(Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length))
    return { avg, max: Math.max(...vals), min: Math.min(...vals), sd }
  }, [data])

  // Year badge
  const yearBadge = useMemo(() => {
    if (!data.length) return ''
    const years = [...new Set(data.map(d => new Date(d.device_timestamp).getFullYear()))].sort()
    return years.length === 1 ? `${years[0]}年` : `${years[0]}–${years[years.length - 1]}年`
  }, [data])

  // Downsampled line chart
  const step = Math.max(1, Math.floor(data.length / 300))
  const ds = data.filter((_, i) => i % step === 0)

  const chartData = useMemo(() => ({
    labels: ds.map(d => new Date(d.device_timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    datasets: [
      { data: ds.map(d => d.glucose_mg_dl), borderColor: '#c8a97d', backgroundColor: 'rgba(200,169,125,0.06)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 1.5 },
      { data: Array(ds.length).fill(70), borderColor: 'rgba(224,100,100,0.45)', borderDash: [4, 4] as number[], borderWidth: 1, pointRadius: 0, fill: false },
      { data: Array(ds.length).fill(180), borderColor: 'rgba(212,168,75,0.45)', borderDash: [4, 4] as number[], borderWidth: 1, pointRadius: 0, fill: false },
    ]
  }), [ds])

  // AGP — hourly average (use full data set)
  const agpData = useMemo(() => {
    const hourly = Array.from({ length: 24 }, (_, h) => {
      const pts = data.filter(d => new Date(d.device_timestamp).getHours() === h)
      return pts.length ? Math.round(pts.reduce((a, d) => a + d.glucose_mg_dl, 0) / pts.length) : null
    })
    return {
      labels: Array.from({ length: 24 }, (_, i) => i + ':00'),
      datasets: [{
        label: '均值血糖',
        data: hourly,
        backgroundColor: hourly.map(v => !v ? 'transparent' : v < 70 ? 'rgba(224,100,100,0.65)' : v > 180 ? 'rgba(212,168,75,0.65)' : 'rgba(92,184,138,0.65)'),
        borderRadius: 5,
      }]
    }
  }, [data])

  const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
    scales: {
      y: { ticks: { color: '#7a756b', font: { size: 10 } }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false }, suggestedMin: 50, suggestedMax: 250 },
      x: { ticks: { color: '#7a756b', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
    },
  }
  const agpOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 60, max: 220, ticks: { color: '#7a756b', font: { size: 10 } }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false } },
      x: { ticks: { color: '#7a756b', font: { size: 10 }, maxTicksLimit: 12 }, grid: { display: false } },
    }
  }

  return (
    <div className="pb-4">
      <div className="pt-5 pb-3.5 flex items-end justify-between">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">CGM 曲线</h2>
          <p className="text-sm text-muted mt-1">连续血糖监测趋势与时段分析</p>
        </div>
        {yearBadge && (
          <span className="text-[11px] text-gold bg-gold/10 px-2.5 py-1 rounded-full font-medium mb-1">{yearBadge}</span>
        )}
      </div>

      <Card>
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <select value={quick} onChange={e => applyQuick(e.target.value)}
            className="text-xs py-1.5 px-2.5 border border-border rounded-[10px] bg-surface2 text-text flex-1 min-w-[100px] outline-none">
            <option value="">自定义范围</option>
            <option value="1">今日</option>
            <option value="3">近3天</option>
            <option value="7">近7天</option>
            <option value="14">近14天</option>
            <option value="30">近30天</option>
            <option value="all">全部数据</option>
          </select>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setQuick('') }}
            className="text-xs py-1.5 px-2.5 border border-border rounded-[10px] bg-surface2 text-text outline-none" />
          <span className="text-xs text-muted">至</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setQuick('') }}
            className="text-xs py-1.5 px-2.5 border border-border rounded-[10px] bg-surface2 text-text outline-none" />
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {[
              { label: '均值', val: stats.avg, col: '' },
              { label: '最高', val: stats.max, col: 'text-amber' },
              { label: '最低', val: stats.min, col: 'text-blue' },
              { label: '标准差', val: stats.sd, col: '' },
            ].map(m => (
              <div key={m.label} className="bg-surface2 border border-border rounded-xl p-3.5">
                <div className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">{m.label}</div>
                <div className={`text-2xl font-bold tracking-tight ${m.col || 'text-text'}`}>{m.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Line chart */}
        <div className="relative h-60">
          <Line data={chartData} options={lineOpts as any} />
        </div>
      </Card>

      {/* AGP — hourly pattern */}
      {data.length > 0 && (
        <Card title="时段血糖规律（AGP）">
          <p className="text-[11px] text-muted mb-3">每小时平均血糖 — 识别高/低血糖规律时段</p>
          <div className="relative h-[190px]">
            <Bar data={agpData} options={agpOpts as any} />
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green/65" />达标 70–180</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red/65" />低血糖 &lt;70</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber/65" />高血糖 &gt;180</span>
          </div>
        </Card>
      )}
    </div>
  )
}
