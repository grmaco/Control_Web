import type { ConveyorUnit, Rotation } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import { STATUS_COLORS } from '../constants/statusColors'
import type { UnitFlowDirs } from './flowDirection'
import { formatTurnFlowAngleLabel } from './turnArc'
import { collectCalloutTags } from './flowCallouts'
import { unitHasMaterial } from './unitMaterial'

export interface CalloutDisplayInfo {
  name: string
  status: string
  role: string
  cstOn: string
  location: string
  productId: string
}

function formatJunctionUpDown(rotation: Rotation): string {
  return rotation === 90 || rotation === 270 ? 'UP' : 'Down'
}

export function formatCalloutLocation(
  unit: ConveyorUnit,
  flow?: UnitFlowDirs | null,
): string {
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

  return '—'
}

export function buildCalloutDisplayInfo(
  unit: ConveyorUnit,
  flow: UnitFlowDirs | undefined,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  simulationActive: boolean,
): CalloutDisplayInfo {
  const tags = flow ? collectCalloutTags(unit, flow) : []
  const role = tags.length > 0 ? tags.map((tag) => tag.text).join(' · ') : '—'
  const hasCst = simulationActive || unitHasMaterial(unit, unitRuntime)
  const cstId = unitRuntime[unit.id]?.cstId?.trim()

  return {
    name: unit.name,
    status: STATUS_COLORS[unit.status].label,
    role,
    cstOn: hasCst ? 'On' : 'Off',
    location: formatCalloutLocation(unit, flow),
    productId: cstId || '—',
  }
}
