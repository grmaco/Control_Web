import { useEffect, useRef } from 'react'
import { useSemiCnvStore } from '../store/useSemiCnvStore'
import { usePioStore } from '../store/usePioStore'
import { useConveyorStore } from '../store/useConveyorStore'
import { useAuthStore } from '../store/useAuthStore'
import { useAssistantStore } from '../store/useAssistantStore'
import { buildWelcomeMessage, createSeenState, detectAnomalies, type SeenState } from '../utils/assistantAlerts'

/** 말풍선 자동 소멸 시간 */
const BUBBLE_TTL_MS = 13_000
/** 연속 이상 폭주 시 말풍선 최소 간격 (스팸 방지) */
const MIN_PUSH_INTERVAL_MS = 3_500
/** 화면 진입 후 환영 인사까지 지연 (UI 안착 뒤 인사) */
const WELCOME_DELAY_MS = 900
/** 환영 인사 말풍선 소멸 시간 */
const WELCOME_TTL_MS = 9_000

/**
 * 코비 능동 감시 — 알람·PIO 오류·V3 연결 변화를 구독하다가 새 이상이 생기면
 * 채팅이 닫혀 있어도 아바타 옆에 말풍선을 띄운다. HumanoidAssistant에서 1회 호출.
 */
export function useAssistantWatcher() {
  const unitAlarms = useSemiCnvStore((s) => s.unitAlarms)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const transactions = usePioStore((s) => s.transactions)
  const muted = useAssistantStore((s) => s.proactiveMuted)
  const open = useAssistantStore((s) => s.open)

  const seenRef = useRef<SeenState>(createSeenState())
  const lastPushRef = useRef(0)
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 화면 진입 시 역할별 환영 인사 (마운트 1회 — AppLayout은 세션 진입당 한 번 마운트).
  // ref 가드 대신 cleanup으로 취소 → StrictMode의 이중 마운트에서도 정확히 1회만 표시.
  useEffect(() => {
    const role = useAuthStore.getState().role
    if (!role) return
    const timer = setTimeout(() => {
      const store = useAssistantStore.getState()
      // 그 사이 채팅을 열었거나, 음소거했거나, 이상 말풍선이 이미 떠 있으면 인사 생략
      if (store.open || store.proactiveMuted || store.proactiveBubble) return
      const id = store.pushProactiveBubble(buildWelcomeMessage(role))
      if (ttlTimerRef.current) clearTimeout(ttlTimerRef.current)
      ttlTimerRef.current = setTimeout(() => {
        useAssistantStore.getState().dismissProactiveBubble(id)
      }, WELCOME_TTL_MS)
    }, WELCOME_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const conveyor = useConveyorStore.getState()
    const unitNameById = new Map<string, string>()
    for (const line of conveyor.lines) {
      for (const unit of line.units) unitNameById.set(unit.id, unit.name)
    }

    // seenRef는 항상 갱신 (음소거/채팅 열림이어도 baseline은 최신 유지 →
    // 나중에 해제했을 때 그 사이 발생분이 한꺼번에 쏟아지지 않음)
    const anomalies = detectAnomalies(seenRef.current, {
      unitAlarms,
      unitNameById,
      connectionState,
      pioTransactions: transactions,
    })

    if (anomalies.length === 0) return
    // 음소거거나 채팅이 열려 있으면(이미 사용자가 코비와 상호작용 중) 말풍선은 생략
    if (muted || open) return

    const now = Date.now()
    if (now - lastPushRef.current < MIN_PUSH_INTERVAL_MS) return
    lastPushRef.current = now

    const top = anomalies[0]!
    const id = useAssistantStore.getState().pushProactiveBubble({
      text: top.text,
      level: top.level,
      followupQuery: top.followupQuery,
    })

    if (ttlTimerRef.current) clearTimeout(ttlTimerRef.current)
    ttlTimerRef.current = setTimeout(() => {
      useAssistantStore.getState().dismissProactiveBubble(id)
    }, BUBBLE_TTL_MS)
  }, [unitAlarms, connectionState, transactions, muted, open])

  // 채팅 패널을 열면 떠 있던 말풍선 정리 (사용자가 이미 코비를 봤으므로)
  useEffect(() => {
    if (open) useAssistantStore.getState().dismissProactiveBubble()
  }, [open])

  useEffect(
    () => () => {
      if (ttlTimerRef.current) clearTimeout(ttlTimerRef.current)
    },
    [],
  )
}
