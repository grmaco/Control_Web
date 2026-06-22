import type { Rotation } from '../types/conveyor'
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

export function isValidTurnThrough(inDir: FlowDir, outDir: FlowDir): boolean {
  return TURN_THROUGH[turnKey(inDir, outDir)] != null
}

export function isValidTurnFlow(inDir: FlowDir, outDir: FlowDir): boolean {
  return isValidTurnArc(inDir, outDir) || isValidTurnThrough(inDir, outDir)
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

/**
 * 0° — 연결(물류) 방향 그대로.
 * 90/180/270° — 해당 각도의 개구부 쌍을 따르되, 실제 흐름(in→out)에 맞춤.
 */
export function resolveTurnFlowDirs(
  inDir: FlowDir | null,
  outDir: FlowDir | null,
  rotation: Rotation,
): { inDir: FlowDir; outDir: FlowDir } | null {
  if (!inDir || !outDir) return null

  if (rotation === 0) {
    return { inDir, outDir }
  }

  const [openA, openB] = TURN_OPENINGS[rotation]
  if (inDir === openA && outDir === openB) return { inDir, outDir }
  if (inDir === openB && outDir === openA) return { inDir, outDir }

  // 설정 각도와 연결이 다를 때는 물리 연결 우선
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
