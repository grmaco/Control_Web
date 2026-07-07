import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit, typeLabel } from '../constants/conveyorTypes'
import { resolveAdjacentPortsForStk } from '../utils/unitPropertyHelpers'
import { usePioStore } from '../store/usePioStore'

export type PortSimStatus = 'LD' | 'ULD' | 'BUSY' | 'READY'
export type StorageSimStatus = 'IDLE' | 'TR' | 'BUSY' | 'COMPLETE'

export interface PortSimState {
  unitId: string
  status: PortSimStatus
  hasCst: boolean
}

export interface StorageSimState {
  unitId: string
  status: StorageSimStatus
  hasCst: boolean
  filledSlots: number
}

interface TransferSession {
  storageId: string
  portId: string
  phase: number
  /** PIO 타임차트 트랜잭션 ID — 핸드셰이크 신호 기록용 */
  pioTxId?: string
}

/**
 * 포트 ↔ 적재창고 전송 시뮬레이션
 *
 * 핸드쉐이크 시퀀스 (1초 간격):
 *  startTransfer → Storage→TR
 *  phase 0 tick → Port→READY
 *  phase 1 tick → Storage→BUSY
 *  phase 2 tick → Port→BUSY (1초째)
 *  phase 3 tick → Port→LD(CST 제거) · Storage→COMPLETE+CST (2초째, 자재 이동)
 *  phase 4 tick → Storage→IDLE, 완료
 *
 * conveyorCstIds: 컨베이어 시뮬에서 자재가 올라간 유닛 ID 목록.
 * 핸드쉐이크 중이 아닌 포트는 이 목록을 기준으로 ULD/LD 상태가 결정됨.
 */
export function usePortStorageSimulation(
  line: ConveyorLine,
  conveyorCstIds?: string[],
  /** 'complete'이면 CST 동기화를 스킵하여 포트 ULD 상태를 유지한다 */
  simulationStatus?: string,
  /** Phase 3 완료 시 호출 — 경로 시뮬에서 해당 포트 자재 로드 제거 */
  onPortDischarge?: (portUnitId: string) => void,
) {
  const [portStates, setPortStates] = useState<Record<string, PortSimState>>({})
  const [storageStates, setStorageStates] = useState<Record<string, StorageSimState>>({})
  const [session, setSession] = useState<TransferSession | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const portRef = useRef<Record<string, PortSimState>>({})
  const storageRef = useRef<Record<string, StorageSimState>>({})
  const sessionRef = useRef<TransferSession | null>(null)
  // 매 렌더마다 portStates와 동기화 — 맵 표시와 일치하는 상태를 모달에서 읽을 때 사용
  const portStatesRef = useRef<Record<string, PortSimState>>({})
  portStatesRef.current = portStates
  // tick의 deps:[] 클로저에서도 최신 콜백 참조
  const onPortDischargeRef = useRef(onPortDischarge)
  onPortDischargeRef.current = onPortDischarge
  // tick·startTransfer의 deps:[] 클로저에서 유닛 이름 조회용
  const lineRef = useRef(line)
  lineRef.current = line

  const unitName = useCallback((unitId: string) => {
    return lineRef.current.units.find((u) => u.id === unitId)?.name ?? unitId
  }, [])
  const unitType = useCallback((unitId: string) => {
    const unit = lineRef.current.units.find((u) => u.id === unitId)
    return unit ? typeLabel(unit.type) : undefined
  }, [])

  const buildInitial = useCallback(() => {
    const ports: Record<string, PortSimState> = {}
    const storages: Record<string, StorageSimState> = {}
    for (const unit of line.units) {
      if (isPortUnit(unit)) {
        // 포트는 처음에 모두 LD — 컨베이어 CST 동기화로 ULD로 전환됨
        ports[unit.id] = { unitId: unit.id, status: 'LD', hasCst: false }
      } else if (isStorageUnit(unit)) {
        storages[unit.id] = { unitId: unit.id, status: 'IDLE', hasCst: false, filledSlots: 0 }
      }
    }
    return { ports, storages }
  }, [line])

  const init = useCallback(() => {
    const { ports, storages } = buildInitial()
    portRef.current = ports
    storageRef.current = storages
    setPortStates(ports)
    setStorageStates(storages)
    sessionRef.current = null
    setSession(null)
  }, [buildInitial])

  const start = useCallback(() => {
    init()
    setIsRunning(true)
  }, [init])

  const stop = useCallback(() => {
    // 진행 중이던 핸드셰이크의 PIO 트랜잭션 정리
    const txId = sessionRef.current?.pioTxId
    if (txId) usePioStore.getState().completeTransaction(txId, 'error')
    setIsRunning(false)
    init()
  }, [init])

  // ── 컨베이어 CST 동기화 ─────────────────────────────────────────
  // 핸드쉐이크 중이 아닌 포트는 컨베이어 시뮬의 자재 위치(cstUnitIds)에 따라
  // ULD(자재 있음) / LD(자재 없음) 상태를 자동 갱신한다.
  //
  // 판정 기준: 포트 자체 OR 포트에 connections[]로 연결된 인접 컨베이어 중
  // 하나라도 cstUnitIds에 있으면 해당 포트는 ULD.
  useEffect(() => {
    if (!isRunning || !conveyorCstIds) return
    // 시뮬 완료 후 포트 상태 동결 — cstUnitIds가 [] 가 되어도 ULD 유지
    if (simulationStatus === 'complete') return

    const cstSet = new Set(conveyorCstIds)
    const sessionPortId = sessionRef.current?.portId

    setPortStates((current) => {
      const next = { ...current }
      let changed = false
      for (const portId of Object.keys(current)) {
        if (portId === sessionPortId) continue // 핸드쉐이크 중인 포트는 건드리지 않음
        // 포트 셀 자체에 자재가 있을 때만 ULD
        const hasMaterial = cstSet.has(portId)
        const expectedStatus: PortSimStatus = hasMaterial ? 'ULD' : 'LD'
        const prev = current[portId]
        if (prev && (prev.status !== expectedStatus || prev.hasCst !== hasMaterial)) {
          next[portId] = { ...prev, status: expectedStatus, hasCst: hasMaterial }
          changed = true
        }
      }
      if (!changed) return current
      portRef.current = next
      return next
    })
  }, [isRunning, conveyorCstIds, line, simulationStatus])

  /** STK에 인접한 포트 목록과 현재 상태 반환 (상태 필터 없음 — 맵 표시와 동기화) */
  const getConnectablePorts = useCallback(
    (storageId: string): Array<{ state: PortSimState; unit: ConveyorUnit }> => {
      const storageUnit = line.units.find((u) => u.id === storageId && isStorageUnit(u))
      if (!storageUnit) return []
      return resolveAdjacentPortsForStk(line, storageUnit).flatMap((u) => {
        const s = portStatesRef.current[u.id]
        if (!s) return []
        return [{ state: s, unit: u }]
      })
    },
    [line],
  )

  /** 반송 명령 시작: 포트 자재 확인 후 Storage→TR, 핸드쉐이크 세션 시작 */
  const startTransfer = useCallback((storageId: string, portId: string) => {
    const storage = storageRef.current[storageId]
    if (!storage || storage.status !== 'IDLE') return

    // 포트에 자재가 없으면(LD) 반송 시작 불가
    const port = portRef.current[portId]
    if (!port || !port.hasCst) return

    const ns = {
      ...storageRef.current,
      [storageId]: { ...storage, status: 'TR' as StorageSimStatus },
    }
    storageRef.current = ns
    setStorageStates(ns)

    // PIO 타임차트: 핸드셰이크 시작 — STK(Active)가 포트(Passive)에서 자재 반출
    // STATUS 프로토콜 — 실제 시뮬 상태값(IDLE/TR/BUSY/COMPLETE, LD/ULD/BUSY/READY)만 사용, E84 신호 아님
    const pio = usePioStore.getState()
    const pioTxId = pio.beginTransaction({
      pairKind: 'PORT_STK',
      operation: 'UNLOAD',
      activeName: unitName(storageId),
      activeType: unitType(storageId),
      passiveName: unitName(portId),
      passiveType: unitType(portId),
      source: 'sim-port',
    })
    pio.addEdgesNow(pioTxId, [
      { signal: 'IDLE', side: 'active', value: 0 },
      { signal: 'TR', side: 'active', value: 1 },
    ])

    const s: TransferSession = { storageId, portId, phase: 0, pioTxId }
    sessionRef.current = s
    setSession(s)
  }, [unitName, unitType])

  const tick = useCallback(() => {
    const s = sessionRef.current
    if (!s) return

    const { storageId, portId, phase, pioTxId } = s
    const storage = storageRef.current[storageId]
    const port = portRef.current[portId]
    if (!storage || !port) return

    let np = { ...portRef.current }
    let ns = { ...storageRef.current }
    let nextPhase = phase + 1
    const pio = usePioStore.getState()

    /** 핸드쉐이크 중단 — 포트/스토커 원상 복귀 */
    const abort = () => {
      np[portId] = { ...port, status: port.hasCst ? 'ULD' : 'LD' }
      ns[storageId] = { ...storage, status: 'IDLE' }
      nextPhase = -1
      sessionRef.current = null
      setSession(null)
      if (pioTxId) {
        pio.completeTransaction(
          pioTxId,
          'error',
          phase === 0 ? 'S1_WAIT' : 'S2_TRANSFER',
        )
      }
    }

    switch (phase) {
      case 0: // Storage=TR → 포트 자재 재확인 후 READY 신호
        if (!port.hasCst) { abort(); break }
        np[portId] = { ...port, status: 'READY' }
        if (pioTxId)
          pio.addEdgesNow(pioTxId, [
            { signal: 'ULD', side: 'passive', value: 0 },
            { signal: 'READY', side: 'passive', value: 1 },
          ])
        break
      case 1: // Port=READY → Storage: BUSY
        ns[storageId] = { ...storage, status: 'BUSY' }
        if (pioTxId)
          pio.addEdgesNow(pioTxId, [
            { signal: 'TR', side: 'active', value: 0 },
            { signal: 'BUSY', side: 'active', value: 1 },
          ])
        break
      case 2: // Storage=BUSY → Port: BUSY
        np[portId] = { ...port, status: 'BUSY' }
        if (pioTxId)
          pio.addEdgesNow(pioTxId, [
            { signal: 'READY', side: 'passive', value: 0 },
            { signal: 'BUSY', side: 'passive', value: 1 },
          ])
        break
      case 3: // 자재 이동 — 포트 자재 최종 확인
        if (!port.hasCst) { abort(); break }
        np[portId] = { ...port, status: 'LD', hasCst: false }
        ns[storageId] = {
          ...storage,
          status: 'COMPLETE',
          hasCst: true,
          filledSlots: storage.filledSlots + 1,
        }
        // 경로 시뮬에서 포트 자재 로드 제거
        onPortDischargeRef.current?.(portId)
        if (pioTxId)
          pio.addEdgesNow(pioTxId, [
            { signal: 'BUSY', side: 'active', value: 0 },
            { signal: 'COMPLETE', side: 'active', value: 1 },
            { signal: 'BUSY', side: 'passive', value: 0 },
            { signal: 'LD', side: 'passive', value: 1 },
          ])
        break
      case 4: // Storage=COMPLETE → IDLE, 완료
        ns[storageId] = { ...storage, status: 'IDLE', hasCst: false }
        nextPhase = -1
        sessionRef.current = null
        setSession(null)
        if (pioTxId) {
          pio.addEdgesNow(pioTxId, [
            { signal: 'COMPLETE', side: 'active', value: 0 },
            { signal: 'IDLE', side: 'active', value: 1 },
          ])
          pio.completeTransaction(pioTxId, 'complete')
        }
        break
    }

    portRef.current = np
    storageRef.current = ns
    setPortStates(np)
    setStorageStates(ns)

    if (nextPhase >= 0) {
      const next = { ...s, phase: nextPhase }
      sessionRef.current = next
      setSession(next)
    }
  }, [])

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isRunning, tick])

  return {
    portStates,
    storageStates,
    session,
    isRunning,
    start,
    stop,
    startTransfer,
    getConnectablePorts,
  }
}
