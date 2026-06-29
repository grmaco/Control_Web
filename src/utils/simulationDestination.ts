import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { isFlowCapableUnit } from './flowEntries'
import { getOrthogonalNeighborUnits } from './units'
import {
  getPortProperties,
  getTransitLinkedUnitIds,
  isJunctionUnit,
  isTransitLinkedUnitCandidate,
  isTurnRoutingUnit,
  listJunctionBranchUnitIds,
  listTransitLinkedUnitCandidates,
  unitDisplayCode,
} from './unitPropertyHelpers'

function lineGridSize(line: { gridSize?: ConveyorLine['gridSize'] }) {
  return {
    cols: line.gridSize?.cols ?? 1,
    rows: line.gridSize?.rows ?? 1,
  }
}

function isConveyorLineTransitUnit(unit: ConveyorUnit): boolean {
  return (
    unit.type === 'straight' || unit.type === 'turn' || unit.type === 'junction'
  )
}

/** 분기·회전 유닛에 인접한 연동(피더) CV — 설정 시 선택값, 미설정 시 인접 CV 자동 */
export function listTransitLinkedFeederUnits(
  line: ConveyorLine,
  unit: ConveyorUnit,
): ConveyorUnit[] {
  if (!isTurnRoutingUnit(unit)) return []
  const unitMap = new Map(line.units.map((item) => [item.id, item]))
  const configured = getTransitLinkedUnitIds(line, unit)
  if (configured.length > 0) {
    return configured
      .map((id) => unitMap.get(id))
      .filter(
        (candidate): candidate is ConveyorUnit =>
          candidate != null && isTransitLinkedUnitCandidate(candidate),
      )
      .sort((a, b) =>
        unitDisplayCode(a).localeCompare(unitDisplayCode(b), undefined, {
          numeric: true,
        }),
      )
  }

  return listTransitLinkedUnitCandidates(line, unit)
}

/** 투입 목적지 후보 — 연동 CV가 있는 분기( junction ) 유닛만 */
export function isInboundJunctionDestination(
  line: ConveyorLine,
  unit: ConveyorUnit,
): boolean {
  if (!isJunctionUnit(unit)) return false
  if (getTransitLinkedUnitIds(line, unit).length > 0) return true
  return listTransitLinkedFeederUnits(line, unit).length > 0
}

/** 분기 유닛이 포트와 인접하거나 분기 팔에 IN 포트 연동 CV가 있는지 */
export function isJunctionPortConnected(
  line: ConveyorLine,
  junction: ConveyorUnit,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  if (!isJunctionUnit(junction)) return false
  const map = unitMap ?? new Map(line.units.map((unit) => [unit.id, unit]))
  const { cols, rows } = lineGridSize(line)

  for (const neighbor of getOrthogonalNeighborUnits(
    line.units,
    junction,
    cols,
    rows,
  )) {
    if (isPortUnit(neighbor)) return true
  }

  for (const neighborId of junction.connections) {
    const neighbor = map.get(neighborId)
    if (neighbor && isPortUnit(neighbor)) return true
  }

  const linkedUnitIds = getTransitLinkedUnitIds(line, junction)
  const branchUnitIds = new Set<string>()
  for (const linkedUnitId of linkedUnitIds) {
    branchUnitIds.add(linkedUnitId)
    for (const unitId of listJunctionBranchUnitIds(line, junction, linkedUnitId)) {
      branchUnitIds.add(unitId)
    }
  }

  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    const linkedId = getPortProperties(unit)?.linkedUnitId
    if (!linkedId) continue
    if (branchUnitIds.has(linkedId)) return true
    if (map.get(linkedId)?.connections.includes(junction.id)) return true
  }

  return false
}

export type InboundTraversalPlan = {
  /** 시뮬 이동 경로(포트·STK 포함) — 최원 분기 목적지까지 */
  pathUnitIds: string[]
  /** 미리보기 — 도달 가능한 모든 직선·분기·회전(거리순 탐색) */
  previewTransitUnitIds: string[]
  destinationUnitId: string
  destinationUnit: ConveyorUnit
}

function isInboundOutPort(unit: ConveyorUnit): boolean {
  return isPortUnit(unit) && (unit.portDirection ?? 'IN') === 'OUT'
}

function isInboundTraversalNeighbor(
  unit: ConveyorUnit,
  unitId: string,
  entryUnitId: string,
): boolean {
  if (unitId === entryUnitId) return true
  if (unit.flowRole === 'exit') return false
  // 투입 경로 — STK OUT 포트 및 출고측 라인 탐색 제외
  if (isInboundOutPort(unit)) return false
  if (isPortUnit(unit) || isStorageUnit(unit) || isFlowCapableUnit(unit)) {
    return true
  }
  return unit.type === 'lift'
}

/**
 * 분기·회전 유닛 — 연결 그래프 + 격자 직교(직선·수직) 이웃 모두 탐색.
 * 그 외 유닛 — connections 그대로 (측선 차단 없음).
 */
function listInboundExpansionNeighbors(
  line: ConveyorLine,
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  entryUnitId: string,
): string[] {
  const candidateIds = new Set<string>(unit.connections)

  if (isJunctionUnit(unit) || unit.type === 'turn') {
    const { cols, rows } = lineGridSize(line)
    for (const neighbor of getOrthogonalNeighborUnits(
      line.units,
      unit,
      cols,
      rows,
    )) {
      candidateIds.add(neighbor.id)
    }
  }

  return [...candidateIds].filter((neighborId) => {
    const neighbor = unitMap.get(neighborId)
    if (!neighbor) return false
    return isInboundTraversalNeighbor(neighbor, neighborId, entryUnitId)
  })
}

type DijkstraResult = {
  dist: Map<string, number>
  prev: Map<string, string | null>
}

/** 투입점 기준 연결 그래프 최단 거리(다익스트라, 간선 비용 1) */
function dijkstraFromEntry(
  line: ConveyorLine,
  entryUnitId: string,
  unitMap: Map<string, ConveyorUnit>,
): DijkstraResult {
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const settled = new Set<string>()

  for (const unit of line.units) {
    dist.set(unit.id, Number.POSITIVE_INFINITY)
    prev.set(unit.id, null)
  }
  dist.set(entryUnitId, 0)

  const queue = new Set<string>([entryUnitId])

  while (queue.size > 0) {
    let currentId: string | null = null
    let currentDist = Number.POSITIVE_INFINITY
    for (const candidateId of queue) {
      const candidateDist = dist.get(candidateId) ?? Number.POSITIVE_INFINITY
      if (candidateDist < currentDist) {
        currentDist = candidateDist
        currentId = candidateId
      }
    }
    if (currentId == null || currentDist === Number.POSITIVE_INFINITY) break

    queue.delete(currentId)
    if (settled.has(currentId)) continue
    settled.add(currentId)

    const current = unitMap.get(currentId)
    if (!current) continue

    for (const neighborId of listInboundExpansionNeighbors(
      line,
      current,
      unitMap,
      entryUnitId,
    )) {
      if (settled.has(neighborId)) continue
      const alt = currentDist + 1
      if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        dist.set(neighborId, alt)
        prev.set(neighborId, currentId)
        queue.add(neighborId)
      }
    }
  }

  return { dist, prev }
}

function reconstructPath(
  prev: Map<string, string | null>,
  targetId: string,
): string[] {
  const path: string[] = []
  let current: string | null = targetId
  while (current) {
    path.unshift(current)
    current = prev.get(current) ?? null
  }
  return path
}

function pickFarthestJunctionDestination(
  line: ConveyorLine,
  dist: Map<string, number>,
): ConveyorUnit | null {
  let best: ConveyorUnit | null = null
  let bestDist = -1

  for (const unit of line.units) {
    if (!isInboundJunctionDestination(line, unit)) continue
    const hops = dist.get(unit.id)
    if (hops == null || !Number.isFinite(hops)) continue
    if (hops > bestDist) {
      bestDist = hops
      best = unit
      continue
    }
    if (hops === bestDist && best) {
      const labelA = unitDisplayCode(unit)
      const labelB = unitDisplayCode(best)
      if (labelA.localeCompare(labelB, undefined, { numeric: true }) > 0) {
        best = unit
      }
    }
  }

  return best
}

/** 다익스트라 거리순 — 목적지까지 도달 가능한 직선·분기·회전(미리보기) */
function listExploredConveyorUnitIds(
  dist: Map<string, number>,
  unitMap: Map<string, ConveyorUnit>,
  destinationUnitId: string,
): string[] {
  const destHops = dist.get(destinationUnitId)
  const maxHops =
    destHops != null && Number.isFinite(destHops) ? destHops : Number.POSITIVE_INFINITY

  const items: Array<{ id: string; hops: number; label: string }> = []

  for (const [unitId, hops] of dist) {
    if (!Number.isFinite(hops) || hops > maxHops) continue
    const unit = unitMap.get(unitId)
    if (!unit || !isConveyorLineTransitUnit(unit)) continue
    items.push({ id: unitId, hops, label: unitDisplayCode(unit) })
  }

  items.sort(
    (a, b) =>
      a.hops - b.hops ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
  return items.map((item) => item.id)
}

/**
 * 1) 다익스트라 — 분기 직선·수직 탐색, IN 포트·STK 포함, OUT 포트 이후 제외
 * 2) 미리보기: 목적지까지 도달 가능한 직선·분기·회전을 거리순 점등
 * 3) 목적지: 도달 가능한 분기(junction) 유닛 중 가장 먼 곳
 */
export function planInboundPathFromFlowTraversal(
  line: ConveyorLine,
  entryUnitId: string,
): InboundTraversalPlan | null {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const entry = unitMap.get(entryUnitId)
  if (!entry) return null

  const { dist, prev } = dijkstraFromEntry(line, entryUnitId, unitMap)
  const destinationUnit = pickFarthestJunctionDestination(line, dist)
  if (!destinationUnit) return null

  const previewTransitUnitIds = listExploredConveyorUnitIds(
    dist,
    unitMap,
    destinationUnit.id,
  )
  if (previewTransitUnitIds.length === 0) return null

  const pathUnitIds = reconstructPath(prev, destinationUnit.id)
  if (pathUnitIds.length === 0 || pathUnitIds[0] !== entryUnitId) return null

  return {
    pathUnitIds,
    previewTransitUnitIds,
    destinationUnitId: destinationUnit.id,
    destinationUnit,
  }
}

export function inboundDestinationDisplayName(unit: ConveyorUnit): string {
  return unitDisplayCode(unit)
}

/** 경로 하이라이트용 — 컨베이어(직선·분기·회전)만 */
export function filterInboundConveyorHighlightPath(
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  return pathUnitIds.filter((unitId) => {
    const unit = unitMap.get(unitId)
    return unit != null && isConveyorLineTransitUnit(unit)
  })
}
