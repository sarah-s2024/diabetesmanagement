import { getConfig } from './config'

export interface AiCallOptions {
  model: string
  system?: string
  messages: { role: string; content: string | object[] }[]
  max_tokens: number
  stream?: boolean
  tools?: ToolDef[]
}

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters?: object }
}

export interface AiResponse {
  res: Response
  format: 'openai' | 'anthropic'
}

/* ── Streaming types ── */
export interface StreamToolCall { id: string; name: string; args: Record<string, any> }
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: StreamToolCall }
  | { type: 'done' }

/** Parse SSE stream from OpenAI or Anthropic format */
export async function* parseAiStream(res: Response, format: 'openai' | 'anthropic'): AsyncGenerator<StreamEvent> {
  if (!res.body) { yield { type: 'done' }; return }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // Accumulate partial tool calls
  const pendingTools = new Map<number | string, { id: string; name: string; argsStr: string }>()

  function flushTool(key: number | string): StreamEvent | null {
    const tc = pendingTools.get(key)
    if (!tc || !tc.name) return null
    pendingTools.delete(key)
    try {
      return { type: 'tool_call', toolCall: { id: tc.id, name: tc.name, args: JSON.parse(tc.argsStr || '{}') } }
    } catch {
      return { type: 'tool_call', toolCall: { id: tc.id, name: tc.name, args: {} } }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') {
          for (const [k] of pendingTools) { const e = flushTool(k); if (e) yield e }
          yield { type: 'done' }; return
        }

        let json: any
        try { json = JSON.parse(payload) } catch { continue }

        if (format === 'openai') {
          const delta = json.choices?.[0]?.delta
          if (delta?.content) yield { type: 'text', text: delta.content }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (tc.id) pendingTools.set(idx, { id: tc.id, name: tc.function?.name || '', argsStr: tc.function?.arguments || '' })
              else { const p = pendingTools.get(idx); if (p && tc.function?.arguments) p.argsStr += tc.function.arguments }
            }
          }
          const fin = json.choices?.[0]?.finish_reason
          if (fin) { for (const [k] of pendingTools) { const e = flushTool(k); if (e) yield e } }
        } else {
          // Anthropic SSE
          if (json.type === 'content_block_delta') {
            if (json.delta?.type === 'text_delta') yield { type: 'text', text: json.delta.text }
            else if (json.delta?.type === 'input_json_delta') {
              const p = pendingTools.get(json.index); if (p) p.argsStr += json.delta.partial_json
            }
          } else if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
            pendingTools.set(json.index, { id: json.content_block.id, name: json.content_block.name, argsStr: '' })
          } else if (json.type === 'content_block_stop') {
            const e = flushTool(json.index); if (e) yield e
          } else if (json.type === 'message_stop') {
            yield { type: 'done' }; return
          }
        }
      }
    }
  } finally { reader.releaseLock() }
  yield { type: 'done' }
}

export function getAiProvider(): { type: 'openrouter' | 'anthropic'; key: string } | null {
  const cfg = getConfig()
  if (!cfg) return null
  if (cfg.openrouter_key) return { type: 'openrouter', key: cfg.openrouter_key }
  if (cfg.claude_key) return { type: 'anthropic', key: cfg.claude_key }
  return null
}

export async function callAi(opts: AiCallOptions): Promise<AiResponse | null> {
  const provider = getAiProvider()
  if (!provider) return null

  if (provider.type === 'openrouter') {
    const orModel = opts.model.startsWith('anthropic/') ? opts.model : 'anthropic/' + opts.model
    const msgs: { role: string; content: string | object[] }[] = []
    if (opts.system) msgs.push({ role: 'system', content: opts.system })
    msgs.push(...opts.messages)
    const body: Record<string, unknown> = {
      model: orModel, messages: msgs, max_tokens: opts.max_tokens, stream: !!opts.stream
    }
    if (opts.tools?.length) body.tools = opts.tools
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.key },
      body: JSON.stringify(body)
    })
    return { res, format: 'openai' }
  }

  const body: Record<string, unknown> = {
    model: opts.model, max_tokens: opts.max_tokens, messages: opts.messages
  }
  if (opts.system) body.system = opts.system
  if (opts.stream) body.stream = true
  if (opts.tools?.length) {
    body.tools = opts.tools.map(t => ({
      name: t.function.name, description: t.function.description,
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    }))
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-api-key': provider.key,
      'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  })
  return { res, format: 'anthropic' }
}
