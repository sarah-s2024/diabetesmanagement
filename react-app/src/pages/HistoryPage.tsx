import { useState, useMemo } from 'react'
import { Chart as ChartJS, registerables } from 'chart.js'
import { Line } from 'react-chartjs-2'
import Card, { Badge } from '../components/Card'
import { useApp } from '../contexts/AppContext'

ChartJS.register(...registerables)

type Tab = 'glucose' | 'bp' | 'weight'

export default function HistoryPage() {
  const { dailyRecords } = useApp()
  const [tab, setTab] = useState<Tab>('glucose')

  const chartData = useMemo(() => {
    const sorted = [...dailyRecords].reverse()
    const labels = sorted.map(r => r.record_date.slice(5))
    if (tab === 'glucose') return {
      labels,
      datasets: [
        { label: '空腹', data: sorted.map(r => r.fasting_glucose), borderColor: '#c8a97d', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        { label: '餐后', data: sorted.map(r => r.post_meal_glucose), borderColor: '#5cb88a', tension: 0.3, pointRadius: 3, borderWidth: 2 },
      ]
    }
    if (tab === 'bp') return {
      labels,
      datasets: [
        { label: '收缩压', data: sorted.map(r => r.systolic_bp), borderColor: '#e06464', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        { label: '舒张压', data: sorted.map(r => r.diastolic_bp), borderColor: '#6b9fd4', tension: 0.3, pointRadius: 3, borderWidth: 2 },
      ]
    }
    return {
      labels,
      datasets: [{ label: '体重(lbs)', data: sorted.map(r => r.weight_lbs), borderColor: '#d4a84b', tension: 0.3, pointRadius: 3, borderWidth: 2 }]
    }
  }, [dailyRecords, tab])

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#7a756b', font: { size: 10 } } } },
    scales: {
      y: { ticks: { color: '#7a756b', font: { size: 10 } }, grid: { color: 'rgba(200,169,125,0.04)' }, border: { display: false } },
      x: { ticks: { color: '#7a756b', font: { size: 10 } }, grid: { display: false } },
    }
  }

  const statusBadge = (r: typeof dailyRecords[0]) => {
    if (r.fasting_glucose && r.fasting_glucose < 100 && (!r.post_meal_glucose || r.post_meal_glucose < 140))
      return <Badge color="green">达标</Badge>
    if (r.fasting_glucose && r.fasting_glucose > 130)
      return <Badge color="red">偏高</Badge>
    return <Badge color="amber">关注</Badge>
  }

  const exportCSV = () => {
    const headers = ['日期', '空腹血糖', '餐后血糖', '收缩压', '舒张压', '体重(lbs)', 'HbA1c', '备注']
    const rows = dailyRecords.map(r => [
      r.record_date,
      r.fasting_glucose ?? '',
      r.post_meal_glucose ?? '',
      r.systolic_bp ?? '',
      r.diastolic_bp ?? '',
      r.weight_lbs ?? '',
      r.hba1c ?? '',
      (r.notes ?? '').replace(/,/g, '；'),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `健康记录_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="pb-4">
      <div className="pt-5 pb-3.5">
        <h2 className="text-[26px] font-bold tracking-tight">历史数据</h2>
        <p className="text-sm text-muted mt-1">近期趋势与每日记录汇总</p>
      </div>

      <Card>
        <div className="flex gap-0.5 mb-3.5 bg-surface2 rounded-xl p-0.5">
          {(['glucose', 'bp', 'weight'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 px-2.5 text-xs rounded-[10px] text-center transition-all font-medium border-none cursor-pointer
                ${tab === t ? 'bg-surface text-text shadow-[0_1px_6px_rgba(0,0,0,0.35)] font-semibold' : 'bg-transparent text-muted'}`}>
              {t === 'glucose' ? '血糖' : t === 'bp' ? '血压' : '体重'}
            </button>
          ))}
        </div>
        <div className="relative h-[210px]">
          <Line data={chartData as any} options={chartOpts as any} />
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-3.5">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">每日记录</span>
          {dailyRecords.length > 0 && (
            <button onClick={exportCSV}
              className="text-[11px] py-1.5 px-3 rounded-lg bg-surface2 border border-border text-muted hover:text-gold hover:border-gold/30 cursor-pointer transition-colors">
              导出 CSV
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {['日期', '空腹', '餐后', '血压', '体重', 'A1c', '状态'].map(h => (
                  <th key={h} className="text-left py-2 px-2.5 text-[10px] text-muted font-semibold border-b border-border uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyRecords.map(r => (
                <tr key={r.record_date} className="hover:bg-surface2/50 transition-colors">
                  <td className="py-2 px-2.5 border-b border-border2">{r.record_date.slice(5)}</td>
                  <td className={`py-2 px-2.5 border-b border-border2 font-medium ${r.fasting_glucose ? (r.fasting_glucose <= 100 ? 'text-green' : r.fasting_glucose <= 130 ? 'text-gold' : 'text-red') : 'text-muted'}`}>
                    {r.fasting_glucose || '--'}
                  </td>
                  <td className="py-2 px-2.5 border-b border-border2">{r.post_meal_glucose || '--'}</td>
                  <td className="py-2 px-2.5 border-b border-border2">{r.systolic_bp && r.diastolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '--'}</td>
                  <td className="py-2 px-2.5 border-b border-border2">{r.weight_lbs || '--'}</td>
                  <td className="py-2 px-2.5 border-b border-border2">{r.hba1c || '--'}</td>
                  <td className="py-2 px-2.5 border-b border-border2">{statusBadge(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!dailyRecords.length && <p className="text-sm text-muted text-center py-6">暂无记录数据</p>}
      </Card>
    </div>
  )
}
