import type { ConveyorUnit, Rotation } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import { STATUS_COLORS } from '../constants/statusColors'
import type { UnitFlowDirs } from './flowDirection'
import { formatTurnFlowAngleLabel } from './turnArc'
import { collectCalloutTags } from './flowCallouts'

export interface CalloutDisplayInfo {
  name: string
  status: string
  role: string
  cstOn: string
  /** null이면 해당 모듈 타입에 위치 정보가 없음 (직선 등) — 행 자체를 숨김 */
  location: string | null
  /** null이면 HOME 정보 없음 (회전·리프트에만 표시) */
  home: string | null
  productId: string
  /** 현재 활성 알람 코드. null이면 알람 없음 */
  alarm: string | null
}

function formatJunctionUpDown(rotation: Rotation): string {
  return rotation === 90 || rotation === 270 ? 'UP' : 'Down'
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
    return formatJunctionUpDown(unit.rotation)
  }

  return null
}

export function buildCalloutDisplayInfo(
  unit: ConveyorUnit,
  flow: UnitFlowDirs | undefined,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  simulationCstActive: boolean,
  options?: { staticTestAtOrigin?: boolean; simulating?: boolean },
  unitAlarms?: Record<string, string>,
): CalloutDisplayInfo {
  const tags = flow ? collectCalloutTags(unit, flow) : []
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

  return {
    name: unit.name,
    status: STATUS_COLORS[unit.status].label,
    role,
    cstOn: hasCst ? 'On' : 'Off',
    location,
    home,
    productId: cstId || '—',
    alarm: unitAlarms?.[unit.id] ?? null,
  }
}
