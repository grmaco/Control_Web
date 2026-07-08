import type { ConveyorUnit } from '../types/conveyor'

export type UnitRefLineContext = Pick<{ units: ConveyorUnit[] }, 'units'>

/** id · code · name으로 유닛 조회 */
export function findUnitByRef(
  line: UnitRefLineContext,
  ref: string | null | undefined,
): ConveyorUnit | null {
  const trimmed = ref?.trim()
  if (!trimmed) return null

  const byId = line.units.find((unit) => unit.id === trimmed)
  if (byId) return byId

  const normalized = trimmed.toLowerCase()
  return (
    line.units.find((unit) => {
      const code = unit.code?.trim().toLowerCase()
      const name = unit.name.trim().toLowerCase()
      return code === normalized || name === normalized
    }) ?? null
  )
}

/** id · code · name 문자열을 유닛 id로 변환 — 라인에 없으면 빈 문자열 */
export function resolveUnitRefToId(
  line: UnitRefLineContext,
  ref: string | null | undefined,
): string {
  return findUnitByRef(line, ref)?.id ?? ''
}
