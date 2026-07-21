import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAssistantStore, resolveAssistantProvider, type ProactiveBubble } from '../../store/useAssistantStore'
import { useAssistantChat } from '../../hooks/useAssistantChat'
import { useAssistantWatcher } from '../../hooks/useAssistantWatcher'
import { useTouchLayout } from '../../hooks/useTouchLayout'

const AVATAR_SIZE_DESKTOP = 48
const AVATAR_SIZE_MOBILE = 40
const DRAG_THRESHOLD_PX = 5
const EDGE_MARGIN = 8

const QUICK_PROMPTS = [
  '현재 활성 알람 원인을 분석해줘',
  'V3 로그에서 이상 징후가 있어?',
  '시뮬레이션 결과를 해석해줘',
  '시스템 상태를 요약해줘',
]

function clampPosition(x: number, y: number, size: number) {
  const maxX = window.innerWidth - size - EDGE_MARGIN
  const maxY = window.innerHeight - size - EDGE_MARGIN
  return {
    x: Math.min(Math.max(x, EDGE_MARGIN), Math.max(maxX, EDGE_MARGIN)),
    y: Math.min(Math.max(y, EDGE_MARGIN), Math.max(maxY, EDGE_MARGIN)),
  }
}

/** 애니메이션 휴머노이드 아바타 (COVY) */
function HumanoidAvatar({ size, busy }: { size: number; busy: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className="assistant-avatar-svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="covy-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id="covy-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      {/* 그림자 */}
      <ellipse className="assistant-shadow" cx="24" cy="45" rx="10" ry="2.2" fill="rgba(34,211,238,0.35)" />

      {/* 부유하는 본체 그룹 */}
      <g className="assistant-float">
        {/* 안테나 */}
        <line x1="24" y1="8" x2="24" y2="4" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" />
        <circle className={busy ? 'assistant-antenna assistant-antenna-busy' : 'assistant-antenna'} cx="24" cy="3" r="2" fill="#f0abfc" />

        {/* 머리 */}
        <rect x="14" y="8" width="20" height="15" rx="7" fill="url(#covy-head)" />
        {/* 페이스 스크린 */}
        <rect x="17" y="11" width="14" height="9" rx="4.5" fill="#0f172a" />
        {/* 눈 */}
        <g className="assistant-eyes">
          <circle cx="20.5" cy="15.5" r="1.8" fill="#67e8f9" />
          <circle cx="27.5" cy="15.5" r="1.8" fill="#67e8f9" />
        </g>

        {/* 몸통 */}
        <rect x="16" y="24" width="16" height="13" rx="5.5" fill="url(#covy-body)" />
        {/* 가슴 코어 */}
        <circle className="assistant-core" cx="24" cy="30" r="3" fill="#0f172a" stroke="#f0abfc" strokeWidth="1" />
        <circle className="assistant-core-dot" cx="24" cy="30" r="1.2" fill="#f0abfc" />

        {/* 왼팔 */}
        <rect x="11" y="25" width="4" height="9" rx="2" fill="#0e7490" />
        {/* 오른팔 — 인사 */}
        <g className="assistant-arm-wave">
          <rect x="33" y="25" width="4" height="9" rx="2" fill="#0e7490" />
        </g>
      </g>
    </svg>
  )
}

function AssistantChatPanel({
  anchorX,
  anchorY,
  avatarSize,
  isMobile,
}: {
  anchorX: number
  anchorY: number
  avatarSize: number
  isMobile: boolean
}) {
  const messages = useAssistantStore((s) => s.messages)
  const busy = useAssistantStore((s) => s.busy)
  const apiKey = useAssistantStore((s) => s.apiKey)
  const geminiKey = useAssistantStore((s) => s.geminiKey)
  const settingsOpen = useAssistantStore((s) => s.settingsOpen)
  const setSettingsOpen = useAssistantStore((s) => s.setSettingsOpen)
  const setApiKey = useAssistantStore((s) => s.setApiKey)
  const setGeminiKey = useAssistantStore((s) => s.setGeminiKey)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const clearMessages = useAssistantStore((s) => s.clearMessages)
  const proactiveMuted = useAssistantStore((s) => s.proactiveMuted)
  const setProactiveMuted = useAssistantStore((s) => s.setProactiveMuted)
  const { send } = useAssistantChat()

  const provider = resolveAssistantProvider({ apiKey, geminiKey })

  const [input, setInput] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [geminiDraft, setGeminiDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || busy) return
    void send(input)
    setInput('')
  }

  // 데스크톱: 아바타 위치 기준 4분면 플립 배치 / 모바일: 하단 시트
  const panelStyle: React.CSSProperties = useMemo(() => {
    if (isMobile) {
      return {
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        maxHeight: '62vh',
        zIndex: 60,
      }
    }
    const PANEL_W = 340
    const PANEL_H = 440
    const rightHalf = anchorX + avatarSize / 2 > window.innerWidth / 2
    const bottomHalf = anchorY + avatarSize / 2 > window.innerHeight / 2
    const style: React.CSSProperties = {
      position: 'fixed',
      width: PANEL_W,
      height: PANEL_H,
      zIndex: 60,
    }
    if (rightHalf) style.left = Math.max(8, anchorX - PANEL_W - 10)
    else style.left = Math.min(anchorX + avatarSize + 10, window.innerWidth - PANEL_W - 8)
    if (bottomHalf) style.top = Math.max(8, anchorY + avatarSize - PANEL_H)
    else style.top = Math.min(anchorY, window.innerHeight - PANEL_H - 8)
    return style
  }, [anchorX, anchorY, avatarSize, isMobile])

  return (
    <div
      style={panelStyle}
      className="assistant-panel flex flex-col overflow-hidden rounded-xl border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_28px_rgba(34,211,238,0.25)] backdrop-blur-md"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-cyan-500/25 bg-gradient-to-r from-cyan-500/15 to-transparent px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-cyan-300">COVY · AI 어시스턴트</span>
          <span
            className={`rounded border px-1 py-px text-[8px] font-bold tracking-wider ${
              provider === 'claude'
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : provider === 'gemini'
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                  : 'border-slate-500/50 bg-slate-500/15 text-slate-400'
            }`}
            title={provider === 'local' ? '로컬 분석 모드 — ⚙에서 API 키 등록 시 생성형 AI 사용' : undefined}
          >
            {provider === 'claude' ? 'CLAUDE' : provider === 'gemini' ? '장과장 클론' : 'LOCAL'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="대화 초기화"
            onClick={clearMessages}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5.5 4V2.5h5V4M4 4l.8 10h6.4L12 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            title="API 설정"
            onClick={() => {
              setKeyDraft('')
              setGeminiDraft('')
              setSettingsOpen(!settingsOpen)
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.2" />
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            title="닫기"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-300"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* API 키 설정 */}
      {settingsOpen && (
        <div className="space-y-2.5 border-b border-cyan-500/25 bg-slate-900/80 px-3 py-2.5">
          <div>
            <p className="mb-1 text-[10px] text-slate-400">
              <span className="font-semibold text-emerald-300">Claude</span> API 키{' '}
              {apiKey ? '(등록됨)' : '(미등록)'} — 가장 정확한 분석
            </p>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-ant-..."
                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setApiKey(keyDraft.trim())
                  setKeyDraft('')
                }}
                disabled={!keyDraft.trim()}
                className="rounded bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                저장
              </button>
              {apiKey && (
                <button
                  type="button"
                  onClick={() => setApiKey('')}
                  className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-400 hover:border-red-400 hover:text-red-300"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] text-slate-400">
              <span className="font-semibold text-sky-300">Gemini</span> 무료 API 키{' '}
              {geminiKey ? '(등록됨)' : '(미등록)'} — Google AI Studio에서 무료 발급
            </p>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={geminiDraft}
                onChange={(e) => setGeminiDraft(e.target.value)}
                placeholder="AIza..."
                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setGeminiKey(geminiDraft.trim())
                  setGeminiDraft('')
                }}
                disabled={!geminiDraft.trim()}
                className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                저장
              </button>
              {geminiKey && (
                <button
                  type="button"
                  onClick={() => setGeminiKey('')}
                  className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-400 hover:border-red-400 hover:text-red-300"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
          <p className="text-[9.5px] leading-relaxed text-slate-500">
            키가 없으면 <b className="text-slate-400">로컬 분석 모드</b>로 동작합니다 — 실제 알람·로그 데이터를 규칙 기반으로 분석해 답변합니다.
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-slate-700/60 pt-2">
            <span className="text-[10px] text-slate-400">
              <b className="text-cyan-300">이상 자동 알림</b> — 알람·핸드셰이크 오류 감지 시 코비가 먼저 말풍선을 띄웁니다
            </span>
            <input
              type="checkbox"
              checked={!proactiveMuted}
              onChange={(e) => setProactiveMuted(!e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 accent-cyan-500"
            />
          </label>
        </div>
      )}

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5" style={{ minHeight: isMobile ? 180 : undefined }}>
        {messages.length === 0 && (
          <div className="space-y-2.5">
            <div className="assistant-bubble-in max-w-[90%] rounded-lg rounded-tl-none border border-cyan-500/25 bg-slate-900/90 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-200">
              안녕하세요, 관제 AI <b className="text-cyan-300">코비</b>입니다. 알람 원인, V3 로그, 시뮬레이션 분석 등 무엇이든 물어보세요.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[10.5px] text-cyan-200 hover:bg-cyan-500/25"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-tr-none bg-cyan-600/85 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div
                className={`assistant-bubble-in max-w-[90%] whitespace-pre-wrap rounded-lg rounded-tl-none border px-2.5 py-2 text-[11.5px] leading-relaxed ${
                  m.error
                    ? 'border-red-500/40 bg-red-950/50 text-red-200'
                    : 'border-cyan-500/25 bg-slate-900/90 text-slate-200'
                }`}
              >
                {m.content}
                {m.streaming && <span className="assistant-cursor ml-0.5 inline-block h-3 w-1.5 bg-cyan-400 align-text-bottom" />}
              </div>
            </div>
          ),
        )}
      </div>

      {/* 입력 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 border-t border-cyan-500/25 bg-slate-900/70 px-2.5 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? '답변 생성 중…' : '알람·로그·시뮬레이션에 대해 질문하세요'}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-[11.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-cyan-600 p-1.5 text-white transition hover:bg-cyan-500 disabled:opacity-40"
          title="전송"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M1.7 8L1 2.3c-.1-.6.6-1.1 1.2-.8l12.2 5.8c.6.3.6 1.1 0 1.4L2.2 14.5c-.6.3-1.3-.2-1.2-.8L1.7 8zm0 0h6" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </button>
      </form>
    </div>
  )
}

const BUBBLE_LEVEL_CLASS: Record<ProactiveBubble['level'], string> = {
  error: 'border-rose-500/60 bg-rose-950/95 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.35)]',
  warn: 'border-amber-500/60 bg-amber-950/95 text-amber-100 shadow-[0_0_22px_rgba(245,158,11,0.3)]',
  info: 'border-cyan-500/50 bg-slate-950/95 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.28)]',
}

/** 이상 탐지 시 아바타 옆에 자동으로 뜨는 코비 말풍선 */
function ProactiveSpeechBubble({
  bubble,
  anchorX,
  anchorY,
  avatarSize,
  isMobile,
  onOpenDetail,
  onDismiss,
  onMute,
}: {
  bubble: ProactiveBubble
  anchorX: number
  anchorY: number
  avatarSize: number
  isMobile: boolean
  onOpenDetail: (query: string) => void
  onDismiss: () => void
  onMute: () => void
}) {
  const BUBBLE_W = isMobile ? 220 : 250

  const style = useMemo<React.CSSProperties>(() => {
    const s: React.CSSProperties = { position: 'fixed', width: BUBBLE_W, zIndex: 62 }
    const rightHalf = anchorX + avatarSize / 2 > window.innerWidth / 2
    const bottomHalf = anchorY + avatarSize / 2 > window.innerHeight / 2
    // 가로: 아바타가 우측이면 오른쪽 끝을 아바타에 맞추고 왼쪽으로 펼침
    if (rightHalf) s.left = Math.max(8, anchorX + avatarSize - BUBBLE_W)
    else s.left = Math.min(anchorX, window.innerWidth - BUBBLE_W - 8)
    // 세로: 아바타가 하단이면 위쪽에, 상단이면 아래쪽에 배치
    if (bottomHalf) s.bottom = Math.max(8, window.innerHeight - anchorY + 10)
    else s.top = Math.min(anchorY + avatarSize + 10, window.innerHeight - 8)
    return s
  }, [anchorX, anchorY, avatarSize, BUBBLE_W])

  return (
    <div
      style={style}
      className={`assistant-proactive-bubble rounded-xl border px-3 py-2.5 backdrop-blur-md ${BUBBLE_LEVEL_CLASS[bubble.level]}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-px shrink-0 text-sm">
          {bubble.level === 'error' ? '🔴' : bubble.level === 'warn' ? '🟠' : '🟢'}
        </span>
        <p className="flex-1 text-[11.5px] leading-relaxed">{bubble.text}</p>
        <button
          type="button"
          aria-label="닫기"
          onClick={onDismiss}
          className="-mr-1 -mt-1 shrink-0 rounded p-0.5 opacity-70 hover:bg-white/10 hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {bubble.followupQuery && (
          <button
            type="button"
            onClick={() => onOpenDetail(bubble.followupQuery!)}
            className="rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 text-[10.5px] font-semibold hover:bg-white/20"
          >
            자세히 분석
          </button>
        )}
        <button
          type="button"
          onClick={onMute}
          title="자동 알림 끄기"
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] opacity-60 hover:bg-white/10 hover:opacity-100"
        >
          알림 끄기
        </button>
      </div>
    </div>
  )
}

export function HumanoidAssistant() {
  const isMobile = useTouchLayout()
  const avatarSize = isMobile ? AVATAR_SIZE_MOBILE : AVATAR_SIZE_DESKTOP

  useAssistantWatcher()

  const open = useAssistantStore((s) => s.open)
  const toggleOpen = useAssistantStore((s) => s.toggleOpen)
  const busy = useAssistantStore((s) => s.busy)
  const savedPosition = useAssistantStore((s) => s.position)
  const setPosition = useAssistantStore((s) => s.setPosition)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const proactiveBubble = useAssistantStore((s) => s.proactiveBubble)
  const dismissProactiveBubble = useAssistantStore((s) => s.dismissProactiveBubble)
  const setProactiveMuted = useAssistantStore((s) => s.setProactiveMuted)
  const { send } = useAssistantChat()

  const handleOpenDetail = useCallback(
    (query: string) => {
      dismissProactiveBubble()
      setOpen(true)
      void send(query)
    },
    [dismissProactiveBubble, setOpen, send],
  )

  // 기본 위치: 우하단
  const [pos, setPos] = useState(() => {
    const fallback = {
      x: window.innerWidth - avatarSize - 20,
      y: window.innerHeight - avatarSize - 24,
    }
    const initial = savedPosition ?? fallback
    return clampPosition(initial.x, initial.y, avatarSize)
  })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
    /** 드래그 중 마지막 좌표 — 렌더 지연과 무관하게 최신 값 유지 */
    lastX: number
    lastY: number
  } | null>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)

  // 뷰포트 리사이즈 시 화면 밖으로 나가지 않게 클램프
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPosition(p.x, p.y, avatarSize))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [avatarSize])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
      lastX: pos.x,
      lastY: pos.y,
    }
    try {
      avatarRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* 캡처 실패해도 드래그는 동작 */
    }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      setDragging(true)
    }
    e.preventDefault()
    const next = clampPosition(drag.originX + dx, drag.originY + dy, avatarSize)
    drag.lastX = next.x
    drag.lastY = next.y
    setPos(next)
  }, [avatarSize])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      avatarRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (drag.moved) {
      setDragging(false)
      // 모바일: 좌우 가장자리로 스냅 (화면 전환에도 어딘가 조그맣게 위치)
      const p = { x: drag.lastX, y: drag.lastY }
      const snapped = isMobile
        ? {
            x: p.x + avatarSize / 2 < window.innerWidth / 2
              ? EDGE_MARGIN
              : window.innerWidth - avatarSize - EDGE_MARGIN,
            y: p.y,
          }
        : p
      const clamped = clampPosition(snapped.x, snapped.y, avatarSize)
      setPos(clamped)
      setPosition(clamped)
    } else {
      // 클릭 — 채팅 토글
      toggleOpen()
    }
  }, [avatarSize, isMobile, setPosition, toggleOpen])

  return (
    <>
      <button
        ref={avatarRef}
        type="button"
        aria-label="AI 어시스턴트 코비"
        title={open ? undefined : 'AI 어시스턴트 — 클릭해서 대화 · 드래그로 이동'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: avatarSize,
          height: avatarSize,
          zIndex: 61,
          touchAction: 'none',
        }}
        className={`assistant-avatar select-none rounded-full ${
          dragging ? 'cursor-grabbing scale-110' : 'cursor-grab'
        } ${open ? 'assistant-avatar-active' : ''} ${
          !open && proactiveBubble ? 'assistant-avatar-alert' : ''
        }`}
      >
        <HumanoidAvatar size={avatarSize} busy={busy} />
        {/* 미읽음/대기 알림 점 대신 busy 링 */}
        {busy && <span className="assistant-busy-ring absolute inset-0 rounded-full border-2 border-fuchsia-400/70" />}
        {/* 이상 탐지 알림 점 (채팅 닫힘 + 말풍선 활성 시) */}
        {!open && proactiveBubble && (
          <span
            className={`assistant-alert-dot absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${
              proactiveBubble.level === 'error'
                ? 'bg-rose-500'
                : proactiveBubble.level === 'warn'
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
            }`}
          />
        )}
      </button>

      {!open && proactiveBubble && (
        <ProactiveSpeechBubble
          bubble={proactiveBubble}
          anchorX={pos.x}
          anchorY={pos.y}
          avatarSize={avatarSize}
          isMobile={isMobile}
          onOpenDetail={handleOpenDetail}
          onDismiss={() => dismissProactiveBubble()}
          onMute={() => setProactiveMuted(true)}
        />
      )}

      {open && (
        <AssistantChatPanel
          anchorX={pos.x}
          anchorY={pos.y}
          avatarSize={avatarSize}
          isMobile={isMobile}
        />
      )}
    </>
  )
}
