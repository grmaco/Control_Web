import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { PathSimulationLoad } from '../types/unitProperties'
import {
  computeJunctionCrossRequestFlow,
  computeJunctionThroughFlow,
  flowEntryDir,
  flowExitDir,
  type FlowDir,
} from './flowDirection'
import {
  findFeederAdjacentToJunction,
  getJunctionRequestUnitIds,
  getJunctionRoutingProperties,
  listJunctionBranchUnitIds,
} from './unitPropertyHelpers'

function loadPosition(load: PathSimulationLoad): string | null {
  if (load.pathUnitIds.length === 0) return null
  return load.pathUnitIds[load.stepIndex] ?? null
}

function activeLoads(loads: PathSimulationLoad[]): PathSimulationLoad[] {
  return loads.filter((load) => load.released && !load.complete && load.pathUnitIds.length > 0)
}

/** 경로가 분기에서 요청 CV1 → 요청 CV2 교차 구간을 포함하는지 */
export function isJunctionCrossPath(
  line: ConveyorLine,
  junction: ConveyorUnit,
  pathUnitIds: string[],
): boolean {
  const props = getJunctionRoutingProperties(junction, line)
  const [req1, req2] = getJunctionRequestUnitIds(
    props ?? { requestUnitIds: [], requestUnitId: '' },
  )
  if (!req1 || !req2) return false

  const junctionIndex = pathUnitIds.indexOf(junction.id)
  if (junctionIndex <= 0 || junctionIndex >= pathUnitIds.length - 1) return false

  const req1Branch = new Set(listJunctionBranchUnitIds(line, junction, req1))
  const req2Branch = new Set(listJunctionBranchUnitIds(line, junction, req2))
  const before = pathUnitIds[junctionIndex - 1]!
  const after = pathUnitIds[junctionIndex + 1]!
  return req1Branch.has(before) && req2Branch.has(after)
}

/** 분기 직진(through) 경로 구간인지 */
export function isJunctionThroughPathStep(
  junction: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
  fromUnitId: string | null | undefined,
  toUnitId: string | null | undefined,
): boolean {
  if (!fromUnitId || !toUnitId) return false
  const fromUnit = unitMap.get(fromUnitId)
  const toUnit = unitMap.get(toUnitId)
  if (!fromUnit || !toUnit) return false

  const through = computeJunctionThroughFlow(junction, unitMap, line)
  if (!through.inDir || !through.outDir) return false

  const inDir = flowEntryDir(fromUnit, junction)
  const outDir = flowExitDir(junction, toUnit)
  return inDir === through.inDir && outDir === through.outDir
}

/** 양쪽 분기 요청 CV에서 교차 수요가 동시에 있는지 */
export function isJunctionCrossRequestActive(
  line: ConveyorLine,
  junction: ConveyorUnit,
  loads: PathSimulationLoad[],
): boolean {
  const props = getJunctionRoutingProperties(junction, line)
  const [req1, req2] = getJunctionRequestUnitIds(
    props ?? { requestUnitIds: [], requestUnitId: '' },
  )
  if (!req1 || !req2) return false

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const req1Branch = new Set(listJunctionBranchUnitIds(line, junction, req1))
  const req2Branch = new Set(listJunctionBranchUnitIds(line, junction, req2))
  const running = activeLoads(loads)

  const supplyFromReq1 = running.some(
    (load) =>
      isJunctionCrossPath(line, junction, load.pathUnitIds) &&
      req1Branch.has(loadPosition(load) ?? ''),
  )

  const demandOnReq2 =
    running.some(
      (load) =>
        isJunctionCrossPath(line, junction, load.pathUnitIds) &&
        req2Branch.has(loadPosition(load) ?? ''),
    ) ||
    (supplyFromReq1 && isReq2BranchReadyForCross(junction, req2, line, running, unitMap))

  return supplyFromReq1 && demandOnReq2
}

function isReq2BranchReadyForCross(
  junction: ConveyorUnit,
  req2: string,
  line: ConveyorLine,
  loads: PathSimulationLoad[],
  unitMap: Map<string, ConveyorUnit>,
): boolean {
  const feeder = findFeederAdjacentToJunction(junction, req2, unitMap)
  if (!feeder) return false
  return !loads.some((load) => loadPosition(load) === feeder.id)
}

/** 분기에 직진 물류가 대기·통과 중인지 — 교차보다 우선 */
export function junctionHasThroughTraffic(
  junction: ConveyorUnit,
  loads: PathSimulationLoad[],
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): boolean {
  return activeLoads(loads).some((load) => {
    const step = load.stepIndex
    const current = load.pathUnitIds[step]
    const prev = step > 0 ? load.pathUnitIds[step - 1] : null
    const next = load.pathUnitIds[step + 1]

    if (current === junction.id) {
      return isJunctionThroughPathStep(junction, unitMap, line, prev, next)
    }

    if (next === junction.id && current) {
      const after = load.pathUnitIds[step + 2]
      return isJunctionThroughPathStep(junction, unitMap, line, current, after)
    }

    return false
  })
}

/** 교차 이동이 직진 우선·양쪽 요청 조건을 만족하는지 */
export function canApproveJunctionCrossMove(
  line: ConveyorLine,
  junction: ConveyorUnit,
  loads: PathSimulationLoad[],
  unitMap: Map<string, ConveyorUnit>,
): boolean {
  if (!isJunctionCrossRequestActive(line, junction, loads)) return false
  if (junctionHasThroughTraffic(junction, loads, unitMap, line)) return false
  return true
}

export function resolveJunctionCrossFlowForPath(
  line: ConveyorLine,
  junction: ConveyorUnit,
  pathUnitIds: string[],
  junctionIndex: number,
): { inDir: FlowDir; outDir: FlowDir } | null {
  const props = getJunctionRoutingProperties(junction, line)
  const [req1, req2] = getJunctionRequestUnitIds(
    props ?? { requestUnitIds: [], requestUnitId: '' },
  )
  if (!req1 || !req2) return null

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const before = pathUnitIds[junctionIndex - 1]
  const after = pathUnitIds[junctionIndex + 1]
  if (!before || !after) return null

  const req1Branch = new Set(listJunctionBranchUnitIds(line, junction, req1))
  const req2Branch = new Set(listJunctionBranchUnitIds(line, junction, req2))
  if (!req1Branch.has(before) || !req2Branch.has(after)) return null

  const cross = computeJunctionCrossRequestFlow(junction, unitMap, line, req1, req2)
  if (!cross?.inDir || !cross.outDir) return null
  return { inDir: cross.inDir, outDir: cross.outDir }
}
