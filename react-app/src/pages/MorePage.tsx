import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Card, { Badge } from '../components/Card'
import { upsertCgmBatch } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'

interface ParsedRow { ts: string; val: number }

function parseLibreCSV(text: string): ParsedRow[] {
  const lines = text.split('\n')
  const results: ParsedRow[] = []

  // LibreView CSV: first rows are headers/metadata, data rows have glucose in different columns
  // Try to auto-detect: find the header row with "时间戳" or "Timestamp" or "Device Timestamp"
  let tsCol = -1, glucoseCol = -1, startRow = 0

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    const lower = cols.map(c => c.toLowerCase())

    // Look for timestamp column
    const tsIdx = lower.findIndex(c =>
      c.includes('timestamp') || c.includes('时间戳') || c.includes('device timestamp') || c === '时间'
    )
    // Look for glucose column
    const gIdx = lower.findIndex(c =>
      c.includes('glucose') || c.includes('血糖') || c.includes('historic glucose') || c.includes('scan glucose')
    )

    if (tsIdx >= 0 && gIdx >= 0) {
      tsCol = tsIdx; glucoseCol = gIdx; startRow = i + 1
      break
    }
  }

  // Fallback: assume col 2 = timestamp, col 3 = glucose (common LibreView format)
  if (tsCol < 0) { tsCol = 2; glucoseCol = 3; startRow = 1 }

  for (let i = startRow; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    if (cols.length <= Math.max(tsCol, glucoseCol)) continue

    const tsRaw = cols[tsCol]
    const glucoseStr = cols[glucoseCol]
    if (!tsRaw || !glucoseStr) continue

    const glucose = parseFloat(glucoseStr)
    if (isNaN(glucose) || glucose < 20 || glucose > 500) continue

    // Try parsing various date formats
    let date = new Date(tsRaw)
    if (isNaN(date.getTime())) {
      // Try DD-MM-YYYY HH:mm or DD/MM/YYYY HH:mm
      const m = tsRaw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})/)
      if (m) date = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
    }
    if (isNaN(date.getTime())) continue

    results.push({ ts: date.toISOString(), val: glucose })
  }

  return results
}

export default function MorePage() {
  const { refreshData, user } = useApp()
  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadPct, setUploadPct] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadStats, setUploadStats] = useState<{ total: number; time: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setUploadMsg('')
    setUploadStats(null)
    const reader = new FileReader()
    reader.onload = () => {
      const results = parseLibreCSV(reader.result as string)
      setParsed(results)
      if (!results.length) setUploadMsg('⚠️ 未从文件中解析到有效血糖数据，请检查 CSV 格式')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) handleFile(file)
  }, [handleFile])

  const upload = async () => {
    if (!parsed.length || !user) return
    setUploading(true); setUploadPct(0); setUploadMsg(''); setUploadStats(null)
    const start = Date.now()
    const batchSize = 500
    try {
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize).map(r => ({ device_timestamp: r.ts, glucose_mg_dl: r.val }))
        await upsertCgmBatch(user.id, batch)
        setUploadPct(Math.round((i + batch.length) / parsed.length * 100))
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      setUploadStats({ total: parsed.length, time: parseFloat(elapsed) })
      setUploadMsg('✅ 上传完成')
      refreshData()
    } catch (e: any) {
      setUploadMsg('❌ 上传失败：' + e.message)
    }
    setUploading(false)
  }

  const reset = () => {
    setParsed([]); setFileName(''); setUploadMsg(''); setUploadStats(null); setUploadPct(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const avg = parsed.length ? Math.round(parsed.reduce((s, r) => s + r.val, 0) / parsed.length) : 0
  const dateRange = parsed.length ? {
    from: parsed.reduce((m, r) => r.ts < m ? r.ts : m, parsed[0].ts).slice(0, 10),
    to: parsed.reduce((m, r) => r.ts > m ? r.ts : m, parsed[0].ts).slice(0, 10),
  } : null

  return (
    <div className="pb-4">
      <div className="pt-5 pb-3.5">
        <h2 className="text-[26px] font-bold tracking-tight">更多</h2>
        <p className="text-sm text-muted mt-1">数据导入、应急指南与系统设置</p>
      </div>

      {/* CSV Upload */}
      <Card title="导入 CGM 数据">
        {/* User badge */}
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-muted">上传到：</span>
          <span className="inline-flex items-center gap-1.5 bg-gold/10 text-gold font-medium px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            {user?.display_name || user?.username}
          </span>
        </div>

        <div className="bg-gold/8 border border-gold/20 rounded-xl p-3 text-xs text-gold/80 mb-3.5 leading-relaxed">
          📋 <strong>Libre 3 CSV 导出：</strong> LibreView → 报告 → 导出数据 → 选择日期范围 → 下载 CSV
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-[18px] p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-gold bg-gold/10 scale-[1.01]' : 'border-gold/25 bg-gold/4 hover:border-gold hover:bg-gold/8'}`}
        >
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <div className="text-4xl mb-3">{dragging ? '📥' : '📂'}</div>
          <p className="text-sm text-muted"><strong className="text-gold">点击选择</strong> 或拖拽 CSV 文件到此处</p>
          <p className="text-[11px] text-muted2 mt-1.5">支持 LibreView / LibreLink 导出的标准 CSV 格式</p>
        </div>

        {/* Parse results */}
        <AnimatePresence>
          {parsed.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              {/* File info */}
              <div className="bg-surface2 rounded-xl p-3.5 mb-3 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">📄</span>
                  <span className="text-sm font-medium truncate">{fileName}</span>
                  <Badge color="blue">{parsed.length} 条</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">开始日期</div>
                    <div className="text-sm font-semibold mt-0.5">{dateRange?.from}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">结束日期</div>
                    <div className="text-sm font-semibold mt-0.5">{dateRange?.to}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">血糖均值</div>
                    <div className="text-sm font-semibold mt-0.5">{avg} <span className="text-[10px] text-muted font-normal">mg/dL</span></div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {uploading && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted mb-1.5">
                    <span>正在上传...</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-accent to-green rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: uploadPct + '%' }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}

              {/* Upload complete stats */}
              {uploadStats && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green/10 border border-green/20 rounded-xl p-3.5 mb-3 flex items-center gap-3"
                >
                  <span className="text-2xl">✅</span>
                  <div>
                    <div className="text-sm font-semibold text-green">上传成功</div>
                    <div className="text-xs text-muted mt-0.5">
                      共 {uploadStats.total} 条数据，耗时 {uploadStats.time}s，已归属到 {user?.display_name || user?.username}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={upload} disabled={uploading || !!uploadStats}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-gold to-[#a08560] text-bg border-none cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(200,169,125,0.2)]">
                  {uploading ? `上传中 ${uploadPct}%` : uploadStats ? '已上传' : '📤 上传到数据库'}
                </button>
                <button onClick={reset}
                  className="py-3 px-5 rounded-xl text-sm font-medium bg-surface2 text-text border border-border cursor-pointer active:scale-[0.98]">
                  {uploadStats ? '上传更多' : '重新选择'}
                </button>
              </div>

              {uploadMsg && !uploadStats && (
                <p className="text-xs mt-2.5 text-center">{uploadMsg}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Emergency guides */}
      <div className="border border-red/20 bg-red/4 rounded-[18px] p-[18px] mb-3">
        <div className="text-[11px] font-semibold text-red uppercase tracking-wider mb-3.5">🚨 低血糖应急 — 15/15 原则</div>
        <div className="text-sm leading-8 text-red/85">
          <strong>识别：</strong>心慌、手抖、出冷汗、饥饿感、CGM 报警 &lt;70<br/>
          <strong>Step 1：</strong>立即补充 15g 快速碳水<br/>
          <strong>Step 2：</strong>等待 15分钟后复测<br/>
          <strong>Step 3：</strong>仍 &lt;70 则重复 Step 1–2<br/>
          <strong>Step 4：</strong>恢复后补充少量蛋白质零食
        </div>
      </div>

      <div className="border border-amber/18 bg-amber/3 rounded-[18px] p-[18px] mb-3">
        <div className="text-[11px] font-semibold text-amber uppercase tracking-wider mb-3.5">⚠️ 高血糖持续 (&gt;250 mg/dL)</div>
        <div className="text-sm leading-relaxed text-amber/85">
          <strong>信号：</strong>口干、多尿、极度疲乏<br/>
          <strong>处理：</strong>大量补水 → 检查用药 → 伴恶心呕吐立即就医<br/>
          <strong>警惕：</strong>酮症酸中毒 (DKA) — 速至急诊
        </div>
      </div>

      <Card title="📋 CGM 报警标准">
        <div className="flex justify-between py-2.5 border-b border-border2"><span>低血糖报警</span><Badge color="red">70 mg/dL</Badge></div>
        <div className="flex justify-between py-2.5 border-b border-border2"><span>高血糖报警</span><Badge color="amber">180 mg/dL</Badge></div>
        <div className="flex justify-between py-2.5"><span>紧急低血糖</span><Badge color="red">55 mg/dL</Badge></div>
      </Card>

      <Card title="📞 紧急联系">
        <div className="flex justify-between py-2.5 border-b border-border2"><span>急救</span><span className="text-lg font-bold text-red">911</span></div>
        <div className="flex justify-between py-2.5"><span>主治医生</span><span className="text-xs text-muted">请在配置中填写</span></div>
      </Card>
    </div>
  )
}
