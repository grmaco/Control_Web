import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { isPortUnit } from '../constants/conveyorTypes'
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
import {
  astarTransportPath,
  buildInboundTransportGraph,
  dijkstraOnTransportGraph,
  type TransportGraph,
} from './transportGraph'

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
  /** 시뮬 이동 경로(컨베이어만) — 최원 분기 목적지까지 */
  pathUnitIds: string[]
  /** 미리보기 — 도달 가능한 모든 직선·분기·회전(거리순 탐색) */
  previewTransitUnitIds: string[]
  destinationUnitId: string
  destinationUnit: ConveyorUnit
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

/** 그래프 거리순 — 목적지까지 도달 가능한 직선·분기·회전(미리보기) */
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
 * 1) Node/Edge 반송 그래프 — 오류 엣지 제외 다익스트라로 도달 범위 산출
 * 2) A* — 최원 분기 목적지까지 경로
 * 3) 미리보기: 목적지까지 도달 가능한 직선·분기·회전을 거리순 점등
 */
export function planInboundPathFromFlowTraversal(
  line: ConveyorLine,
  entryUnitId: string,
): InboundTraversalPlan | null {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const entry = unitMap.get(entryUnitId)
  if (!entry) return null

  const graph = buildInboundTransportGraph(line, entryUnitId, unitMap)
  if (!graph) return null

  const { dist } = dijkstraOnTransportGraph(graph, entryUnitId)
  const destinationUnit = pickFarthestJunctionDestination(line, dist)
  if (!destinationUnit) return null

  const astar = astarTransportPath(
    graph,
    entryUnitId,
    destinationUnit.id,
    unitMap,
  )
  if (!astar || astar.pathUnitIds.length === 0) return null
  if (astar.pathUnitIds[0] !== entryUnitId) return null

  const previewTransitUnitIds = listExploredConveyorUnitIds(
    dist,
    unitMap,
    destinationUnit.id,
  )
  if (previewTransitUnitIds.length === 0) return null

  return {
    pathUnitIds: astar.pathUnitIds,
    previewTransitUnitIds,
    destinationUnitId: destinationUnit.id,
    destinationUnit,
  }
}

/** 투입 반송 그래프 빌드 — 런타임 재탐색용 export */
export function buildInboundTraversalGraph(
  line: ConveyorLine,
  entryUnitId: string,
  unitMap?: Map<string, ConveyorUnit>,
): TransportGraph | null {
  return buildInboundTransportGraph(line, entryUnitId, unitMap)
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
