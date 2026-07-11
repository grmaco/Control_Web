import { useEffect, useRef } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import type { PioPairKind } from '../types/pio'
import { isPortUnit, isStorageUnit, typeLabel } from '../constants/conveyorTypes'
import { usePioStore } from '../store/usePioStore'
import { runPioSequence } from '../utils/pioSequence'

/** 동시 기록 상한 — V3 실제 반송이 많아도 차트가 홍수나지 않게 */
const MAX_CONCURRENT_V3_TX = 4
/** 실측 소요시간을 알 수 없을 때 사용할 클램프 범위(ms) — 관측 간격 기반 추정치 보정용 */
const MIN_HOP_MS = 400
const MAX_HOP_MS = 4000

interface CstLocation {
  unitId: string
  seenAt: number
}

/**
 * 실제 V3 연동 반송 → PIO 핸드셰이크 브리지.
 * usePioPathSimBridge(내부 시뮬)와 대칭 — 이쪽은 V3가 보내는 CST_TRACKING/CONVEYOR_STATUS의
 * cstId 위치 변화를 관찰해서 실제 자재 이동(A유닛→B유닛)을 감지하고, 그 시점에 STATUS
 * 프로토콜 시퀀스를 기록한다. 실제 신호 엣지가 없으므로 cstId가 한 유닛에서 사라지고
 * 다른 유닛에 동시에 나타나는 것을 "홉"으로 간주한다.
 */
export function useV3PioBridge(options: {
  enabled: boolean
  unitRuntime: Record<string, SemiCnvUnitRuntime>
  line: ConveyorLine
}): void {
  const { enabled, unitRuntime, line } = options
  // cstId → 마지막으로 관찰된 위치(unitId)와 관찰 시각
  const cstLocationRef = useRef<Map<string, CstLocation>>(new Map())
  const lineRef = useRef(line)

  useEffect(() => {
    lineRef.current = line
  }, [line])

  useEffect(() => {
    if (!enabled) {
      cstLocationRef.current.clear()
      return
    }

    const tracked = cstLocationRef.current
    const currentLine = lineRef.current
    const unitById = new Map(currentLine.units.map((u) => [u.id, u]))
    const now = Date.now()

    // 이번 스냅샷의 cstId → unitId
    const currentByCst = new Map<string, string>()
    for (const [unitId, runtime] of Object.entries(unitRuntime)) {
      if (runtime.cstId) currentByCst.set(runtime.cstId, unitId)
    }

    for (const [cstId, unitId] of currentByCst) {
      const prev = tracked.get(cstId)
      if (!prev) {
        // 첫 관찰 — 기준점만 기록
        tracked.set(cstId, { unitId, seenAt: now })
        continue
      }
      if (prev.unitId === unitId) continue // 같은 위치 — 홉 아님

      const fromUnit = unitById.get(prev.unitId)
      const toUnit = unitById.get(unitId)
      tracked.set(cstId, { unitId, seenAt: now })
      if (!fromUnit || !toUnit) continue

      // 홍수 방지: 실행 중인 V3 트랜잭션 수 제한
      const running = usePioStore
        .getState()
        .transactions.filter((t) => t.source === 'v3' && t.status === 'running')
      if (running.length >= MAX_CONCURRENT_V3_TX) continue

      const pairKind: PioPairKind =
        isStorageUnit(fromUnit) || isStorageUnit(toUnit)
          ? 'PORT_STK'
          : isPortUnit(fromUnit) || isPortUnit(toUnit)
            ? 'CNV_PORT'
            : 'CNV_CNV'

      const elapsedMs = Math.min(Math.max(now - prev.seenAt, MIN_HOP_MS), MAX_HOP_MS)

      runPioSequence({
        pairKind,
        operation: 'LOAD', // 하류(Passive)에 자재 적재
        activeName: fromUnit.name,
        activeType: typeLabel(fromUnit.type),
        passiveName: toUnit.name,
        passiveType: typeLabel(toUnit.type),
        source: 'v3',
        scaleToTotalMs: elapsedMs,
      })
    }

    // 사라진 cstId(반출 완료 등) 정리 — 홉 없이 그냥 추적 종료
    for (const cstId of [...tracked.keys()]) {
      if (!currentByCst.has(cstId)) tracked.delete(cstId)
    }
  }, [enabled, unitRuntime])
}
