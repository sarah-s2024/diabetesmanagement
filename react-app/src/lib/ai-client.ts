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
