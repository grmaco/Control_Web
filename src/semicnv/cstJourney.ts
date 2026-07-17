import type {
  SemiCnvConveyorStatusItem,
  SemiCnvCstJourney,
  SemiCnvCstTrackingItem,
  SemiCnvMessage,
} from '../types/semicnv'

const MAX_JOURNEYS = 200

interface Observation {
  cstId: string
  siteId: string | null
  conveyorId: number
  lineId: number
  destination: number | null
  at: string
}

function freshJourney(obs: Observation): SemiCnvCstJourney {
  const destination = obs.destination ?? 0
  const arrived = destination > 0 && obs.conveyorId === destination
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
function observe(map: Record<string, SemiCnvCstJourney>, obs: Observation): boolean {
  const prev = map[obs.cstId]
  if (!prev || prev.status === 'done') {
    // 신규 CST — 또는 완료된 CST ID 재등장 시 새 반송으로 시작
    map[obs.cstId] = freshJourney(obs)
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

  if (j.arrivedAt == null && j.destination > 0 && obs.conveyorId === j.destination) {
    j.arrivedAt = obs.at
    j.status = 'waiting'
    changed = true
  }

  if (j.lastSeenAt !== obs.at) {
    j.lastSeenAt = obs.at
    changed = true
  }

  if (changed) map[obs.cstId] = j
  return changed
}

/** 오래된 완료 여정부터 정리해 MAX_JOURNEYS 유지 */
function trim(map: Record<string, SemiCnvCstJourney>): void {
  const keys = Object.keys(map)
  if (keys.length <= MAX_JOURNEYS) return
  const done = Object.values(map)
    .filter((j) => j.status === 'done')
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
        observe(next, {
          cstId: item.cstId,
          siteId,
          conveyorId: item.conveyorId,
          lineId: item.lineId,
          destination: item.destination ?? null,
          at,
        }) || changed
    }
  } else {
    const items = message.data as SemiCnvConveyorStatusItem[]
    for (const item of items) {
      if (item.cstId) {
        changed =
          observe(next, {
            cstId: item.cstId,
            siteId,
            conveyorId: item.id,
            lineId: item.lineId,
            destination: item.destination ?? null,
            at,
          }) || changed
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

  if (!changed) return null
  trim(next)
  return next
}
