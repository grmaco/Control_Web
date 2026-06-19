import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { SemiCnvConveyorStatusItem } from '../types/semicnv'

function normalizeUnitName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '')
}

/** Semi C/V numeric id → CV-012 형태 후보 */
function idNameCandidates(id: number): string[] {
  const padded = String(id).padStart(2, '0')
  return [`CV-${padded}`, `CV-${id}`, `CV${padded}`, `CV${id}`]
}

export function findUnitForSemiCnvStatus(
  lines: ConveyorLine[],
  item: SemiCnvConveyorStatusItem,
): { line: ConveyorLine; unit: ConveyorUnit } | null {
  for (const line of lines) {
    if (line.semiCnvLineId != null && line.semiCnvLineId !== item.lineId) {
      continue
    }

    const byId = line.units.find((u) => u.semiCnvId === item.id)
    if (byId) return { line, unit: byId }

    const normalizedTarget = normalizeUnitName(item.name)
    const byName = line.units.find(
      (u) => normalizeUnitName(u.name) === normalizedTarget,
    )
    if (byName) return { line, unit: byName }

    const byPrefix = line.units.find((u) => {
      const normalized = normalizeUnitName(u.name)
      return idNameCandidates(item.id).some(
        (candidate) =>
          normalized === candidate ||
          normalized.startsWith(candidate) ||
          normalizedTarget.startsWith(normalizeUnitName(u.name)),
      )
    })
    if (byPrefix) return { line, unit: byPrefix }
  }

  // lineId 매핑 없을 때 전체 라인에서 id/name 재탐색
  for (const line of lines) {
    const byId = line.units.find((u) => u.semiCnvId === item.id)
    if (byId) return { line, unit: byId }

    const normalizedTarget = normalizeUnitName(item.name)
    const byName = line.units.find(
      (u) => normalizeUnitName(u.name) === normalizedTarget,
    )
    if (byName) return { line, unit: byName }
  }

  return null
}

export function findLineForSemiCnvLineId(
  lines: ConveyorLine[],
  semiCnvLineId: number,
): ConveyorLine | null {
  const mapped = lines.find((line) => line.semiCnvLineId === semiCnvLineId)
  if (mapped) return mapped

  if (lines.length === 1) return lines[0]
  return null
}

export function findUnitBySemiCnvId(
  lines: ConveyorLine[],
  semiCnvId: number,
  semiCnvLineId?: number,
): { line: ConveyorLine; unit: ConveyorUnit } | null {
  for (const line of lines) {
    if (semiCnvLineId != null && line.semiCnvLineId != null && line.semiCnvLineId !== semiCnvLineId) {
      continue
    }
    const unit = line.units.find((u) => u.semiCnvId === semiCnvId)
    if (unit) return { line, unit }
  }

  for (const line of lines) {
    const unit = line.units.find((u) => u.semiCnvId === semiCnvId)
    if (unit) return { line, unit }
  }

  return null
}
