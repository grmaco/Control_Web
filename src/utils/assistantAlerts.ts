import type { PioTransaction } from '../types/pio'
import type { UserRole } from '../types/auth'

/**
 * 코비(COVY) 능동 이상 탐지 — 질문을 기다리지 않고 먼저 말 걸기 위한 규칙 엔진.
 *
 * 스토어 스냅샷을 이전에 본 상태(SeenState)와 비교해 "새로" 나타난 이상만 골라
 * 짧은 말풍선 문구로 만든다. API 키 없이도 동작하도록 로컬 규칙 기반이며,
 * "자세히 분석"에 쓸 followupQuery만 담아 실제 생성형 분석은 사용자가 눌렀을 때 수행한다.
 */

export interface AnomalySnapshot {
  /** unitId → 알람 코드 */
  unitAlarms: Record<string, string>
  /** unitId → 표시 이름 */
  unitNameById: Map<string, string>
  /** 'connected' | 'connecting' | 'disconnected' 등 */
  connectionState: string
  pioTransactions: PioTransaction[]
}

export interface SeenState {
  /** `${unitId}:${code}` — 이미 알린 알람 */
  alarmKeys: Set<string>
  /** 이미 알린 PIO 오류 트랜잭션 id */
  pioErrorIds: Set<string>
  /** 직전 연결 상태 (전환 감지용) */
  connectionState: string
  /** 최초 1회 여부 — 첫 패스는 기존 상태를 "본 것"으로만 등록하고 알림은 내지 않음 */
  initialized: boolean
}

export interface DetectedAnomaly {
  level: 'info' | 'warn' | 'error'
  text: string
  followupQuery?: string
  /** 동시 다발 시 우선순위 (높을수록 먼저 알림) */
  priority: number
}

/** 말풍선에 넣을 최소 입력 형태 (id·timestamp는 스토어가 부여) */
export interface BubbleInput {
  text: string
  level: 'info' | 'warn' | 'error'
  followupQuery?: string
}

/**
 * 로그인 역할별 환영 인사 — 화면 진입 시 코비가 먼저 건네는 인사말.
 * 오퍼레이터/엔지니어/개발자의 업무 성격에 맞춰 다르게 인사한다.
 */
export function buildWelcomeMessage(role: UserRole): BubbleInput {
  switch (role) {
    case 'operator':
      return {
        level: 'info',
        text: '오퍼레이터님, 안녕하세요! 현장 모니터링을 시작합니다. 알람이나 이상이 감지되면 제가 먼저 알려드릴게요.',
        followupQuery: '시스템 상태를 요약해줘',
      }
    case 'engineer':
      return {
        level: 'info',
        text: '엔지니어님, 환영합니다! 설비 상태와 핸드셰이크 분석이 필요하면 언제든 말씀해 주세요.',
        followupQuery: '시스템 상태를 요약해줘',
      }
    case 'developer':
      return {
        level: 'info',
        text: '개발자님, 반갑습니다! 시뮬레이션·V3 로그·PIO 분석까지 도와드릴 준비가 됐어요.',
        followupQuery: '시스템 상태를 요약해줘',
      }
  }
}

export function createSeenState(): SeenState {
  return {
    alarmKeys: new Set(),
    pioErrorIds: new Set(),
    connectionState: '',
    initialized: false,
  }
}

/**
 * seen을 갱신하며 새 이상만 반환. seen은 호출부의 ref에 보관되는 가변 객체다.
 * 첫 호출(initialized=false)은 현재 상태를 baseline으로만 등록 → 페이지 로드 직후
 * 기존 알람들로 말풍선이 쏟아지는 것을 방지한다.
 */
export function detectAnomalies(seen: SeenState, snap: AnomalySnapshot): DetectedAnomaly[] {
  const firstPass = !seen.initialized
  const anomalies: DetectedAnomaly[] = []

  // ── 새 유닛 알람 ────────────────────────────────────────────────
  const currentAlarmKeys = new Set<string>()
  const newAlarmUnitIds: string[] = []
  for (const [unitId, code] of Object.entries(snap.unitAlarms)) {
    const key = `${unitId}:${code}`
    currentAlarmKeys.add(key)
    if (seen.alarmKeys.has(key)) continue
    seen.alarmKeys.add(key)
    if (!firstPass) newAlarmUnitIds.push(unitId)
  }
  // 해제된 알람 키는 잊는다 → 같은 유닛에서 재발화하면 다시 알림
  for (const key of [...seen.alarmKeys]) {
    if (!currentAlarmKeys.has(key)) seen.alarmKeys.delete(key)
  }

  if (newAlarmUnitIds.length === 1) {
    const unitId = newAlarmUnitIds[0]!
    const name = snap.unitNameById.get(unitId) ?? unitId
    const code = snap.unitAlarms[unitId]
    anomalies.push({
      level: 'error',
      priority: 100,
      text: `${name}에서 알람이 발생했어요 (코드 ${code}). 원인을 확인해볼까요?`,
      followupQuery: '현재 활성 알람 원인을 분석해줘',
    })
  } else if (newAlarmUnitIds.length > 1) {
    anomalies.push({
      level: 'error',
      priority: 100,
      text: `알람 ${newAlarmUnitIds.length}건이 새로 발생했어요. 함께 확인해볼까요?`,
      followupQuery: '현재 활성 알람 원인을 분석해줘',
    })
  }

  // ── 새 PIO 핸드셰이크 오류 ──────────────────────────────────────
  const newPioErrors: PioTransaction[] = []
  for (const tx of snap.pioTransactions) {
    if (tx.status !== 'error') continue
    if (seen.pioErrorIds.has(tx.id)) continue
    seen.pioErrorIds.add(tx.id)
    if (!firstPass) newPioErrors.push(tx)
  }
  if (newPioErrors.length > 0) {
    const tx = newPioErrors[0]!
    const step = tx.errorStep ? ` (@${tx.errorStep})` : ''
    anomalies.push({
      level: 'error',
      priority: 90,
      text:
        newPioErrors.length === 1
          ? `${tx.activeName}→${tx.passiveName} 핸드셰이크가 중단됐어요${step}. 타임차트를 볼까요?`
          : `PIO 핸드셰이크 오류 ${newPioErrors.length}건이 발생했어요. 분석해볼까요?`,
      followupQuery: 'PIO 핸드셰이크 이상을 분석해줘',
    })
  }

  // ── V3 연결 상태 전환 ───────────────────────────────────────────
  if (!firstPass && snap.connectionState !== seen.connectionState) {
    if (snap.connectionState === 'disconnected' && seen.connectionState === 'connected') {
      anomalies.push({
        level: 'warn',
        priority: 80,
        text: 'V3 연결이 끊어졌어요. 실시간 데이터 수신이 중단됩니다.',
      })
    } else if (snap.connectionState === 'connected' && seen.connectionState === 'disconnected') {
      anomalies.push({
        level: 'info',
        priority: 20,
        text: 'V3 연결이 복구됐어요. 실시간 수신을 재개합니다.',
      })
    }
  }

  seen.connectionState = snap.connectionState
  seen.initialized = true

  return anomalies.sort((a, b) => b.priority - a.priority)
}
