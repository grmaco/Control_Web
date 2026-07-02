import type { OhtDir, OhtRailType } from '../types/oht'
import type { Rotation } from '../types/conveyor'

/** 팔레트 노출 순서 (GPT 목업 기준) */
export const OHT_RAIL_TYPES: OhtRailType[] = [
  'straight',
  'curve',
  'branchT',
  'branchX',
  'branchY',
  'cross',
  'railGate',
]

const RAIL_LABELS: Record<OhtRailType, string> = {
  straight: '직선 레일',
  curve: '45° 곡선 레일',
  branchT: 'T 분기 (3way)',
  branchX: 'X 분기 (4way)',
  branchY: 'Y 분기 (3way)',
  cross: '크로스 분기',
  railGate: '레일 출입',
}

const RAIL_DESCRIPTIONS: Record<OhtRailType, string> = {
  straight: '직선 구간 · 양방향 개구부',
  curve: '90° 방향 전환 곡선',
  branchT: '3방향 T 분기',
  branchX: '4방향 X 분기',
  branchY: '3방향 Y 분기',
  cross: '4방향 교차 분기',
  railGate: '레일 진입·진출 게이트 (단일)',
}

/** 회전 0° 기준 기본 개구부 방향 */
const BASE_OPENINGS: Record<OhtRailType, OhtDir[]> = {
  straight: ['N', 'S'],
  curve: ['N', 'E'],
  branchT: ['E', 'W', 'S'],
  branchX: ['N', 'E', 'S', 'W'],
  branchY: ['N', 'E', 'W'],
  cross: ['N', 'E', 'S', 'W'],
  railGate: ['S'],
}

const DIR_ORDER: OhtDir[] = ['N', 'E', 'S', 'W']

export function ohtRailLabel(type: OhtRailType): string {
  return RAIL_LABELS[type]
}

export function ohtRailDescription(type: OhtRailType): string {
  return RAIL_DESCRIPTIONS[type]
}

/** 방향을 시계방향 rotation 만큼 회전 */
export function rotateOhtDir(dir: OhtDir, rotation: Rotation): OhtDir {
  const steps = (rotation / 90) % 4
  const index = DIR_ORDER.indexOf(dir)
  return DIR_ORDER[(index + steps) % 4]!
}

/** 회전이 적용된 실제 개구부 방향 집합 */
export function ohtRailOpenings(type: OhtRailType, rotation: Rotation): OhtDir[] {
  return BASE_OPENINGS[type].map((dir) => rotateOhtDir(dir, rotation))
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
