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

export function minimapPortNameHalfInner(
  cellSize: number,
  dir: 'N' | 'E' | 'S' | 'W',
): number {
  const horizontalSplit = dir === 'E' || dir === 'W'
  const w = horizontalSplit ? cellSize * 0.5 : cellSize
  const h = horizontalSplit ? cellSize : cellSize * 0.5
  const inset = Math.min(4, Math.min(w, h) * 0.12)
  return Math.max(3, Math.min(w, h) - inset)
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

/** 포트 표시명 — "30101 IN" → "30101" */
export function portDisplayName(name: string): string {
  return name.replace(/\s+(IN|OUT)$/i, '').trim()
}

export function isPortNameVerticalLayout(dir: 'N' | 'E' | 'S' | 'W'): boolean {
  return dir === 'E' || dir === 'W'
}

function fitVerticalPortNameFontSize(innerSize: number, text: string): number {
  const chars = [...text]
  if (chars.length === 0 || innerSize <= 0) return 0

  const byHeight = innerSize / (chars.length * LABEL_LINE_HEIGHT)
  const byWidth = innerSize / charWidthFactor(chars[0], true)
  return Math.max(minimapMinFont(innerSize), Math.min(byHeight, byWidth))
}

/** 포트 이름 — 좌·우 절반(E/W)은 세로, 상·하(N/S)는 가로 */
export function pickMinimapPortName(
  innerSize: number,
  unitName: string,
  dir: 'N' | 'E' | 'S' | 'W',
): { displayName: string; fontSize: number; vertical: boolean } {
  const displayName = portDisplayName(unitName)
  if (!displayName || innerSize <= 0) {
    return { displayName: '', fontSize: 0, vertical: false }
  }

  if (isPortNameVerticalLayout(dir)) {
    return {
      displayName,
      fontSize: fitVerticalPortNameFontSize(innerSize, displayName),
      vertical: true,
    }
  }

  const { fontSize } = pickMinimapLabelLines(innerSize, [displayName])
  return { displayName, fontSize, vertical: false }
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
