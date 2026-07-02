import type { Rotation } from './conveyor'

/** OHT 레일 개구부 방향 (직교 4방위) */
export type OhtDir = 'N' | 'E' | 'S' | 'W'

/**
 * OHT Rail 모듈 종류 (GPT 목업 팔레트 기준)
 * - straight  : 직선 레일 (N·S)
 * - curve     : 45° 곡선 레일 (N·E) — 90° 방향 전환
 * - branchT   : T 분기 (3way)
 * - branchX   : X 분기 (4way)
 * - branchY   : Y 분기 (3way)
 * - cross     : 크로스 분기 (교차 4way)
 * - railGate  : 레일 출입 (단일 개구부)
 */
export type OhtRailType =
  | 'straight'
  | 'curve'
  | 'branchT'
  | 'branchX'
  | 'branchY'
  | 'cross'
  | 'railGate'

/** 맵 위에 겹쳐지는 OHT 레일 1칸 (별도 레이어 — 컨베이어 units[]와 독립) */
export interface OhtRailUnit {
  id: string
  gridX: number
  gridY: number
  type: OhtRailType
  rotation: Rotation
  createdAt: string
  updatedAt: string
}

/** OHT 대차/도크 유닛 (레일 위 출발 지점 · 시뮬레이션 시 이동) */
export interface OhtUnit {
  id: string
  name: string
  gridX: number
  gridY: number
  rotation: Rotation
  createdAt: string
  updatedAt: string
}

/** OHT 레이어 선택 대상 구분 */
export type OhtSelectionKind = 'rail' | 'unit'

export interface OhtSelection {
  kind: OhtSelectionKind
  id: string
}
