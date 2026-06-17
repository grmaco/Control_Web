import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'

export function formatConveyorName(index: number): string {
  return `CV-${String(index).padStart(2, '0')}`
}

export interface ParsedUnitName {
  prefix: string
  number: number
  padWidth: number
}

/** 이름 끝의 숫자를 접두어·순번으로 분리 (예: "CV-05" → prefix "CV-", number 5) */
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

function isConveyorForNaming(unit: ConveyorUnit): boolean {
  return unit.type !== 'port' && unit.type !== 'storage'
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
    if (!isConveyorForNaming(unit)) continue
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

  return { prefix: 'CV-', number: 1, padWidth: 2 }
}

function sortNeighborsForFlow(
  neighbors: ConveyorUnit[],
  from: ConveyorUnit,
): ConveyorUnit[] {
  return [...neighbors].sort((a, b) => {
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

export interface SequentialNamingResult {
  line: ConveyorLine
  orderedUnitIds: string[]
  disconnectedUnitIds: string[]
}

export function assignSequentialNamesFromBase(
  line: ConveyorLine,
  baseUnitId: string,
): SequentialNamingResult {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const baseUnit = unitMap.get(baseUnitId)
  if (!baseUnit) {
    throw new Error('기준 컨베이어를 찾을 수 없습니다.')
  }

  const visited = new Set<string>()
  const orderedUnitIds: string[] = []
  const queue = [baseUnitId]
  visited.add(baseUnitId)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    orderedUnitIds.push(currentId)

    const current = unitMap.get(currentId)!
    const neighbors = sortNeighborsForFlow(
      current.connections
        .map((id) => unitMap.get(id))
        .filter((unit): unit is ConveyorUnit => Boolean(unit)),
      current,
    )

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue
      visited.add(neighbor.id)
      queue.push(neighbor.id)
    }
  }

  const disconnectedUnitIds = line.units
    .filter((unit) => !visited.has(unit.id))
    .sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
    .map((unit) => unit.id)

  orderedUnitIds.push(...disconnectedUnitIds)

  const template = resolveNamingTemplate(baseUnit, line.units)
  let nextNumber = template.number
  const nameById = new Map<string, string>()

  for (const id of orderedUnitIds) {
    const unit = unitMap.get(id)!
    if (!isConveyorForNaming(unit)) continue
    nameById.set(id, formatSequentialName(template, nextNumber))
    nextNumber += 1
  }

  const now = new Date().toISOString()
  const units = line.units.map((unit) => ({
    ...unit,
    name: isConveyorForNaming(unit)
      ? (nameById.get(unit.id) ?? unit.name)
      : unit.name,
    updatedAt: now,
  }))

  return {
    line: { ...line, units, updatedAt: now },
    orderedUnitIds,
    disconnectedUnitIds,
  }
}
