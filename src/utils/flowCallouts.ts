import type { ConveyorLine, ConveyorStatus, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { STATUS_COLORS } from '../constants/statusColors'
import type { UnitFlowDirs } from './flowDirection'
import type { LineViewport } from './lineViewport'
import { getUnitFootprint } from './unitFootprint'
import { formatTurnFlowAngleLabel } from './turnArc'
import { unitDisplayCode } from './unitPropertyHelpers'

export type FlowCalloutTagKind = 'start' | 'end' | 'angle'

export interface FlowCalloutTag {
  kind: FlowCalloutTagKind
  text: string
}

export interface FlowCallout {
  unitId: string
  unitName: string
  unitCode: string
  status: ConveyorStatus
  statusLabel: string
  tags: FlowCalloutTag[]
  lineStart: { x: number; y: number }
  lineEnd: { x: number; y: number }
  panelX: number
  panelY: number
  panelWidth: number
  panelHeight: number
}

interface PxRect {
  left: number
  top: number
  right: number
  bottom: number
}

const DIRECTIONS: Array<{ x: -1 | 0 | 1; y: -1 | 0 | 1 }> = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
]

/** 그리드 밖 콜아웃이 잘리지 않도록 오버레이 여백 */
export const FLOW_CALLOUT_OVERLAY_PAD = 120

function unitBoundsPx(
  unit: ConveyorUnit,
  cellSize: number,
  minX: number,
  minY: number,
): PxRect & { cx: number; cy: number } {
  const footprint = getUnitFootprint(unit)
  const left = (unit.gridX - minX) * cellSize
  const top = (unit.gridY - minY) * cellSize
  const right = left + footprint.cols * cellSize
  const bottom = top + footprint.rows * cellSize
  return {
    left,
    top,
    right,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  }
}

function edgePointToward(
  bounds: PxRect & { cx: number; cy: number },
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const dx = targetX - bounds.cx
  const dy = targetY - bounds.cy
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: bounds.cx, y: bounds.top }
  }

  const halfW = (bounds.right - bounds.left) / 2
  const halfH = (bounds.bottom - bounds.top) / 2
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1e-6)
  return {
    x: bounds.cx + dx * scale,
    y: bounds.cy + dy * scale,
  }
}

/** 콜아웃 연결선 시작점 — 모듈 꼭지점 대신 변 위 점(모서리 inset) */
function lineAnchorOnBounds(
  bounds: PxRect & { cx: number; cy: number },
  targetX: number,
  targetY: number,
  spreadSeed = 0,
): { x: number; y: number } {
  const dx = targetX - bounds.cx
  const dy = targetY - bounds.cy
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const halfW = width / 2
  const halfH = height / 2
  const cornerInset = Math.min(6, width * 0.22, height * 0.22)
  const spread = Math.min(10, width * 0.28, height * 0.28)
  const spreadT = ((spreadSeed % 7) - 3) / 3

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: bounds.cx + spreadT * spread, y: bounds.top + cornerInset }
  }

  if (Math.abs(dx) * halfH >= Math.abs(dy) * halfW) {
    const x = dx < 0 ? bounds.left : bounds.right
    const ySpan = Math.max(cornerInset, halfH - cornerInset)
    const y = bounds.cy + (dy / Math.max(Math.abs(dx), 1e-6)) * (halfW / Math.max(halfH, 1e-6)) * ySpan
    const clampedY = Math.max(bounds.top + cornerInset, Math.min(bounds.bottom - cornerInset, y))
    return { x, y: clampedY + spreadT * Math.min(spread, ySpan * 0.35) }
  }

  const y = dy < 0 ? bounds.top : bounds.bottom
  const xSpan = Math.max(cornerInset, halfW - cornerInset)
  const x = bounds.cx + (dx / Math.max(Math.abs(dy), 1e-6)) * (halfH / Math.max(halfW, 1e-6)) * xSpan
  const clampedX = Math.max(bounds.left + cornerInset, Math.min(bounds.right - cornerInset, x))
  return { x: clampedX + spreadT * Math.min(spread, xSpan * 0.35), y }
}

function edgePointOnRect(rect: PxRect, fromX: number, fromY: number): { x: number; y: number } {
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
  return edgePointToward({ ...rect, cx, cy }, fromX, fromY)
}

function rectsOverlap(a: PxRect, b: PxRect, gap = 0): boolean {
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  )
}

function buildUnitRects(
  line: ConveyorLine,
  cellSize: number,
  minX: number,
  minY: number,
): PxRect[] {
  return line.units.map((unit) => {
    const bounds = unitBoundsPx(unit, cellSize, minX, minY)
    return {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    }
  })
}

export function collectCalloutTags(
  unit: ConveyorUnit,
  flow: UnitFlowDirs | undefined,
): FlowCalloutTag[] {
  const tags: FlowCalloutTag[] = []

  if (flow?.role === 'start' || unit.flowRole === 'entry') {
    tags.push({ kind: 'start', text: '시작점' })
  }
  if (flow?.role === 'end' || unit.flowRole === 'exit') {
    tags.push({ kind: 'end', text: '종료점' })
  }

  if (unit.type === 'turn' && flow?.inDir && flow.outDir) {
    const angle = formatTurnFlowAngleLabel(flow.inDir, flow.outDir)
    if (angle) {
      tags.push({ kind: 'angle', text: `회전 ${angle}` })
    }
  }

  return tags
}

function needsCallout(
  unit: ConveyorUnit,
  flow: UnitFlowDirs | undefined,
  hasAlarm: boolean,
): boolean {
  if (isStorageUnit(unit) || isPortUnit(unit)) return false
  if (unit.type === 'junction') return false
  if (hasAlarm) return true
  if (unit.flowRole === 'entry' || unit.flowRole === 'exit') return true
  if (!flow) return false
  return collectCalloutTags(unit, flow).length > 0
}

function positionPanelOutside(
  lineStart: { x: number; y: number },
  dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 },
  panelWidth: number,
  panelHeight: number,
  gap: number,
): PxRect {
  let panelX = lineStart.x - panelWidth / 2
  let panelY = lineStart.y - panelHeight / 2

  if (dir.x < 0) panelX = lineStart.x - panelWidth - gap
  else if (dir.x > 0) panelX = lineStart.x + gap

  if (dir.y < 0) panelY = lineStart.y - panelHeight - gap
  else if (dir.y > 0) panelY = lineStart.y + gap

  return {
    left: panelX,
    top: panelY,
    right: panelX + panelWidth,
    bottom: panelY + panelHeight,
  }
}

function panelOverlapsModule(
  panel: PxRect,
  unitRects: PxRect[],
  moduleGap: number,
): boolean {
  return unitRects.some((rect) => rectsOverlap(panel, rect, moduleGap))
}

function fallbackPlacement(
  bounds: PxRect & { cx: number; cy: number },
  panelWidth: number,
  panelHeight: number,
  unitRects: PxRect[],
  reservedPanels: PxRect[],
  spreadSeed = 0,
): {
  lineStart: { x: number; y: number }
  lineEnd: { x: number; y: number }
  panel: PxRect
} | null {
  const moduleGap = 2
  const margin = 6
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const cornerInset = Math.min(6, width * 0.22, height * 0.22)
  const spread = Math.min(10, width * 0.28, height * 0.28)
  const spreadT = ((spreadSeed % 7) - 3) / 3
  const anchors = [
    {
      x: bounds.cx + spreadT * spread,
      y: bounds.top + cornerInset,
      panelX: bounds.left - panelWidth - margin,
      panelY: bounds.top - panelHeight - margin,
    },
    {
      x: bounds.right - cornerInset,
      y: bounds.cy + spreadT * spread,
      panelX: bounds.right + margin,
      panelY: bounds.top - panelHeight - margin,
    },
    {
      x: bounds.cx + spreadT * spread,
      y: bounds.bottom - cornerInset,
      panelX: bounds.left - panelWidth - margin,
      panelY: bounds.bottom + margin,
    },
    {
      x: bounds.left + cornerInset,
      y: bounds.cy + spreadT * spread,
      panelX: bounds.left - panelWidth - margin,
      panelY: bounds.top - panelHeight - margin,
    },
  ]

  for (const anchor of anchors) {
    const panel: PxRect = {
      left: anchor.panelX,
      top: anchor.panelY,
      right: anchor.panelX + panelWidth,
      bottom: anchor.panelY + panelHeight,
    }
    if (panelOverlapsModule(panel, unitRects, moduleGap)) continue
    if (reservedPanels.some((rect) => rectsOverlap(panel, rect, 4))) continue

    const lineStart = { x: anchor.x, y: anchor.y }
    const lineEnd = edgePointOnRect(panel, lineStart.x, lineStart.y)
    return { lineStart, lineEnd, panel }
  }

  return null
}

function placeCalloutPanel(
  bounds: PxRect & { cx: number; cy: number },
  cellSize: number,
  panelWidth: number,
  panelHeight: number,
  unitRects: PxRect[],
  reservedPanels: PxRect[],
  spreadSeed = 0,
): {
  lineStart: { x: number; y: number }
  lineEnd: { x: number; y: number }
  panel: PxRect
} | null {
  const moduleGap = 2
  const panelGap = 4
  const maxSteps = 28

  let best: {
    lineStart: { x: number; y: number }
    lineEnd: { x: number; y: number }
    panel: PxRect
    score: number
  } | null = null

  for (const dir of DIRECTIONS) {
    if (dir.x === 0 && dir.y === 0) continue

    for (let step = 1; step <= maxSteps; step += 1) {
      const length = cellSize * (1.8 + step * 0.65)
      const targetX = bounds.cx + dir.x * length
      const targetY = bounds.cy + dir.y * length
      const lineStart = lineAnchorOnBounds(bounds, targetX, targetY, spreadSeed)
      const panel = positionPanelOutside(lineStart, dir, panelWidth, panelHeight, panelGap)
      const lineEnd = edgePointOnRect(panel, lineStart.x, lineStart.y)

      if (panelOverlapsModule(panel, unitRects, moduleGap)) continue
      if (reservedPanels.some((rect) => rectsOverlap(panel, rect, 4))) continue

      const score = length + (panel.left < 0 ? -8 : 0) + (panel.top < 0 ? -8 : 0)
      if (!best || score < best.score) {
        best = { lineStart, lineEnd, panel, score }
      }
      break
    }
  }

  if (best) {
    return {
      lineStart: best.lineStart,
      lineEnd: best.lineEnd,
      panel: best.panel,
    }
  }

  return fallbackPlacement(bounds, panelWidth, panelHeight, unitRects, reservedPanels, spreadSeed)
}

/** 배치 후보가 모두 막혔을 때 — 모듈만 피하고 링형으로 강제 배치 */
function forceCalloutPlacement(
  bounds: PxRect & { cx: number; cy: number },
  cellSize: number,
  panelWidth: number,
  panelHeight: number,
  unitRects: PxRect[],
  spreadSeed: number,
): {
  lineStart: { x: number; y: number }
  lineEnd: { x: number; y: number }
  panel: PxRect
} | null {
  const moduleGap = 2
  const slots = 16

  for (let ring = 0; ring < 14; ring += 1) {
    const dist = cellSize * (2.2 + ring * 0.75)
    for (let slot = 0; slot < slots; slot += 1) {
      const angle = ((spreadSeed + slot * 5) % slots) * ((2 * Math.PI) / slots)
      const cx = bounds.cx + Math.cos(angle) * dist
      const cy = bounds.cy + Math.sin(angle) * dist
      const panel: PxRect = {
        left: cx - panelWidth / 2,
        top: cy - panelHeight / 2,
        right: cx + panelWidth / 2,
        bottom: cy + panelHeight / 2,
      }
      if (panelOverlapsModule(panel, unitRects, moduleGap)) continue

      const lineStart = lineAnchorOnBounds(bounds, cx, cy, spreadSeed)
      const lineEnd = edgePointOnRect(panel, lineStart.x, lineStart.y)
      return { lineStart, lineEnd, panel }
    }
  }

  return null
}

function calloutSortPriority(
  unit: ConveyorUnit,
  flowMap: Map<string, UnitFlowDirs>,
): number {
  const flow = flowMap.get(unit.id)
  if (flow?.role === 'start' || flow?.role === 'end') return 0
  if (unit.flowRole === 'entry' || unit.flowRole === 'exit') return 1
  return 2
}

/** 알람 한 줄 표시용 패널 너비 추정 (7px 폰트 기준) */
export function estimateAlarmCalloutPanelWidth(
  alarmText: string | undefined,
  minWidth: number,
): number {
  if (!alarmText) return minWidth
  const labelCol = 40
  const padding = 12
  const charWidth = 4.2
  return Math.max(minWidth, Math.ceil(labelCol + padding + alarmText.length * charWidth))
}

export function computeFlowCallouts(
  line: ConveyorLine,
  flowMap: Map<string, UnitFlowDirs>,
  viewport: LineViewport,
  cellSize: number,
  alarmUnitIds?: Set<string>,
  alarmTexts?: Record<string, string>,
): FlowCallout[] {
  const panelMinWidth = Math.max(80, Math.round((cellSize * 7) / 3))
  const panelHeight = 50
  const unitRects = buildUnitRects(line, cellSize, viewport.minX, viewport.minY)
  const reservedPanels: PxRect[] = []
  const callouts: FlowCallout[] = []

  const units = [...line.units].sort((a, b) => {
    const priority = calloutSortPriority(a, flowMap) - calloutSortPriority(b, flowMap)
    if (priority !== 0) return priority
    const ay = a.gridY - a.gridX
    const by = b.gridY - b.gridX
    return ay - by || a.gridX - b.gridX
  })

  for (const unit of units) {
    const flow = flowMap.get(unit.id)
    const hasAlarm = alarmUnitIds?.has(unit.id) ?? false
    if (!needsCallout(unit, flow, hasAlarm)) continue

    const bounds = unitBoundsPx(unit, cellSize, viewport.minX, viewport.minY)
    const panelWidth = estimateAlarmCalloutPanelWidth(
      alarmTexts?.[unit.id],
      panelMinWidth,
    )
    const spreadSeed = unit.gridX * 11 + unit.gridY * 17 + unit.name.length
    const placement =
      placeCalloutPanel(
        bounds,
        cellSize,
        panelWidth,
        panelHeight,
        unitRects,
        reservedPanels,
        spreadSeed,
      ) ??
      forceCalloutPlacement(
        bounds,
        cellSize,
        panelWidth,
        panelHeight,
        unitRects,
        spreadSeed,
      )
    if (!placement) continue

    reservedPanels.push(placement.panel)
    const tags = collectCalloutTags(unit, flow)

    callouts.push({
      unitId: unit.id,
      unitName: unit.name,
      unitCode: unitDisplayCode(unit),
      status: unit.status,
      statusLabel: STATUS_COLORS[unit.status].label,
      tags,
      lineStart: placement.lineStart,
      lineEnd: placement.lineEnd,
      panelX: placement.panel.left,
      panelY: placement.panel.top,
      panelWidth,
      panelHeight,
    })
  }

  return callouts
}

export type FlowCalloutPosition = { panelX: number; panelY: number }

export function buildCalloutPositions(
  callouts: FlowCallout[],
  saved?: Record<string, FlowCalloutPosition>,
): Record<string, FlowCalloutPosition> {
  const result: Record<string, FlowCalloutPosition> = {}
  for (const callout of callouts) {
    const stored = saved?.[callout.unitId]
    result[callout.unitId] = stored ?? {
      panelX: callout.panelX,
      panelY: callout.panelY,
    }
  }
  return result
}

export function panelLineEnd(
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
  fromX: number,
  fromY: number,
): { x: number; y: number } {
  return edgePointOnRect(
    {
      left: panelX,
      top: panelY,
      right: panelX + panelWidth,
      bottom: panelY + panelHeight,
    },
    fromX,
    fromY,
  )
}
