import type { Rotation } from './conveyor'

/** OHT 레일 개구부 방향 (직교 4방위) */
export type OhtDir = 'N' | 'E' | 'S' | 'W'

/**
 * OHT Rail 모듈 종류 — 실제 현장 레일 기준
 *
 * 표준 레일:
 * - straight      : 직선 레일 (N·S)
 * - curve90       : 90° 곡선 레일 (N·E)
 * - branchR       : 분기 오른쪽 / BRANCH-R (N·S·E)
 * - branchL       : 분기 왼쪽  / BRANCH-L (N·S·W)
 * - yBypass       : Y-BYPASS (N·E·W)
 *
 * 1900mm 대형 레일:
 * - uBypass       : U-BYPASS 1900 (N·S + U루프)
 * - doubleUBypass : DOUBLE U-BYPASS 1900 (N·S + 양측 U루프)
 * - doubleBranchR : DOUBLE BRANCH-1-R 1900 (N·S·E)
 * - doubleBranchL : DOUBLE BRANCH-1-L 1900 (N·S·W)
 * - doubleBranch2 : DOUBLE BRANCH-2 1900 (N·E·W)
 */
export type OhtRailType =
  | 'straight'
  | 'curve90'
  | 'branchR'
  | 'branchL'
  | 'yBypass'
  | 'uBypass'
  | 'doubleUBypass'
  | 'doubleBranchR'
  | 'doubleBranchL'
  | 'doubleBranch2'

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
