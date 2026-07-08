import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { parseTrailingNumber } from './sequentialNaming'
import { getPortProperties, resolvePortAdjacentStk } from './unitPropertyHelpers'
import { getExitUnits } from './flowEntries'

export interface OutboundLink {
  prev: ConveyorUnit | null
  next: ConveyorUnit | null
}

function cvNumber(unit: ConveyorUnit): number | null {
  return parseTrailingNumber(unit.name)?.number ?? null
}

function getNeighbors(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  return unit.connections
    .map((id) => unitMap.get(id))
    .filter((neighbor): neighbor is ConveyorUnit => neighbor != null)
}

function resolvePortAdjacentStkUnit(
  port: ConveyorUnit,
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit | null {
  return resolvePortAdjacentStk(line, port) ?? getNeighbors(port, unitMap).find(isStorageUnit) ?? null
}

function connectedOutboundConveyors(
  port: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  return getNeighbors(port, unitMap).filter(
    (neighbor) => !isStorageUnit(neighbor) && !isPortUnit(neighbor),
  )
}

/**
 * 출고 목적지 자동 유도 — 출고구(목적지 CV) 속성은 제거됨.
 * 포트에서 컨베이어망(STK·타 포트 제외)으로 도달 가능한
 * 흐름 종료점(flowRole==='exit') 중 가장 가까운 유닛을 목적지로 사용한다.
 */
function resolveOutputDestination(
  port: ConveyorUnit,
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit | null {
  const exits = getExitUnits(line)
  if (exits.length === 0) return null

  const blocked = new Set(
    line.units
      .filter((u) => (isStorageUnit(u) || isPortUnit(u)) && u.id !== port.id)
      .map((u) => u.id),
  )

  let best: ConveyorUnit | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const exit of exits) {
    const dist = bfsDistance(port.id, exit.id, unitMap, blocked)
    if (dist < bestDist) {
      bestDist = dist
      best = exit
    }
  }
  return Number.isFinite(bestDist) ? best : null
}

function bfsDistance(
  fromId: string,
  toId: string,
  unitMap: Map<string, ConveyorUnit>,
  blocked: Set<string>,
): number {
  if (fromId === toId) return 0
  const queue: { id: string; dist: number }[] = [{ id: fromId, dist: 0 }]
  const visited = new Set<string>([fromId])

  while (queue.length > 0) {
    const current = queue.shift()!
    const unit = unitMap.get(current.id)
    if (!unit) continue

    for (const neighborId of unit.connections) {
      if (visited.has(neighborId) || blocked.has(neighborId)) continue
      if (neighborId === toId) return current.dist + 1
      visited.add(neighborId)
      queue.push({ id: neighborId, dist: current.dist + 1 })
    }
  }

  return Number.POSITIVE_INFINITY
}

function pickFirstOutboundConveyor(
  port: ConveyorUnit,
  dest: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  transitPassable?: (unit: ConveyorUnit) => boolean,
): ConveyorUnit | null {
  const props = getPortProperties(port)
  if (props?.linkedUnitId) {
    const linked = unitMap.get(props.linkedUnitId)
    if (
      linked &&
      !isStorageUnit(linked) &&
      !isPortUnit(linked) &&
      (!transitPassable || transitPassable(linked))
    ) {
      return linked
    }
  }

  let conveyors = connectedOutboundConveyors(port, unitMap)
  if (transitPassable) {
    conveyors = conveyors.filter(transitPassable)
  }
  if (conveyors.length === 0) return null
  if (conveyors.length === 1) return conveyors[0]

  const blocked = new Set<string>([port.id])
  return [...conveyors].sort(
    (a, b) =>
      scoreOutboundCandidate(port, b, dest, unitMap, blocked) -
      scoreOutboundCandidate(port, a, dest, unitMap, blocked),
  )[0] ?? null
}

/** STK 출고 분기 — CV20→CV31, CV21→CV33, CV23→CV37, 이후 CV36~CV28 */
function scoreOutboundCandidate(
  current: ConveyorUnit,
  candidate: ConveyorUnit,
  dest: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  blocked: Set<string>,
): number {
  const cvCurrent = cvNumber(current)
  const cvNext = cvNumber(candidate)
  const cvDest = cvNumber(dest) ?? 28
  let score = 0

  if (cvCurrent != null && cvNext != null) {
    if (cvCurrent > cvDest) {
      if (cvNext === cvCurrent - 1) score += 200
      else if (cvNext < cvCurrent && cvNext >= cvDest) score += 120 - (cvCurrent - cvNext)
      else if (cvNext > cvCurrent) score -= 80
    } else if (cvCurrent <= 23) {
      score += cvNext
    }
  }

  const dist = bfsDistance(candidate.id, dest.id, unitMap, blocked)
  if (Number.isFinite(dist)) score += Math.max(0, 40 - dist)

  return score
}

export type OutboundPathFinder = (
  fromId: string,
  toId: string,
  unitMap: Map<string, ConveyorUnit>,
) => string[] | null

export function listOutboundPorts(line: ConveyorLine): ConveyorUnit[] {
  return line.units
    .filter((unit) => isPortUnit(unit) && (unit.portDirection ?? 'IN') === 'OUT')
    .sort((a, b) => a.name.localeCompare(b.name))
}

function traceOutboundPath(
  start: ConveyorUnit,
  dest: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  const path: ConveyorUnit[] = [start]
  const visited = new Set<string>([start.id])
  let current = start

  while (current.id !== dest.id && path.length < 64) {
    const blocked = new Set<string>(visited)
    const neighbors = getNeighbors(current, unitMap).filter(
      (neighbor) =>
        !visited.has(neighbor.id) &&
        !isStorageUnit(neighbor) &&
        !isPortUnit(neighbor),
    )

    if (neighbors.length === 0) break

    const next = [...neighbors].sort(
      (a, b) =>
        scoreOutboundCandidate(current, b, dest, unitMap, blocked) -
        scoreOutboundCandidate(current, a, dest, unitMap, blocked),
    )[0]

    if (!next) break
    path.push(next)
    visited.add(next.id)
    current = next
  }

  return path
}

export function computeOutboundLinks(line: ConveyorLine): Map<string, OutboundLink> {
  const links = new Map<string, OutboundLink>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  for (const port of line.units) {
    if (!isPortUnit(port) || (port.portDirection ?? 'IN') !== 'OUT') continue

    const dest = resolveOutputDestination(port, line, unitMap)
    if (!dest) continue

    const first = pickFirstOutboundConveyor(port, dest, unitMap)
    if (!first) continue

    const path = traceOutboundPath(first, dest, unitMap)
    links.set(port.id, {
      prev: resolvePortAdjacentStkUnit(port, line, unitMap),
      next: first,
    })

    for (let i = 0; i < path.length; i += 1) {
      const unit = path[i]
      const prev = i === 0 ? port : path[i - 1]
      const next = i < path.length - 1 ? path[i + 1] : null
      links.set(unit.id, { prev, next })
    }
  }

  return links
}

/** OUT 포트별 출고 경로 라벨 (속성 패널·디버그용) */
export function describeOutboundPaths(
  line: ConveyorLine,
): { portId: string; portName: string; labels: string[] }[] {
  const links = computeOutboundLinks(line)

  return line.units
    .filter((unit) => isPortUnit(unit) && (unit.portDirection ?? 'IN') === 'OUT')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((port) => {
      const labels: string[] = [port.name]
      let current = links.get(port.id)?.next ?? null
      const visited = new Set<string>([port.id])

      while (current && !visited.has(current.id) && labels.length < 32) {
        labels.push(current.name)
        visited.add(current.id)
        current = links.get(current.id)?.next ?? null
      }

      return { portId: port.id, portName: port.name, labels }
    })
}

export function outboundPathLabelForPort(
  line: ConveyorLine,
  portId: string,
): string | null {
  const item = describeOutboundPaths(line).find((entry) => entry.portId === portId)
  return item ? item.labels.join(' → ') : null
}

/** OUT 포트 → 연결 컨베이어 → 출고구 경로 (시뮬레이션용, findPath로 비가동 우회) */
export function buildOutboundSimulationPath(
  line: ConveyorLine,
  portId: string,
  findPath: OutboundPathFinder,
  transitPassable: (unit: ConveyorUnit) => boolean,
): {
  pathUnitIds: string[]
  stkId: string | null
  exitId: string | null
  message: string
} {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const port = unitMap.get(portId)
  if (!port || !isPortUnit(port) || (port.portDirection ?? 'IN') !== 'OUT') {
    return {
      pathUnitIds: [],
      stkId: null,
      exitId: null,
      message: 'OUT 포트를 찾을 수 없습니다.',
    }
  }

  const props = getPortProperties(port)
  if (props?.enabled === false) {
    return {
      pathUnitIds: [],
      stkId: null,
      exitId: null,
      message: `${port.name} 비활성`,
    }
  }

  if (transitPassable && !transitPassable(port)) {
    return {
      pathUnitIds: [],
      stkId: null,
      exitId: null,
      message: `${port.name} 비가동 — STK 출고 불가`,
    }
  }

  const dest = resolveOutputDestination(port, line, unitMap)
  if (!dest) {
    return {
      pathUnitIds: [],
      stkId: null,
      exitId: null,
      message: `${port.name} — 도달 가능한 종료점(flowRole=exit) 없음`,
    }
  }

  const stk = resolvePortAdjacentStkUnit(port, line, unitMap)
  const first = pickFirstOutboundConveyor(port, dest, unitMap, transitPassable)
  if (!first) {
    return {
      pathUnitIds: [],
      stkId: stk?.id ?? null,
      exitId: dest.id,
      message: `${port.name} — 가동 중인 연결 컨베이어 없음`,
    }
  }

  const tail = findPath(first.id, dest.id, unitMap)
  if (!tail || tail.length === 0) {
    return {
      pathUnitIds: [],
      stkId: stk?.id ?? null,
      exitId: dest.id,
      message: `${port.name} → ${dest.name} 가동 경로 없음`,
    }
  }

  const pathUnitIds: string[] = []
  if (stk) pathUnitIds.push(stk.id)
  if (!pathUnitIds.includes(port.id)) pathUnitIds.push(port.id)
  for (const unitId of tail) {
    if (!pathUnitIds.includes(unitId)) pathUnitIds.push(unitId)
  }

  const prefix = stk ? `${stk.name} → ${port.name}` : port.name
  return {
    pathUnitIds,
    stkId: stk?.id ?? null,
    exitId: dest.id,
    message: `${prefix} → … → ${dest.name} (${pathUnitIds.length}구간)`,
  }
}
