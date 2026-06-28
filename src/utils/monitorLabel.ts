import type { ConveyorUnit } from '../types/conveyor'

export const LABEL_LINE_HEIGHT = 1.12
/** p-0.5 + border 등으로 줄어드는 DOM 기준 여백 */
export const CELL_INSET = 6
const MIN_VISUAL_FONT = 7

function charWidthFactor(text: string, isNameLine: boolean): number {
  if (/[가-힣]/.test(text)) {
    return isNameLine ? 1.05 : 1
  }
  return isNameLine ? 0.78 : 0.68
}

/** 화면상(줌 적용 후) px 기준 글자 크기 */
export function fitVisualFontSize(innerSize: number, lines: string[]): number {
  if (lines.length === 0 || innerSize <= 0) return 0

  const byHeight = innerSize / (lines.length * LABEL_LINE_HEIGHT)
  const byWidth = Math.min(
    ...lines.map((line, index) => {
      const chars = [...line].length
      return innerSize / (chars * charWidthFactor(line, index === 0))
    }),
  )

  return Math.max(3, Math.min(byHeight, byWidth))
}

/** 미니맵 — 셀/풋프린트 크기에 맞춘 라벨 */
export function minimapInnerSize(
  cellSize: number,
  spanCols: number,
  spanRows: number,
): number {
  const spanWidth = cellSize * spanCols
  const spanHeight = cellSize * spanRows
  const inset = Math.min(CELL_INSET, Math.min(spanWidth, spanHeight) * 0.2)
  return Math.max(3, Math.min(spanWidth, spanHeight) - inset)
}

function portCharWidthFactor(text: string): number {
  if (/^\d+$/.test(text)) return 0.6
  if (/[가-힣]/.test(text)) return 1.02
  return 0.72
}

function minimapMinFont(innerSize: number): number {
  if (innerSize < 14) return 3
  if (innerSize < 24) return 5
  return MIN_VISUAL_FONT
}

export function pickMinimapLabelLines(
  innerSize: number,
  candidates: string[],
): { lines: string[]; fontSize: number } {
  if (candidates.length === 0 || innerSize <= 0) {
    return { lines: [], fontSize: 0 }
  }

  const minFont = minimapMinFont(innerSize)
  let lines = [candidates[0]]
  for (let i = 1; i < candidates.length; i += 1) {
    const next = [...lines, candidates[i]]
    if (fitVisualFontSize(innerSize, next) >= minFont) lines = next
  }

  return { lines, fontSize: fitVisualFontSize(innerSize, lines) }
}

export function minimapPortNameBandHeight(cellSize: number): number {
  return Math.max(10, Math.round(cellSize * 0.4))
}

/** 홀로그램이 차지하는 상단 비율 (나머지는 이름) */
export const PORT_HOLO_ZONE_RATIO = 0.58

function minimapPortNameBandBounds(cellSize: number): { width: number; height: number } {
  const inset = Math.min(4, cellSize * 0.06)
  return {
    width: Math.max(3, cellSize - inset * 2),
    height: Math.max(8, minimapPortNameBandHeight(cellSize) - inset),
  }
}

/** 포트 이름 — 박스 안에 전체 문자열이 들어가도록 축소 (잘림 없음) */
export function fitPortNameInBox(
  width: number,
  height: number,
  text: string,
): number {
  if (!text || width <= 0 || height <= 0) return 0

  const chars = [...text].length
  const byHeight = height / LABEL_LINE_HEIGHT
  const byWidth = width / (chars * portCharWidthFactor(text))
  return Math.max(3.5, Math.min(byHeight, byWidth))
}

/** 포트 표시명 — "30101 IN" → "30101" */
export function portDisplayName(name: string): string {
  return name.replace(/\s+(IN|OUT)$/i, '').trim()
}

/** 포트 이름 — 셀 하단 가로 밴드 */
export function pickMinimapPortName(
  cellSize: number,
  unitName: string,
): { displayName: string; fontSize: number } {
  const displayName = portDisplayName(unitName)
  if (!displayName || cellSize <= 0) {
    return { displayName: '', fontSize: 0 }
  }

  const { width, height } = minimapPortNameBandBounds(cellSize)
  return {
    displayName,
    fontSize: fitPortNameInBox(width, height, displayName),
  }
}

/** flow 없을 때 포트 전체 셀에 이름 표시 */
export function pickMinimapPortFullName(
  cellSize: number,
  unitName: string,
): { displayName: string; fontSize: number } {
  return pickMinimapPortName(cellSize, unitName)
}

/** 포트 미니맵 SVG text — viewBox(100) 기준 */
export function portMinimapSvgFontSize(
  cellSize: number,
  text: string,
  compact: boolean,
): number {
  const targetPx = compact
    ? Math.max(4.5, cellSize * 0.42)
    : Math.max(5, cellSize * 0.2)
  let size = (targetPx / Math.max(cellSize, 1)) * 100
  const maxUnits = compact ? 88 : 44
  const charUnits = Math.max(1, [...text].length) * 0.52
  size = Math.min(size, (maxUnits / charUnits) * 100)
  return Math.min(100, Math.max(compact ? 30 : 18, size))
}

export interface UnitLabelLines {
  lines: string[]
  /** TransformWrapper scale 보정된 DOM font-size (px) */
  fontSize: number
}

export function buildUnitLabelLines(
  unit: ConveyorUnit,
  cellSize: number,
  scale: number,
  spanCols = 1,
  spanRows = 1,
): UnitLabelLines {
  const spanWidth = cellSize * spanCols
  const spanHeight = cellSize * spanRows
  const effectiveInner = Math.max(
    8,
    Math.min(spanWidth, spanHeight) - CELL_INSET,
  ) * scale

  const lines = [unit.name]
  const visualFont = fitVisualFontSize(effectiveInner, lines)

  return {
    lines,
    fontSize: visualFont / scale,
  }
}
