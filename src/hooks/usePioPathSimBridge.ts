import { useEffect, useRef } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { PathSimulationLoad } from '../types/unitProperties'
import type { PioPairKind } from '../types/pio'
import { isPortUnit, isStorageUnit, typeLabel } from '../constants/conveyorTypes'
import { usePioStore } from '../store/usePioStore'
import { runPioSequence } from '../utils/pioSequence'
import { getTurnTraversalAngle } from '../utils/pathSimulation'

/** 동시 기록 상한 — 경로 시뮬 자재가 많아도 차트가 홍수나지 않게 */
const MAX_CONCURRENT_PATH_TX = 4

export interface PioTurnTransitSec {
  90: number
  180: number
  270: number
}

/**
 * 경로 시뮬레이션 자재 홉 → PIO 핸드셰이크 브리지.
 * 자재가 유닛 A→B로 이동할 때마다 상류(Active)↔하류(Passive) 간
 * STATUS 프로토콜(LD/ULD/BUSY — 실제 시뮬 상태값) 시퀀스를 이송 간격에 맞춰 기록한다.
 * E84 신호는 쓰지 않는다 — CNV_CNV/CNV_PORT는 E84 대상이 아니다.
 *
 * 회전(turn) 유닛에서 나가는 홉은 실제 시뮬레이션과 동일하게 회전각(90/180/270°)별
 * 실측 시간(turnTransitSec)을 사용 — 직선 홉의 기본 전송시간과 구별되어야 하기 때문
 * (getTurnTraversalAngle은 pathSimulation.ts의 실제 시뮬 로직을 그대로 재사용).
 */
export function usePioPathSimBridge(options: {
  enabled: boolean
  loads: PathSimulationLoad[]
  line: ConveyorLine
  transitIntervalSec: number
  turnTransitSec: PioTurnTransitSec
}): void {
  const { enabled, loads, line, transitIntervalSec, turnTransitSec } = options
  // loadId → 마지막으로 관찰한 stepIndex
  const stepIndexRef = useRef<Map<string, number>>(new Map())
  const lineRef = useRef(line)
  const transitRef = useRef(transitIntervalSec)
  const turnTransitRef = useRef(turnTransitSec)

  useEffect(() => {
    lineRef.current = line
  }, [line])
  useEffect(() => {
    transitRef.current = transitIntervalSec
  }, [transitIntervalSec])
  useEffect(() => {
    turnTransitRef.current = turnTransitSec
  }, [turnTransitSec])

  useEffect(() => {
    if (!enabled) {
      stepIndexRef.current.clear()
      return
    }

    const seen = stepIndexRef.current
    const currentLine = lineRef.current
    const unitById = new Map(currentLine.units.map((u) => [u.id, u]))

    for (const load of loads) {
      const prevIdx = seen.get(load.id)
      if (prevIdx == null) {
        // 첫 관찰 — 기준점만 기록 (StrictMode 재실행에도 안전)
        seen.set(load.id, load.stepIndex)
        continue
      }
      if (load.stepIndex <= prevIdx) continue
      seen.set(load.id, load.stepIndex)

      const fromId = load.pathUnitIds[load.stepIndex - 1]
      const toId = load.pathUnitIds[load.stepIndex]
      if (!fromId || !toId) continue
      const fromUnit = unitById.get(fromId)
      const toUnit = unitById.get(toId)
      if (!fromUnit || !toUnit) continue
      // 창고 진입은 포트↔창고 시뮬이 별도 기록 — 여기선 컨베이어 계열만
      if (isStorageUnit(fromUnit) || isStorageUnit(toUnit)) continue

      // 홍수 방지: 실행 중인 경로 트랜잭션 수 제한
      const running = usePioStore
        .getState()
        .transactions.filter((t) => t.source === 'sim-path' && t.status === 'running')
      if (running.length >= MAX_CONCURRENT_PATH_TX) continue

      const pairKind: PioPairKind =
        isPortUnit(fromUnit) || isPortUnit(toUnit) ? 'CNV_PORT' : 'CNV_CNV'

      // 실제 소요시간 — 회전 유닛에서 나가는 홉은 회전각별 실측시간(1.0/1.6/2.2s),
      // 그 외(직선↔직선, 직선↔포트)는 기본 전송시간(transitIntervalSec)
      let realSec = transitRef.current
      if (fromUnit.type === 'turn') {
        const angle = getTurnTraversalAngle(
          { ...load, stepIndex: load.stepIndex - 1 },
          unitById,
        )
        if (angle != null) realSec = turnTransitRef.current[angle]
      }

      // 이송 간격 안에 시퀀스가 끝나도록 축소 (85%)
      const totalMs = Math.min(Math.max(Math.round(realSec * 1000 * 0.85), 400), 2500)

      runPioSequence({
        pairKind,
        operation: 'LOAD', // 하류(Passive)에 자재 적재
        activeName: fromUnit.name,
        activeType: typeLabel(fromUnit.type),
        passiveName: toUnit.name,
        passiveType: typeLabel(toUnit.type),
        source: 'sim-path',
        scaleToTotalMs: totalMs,
      })
    }

    // 완료·제거된 load 정리
    const liveIds = new Set(loads.map((l) => l.id))
    for (const id of [...seen.keys()]) {
      if (!liveIds.has(id)) seen.delete(id)
    }
  }, [enabled, loads])
}
