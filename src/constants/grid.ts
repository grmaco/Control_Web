export const DEFAULT_GRID_COLS = 128
export const DEFAULT_GRID_ROWS = 128
export const MAX_UNITS = DEFAULT_GRID_COLS * DEFAULT_GRID_ROWS

export const DEFAULT_GRID_SIZE = {
  cols: DEFAULT_GRID_COLS,
  rows: DEFAULT_GRID_ROWS,
} as const

/** 모니터링 화면 셀 크기 (px) */
export const MONITOR_CELL_SIZE = 24

/** HOME 미니맵 셀 크기 (px) */
export const MINIMAP_CELL_SIZE = 2

/** 라인 빌더 셀 크기 (px) — 작업 영역 기준 */
export const BUILDER_CELL_SIZE = 36

/** 라인 빌더 기본 작업 영역 (유닛 없을 때) */
export const BUILDER_DEFAULT_VIEWPORT_COLS = 20
export const BUILDER_DEFAULT_VIEWPORT_ROWS = 14

/** 라인 빌더 작업 영역 여백 (셀) */
export const BUILDER_VIEWPORT_PADDING = 6

/** @deprecated 이전 16×8 맵 호환 */
export const LEGACY_GRID_COLS = 16
export const LEGACY_GRID_ROWS = 8
