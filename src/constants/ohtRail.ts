import type { OhtDir, OhtPortSpec, OhtRailType } from '../types/oht'
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
  doubleBranchR: 'DBL 분기-R',
  doubleBranchL: 'DBL 분기-L',
}

const RAIL_DESCRIPTIONS: Record<OhtRailType, string> = {
  straight:      '직선 구간 · 양방향 개구부',
  curve90:       '90° 방향 전환 곡선',
  branchR:       'BRANCH-R · 직선 + 오른쪽 분기',
  branchL:       'BRANCH-L · 직선 + 왼쪽 분기',
  yBypass:       'Y-BYPASS · 위쪽 양방향 분기',
  uBypass:       'U-BYPASS 1900 · 측면 U루프 사이딩',
  doubleUBypass: 'DOUBLE U-BYPASS 1900 · 양측 U루프',
  doubleBranchR: 'DBL BRANCH-R · BRANCH-R 2세트 복합',
  doubleBranchL: 'DBL BRANCH-L · BRANCH-L 2세트 복합',
}

/** 회전 0° 기준 기본 포트 사양 (어느 칸의 어느 방향) */
const BASE_PORTS: Record<OhtRailType, OhtPortSpec[]> = {
  straight:      [{ dir:'N',dx:0,dy:0 }, { dir:'S',dx:0,dy:0 }],
  curve90:       [{ dir:'N',dx:0,dy:0 }, { dir:'E',dx:0,dy:0 }],
  branchR:       [{ dir:'N',dx:0,dy:0 }, { dir:'S',dx:0,dy:0 }, { dir:'E',dx:0,dy:0 }],
  branchL:       [{ dir:'N',dx:0,dy:0 }, { dir:'S',dx:0,dy:0 }, { dir:'W',dx:0,dy:0 }],
  yBypass:       [{ dir:'S',dx:0,dy:0 }, { dir:'E',dx:0,dy:0 }, { dir:'W',dx:0,dy:0 }],
  // U-BYPASS: 2칸 가로. 각 레인 N+S 직통 + N측 U루프(S진입 OHT는 루프 이용 불가)
  uBypass:       [
    { dir:'N',dx:0,dy:0 }, { dir:'N',dx:1,dy:0 },
    { dir:'S',dx:0,dy:0 }, { dir:'S',dx:1,dy:0 },
  ],
  // DOUBLE U-BYPASS: 2×2칸. 위쪽 행(N), 아래쪽 행(S)
  doubleUBypass: [
    { dir:'N',dx:0,dy:0 }, { dir:'N',dx:1,dy:0 },
    { dir:'S',dx:0,dy:1 }, { dir:'S',dx:1,dy:1 },
  ],
  // DBL BRANCH-R: 2×1 복합. cell0=branchR, cell1=branchR@270°
  // 외부 포트: N(0,0), S(0,0), N(1,0), E(1,0)
  doubleBranchR: [
    { dir:'N', dx:0, dy:0 }, { dir:'S', dx:0, dy:0 },
    { dir:'N', dx:1, dy:0 }, { dir:'E', dx:1, dy:0 },
  ],
  // DBL BRANCH-L: doubleBranchR 좌우 대칭. cell0=branchL@270°, cell1=branchL
  // 외부 포트: N(0,0), W(0,0), N(1,0), S(1,0)
  doubleBranchL: [
    { dir:'N', dx:0, dy:0 }, { dir:'W', dx:0, dy:0 },
    { dir:'N', dx:1, dy:0 }, { dir:'S', dx:1, dy:0 },
  ],
}

/** 회전 0° 기준 기본 개구부 방향 (단일셀 앵커 포트만, backward compat) */
const BASE_OPENINGS: Record<OhtRailType, OhtDir[]> = Object.fromEntries(
  (Object.entries(BASE_PORTS) as [OhtRailType, OhtPortSpec[]][]).map(([type, ports]) => [
    type,
    ports.filter((p) => p.dx === 0 && p.dy === 0).map((p) => p.dir),
  ]),
) as Record<OhtRailType, OhtDir[]>

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

// ── 멀티셀 푸트프린트 ────────────────────────────────────────────────────────────

/** 회전 0° 기준 추가 점유 칸 오프셋 (앵커=(0,0) 포함) */
const BASE_FOOTPRINTS: Partial<Record<OhtRailType, Array<{ dx: number; dy: number }>>> = {
  // U-BYPASS: 가로 2칸 (앵커 왼쪽, 오른쪽으로 +1)
  uBypass:       [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
  // DOUBLE U-BYPASS: 2×2칸
  doubleUBypass: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }],
  doubleBranchR: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
  doubleBranchL: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
}

/** 오프셋 벡터를 90° CW 1스텝 회전 (스크린 좌표 y-down 기준) */
function rotateOffset90CW({ dx, dy }: { dx: number; dy: number }) {
  return { dx: -dy, dy: dx }
}

/**
 * 레일이 실제로 점유하는 칸의 앵커 기준 오프셋 목록 (회전 적용).
 * 1×1 레일은 [{dx:0,dy:0}] 단독 반환.
 */
export function ohtRailFootprint(
  type: OhtRailType,
  rotation: Rotation,
): Array<{ dx: number; dy: number }> {
  const base = BASE_FOOTPRINTS[type] ?? [{ dx: 0, dy: 0 }]
  const steps = (rotation / 90) % 4
  return base.map((p) => {
    let r = p
    for (let i = 0; i < steps; i++) r = rotateOffset90CW(r)
    return r
  })
}

/**
 * 회전이 적용된 포트 사양 목록 (칸 오프셋 + 방향 모두 회전).
 * 멀티셀 레일의 정확한 연결성 판단에 사용.
 */
export function ohtRailPorts(type: OhtRailType, rotation: Rotation): OhtPortSpec[] {
  const steps = (rotation / 90) % 4
  return BASE_PORTS[type].map(({ dir, dx, dy }) => {
    let rotatedDir = rotateOhtDir(dir, rotation)
    let cell = { dx, dy }
    for (let i = 0; i < steps; i++) cell = rotateOffset90CW(cell)
    return { dir: rotatedDir, dx: cell.dx, dy: cell.dy }
  })
}
