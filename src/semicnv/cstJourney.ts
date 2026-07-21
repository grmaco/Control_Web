import type {
  SemiCnvConveyorStatusItem,
  SemiCnvCstJourney,
  SemiCnvCstTrackingItem,
  SemiCnvMessage,
} from '../types/semicnv'

const MAX_JOURNEYS = 200

/**
 * V3가 이 CST를 CST_TRACKING·CONVEYOR_STATUS 어디에서도 더 이상 언급하지 않은 채
 * 이 시간이 지나면 "유실"로 강제 종료 — 정상 반출 핸드셰이크 없이 수동으로 치워지는
 * 경우(알람 발생 등) 목적지 대기/반송 카운터가 무한정 증가하는 것을 방지.
 * CONVEYOR_STATUS는 주기 전송이라 정상 흐름에서는 이 시간 내에 반드시 갱신된다.
 */
const STALE_TIMEOUT_MS = 60_000

interface Observation {
  cstId: string
  siteId: string | null
  conveyorId: number
  lineId: number
  destination: number | null
  at: string
}

/**
 * conveyorId(+lineId, siteId)가 Web에서 물리적 종료점(flowRole=exit)으로 지정된
 * 유닛인지 판정. V3가 이 위치에 대해 destination을 전혀 보고하지 않을 때
 * (이미 라인의 끝이라 "다음 목적지"가 없는 경우) 도착 판정의 대체 근거로 쓰인다.
 */
export type ExitResolver = (conveyorId: number, lineId: number, siteId: string | null) => boolean

function freshJourney(obs: Observation, isKnownExit?: ExitResolver): SemiCnvCstJourney {
  const reported = obs.destination ?? 0
  const arrivedByDestination = reported > 0 && obs.conveyorId === reported
  // V3가 destination을 안 주는 경우(0/미보고) — 이미 Web에 종료점으로 지정된
  // 유닛에 도착해 있을 수 있다. 그 경우 스스로를 목적지로 채워 "도착"으로 판정한다.
  const arrivedAtKnownExit =
    !arrivedByDestination &&
    reported <= 0 &&
    (isKnownExit?.(obs.conveyorId, obs.lineId, obs.siteId) ?? false)
  const arrived = arrivedByDestination || arrivedAtKnownExit
  const destination = arrivedAtKnownExit ? obs.conveyorId : reported
  return {
    cstId: obs.cstId,
    siteId: obs.siteId,
    lineId: obs.lineId,
    destination,
    startAt: obs.at,
    entryConveyorId: obs.conveyorId,
    hops: [{ conveyorId: obs.conveyorId, at: obs.at }],
    arrivedAt: arrived ? obs.at : null,
    departedAt: null,
    lastSeenAt: obs.at,
    status: arrived ? 'waiting' : 'moving',
    // 최초 관측이 이미 목적지 — 접속 전에 투입된 CST라 투입/도착 시각을 알 수 없음
    incomplete: arrived || undefined,
  }
}

/** 위치/목적지 관측 반영. 변경이 있으면 true */
function observe(
  map: Record<string, SemiCnvCstJourney>,
  obs: Observation,
  isKnownExit?: ExitResolver,
): boolean {
  const prev = map[obs.cstId]
  // 이전 여정이 이미 "유실"(연결 유지 상태에서 STALE_TIMEOUT_MS 이상 무언급 확인됨)
  // 판정을 받은 뒤 같은 cstId가 다시 나타나면 — 같은 캐리어를 재사용한 새 투입
  // 사이클로 간주. 이 판단이 없으면 옛 여정에 계속 이어붙어 투입점(entryConveyorId)이
  // 실제 투입 위치가 아니라 예전 사이클의 시작 위치로 잘못 표시된다.
  // 주의: prev.lastSeenAt과의 단순 경과 시간으로 판단하면 안 됨 — Web 재접속처럼
  // "우리가 안 듣고 있던 시간"까지 유실로 오판해, 실제로는 그대로 대기 중이던
  // CST의 투입 시각이 재접속 시각으로 리셋되는 문제가 생긴다. lost는 closeStaleJourneys가
  // 실시간 트래픽이 흐르는 동안에만(연결 유지 중에만) 세우므로 이 구분에 안전하다.
  if (!prev || prev.status === 'done' || prev.lost) {
    // 신규 CST — 또는 완료/유실된 CST ID 재등장 시 새 반송으로 시작
    map[obs.cstId] = freshJourney(obs, isKnownExit)
    return true
  }

  const j: SemiCnvCstJourney = { ...prev }
  let changed = false

  if (obs.destination != null && obs.destination > 0 && obs.destination !== j.destination) {
    j.destination = obs.destination
    changed = true
  }

  const last = j.hops[j.hops.length - 1]
  if (last.conveyorId !== obs.conveyorId) {
    j.hops = [...j.hops, { conveyorId: obs.conveyorId, at: obs.at }]
    changed = true
  }

  if (j.arrivedAt == null) {
    const arrivedByDestination = j.destination > 0 && obs.conveyorId === j.destination
    // 이 여정에 목적지가 한 번도 보고된 적 없을 때만(j.destination<=0) 종료점
    // 대체 판정을 적용 — 이미 다른 목적지가 알려진 상태에서 그 목적지에 도달하지
    // 못한 채 엉뚱한 종료점을 지나는 경우까지 "도착"으로 오판하지 않기 위함.
    const arrivedAtKnownExit =
      !arrivedByDestination &&
      j.destination <= 0 &&
      (isKnownExit?.(obs.conveyorId, obs.lineId, obs.siteId) ?? false)
    if (arrivedByDestination || arrivedAtKnownExit) {
      if (arrivedAtKnownExit) j.destination = obs.conveyorId
      j.arrivedAt = obs.at
      j.status = 'waiting'
      changed = true
    }
  }

  if (j.lastSeenAt !== obs.at) {
    j.lastSeenAt = obs.at
    changed = true
  }

  if (changed) map[obs.cstId] = j
  return changed
}

/**
 * 같은 site의 진행 중(moving·waiting) 여정 중 STALE_TIMEOUT_MS 이상 갱신이 없던
 * 것을 "유실"로 강제 종료. siteId가 없는(구버전 보존) 여정은 대상에서 제외 —
 * 실시간 관측이 아니라 어느 site 기준으로 판단해야 할지 알 수 없기 때문.
 */
function closeStaleJourneys(
  map: Record<string, SemiCnvCstJourney>,
  nowIso: string,
  siteId: string | null,
): boolean {
  const now = new Date(nowIso).getTime()
  let changed = false
  for (const j of Object.values(map)) {
    if (j.status === 'done') continue
    if (j.siteId == null || j.siteId !== siteId) continue
    const elapsed = now - new Date(j.lastSeenAt).getTime()
    if (elapsed < STALE_TIMEOUT_MS) continue
    // status(moving/waiting)는 그대로 둔다 — UI가 반송/대기 소요시간을 계속 정확히
    // 표시하려면 어느 단계에서 멈췄는지 구분이 필요하다. lost만 표시로 구분한다.
    map[j.cstId] = { ...j, lost: true }
    changed = true
  }
  return changed
}

/** 오래된 완료 여정부터 정리해 MAX_JOURNEYS 유지 */
function trim(map: Record<string, SemiCnvCstJourney>): void {
  const keys = Object.keys(map)
  if (keys.length <= MAX_JOURNEYS) return
  const done = Object.values(map)
    .filter((j) => j.status === 'done' || j.lost)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  for (const j of done) {
    if (Object.keys(map).length <= MAX_JOURNEYS) break
    delete map[j.cstId]
  }
}

/**
 * V3 메시지 → CST 반송 여정 집계.
 * - CST_TRACKING: 위치·목적지 관측 (투입/이동/도착 판정)
 * - CONVEYOR_STATUS: cstId 실린 유닛도 위치 관측 + 목적지 유닛에서 CST가
 *   사라지면(다른/빈 cstId 보고) 반출 완료 판정
 * 변경 없으면 null 반환 (스토어 set 생략용).
 */
export function updateCstJourneysFromMessage(
  journeys: Record<string, SemiCnvCstJourney>,
  message: SemiCnvMessage,
  isKnownExit?: ExitResolver,
): Record<string, SemiCnvCstJourney> | null {
  if (message.type !== 'CST_TRACKING' && message.type !== 'CONVEYOR_STATUS') return null

  const at = message.timestamp || new Date().toISOString()
  const siteId = message.siteId ?? null
  const next: Record<string, SemiCnvCstJourney> = { ...journeys }
  let changed = false

  if (message.type === 'CST_TRACKING') {
    const items = message.data as SemiCnvCstTrackingItem[]
    for (const item of items) {
      if (!item.cstId) continue
      changed =
        observe(
          next,
          {
            cstId: item.cstId,
            siteId,
            conveyorId: item.conveyorId,
            lineId: item.lineId,
            destination: item.destination ?? null,
            at,
          },
          isKnownExit,
        ) || changed
    }
  } else {
    const items = message.data as SemiCnvConveyorStatusItem[]
    for (const item of items) {
      if (item.cstId) {
        changed =
          observe(
            next,
            {
              cstId: item.cstId,
              siteId,
              conveyorId: item.id,
              lineId: item.lineId,
              destination: item.destination ?? null,
              at,
            },
            isKnownExit,
          ) || changed
      }
      // 반출 감지 — 목적지 대기 중이던 CST가 그 유닛에서 사라짐
      for (const j of Object.values(next)) {
        if (
          j.status === 'waiting' &&
          j.destination === item.id &&
          j.lineId === item.lineId &&
          item.cstId !== j.cstId
        ) {
          next[j.cstId] = { ...j, status: 'done', departedAt: at }
          changed = true
        }
      }
    }
  }

  // 이 메시지가 언급하지 않은 채 오래 방치된 여정 — V3가 더 이상 추적하지 않음(유실)
  changed = closeStaleJourneys(next, at, siteId) || changed

  if (!changed) return null
  trim(next)
  return next
}
