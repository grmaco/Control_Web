import { create } from 'zustand'

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

interface AssistantPosition {
  x: number
  y: number
}

const POSITION_KEY = 'assistant-position'
const API_KEY_STORAGE = 'assistant-api-key'
const GEMINI_KEY_STORAGE = 'assistant-gemini-key'

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
}))
