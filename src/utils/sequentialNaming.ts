import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'

export function formatConveyorName(index: number): string {
  return `CV-${String(index).padStart(2, '0')}`
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
  if (!unitMap.has(baseUnitId)) {
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

  const now = new Date().toISOString()
  const nameById = new Map(
    orderedUnitIds.map((id, index) => [id, formatConveyorName(index + 1)]),
  )

  const units = line.units.map((unit) => ({
    ...unit,
    name: nameById.get(unit.id) ?? unit.name,
    updatedAt: now,
  }))

  return {
    line: { ...line, units, updatedAt: now },
    orderedUnitIds,
    disconnectedUnitIds,
  }
}
