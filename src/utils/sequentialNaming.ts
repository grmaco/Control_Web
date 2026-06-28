import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { getEntryUnits } from './flowEntries'

export const DEFAULT_CV_NAME_PREFIX = 'CV'
export const DEFAULT_CV_PAD_WIDTH = 2

export function formatConveyorName(index: number): string {
  return `${DEFAULT_CV_NAME_PREFIX}${String(index).padStart(DEFAULT_CV_PAD_WIDTH, '0')}`
}

export interface ParsedUnitName {
  prefix: string
  number: number
  padWidth: number
}

/** 이름 끝의 숫자를 접두어·순번으로 분리 (예: "CV05" → prefix "CV", number 5) */
export function parseTrailingNumber(name: string): ParsedUnitName | null {
  const match = /^(.*?)(\d+)$/.exec(name.trim())
  if (!match) return null

  const [, prefix, digits] = match
  return {
    prefix,
    number: Number(digits),
    padWidth: digits.length,
  }
}

export function formatSequentialName(
  template: Pick<ParsedUnitName, 'prefix' | 'padWidth'>,
  number: number,
): string {
  return `${template.prefix}${String(number).padStart(template.padWidth, '0')}`
}

/** 배치 완료 CV 순번 — 포트·적재창고 제외, 회전/분기/리프트 포함 */
function receivesCvSequentialName(unit: ConveyorUnit): boolean {
  return unit.type !== 'port' && unit.type !== 'storage'
}

/** prev → from 진입 방향의 반대(되돌아가기)인 이웃 */
function isBacktrack(
  prev: ConveyorUnit,
  from: ConveyorUnit,
  next: ConveyorUnit,
): boolean {
  const inDx = from.gridX - prev.gridX
  const inDy = from.gridY - prev.gridY
  const outDx = next.gridX - from.gridX
  const outDy = next.gridY - from.gridY

  if (inDx !== 0 && outDx !== 0 && inDy === 0 && outDy === 0) {
    return Math.sign(inDx) !== Math.sign(outDx)
  }
  if (inDy !== 0 && outDy !== 0 && inDx === 0 && outDx === 0) {
    return Math.sign(inDy) !== Math.sign(outDy)
  }
  return false
}

/** 메인 라인 우선 — 직진 > 회전/분기 > 가지 */
function flowWalkPriority(
  prev: ConveyorUnit | null,
  from: ConveyorUnit,
  next: ConveyorUnit,
): number {
  if (prev && isBacktrack(prev, from, next)) return 3
  if (!prev) return 0

  const inDx = from.gridX - prev.gridX
  const inDy = from.gridY - prev.gridY
  const outDx = next.gridX - from.gridX
  const outDy = next.gridY - from.gridY
  const collinear =
    (inDx !== 0 && outDx !== 0 && Math.sign(inDx) === Math.sign(outDx)) ||
    (inDy !== 0 && outDy !== 0 && Math.sign(inDy) === Math.sign(outDy))

  if (collinear) return 0
  if (next.type === 'turn' || next.type === 'junction') return 1
  return 2
}

/** 기준 유닛·기존 이름에서 순번 시작값과 접두어를 결정 */
export function resolveNamingTemplate(
  baseUnit: ConveyorUnit,
  units: ConveyorUnit[],
): ParsedUnitName {
  const fromBase = parseTrailingNumber(baseUnit.name)
  if (fromBase) return fromBase

  let best: ParsedUnitName | null = null
  for (const unit of units) {
    if (!receivesCvSequentialName(unit)) continue
    const parsed = parseTrailingNumber(unit.name)
    if (!parsed) continue
    if (!best || parsed.number > best.number) {
      best = parsed
    }
  }

  if (best) {
    return {
      prefix: best.prefix,
      number: best.number + 1,
      padWidth: best.padWidth,
    }
  }

  return {
    prefix: DEFAULT_CV_NAME_PREFIX,
    number: 1,
    padWidth: DEFAULT_CV_PAD_WIDTH,
  }
}

function sortNeighborsForFlow(
  neighbors: ConveyorUnit[],
  from: ConveyorUnit,
  prev: ConveyorUnit | null = null,
): ConveyorUnit[] {
  return [...neighbors].sort((a, b) => {
    const priA = flowWalkPriority(prev, from, a)
    const priB = flowWalkPriority(prev, from, b)
    if (priA !== priB) return priA - priB

    if (prev) {
      const backA = isBacktrack(prev, from, a)
      const backB = isBacktrack(prev, from, b)
      if (backA !== backB) return backA ? 1 : -1
    }

    const dxA = a.gridX - from.gridX
    const dyA = a.gridY - from.gridY
    const dxB = b.gridX - from.gridX
    const dyB = b.gridY - from.gridY

    const isHorizontalA = dyA === 0 && dxA !== 0
    const isHorizontalB = dyB === 0 && dxB !== 0
    const isVerticalA = dxA === 0 && dyA !== 0
    const isVerticalB = dxB === 0 && dyB !== 0

    if (isHorizontalA && !isHorizontalB) return -1
    if (!isHorizontalA && isHorizontalB) return 1
    if (isVerticalA && !isVerticalB) return -1
    if (!isVerticalA && isVerticalB) return 1

    return a.gridY - b.gridY || a.gridX - b.gridX
  })
}

export interface FlowOrderResult {
  orderedUnitIds: string[]
  disconnectedUnitIds: string[]
}

/** baseUnitId 기준 물류 순서 — 되돌아가기·가지 우선순위로 메인 라인 따라감 */
export function computeFlowOrder(
  line: ConveyorLine,
  baseUnitId?: string | null,
): FlowOrderResult {
  if (!baseUnitId) {
    return { orderedUnitIds: [], disconnectedUnitIds: [] }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  if (!unitMap.has(baseUnitId)) {
    return { orderedUnitIds: [], disconnectedUnitIds: [] }
  }

  const visited = new Set<string>()
  const orderedUnitIds: string[] = []

  const traverse = (currentId: string, prevId: string | null) => {
    if (visited.has(currentId)) return
    visited.add(currentId)
    orderedUnitIds.push(currentId)

    const current = unitMap.get(currentId)!
    const prev = prevId ? (unitMap.get(prevId) ?? null) : null
    const neighbors = sortNeighborsForFlow(
      current.connections
        .map((id) => unitMap.get(id))
        .filter((unit): unit is ConveyorUnit => Boolean(unit && !visited.has(unit.id))),
      current,
      prev,
    )

    for (const neighbor of neighbors) {
      traverse(neighbor.id, currentId)
    }
  }

  traverse(baseUnitId, null)

  const disconnectedUnitIds = line.units
    .filter((unit) => !visited.has(unit.id))
    .sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
    .map((unit) => unit.id)

  return {
    orderedUnitIds: [...orderedUnitIds, ...disconnectedUnitIds],
    disconnectedUnitIds,
  }
}

export interface SequentialNamingResult {
  line: ConveyorLine
  orderedUnitIds: string[]
  disconnectedUnitIds: string[]
}

export function assignSequentialNamesFromEntries(
  line: ConveyorLine,
): SequentialNamingResult {
  const entries = getEntryUnits(line)
  if (entries.length === 0) {
    throw new Error('시작점(투입) 컨베이어를 1개 이상 지정하세요.')
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const nameById = new Map<string, string>()
  const allOrdered: string[] = []
  const disconnectedSet = new Set<string>()

  for (const entry of entries) {
    const { orderedUnitIds, disconnectedUnitIds } = computeFlowOrder(line, entry.id)
    const template = resolveNamingTemplate(entry, line.units)
    let nextNumber = template.number

    for (const id of orderedUnitIds) {
      if (!allOrdered.includes(id)) allOrdered.push(id)

      const unit = unitMap.get(id)!
      if (!receivesCvSequentialName(unit)) continue
      if (nameById.has(id)) continue
      // V3 ID가 수동 지정된 유닛은 자동 순번 대상에서 제외
      if (unit.semiCnvId != null) continue

      nameById.set(id, formatSequentialName(template, nextNumber))
      nextNumber += 1
    }

    for (const id of disconnectedUnitIds) {
      disconnectedSet.add(id)
    }
  }

  for (const unit of line.units) {
    if (!allOrdered.includes(unit.id) && receivesCvSequentialName(unit)) {
      disconnectedSet.add(unit.id)
    }
  }

  const disconnectedUnitIds = [...disconnectedSet]

  const now = new Date().toISOString()
  const units = line.units.map((unit) => {
    const sequentialName = receivesCvSequentialName(unit)
      ? nameById.get(unit.id)
      : undefined
    if (!sequentialName) {
      return { ...unit, updatedAt: now }
    }
    return {
      ...unit,
      name: sequentialName,
      code: sequentialName,
      updatedAt: now,
    }
  })

  return {
    line: { ...line, units, updatedAt: now, baseUnitId: null },
    orderedUnitIds: allOrdered,
    disconnectedUnitIds,
  }
}

/** @deprecated assignSequentialNamesFromEntries 사용 */
export function assignSequentialNamesFromBase(
  line: ConveyorLine,
  baseUnitId: string,
): SequentialNamingResult {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const baseUnit = unitMap.get(baseUnitId)
  if (!baseUnit) {
    throw new Error('기준 컨베이어를 찾을 수 없습니다.')
  }

  const withEntry: ConveyorLine = {
    ...line,
    units: line.units.map((unit) => {
      if (unit.id === baseUnitId) {
        return { ...unit, flowRole: 'entry' as const, role: 'INPUT' as const }
      }
      if (unit.flowRole === 'entry' && unit.id !== baseUnitId) {
        return {
          ...unit,
          flowRole: null,
          role: unit.role === 'INPUT' ? ('TRANSFER' as const) : unit.role,
        }
      }
      return unit
    }),
    baseUnitId: null,
  }

  return assignSequentialNamesFromEntries(withEntry)
}
