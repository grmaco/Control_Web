import type { ConveyorUnit, Rotation } from '../types/conveyor'
import type { FlowDir } from './flowDirection'

const R = 28

const EDGE: Record<FlowDir, { x: number; y: number }> = {
  N: { x: 50, y: 14 },
  E: { x: 86, y: 50 },
  S: { x: 50, y: 86 },
  W: { x: 14, y: 50 },
}

/** 회전 유닛 기본 개구부 — 0°=좌·하, 90°=상·좌, 180°=우·상, 270°=하·우 (빌더 회전 라벨 기준) */
const TURN_OPENINGS: Record<Rotation, readonly [FlowDir, FlowDir]> = {
  0: ['W', 'S'],
  90: ['N', 'W'],
  180: ['E', 'N'],
  270: ['S', 'E'],
}

export function getTurnOpenings(rotation: Rotation): readonly [FlowDir, FlowDir] {
  return TURN_OPENINGS[rotation]
}

/** 유닛의 사용자 정의 개구부가 있으면 반환, 없으면 기본 2방향 */
export function getEffectiveTurnOpenings(unit: ConveyorUnit): readonly FlowDir[] {
  const custom = (unit.turnOpeningsConfig as Partial<Record<Rotation, FlowDir[]>> | undefined)?.[unit.rotation]
  if (custom != null && custom.length > 0) return custom
  return TURN_OPENINGS[unit.rotation]
}

/** 시계방향 나침반 각도 — N=0°, E=90°, S=180°, W=270° */
export const FLOW_DIR_COMPASS_CW: Record<FlowDir, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
}

/** 입고(in) 방향을 0°로 한 시계방향 출고 각도 */
export function turnRelativeAngleDegrees(inDir: FlowDir, outDir: FlowDir): number {
  return (FLOW_DIR_COMPASS_CW[outDir] - FLOW_DIR_COMPASS_CW[inDir] + 360) % 360
}

export function formatTurnFlowAngleLabel(
  inDir: FlowDir | null | undefined,
  outDir: FlowDir | null | undefined,
): string | null {
  if (!inDir || !outDir) return null
  return `${turnRelativeAngleDegrees(inDir, outDir)}°`
}

/** 짧은 1/4 호 (스크린 좌표, y↓) */
const TURN_SWEEP: Record<string, 0 | 1> = {
  'S-E': 1,
  'E-S': 0,
  'S-W': 0,
  'W-S': 1,
  'N-E': 0,
  'E-N': 1,
  'N-W': 1,
  'W-N': 0,
}

function turnKey(inDir: FlowDir, outDir: FlowDir): string {
  return `${inDir}-${outDir}`
}

export function isValidTurnArc(inDir: FlowDir, outDir: FlowDir): boolean {
  return TURN_SWEEP[turnKey(inDir, outDir)] != null
}

/** 180° 직통 — 개구부가 마주보는 경우 */
const TURN_THROUGH: Record<string, string> = {
  'W-E': `M ${EDGE.W.x},${EDGE.W.y} L ${EDGE.E.x},${EDGE.E.y}`,
  'E-W': `M ${EDGE.E.x},${EDGE.E.y} L ${EDGE.W.x},${EDGE.W.y}`,
  'N-S': `M ${EDGE.N.x},${EDGE.N.y} L ${EDGE.S.x},${EDGE.S.y}`,
  'S-N': `M ${EDGE.S.x},${EDGE.S.y} L ${EDGE.N.x},${EDGE.N.y}`,
}

/** 180° 직통 + 화살촉 (네온이 몸통·촉 전체에 적용되도록 한 path) */
const TURN_THROUGH_WITH_HEAD: Record<string, string> = {
  'W-E': `M ${EDGE.W.x},${EDGE.W.y} L 75,50 M 75,44 L ${EDGE.E.x},${EDGE.E.y} L 75,56`,
  'E-W': `M ${EDGE.E.x},${EDGE.E.y} L 25,50 M 25,44 L ${EDGE.W.x},${EDGE.W.y} L 25,56`,
  'N-S': `M ${EDGE.N.x},${EDGE.N.y} L 50,75 M 44,75 L ${EDGE.S.x},${EDGE.S.y} L 56,75`,
  'S-N': `M ${EDGE.S.x},${EDGE.S.y} L 50,25 M 44,25 L ${EDGE.N.x},${EDGE.N.y} L 56,25`,
}

export function arrowHeadSubpath(
  tipX: number,
  tipY: number,
  dir: FlowDir,
  size = 11,
): string {
  switch (dir) {
    case 'E':
      return `M ${tipX - size},${tipY - size * 0.55} L ${tipX},${tipY} L ${tipX - size},${tipY + size * 0.55}`
    case 'W':
      return `M ${tipX + size},${tipY - size * 0.55} L ${tipX},${tipY} L ${tipX + size},${tipY + size * 0.55}`
    case 'S':
      return `M ${tipX - size * 0.55},${tipY - size} L ${tipX},${tipY} L ${tipX + size * 0.55},${tipY - size}`
    case 'N':
      return `M ${tipX - size * 0.55},${tipY + size} L ${tipX},${tipY} L ${tipX + size * 0.55},${tipY + size}`
  }
}

/** 네온용 — 몸통(호 또는 직통) + 화살촉을 단일 SVG path로 */
export function buildTurnFlowPathFull(inDir: FlowDir, outDir: FlowDir): string | null {
  const key = turnKey(inDir, outDir)

  const throughWithHead = TURN_THROUGH_WITH_HEAD[key]
  if (throughWithHead) return throughWithHead

  const pathInfo = buildTurnFlowPath(inDir, outDir)
  if (!pathInfo) return null

  return `${pathInfo.d} ${arrowHeadSubpath(pathInfo.tip.x, pathInfo.tip.y, pathInfo.outDir)}`
}

export function isValidTurnThrough(inDir: FlowDir, outDir: FlowDir): boolean {
  return TURN_THROUGH[turnKey(inDir, outDir)] != null
}

export function isValidTurnFlow(inDir: FlowDir, outDir: FlowDir): boolean {
  return isValidTurnArc(inDir, outDir) || isValidTurnThrough(inDir, outDir)
}

/** 미니맵 곡선(sweep)과 동일 — 1=시계, -1=반시계, null=직통 등 */
export function turnFlowRotationSign(inDir: FlowDir, outDir: FlowDir): 1 | -1 | null {
  const sweep = TURN_SWEEP[turnKey(inDir, outDir)]
  if (sweep == null) return null
  return sweep === 1 ? 1 : -1
}

export function buildTurnFlowPath(
  inDir: FlowDir,
  outDir: FlowDir,
): { d: string; tip: { x: number; y: number }; outDir: FlowDir } | null {
  const arc = buildTurnArcPath(inDir, outDir)
  if (arc) {
    const tipInfo = turnArcEdge(inDir, outDir)
    if (tipInfo) return { d: arc, tip: tipInfo.tip, outDir: tipInfo.outDir }
  }

  const through = TURN_THROUGH[turnKey(inDir, outDir)]
  if (through) {
    return { d: through, tip: EDGE[outDir], outDir }
  }

  return null
}

function junctionElbowCorner(inDir: FlowDir, outDir: FlowDir): { x: number; y: number } {
  const start = EDGE[inDir]
  const inHorizontal = inDir === 'E' || inDir === 'W'
  return {
    x: inHorizontal ? 50 : start.x,
    y: inHorizontal ? start.y : 50,
  }
}

/** 분기 — 90° 꺾임 직각 화살표 (곡선 대신 L자) */
export function buildJunctionElbowPath(
  inDir: FlowDir,
  outDir: FlowDir,
): { d: string; tip: { x: number; y: number }; outDir: FlowDir } | null {
  if (!isValidTurnArc(inDir, outDir)) return null

  const start = EDGE[inDir]
  const end = EDGE[outDir]
  const corner = junctionElbowCorner(inDir, outDir)
  return {
    d: `M ${start.x},${start.y} L ${corner.x},${corner.y} L ${end.x},${end.y}`,
    tip: end,
    outDir,
  }
}

export function buildJunctionElbowPathFull(inDir: FlowDir, outDir: FlowDir): string | null {
  const path = buildJunctionElbowPath(inDir, outDir)
  if (!path) return null
  return `${path.d} ${arrowHeadSubpath(path.tip.x, path.tip.y, path.outDir)}`
}

/**
 * 미니맵 곡선 — 물리 입고·출고 방향 그대로 사용 (입고측=0° 기준).
 * 저장된 rotation 필드는 빌더 배치용이며 곡선 렌더에는 쓰지 않음.
 */
export function resolveTurnFlowDirs(
  inDir: FlowDir | null,
  outDir: FlowDir | null,
  _rotation?: Rotation,
): { inDir: FlowDir; outDir: FlowDir } | null {
  if (!inDir || !outDir) return null
  return { inDir, outDir }
}

/** in → out 1/4 원호 SVG path */
export function buildTurnArcPath(inDir: FlowDir, outDir: FlowDir): string | null {
  const key = turnKey(inDir, outDir)
  const sweep = TURN_SWEEP[key]
  if (sweep == null) return null

  const start = EDGE[inDir]
  const end = EDGE[outDir]

  return `M ${start.x},${start.y} A ${R},${R} 0 0 ${sweep} ${end.x},${end.y}`
}

export function turnArcEdge(inDir: FlowDir, outDir: FlowDir): {
  tip: { x: number; y: number }
  outDir: FlowDir
} | null {
  const key = turnKey(inDir, outDir)
  if (TURN_SWEEP[key] == null) return null
  return { tip: EDGE[outDir], outDir }
}

export { EDGE as TURN_EDGE }
