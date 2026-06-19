import type { ConveyorLine, ConveyorStatus } from '../types/conveyor'
import type {
  SemiCnvLineRuntime,
  SemiCnvUnitRuntime,
} from '../types/semicnv'

export function mergeLiveLine(
  line: ConveyorLine,
  unitStatuses: Record<string, ConveyorStatus>,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
): ConveyorLine {
  if (Object.keys(unitStatuses).length === 0 && Object.keys(unitRuntime).length === 0) {
    return line
  }

  return {
    ...line,
    units: line.units.map((unit) => {
      const liveStatus = unitStatuses[unit.id]
      const runtime = unitRuntime[unit.id]
      if (!liveStatus && !runtime) return unit

      return {
        ...unit,
        status: liveStatus ?? unit.status,
        updatedAt: runtime?.updatedAt ?? unit.updatedAt,
      }
    }),
  }
}

export function mergeLiveLines(
  lines: ConveyorLine[],
  unitStatuses: Record<string, ConveyorStatus>,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
): ConveyorLine[] {
  return lines.map((line) => mergeLiveLine(line, unitStatuses, unitRuntime))
}

export function getUnitRuntime(
  unitId: string,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
): SemiCnvUnitRuntime | undefined {
  return unitRuntime[unitId]
}

export function getLineRuntime(
  lineId: string,
  lineRuntime: Record<string, SemiCnvLineRuntime>,
): SemiCnvLineRuntime | undefined {
  return lineRuntime[lineId]
}
