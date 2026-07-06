import { useCallback } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { useAssistantStore, resolveAssistantProvider } from '../store/useAssistantStore'
import { buildAssistantSystemPrompt } from '../utils/assistantContext'
import { localAssistantAnswer } from '../utils/assistantLocalEngine'

const CLAUDE_MODEL = 'claude-opus-4-8'
/**
 * Google AI Studio 무료 등급 모델.
 * gemini-2.0-flash는 shut down(폐기)되어 무료 quota가 0으로 고정됨 — 반드시 현재 세대 모델 사용.
 */
const GEMINI_MODEL = 'gemini-3.5-flash'
const MAX_TURNS = 20

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Gemini streamGenerateContent (SSE) — 무료 API 키로 브라우저 직접 호출 */
async function streamGemini(
  apiKey: string,
  system: string,
  history: ChatTurn[],
  onDelta: (text: string) => void,
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: 2048 },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as { error?: { message?: string } }
      if (err.error?.message) detail = `${detail} — ${err.error.message}`
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('스트리밍 응답을 읽을 수 없습니다')
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const text = chunk.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? '')
          .join('')
        if (text) onDelta(text)
      } catch {
        /* 부분 JSON — 무시 */
      }
    }
  }
}

async function streamClaude(
  apiKey: string,
  system: string,
  history: ChatTurn[],
  onDelta: (text: string) => void,
): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system,
    messages: history,
  })
  stream.on('text', onDelta)
  await stream.finalMessage()
}

function describeError(err: unknown, provider: 'claude' | 'gemini'): string {
  if (provider === 'claude') {
    if (err instanceof Anthropic.AuthenticationError)
      return 'Claude API 키 인증에 실패했습니다. ⚙ 설정에서 키를 확인해주세요.'
    if (err instanceof Anthropic.RateLimitError)
      return 'Claude 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
    if (err instanceof Anthropic.APIError)
      return `Claude API 오류 (${err.status}): ${err.message}`
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (provider === 'gemini') {
    if (/400|API key not valid|API_KEY_INVALID/i.test(msg))
      return `Gemini API 키가 유효하지 않습니다. ⚙ 설정에서 키를 확인해주세요.\n(상세: ${msg})`
    if (/free_tier|generate_content_free_tier/i.test(msg))
      return [
        `모델 "${GEMINI_MODEL}"의 무료 등급 할당량이 0입니다 — 대개 해당 모델이 폐기(shut down)되었거나 아직 무료 등급 대상이 아닌 경우입니다.`,
        '',
        'https://ai.google.dev/gemini-api/docs/models 에서 현재 사용 가능한 모델명을 확인해 코드의 GEMINI_MODEL 값을 교체해주세요.',
        '',
        `(상세: ${msg})`,
      ].join('\n')
    if (/429|RESOURCE_EXHAUSTED/i.test(msg))
      return `Gemini 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.\n(상세: ${msg})`
    return `Gemini 오류: ${msg}`
  }
  return `연결 오류: ${msg}`
}

export function useAssistantChat() {
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const store = useAssistantStore.getState()
    if (store.busy) return

    store.addMessage({
      id: uuidv4(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    })

    const assistantId = uuidv4()
    const provider = resolveAssistantProvider(store)

    // ── 로컬 분석 모드 (키 없음) — 실데이터 규칙 기반 답변
    if (provider === 'local') {
      useAssistantStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: localAssistantAnswer(trimmed),
        timestamp: new Date().toISOString(),
      })
      return
    }

    store.setBusy(true)
    useAssistantStore.getState().addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      timestamp: new Date().toISOString(),
    })

    try {
      const history: ChatTurn[] = useAssistantStore
        .getState()
        .messages.filter((m) => m.id !== assistantId && !m.error && m.content)
        .slice(-MAX_TURNS)
        .map((m) => ({ role: m.role, content: m.content }))
      const system = buildAssistantSystemPrompt()
      const onDelta = (delta: string) =>
        useAssistantStore.getState().appendToMessage(assistantId, delta)

      if (provider === 'claude') {
        await streamClaude(store.apiKey, system, history, onDelta)
      } else {
        await streamGemini(store.geminiKey, system, history, onDelta)
      }
      useAssistantStore.getState().updateMessage(assistantId, { streaming: false })
    } catch (err) {
      useAssistantStore.getState().updateMessage(assistantId, {
        content: describeError(err, provider),
        streaming: false,
        error: true,
      })
    } finally {
      useAssistantStore.getState().setBusy(false)
    }
  }, [])

  return { send }
}
