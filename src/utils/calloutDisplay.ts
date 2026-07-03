import type { ConveyorUnit } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import type { PathSimulationLoad } from '../types/unitProperties'
import type { UnitFlowDirs } from './flowDirection'
import { formatTurnFlowAngleLabel } from './turnArc'
import { collectCalloutTags } from './flowCallouts'
import {
  CALLOUT_TRANSFER_STATUS_LABEL,
  resolveLiveTransferStatus,
  type CalloutTransferStatus,
} from './calloutTransferStatus'
import { resolveSimulationUnitTransferStatus } from './pathSimulation'
import type { PortSimState } from '../hooks/usePortStorageSimulation'

export interface CalloutDisplayInfo {
  name: string
  status: string
  transferStatus: CalloutTransferStatus
  role: string
  cstOn: string
  /** null이면 해당 모듈 타입에 위치 정보가 없음 (직선 등) — 행 자체를 숨김 */
  location: string | null
  /** null이면 HOME 정보 없음 (회전·리프트에만 표시) */
  home: string | null
  /** 시뮬 투입 목적지 — null이면 행 숨김 (분기·회전·투입점, CST 있을 때) */
  simDestination: string | null
  productId: string
  /** 현재 활성 알람 코드. null이면 알람 없음 */
  alarm: string | null
}

export function formatCalloutLocation(
  unit: ConveyorUnit,
  flow?: UnitFlowDirs | null,
): string | null {
  if (unit.type === 'lift') {
    return `${unit.rotation}mm`
  }

  if (unit.type === 'turn') {
    const angle =
      flow?.inDir && flow?.outDir
        ? formatTurnFlowAngleLabel(flow.inDir, flow.outDir)
        : null
    return angle ?? `${unit.rotation}°`
  }

  if (unit.type === 'junction') {
    return '수직 전환'
  }

  return null
}

export function buildCalloutDisplayInfo(
  unit: ConveyorUnit,
  flow: UnitFlowDirs | undefined,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  simulationCstActive: boolean,
  options?: {
    staticTestAtOrigin?: boolean
    simulating?: boolean
    simDestination?: string | null
    simulationLoads?: PathSimulationLoad[]
    unitMap?: Map<string, ConveyorUnit>
    inputIntervalSec?: number
    transitIntervalSec?: number
    dischargeIntervalSec?: number
    continuousInputActive?: boolean
    /** 포트/창고 핸드쉐이크 시뮬 상태 — READY/BUSY 오버라이드용 */
    portSimState?: PortSimState
  },
  unitAlarms?: Record<string, string>,
): CalloutDisplayInfo {
  const tags = collectCalloutTags(unit, flow)
  const role = tags.length > 0 ? tags.map((tag) => tag.text).join(' · ') : '—'
  const simulating = options?.simulating ?? false
  const staticTestAtOrigin = options?.staticTestAtOrigin ?? unit.testMaterial === 1
  const hasCst =
    simulationCstActive ||
    (unit.testMaterial === 1
      ? simulating
        ? staticTestAtOrigin
        : true
      : false) ||
    Boolean(unitRuntime[unit.id]?.cstId?.trim())
  const cstId = unitRuntime[unit.id]?.cstId?.trim()

  const runtime = unitRuntime[unit.id]
  const showHome = unit.type === 'turn' || unit.type === 'lift'
  const home = showHome ? (runtime?.homeDone ?? null) : null

  // 회전 유닛: V3 실시간 각도 우선, 없으면 flow 기반 정적 각도
  let location: string | null
  if (unit.type === 'turn' && runtime?.currentDegree != null) {
    location = `${runtime.currentDegree}°`
  } else {
    location = formatCalloutLocation(unit, flow)
  }

  const isEntry = unit.flowRole === 'entry' || unit.role === 'INPUT'
  const showsSimDestination =
    unit.type === 'junction' ||
    unit.type === 'turn' ||
    unit.flowRole === 'exit' ||
    isEntry
  const simDestination =
    showsSimDestination && hasCst && options?.simDestination?.trim()
      ? options.simDestination.trim()
      : null

  const simStatus =
    simulating && options?.simulationLoads
      ? resolveSimulationUnitTransferStatus(unit.id, options.simulationLoads, options.unitMap, {
          staticTestAtOrigin,
          simulating,
          inputIntervalSec: options.inputIntervalSec,
          transitIntervalSec: options.transitIntervalSec,
          dischargeIntervalSec: options.dischargeIntervalSec,
          continuousInputActive: options.continuousInputActive,
        })
      : null
  const liveStatus = resolveLiveTransferStatus(runtime, hasCst)
  const baseStatus: CalloutTransferStatus =
    simStatus ?? (runtime ? liveStatus : hasCst ? 'ULD' : 'LD')
  // 핸드쉐이크 중 READY/BUSY는 portSimState가 우선 — 경로 시뮬이 모르는 상태
  const portSimStatus = options?.portSimState?.status
  const transferStatus: CalloutTransferStatus =
    portSimStatus === 'READY' || portSimStatus === 'BUSY' ? portSimStatus : baseStatus

  return {
    name: unit.name,
    status: CALLOUT_TRANSFER_STATUS_LABEL[transferStatus],
    transferStatus,
    role,
    cstOn: hasCst ? 'On' : 'Off',
    location,
    home,
    simDestination,
    productId: cstId || '—',
    alarm: unitAlarms?.[unit.id] ?? null,
  }
}
