import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { SemiCnvConveyorStatusItem } from '../types/semicnv'

function normalize(name: string | undefined | null): string {
  return (name ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

/** "CV01", "CV-01", "1", "001" 같은 표현에서 숫자 추출 */
function extractNumericId(s: string | undefined | null): number | null {
  if (!s) return null
  const m = (s ?? '').match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}

/** V3 numeric id → 가능한 이름 후보 */
function idNameCandidates(id: number): string[] {
  const pad = String(id).padStart(2, '0')
  return [`CV-${pad}`, `CV-${id}`, `CV${pad}`, `CV${id}`, String(id), pad]
}

/** unit의 name 또는 code 가 V3 item 과 매칭되는지 확인 */
function unitMatchesItem(unit: ConveyorUnit, item: SemiCnvConveyorStatusItem): boolean {
  // 1. semiCnvId 직접 매핑 (명시적으로 설정된 경우)
  if (unit.semiCnvId != null && unit.semiCnvId === item.id) return true

  const normalizedItemName = normalize(item.name)
  const unitName = normalize(unit.name)
  const unitCode = normalize(unit.code)

  // 2. 이름 완전 일치
  if (unitName && unitName === normalizedItemName) return true
  if (unitCode && unitCode === normalizedItemName) return true

  // 3. 후보명과 비교 (CV01, CV1 등 변형)
  const candidates = idNameCandidates(item.id)
  if (unitName && candidates.some((c) => unitName === c)) return true
  if (unitCode && candidates.some((c) => unitCode === c)) return true

  // 4. 숫자 ID 매칭 (name/code 끝 숫자만 동일하면 매칭)
  const unitNameId = extractNumericId(unit.name)
  const unitCodeId = extractNumericId(unit.code)
  if (unitNameId != null && unitNameId === item.id) return true
  if (unitCodeId != null && unitCodeId === item.id) return true

  // 5. 접두사 포함 매칭
  if (
    unitName &&
    normalizedItemName &&
    (unitName.startsWith(normalizedItemName) || normalizedItemName.startsWith(unitName))
  )
    return true
  if (
    unitCode &&
    normalizedItemName &&
    (unitCode.startsWith(normalizedItemName) || normalizedItemName.startsWith(unitCode))
  )
    return true

  return false
}

export function findUnitForSemiCnvStatus(
  lines: ConveyorLine[],
  item: SemiCnvConveyorStatusItem,
): { line: ConveyorLine; unit: ConveyorUnit } | null {
  // 1차: semiCnvId 직접 매핑
  for (const line of lines) {
    const unit = line.units.find((u) => u.semiCnvId != null && u.semiCnvId === item.id)
    if (unit) return { line, unit }
  }

  // 2차: V3 lineId → 관제 라인 매핑 후 이름 매칭
  const mappedLine = findLineForSemiCnvLineId(lines, item.lineId)
  if (mappedLine) {
    const unit = mappedLine.units.find(
      (u) => u.semiCnvId == null && unitMatchesItem(u, item),
    )
    if (unit) return { line: mappedLine, unit }
  }

  // 3차: semiCnvLineId가 V3 lineId와 일치하는 라인에서만 이름 매칭
  for (const line of lines) {
    if (line.semiCnvLineId == null || line.semiCnvLineId !== item.lineId) continue
    const unit = line.units.find((u) => u.semiCnvId == null && unitMatchesItem(u, item))
    if (unit) return { line, unit }
  }

  return null
}

export function findLineForSemiCnvLineId(
  lines: ConveyorLine[],
  semiCnvLineId: number,
): ConveyorLine | null {
  // 명시적으로 semiCnvLineId 가 설정된 라인 우선
  const mapped = lines.find((line) => line.semiCnvLineId === semiCnvLineId)
  if (mapped) return mapped

  // 단일 라인이면 무조건 반환
  if (lines.length === 1) return lines[0]

  // semiCnvLineId 가 하나도 설정 안 된 경우 → V3 라인 인덱스 순서로 매핑
  const noneSet = lines.every((l) => l.semiCnvLineId == null)
  if (noneSet) return lines[semiCnvLineId] ?? null

  return null
}

export function findUnitBySemiCnvId(
  lines: ConveyorLine[],
  semiCnvId: number,
  semiCnvLineId?: number,
): { line: ConveyorLine; unit: ConveyorUnit } | null {
  // 1차: semiCnvId 직접 매핑 (lineId 필터 적용)
  for (const line of lines) {
    if (
      semiCnvLineId != null &&
      line.semiCnvLineId != null &&
      line.semiCnvLineId !== semiCnvLineId
    )
      continue
    const unit = line.units.find((u) => u.semiCnvId === semiCnvId)
    if (unit) return { line, unit }
  }

  // 2차: semiCnvId 직접 매핑 (lineId 필터 없이 전체)
  for (const line of lines) {
    const unit = line.units.find((u) => u.semiCnvId === semiCnvId)
    if (unit) return { line, unit }
  }

  // 3차: CONVEYOR_STATUS와 동일한 이름 기반 fallback (semiCnvId 미설정 유닛)
  const fakeItem = {
    id: semiCnvId,
    name: String(semiCnvId),
    lineId: semiCnvLineId ?? 0,
  } as SemiCnvConveyorStatusItem
  return findUnitForSemiCnvStatus(lines, fakeItem)
}
