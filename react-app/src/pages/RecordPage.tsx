import { useState } from 'react'
import Card from '../components/Card'
import { upsertDailyRecord, insertMedication, updateMedication, deleteMedication } from '../lib/supabase'
import { MED_DRUGS } from '../lib/constants'
import { useApp } from '../contexts/AppContext'

export default function RecordPage() {
  const { refreshData, refreshMeds, user, medications } = useApp()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [fasting, setFasting] = useState('')
  const [postMeal, setPostMeal] = useState('')
  const [sbp, setSbp] = useState('')
  const [dbp, setDbp] = useState('')
  const [weight, setWeight] = useState('')
  const [hba1c, setHba1c] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [cat, setCat] = useState('')
  const [drug, setDrug] = useState('')
  const [dose, setDose] = useState('')
  const [medStart, setMedStart] = useState(new Date().toISOString().slice(0, 10))
  const [medMsg, setMedMsg] = useState('')
  const [medLoading, setMedLoading] = useState(false)

  const saveRecord = async () => {
    try {
      await upsertDailyRecord(user!.id, {
        record_date: date,
        fasting_glucose: fasting ? parseFloat(fasting) : null,
        post_meal_glucose: postMeal ? parseFloat(postMeal) : null,
        systolic_bp: sbp ? parseFloat(sbp) : null,
        diastolic_bp: dbp ? parseFloat(dbp) : null,
        weight_lbs: weight ? parseFloat(weight) : null,
        hba1c: hba1c ? parseFloat(hba1c) : null,
        notes: notes || null,
      })
      setMsg('✅ 保存成功')
      refreshData()
    } catch (e: any) {
      setMsg('❌ ' + e.message)
    }
  }

  const addMed = async () => {
    if (!cat || !drug) { setMedMsg('请选择药物类别和名称'); return }
    if (!user) { setMedMsg('请先登录'); return }
    setMedLoading(true)
    try {
      await insertMedication(user.id, { cat, drug, dose, start_date: medStart, stop_date: null })
      await refreshMeds()
      setMedMsg('✅ 已添加')
      setCat(''); setDrug(''); setDose('')
    } catch (e: any) {
      setMedMsg('❌ ' + e.message)
    }
    setMedLoading(false)
  }

  const stopMed = async (id: number) => {
    if (!user) return
    try {
      await updateMedication(user.id, id, { stop_date: new Date().toISOString().slice(0, 10) })
      await refreshMeds()
    } catch (e: any) {
      setMedMsg('❌ ' + e.message)
    }
  }

  const deleteMed = async (id: number) => {
    if (!user) return
    try {
      await deleteMedication(user.id, id)
      await refreshMeds()
    } catch (e: any) {
      setMedMsg('❌ ' + e.message)
    }
  }

  const drugs = MED_DRUGS[cat] || []
  const today = new Date().toISOString().slice(0, 10)
  const fieldClass = "w-full py-2.5 px-3 border border-border rounded-[10px] text-sm bg-surface2 text-text outline-none transition-all focus:border-gold/40 focus:bg-surface3"

  return (
    <div className="pb-4">
      <div className="pt-5 pb-3.5">
        <h2 className="text-[26px] font-bold tracking-tight">日常记录</h2>
        <p className="text-sm text-muted mt-1">记录今日血糖、血压、体重等数据</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: '日期', type: 'date', value: date, set: setDate },
            { label: '空腹血糖 (mg/dL)', type: 'number', value: fasting, set: setFasting, ph: '70–100' },
            { label: '餐后血糖 (mg/dL)', type: 'number', value: postMeal, set: setPostMeal, ph: '<180' },
            { label: '收缩压 (mmHg)', type: 'number', value: sbp, set: setSbp, ph: '<120' },
            { label: '舒张压 (mmHg)', type: 'number', value: dbp, set: setDbp, ph: '<80' },
            { label: '体重 (lbs)', type: 'number', value: weight, set: setWeight, ph: '180' },
            { label: 'HbA1c %', type: 'number', value: hba1c, set: setHba1c, ph: '<6%' },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} className={fieldClass} />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">备注</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="饮食、运动、用药等情况..." className={`${fieldClass} resize-y min-h-16`} />
        </div>
        <div className="flex gap-2 mt-3.5">
          <button onClick={saveRecord} className="py-2.5 px-5 rounded-xl text-sm font-medium cursor-pointer bg-gradient-to-r from-gold to-[#a08560] text-bg border-none shadow-[0_4px_16px_rgba(200,169,125,0.2)] active:scale-[0.97]">
            保存记录
          </button>
          <button onClick={() => { setFasting(''); setPostMeal(''); setSbp(''); setDbp(''); setWeight(''); setHba1c(''); setNotes('') }}
            className="py-2.5 px-5 rounded-xl text-sm font-medium cursor-pointer bg-surface2 text-text border border-border active:scale-[0.97]">
            清空
          </button>
        </div>
        {msg && <p className="text-xs mt-2.5">{msg}</p>}
      </Card>

      {/* Medication management */}
      <Card title="💊 用药管理">
        <p className="text-xs text-muted mb-3.5 leading-relaxed">记录正在使用的糖尿病药物，AI 分析时将一并纳入参考</p>
        <div className="bg-surface2 rounded-xl p-3.5 border border-border mb-3.5">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">添加药物</div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">药物类别</label>
              <select value={cat} onChange={e => { setCat(e.target.value); setDrug('') }} className={fieldClass}>
                <option value="">选择类别...</option>
                {Object.keys(MED_DRUGS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">具体药物</label>
              <select value={drug} onChange={e => setDrug(e.target.value)} className={fieldClass}>
                <option value="">请先选择类别</option>
                {drugs.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">剂量 / 频率</label>
              <input value={dose} onChange={e => setDose(e.target.value)} placeholder="例如：0.5mg 每周一次" className={fieldClass} />
            </div>
            <div>
              <label className="block text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">开始日期</label>
              <input type="date" value={medStart} onChange={e => setMedStart(e.target.value)} className={fieldClass} />
            </div>
          </div>
          <button onClick={addMed} className="mt-2.5 py-2 px-4 rounded-xl text-sm font-medium bg-gradient-to-r from-gold to-[#a08560] text-bg border-none cursor-pointer active:scale-[0.97]">
            添加药物记录
          </button>
          {medMsg && <p className="text-xs mt-2">{medMsg}</p>}
        </div>

        {/* Med list */}
        {meds.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">暂无药物记录</p>
        ) : meds.map(m => {
          const active = !m.stopDate || m.stopDate >= today
          return (
            <div key={m.id} className="bg-surface2 border border-border rounded-xl p-3.5 mb-2.5 flex items-start gap-3">
              <span className="text-[22px] flex-shrink-0 mt-0.5">💊</span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gold font-medium uppercase tracking-wider mb-1">{m.cat}</div>
                <div className="text-sm font-semibold mb-0.5">{m.drug}</div>
                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${active ? 'bg-green-dim text-green' : 'bg-surface3 text-muted'}`}>
                  {active ? '使用中' : '已停药'}
                </span>
                <div className="text-[11px] text-muted mt-1 leading-relaxed">
                  {m.dose && <><b>剂量：</b>{m.dose}<br /></>}
                  <b>开始：</b>{m.startDate}
                  {m.stopDate && <><br /><b>停药：</b>{m.stopDate}</>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {active && (
                  <button onClick={() => stopMed(m.id)} className="text-[11px] py-1 px-2.5 rounded-lg border border-border bg-surface text-muted cursor-pointer hover:text-red hover:border-red/30">
                    停药
                  </button>
                )}
                <button onClick={() => deleteMed(m.id)} className="text-[11px] py-1 px-2.5 rounded-lg border border-red/20 bg-red-dim text-red cursor-pointer">
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
