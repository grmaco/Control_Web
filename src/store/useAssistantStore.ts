import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 스트리밍 중 여부 — 커서 애니메이션 표시 */
  streaming?: boolean
  /** API 오류 등 — 붉은 톤으로 표시 */
  error?: boolean
  timestamp: string
}

/** 이상 탐지 시 코비가 먼저 말 거는 말풍선 (질문 없이 자동 표시) */
export interface ProactiveBubble {
  id: string
  text: string
  level: 'info' | 'warn' | 'error'
  /** "자세히 분석" 클릭 시 AI에 보낼 질문 — 없으면 버튼 숨김 */
  followupQuery?: string
  timestamp: string
}

interface AssistantPosition {
  x: number
  y: number
}

const POSITION_KEY = 'assistant-position'
const API_KEY_STORAGE = 'assistant-api-key'
const GEMINI_KEY_STORAGE = 'assistant-gemini-key'
const PROACTIVE_MUTED_KEY = 'assistant-proactive-muted'

function loadPosition(): AssistantPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssistantPosition
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch {
    /* ignore */
  }
  return null
}

function loadStoredKey(storageKey: string): string {
  try {
    return localStorage.getItem(storageKey) ?? ''
  } catch {
    return ''
  }
}

function loadProactiveMuted(): boolean {
  try {
    return localStorage.getItem(PROACTIVE_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

/** 어떤 AI 백엔드가 답변하는지 — 헤더 표시·라우팅에 사용 */
export type AssistantProvider = 'claude' | 'gemini' | 'local'

interface AssistantState {
  open: boolean
  position: AssistantPosition | null
  messages: AssistantMessage[]
  apiKey: string
  geminiKey: string
  busy: boolean
  settingsOpen: boolean
  /** 이상 탐지 자동 말풍선 (질문 없이 코비가 먼저 알림) — null이면 표시 안 함 */
  proactiveBubble: ProactiveBubble | null
  /** 자동 말풍선 음소거 (사용자 설정, localStorage 보존) */
  proactiveMuted: boolean

  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setPosition: (pos: AssistantPosition) => void
  setApiKey: (key: string) => void
  setGeminiKey: (key: string) => void
  setSettingsOpen: (open: boolean) => void
  setBusy: (busy: boolean) => void
  addMessage: (message: AssistantMessage) => void
  updateMessage: (id: string, patch: Partial<AssistantMessage>) => void
  appendToMessage: (id: string, delta: string) => void
  clearMessages: () => void
  /** 이상 알림 말풍선 표시 — 생성된 id 반환 (TTL 타이머가 이 id로만 닫도록) */
  pushProactiveBubble: (bubble: Omit<ProactiveBubble, 'id' | 'timestamp'>) => string
  /** 말풍선 닫기 — id 지정 시 현재 말풍선이 그 id일 때만 닫음(경합 방지) */
  dismissProactiveBubble: (id?: string) => void
  setProactiveMuted: (muted: boolean) => void
}

/** Claude 키 우선, 없으면 Gemini, 둘 다 없으면 로컬 분석 */
export function resolveAssistantProvider(state: {
  apiKey: string
  geminiKey: string
}): AssistantProvider {
  if (state.apiKey) return 'claude'
  if (state.geminiKey) return 'gemini'
  return 'local'
}

export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  position: loadPosition(),
  messages: [],
  apiKey: loadStoredKey(API_KEY_STORAGE),
  geminiKey: loadStoredKey(GEMINI_KEY_STORAGE),
  busy: false,
  settingsOpen: false,
  proactiveBubble: null,
  proactiveMuted: loadProactiveMuted(),

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setPosition: (position) => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    } catch {
      /* ignore */
    }
    set({ position })
  },
  setApiKey: (apiKey) => {
    try {
      if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey)
      else localStorage.removeItem(API_KEY_STORAGE)
    } catch {
      /* ignore */
    }
    set({ apiKey })
  },
  setGeminiKey: (geminiKey) => {
    try {
      if (geminiKey) localStorage.setItem(GEMINI_KEY_STORAGE, geminiKey)
      else localStorage.removeItem(GEMINI_KEY_STORAGE)
    } catch {
      /* ignore */
    }
    set({ geminiKey })
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setBusy: (busy) => set({ busy }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  appendToMessage: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m,
      ),
    })),
  clearMessages: () => set({ messages: [] }),
  pushProactiveBubble: (bubble) => {
    const id = uuidv4()
    set({ proactiveBubble: { ...bubble, id, timestamp: new Date().toISOString() } })
    return id
  },
  dismissProactiveBubble: (id) =>
    set((s) => {
      // id 지정 시 현재 말풍선이 그 id가 아니면(이미 새 말풍선으로 교체됨) 무시
      if (id && s.proactiveBubble && s.proactiveBubble.id !== id) return s
      return { proactiveBubble: null }
    }),
  setProactiveMuted: (proactiveMuted) => {
    try {
      if (proactiveMuted) localStorage.setItem(PROACTIVE_MUTED_KEY, '1')
      else localStorage.removeItem(PROACTIVE_MUTED_KEY)
    } catch {
      /* ignore */
    }
    // 음소거 켜면 현재 떠 있는 말풍선도 즉시 정리
    set((s) => ({ proactiveMuted, proactiveBubble: proactiveMuted ? null : s.proactiveBubble }))
  },
}))
