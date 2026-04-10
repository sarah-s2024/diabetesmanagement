import { useState, useRef, useEffect } from 'react'
import Card from '../components/Card'
import { useApp } from '../contexts/AppContext'
import { callAi, getAiProvider } from '../lib/ai-client'
import { getActiveMeds } from '../lib/storage'

export default function AiAnalysisPage() {
  const { cgmData, dailyRecords, setActivePage } = useApp()
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataSummary, setDataSummary] = useState('')
  const resultRef = useRef<HTMLDivElement>(null)

  const buildDataBlock = () => {
    const now = Date.now(), ago90 = now - 90 * 24 * 3600000
    const recent = cgmData.filter(r => new Date(r.device_timestamp).getTime() >= ago90)

    const cgmStats = (arr: typeof cgmData) => {
      if (!arr.length) return null
      const vals = arr.map(r => r.glucose_mg_dl)
      const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)
      const ir = vals.filter(v=>v>=70&&v<=180).length
      const lo = vals.filter(v=>v<70).length
      const hi = vals.filter(v=>v>180).length
      return { tir: Math.round(ir/vals.length*100), low: Math.round(lo/vals.length*100), high: Math.round(hi/vals.length*100), avg, max: Math.max(...vals), min: Math.min(...vals) }
    }

    const overall = cgmStats(recent)
    const hba1cRecs = dailyRecords.filter(r => r.hba1c).map(r => `${r.record_date.slice(0,7)} ${r.hba1c}%`)
    const weightRecs = dailyRecords.filter(r => r.weight_lbs).slice(0,12).map(r => `${r.record_date.slice(5)} ${r.weight_lbs}lbs`)
    const meds = getActiveMeds()
    const medLines = meds.map(m => `  ${m.cat}：${m.drug}${m.dose ? ' ('+m.dose+')' : ''} 自${m.startDate}起`)

    const parts = [
      overall ? `【CGM近3月】TIR: ${overall.tir}%  低血糖: ${overall.low}%  高血糖: ${overall.high}%  均值: ${overall.avg} mg/dL（最高${overall.max}，最低${overall.min}）` : '',
      hba1cRecs.length ? `【HbA1c】${hba1cRecs.join('，')}` : '',
      weightRecs.length ? `【体重】${weightRecs.join('，')}` : '',
      medLines.length ? `【当前用药】\n${medLines.join('\n')}` : '',
    ].filter(Boolean).join('\n\n')
    return parts
  }

  const runAnalysis = async (customPrompt?: string) => {
    if (!getAiProvider()) { setResult('请先配置 API Key'); return }
    const dataBlock = buildDataBlock()
    if (!dataBlock) { setResult('暂无足够数据'); return }

    setDataSummary(dataBlock)
    setLoading(true); setResult('')

    const userPrompt = customPrompt || prompt || '请全面分析我的健康数据'
    const sysPrompt = '你是一位专业的糖尿病健康顾问。用中文给出清晰详细的分析建议。最后注明：本分析仅供参考，不构成医疗诊断，请遵医嘱。'

    try {
      const r = await callAi({
        model: 'claude-sonnet-4-6', max_tokens: 1500, stream: true,
        system: sysPrompt,
        messages: [{ role: 'user', content: `${userPrompt}\n\n以下是我的健康数据：\n\n${dataBlock}` }]
      })
      if (!r || !r.res.ok) throw new Error(`HTTP ${r?.res?.status}`)

      const reader = r.res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      const isOpenAi = r.format === 'openai'

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const c = JSON.parse(payload)
            if (isOpenAi) {
              const t = c.choices?.[0]?.delta?.content
              if (t) setResult(prev => prev + t)
            } else {
              if (c.type === 'content_block_delta' && c.delta?.type === 'text_delta')
                setResult(prev => prev + c.delta.text)
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setResult(`请求失败：${e.message}`)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (resultRef.current) resultRef.current.scrollTop = resultRef.current.scrollHeight
  }, [result])

  return (
    <div className="pb-4">
      <div className="flex items-center gap-3 pt-4 pb-3.5 sticky top-0 bg-bg z-10">
        <button onClick={() => setActivePage('dashboard')}
          className="w-9 h-9 rounded-full bg-surface2 border border-border text-text flex items-center justify-center cursor-pointer flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h2 className="text-[17px] font-bold">AI 健康分析</h2>
          <p className="text-[11px] text-muted mt-0.5">基于你的健康数据生成</p>
        </div>
      </div>

      {/* Prompt input */}
      <Card>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="输入你想分析的方向，例如：分析我最近的血糖控制情况..."
          rows={3}
          className="w-full bg-surface2 border border-border rounded-xl text-text p-3 text-sm resize-none font-inherit leading-relaxed outline-none focus:border-accent mb-3"
        />
        <div className="flex gap-2">
          <button onClick={() => runAnalysis()} disabled={loading}
            className="flex-1 py-3 bg-gradient-to-r from-accent to-purple-700 text-white border-none rounded-[14px] text-[15px] font-semibold cursor-pointer shadow-[0_6px_24px_rgba(139,92,246,0.35)] disabled:opacity-50 active:scale-[0.98]">
            {loading ? '分析中...' : '✨ 开始分析'}
          </button>
          <button onClick={() => runAnalysis('请全面分析我近三个月的健康数据，包括数据解读、风险提示、饮食运动建议、下次就诊关注点')} disabled={loading}
            className="flex-1 py-3 bg-surface2 text-text border border-border rounded-[14px] text-[15px] font-semibold cursor-pointer disabled:opacity-50 active:scale-[0.98]">
            📊 默认全面分析
          </button>
        </div>
      </Card>

      {/* Data summary */}
      {dataSummary && (
        <Card>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-base">📊</span>
            <span className="text-sm font-semibold">数据摘要</span>
          </div>
          <div className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{dataSummary}</div>
        </Card>
      )}

      {/* Result */}
      {(result || loading) && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🤖</span>
            <span className="text-sm font-semibold">AI 分析结果</span>
            {loading && <span className="ml-auto text-[11px] text-accent animate-pulse">生成中...</span>}
          </div>
          <div ref={resultRef} className="text-sm leading-relaxed whitespace-pre-wrap min-h-[60px] max-h-[60vh] overflow-y-auto">
            {result || <span className="text-muted">等待 AI 响应...</span>}
          </div>
        </Card>
      )}
    </div>
  )
}
