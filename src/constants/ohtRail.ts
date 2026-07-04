import type { OhtDir, OhtRailType } from '../types/oht'
import type { Rotation } from '../types/conveyor'

/** 표준 레일 (팔레트 상단 섹션) */
export const OHT_STANDARD_RAIL_TYPES: OhtRailType[] = [
  'straight',
  'curve90',
  'branchR',
  'branchL',
  'yBypass',
]

/** 1900mm 대형 레일 (팔레트 하단 섹션) */
export const OHT_LARGE_RAIL_TYPES: OhtRailType[] = [
  'uBypass',
  'doubleUBypass',
  'doubleBranchR',
  'doubleBranchL',
  'doubleBranch2',
]

/** 전체 레일 목록 (순서 = 팔레트 순서) */
export const OHT_RAIL_TYPES: OhtRailType[] = [
  ...OHT_STANDARD_RAIL_TYPES,
  ...OHT_LARGE_RAIL_TYPES,
]

const RAIL_LABELS: Record<OhtRailType, string> = {
  straight:      '직선 레일',
  curve90:       '90° 곡선 레일',
  branchR:       '분기 오른쪽',
  branchL:       '분기 왼쪽',
  yBypass:       'Y-BYPASS',
  uBypass:       'U-BYPASS',
  doubleUBypass: 'DOUBLE U-BYPASS',
  doubleBranchR: 'DBL 분기 오른쪽',
  doubleBranchL: 'DBL 분기 왼쪽',
  doubleBranch2: 'DBL 분기-2',
}

const RAIL_DESCRIPTIONS: Record<OhtRailType, string> = {
  straight:      '직선 구간 · 양방향 개구부',
  curve90:       '90° 방향 전환 곡선',
  branchR:       'BRANCH-R · 직선 + 오른쪽 분기',
  branchL:       'BRANCH-L · 직선 + 왼쪽 분기',
  yBypass:       'Y-BYPASS · 위쪽 양방향 분기',
  uBypass:       'U-BYPASS 1900 · 측면 U루프 사이딩',
  doubleUBypass: 'DOUBLE U-BYPASS 1900 · 양측 U루프',
  doubleBranchR: 'DBL BRANCH-1-R 1900 · 광폭 오른쪽 분기',
  doubleBranchL: 'DBL BRANCH-1-L 1900 · 광폭 왼쪽 분기',
  doubleBranch2: 'DBL BRANCH-2 1900 · 광폭 양방향 분기',
}

/** 회전 0° 기준 기본 개구부 방향 */
const BASE_OPENINGS: Record<OhtRailType, OhtDir[]> = {
  straight:      ['N', 'S'],
  curve90:       ['N', 'E'],
  branchR:       ['N', 'S', 'E'],
  branchL:       ['N', 'S', 'W'],
  yBypass:       ['N', 'E', 'W'],
  uBypass:       ['N', 'S'],
  doubleUBypass: ['N', 'S'],
  doubleBranchR: ['N', 'S', 'E'],
  doubleBranchL: ['N', 'S', 'W'],
  doubleBranch2: ['N', 'E', 'W'],
}

const DIR_ORDER: OhtDir[] = ['N', 'E', 'S', 'W']

export function ohtRailLabel(type: OhtRailType): string {
  return RAIL_LABELS[type]
}

export function ohtRailDescription(type: OhtRailType): string {
  return RAIL_DESCRIPTIONS[type]
}

export function ohtRailIsLarge(type: OhtRailType): boolean {
  return (OHT_LARGE_RAIL_TYPES as OhtRailType[]).includes(type)
}

/** 방향을 시계방향 rotation 만큼 회전 */
export function rotateOhtDir(dir: OhtDir, rotation: Rotation): OhtDir {
  const steps = (rotation / 90) % 4
  const index = DIR_ORDER.indexOf(dir)
  return DIR_ORDER[(index + steps) % 4]!
}

/** 회전이 적용된 실제 개구부 방향 집합 */
export function ohtRailOpenings(type: OhtRailType, rotation: Rotation): OhtDir[] {
  return (BASE_OPENINGS[type] ?? []).map((dir) => rotateOhtDir(dir, rotation))
}

/** 방향 → 인접 셀 오프셋 */
export const OHT_DIR_OFFSET: Record<OhtDir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
}

/** 반대 방향 (개구부 마주봄 판정용) */
export const OHT_DIR_OPPOSITE: Record<OhtDir, OhtDir> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
}
