import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import type { OhtRailUnit, OhtSelection, OhtUnit } from '../../types/oht'
import { ohtRailConnectedDirs, getOhtRails, getOhtUnits } from '../../utils/ohtLayer'
import { ohtRailFootprint } from '../../constants/ohtRail'
import { ohtGridDragId, type OhtGridDragData } from '../builder/dnd'
import { OhtRailGlyph } from './OhtRailGlyph'
import { OhtVehicleGlyph } from '../builder/OhtPaletteItem'

interface OhtViewport {
  minX: number
  minY: number
  cols: number
  rows: number
}

interface OhtRailLayerProps {
  line: ConveyorLine
  viewport: OhtViewport
  cellSize: number
  /** true: 빌더 — 드래그·선택 가능. false: 표시 전용(모니터·미니맵) */
  interactive?: boolean
  selection?: OhtSelection | null
  onSelect?: (selection: OhtSelection) => void
}

export function OhtRailLayer({
  line,
  viewport,
  cellSize,
  interactive = false,
  selection = null,
  onSelect,
}: OhtRailLayerProps) {
  const rails = getOhtRails(line)
  const units = getOhtUnits(line)

  const connectedByRailId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const rail of rails) {
      map.set(rail.id, ohtRailConnectedDirs(rail, rails))
    }
    return map
  }, [rails])

  if (rails.length === 0 && units.length === 0) return null

  const width = viewport.cols * cellSize
  const height = viewport.rows * cellSize

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[15] overflow-visible"
      style={{ width, height }}
    >
      {rails.map((rail) => (
        <OhtRailCell
          key={rail.id}
          rail={rail}
          viewport={viewport}
          cellSize={cellSize}
          connectedDirs={connectedByRailId.get(rail.id)}
          interactive={interactive}
          selected={selection?.kind === 'rail' && selection.id === rail.id}
          onSelect={onSelect}
        />
      ))}
      {units.map((unit) => (
        <OhtVehicleCell
          key={unit.id}
          unit={unit}
          viewport={viewport}
          cellSize={cellSize}
          interactive={interactive}
          selected={selection?.kind === 'unit' && selection.id === unit.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function cellStyle(
  gridX: number,
  gridY: number,
  viewport: OhtViewport,
  cellSize: number,
  extraCols = 0,
  extraRows = 0,
  offsetCols = 0,
  offsetRows = 0,
): React.CSSProperties {
  return {
    position: 'absolute',
    left: (gridX + offsetCols - viewport.minX) * cellSize,
    top: (gridY + offsetRows - viewport.minY) * cellSize,
    width: (1 + extraCols) * cellSize,
    height: (1 + extraRows) * cellSize,
  }
}

/** 레일 푸트프린트에서 렌더 bounding box 오프셋/크기 계산 */
function footprintBounds(type: OhtRailUnit['type'], rotation: OhtRailUnit['rotation']) {
  const fp = ohtRailFootprint(type, rotation)
  const dxs = fp.map((p) => p.dx)
  const dys = fp.map((p) => p.dy)
  const minDx = Math.min(...dxs)
  const minDy = Math.min(...dys)
  const maxDx = Math.max(...dxs)
  const maxDy = Math.max(...dys)
  return {
    offsetCols: minDx,
    offsetRows: minDy,
    extraCols: maxDx - minDx,
    extraRows: maxDy - minDy,
  }
}

function OhtRailCell({
  rail,
  viewport,
  cellSize,
  connectedDirs,
  interactive,
  selected,
  onSelect,
}: {
  rail: OhtRailUnit
  viewport: OhtViewport
  cellSize: number
  connectedDirs?: Set<string>
  interactive: boolean
  selected: boolean
  onSelect?: (selection: OhtSelection) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ohtGridDragId('rail', rail.id),
    data: { source: 'oht-grid', kind: 'rail', ohtId: rail.id } satisfies OhtGridDragData,
    disabled: !interactive,
  })

  const { offsetCols, offsetRows, extraCols, extraRows } = footprintBounds(rail.type, rail.rotation)
  const glyphW = (1 + extraCols) * cellSize
  const glyphH = (1 + extraRows) * cellSize

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      style={{
        ...cellStyle(rail.gridX, rail.gridY, viewport, cellSize, extraCols, extraRows, offsetCols, offsetRows),
        touchAction: 'none',
      }}
      className={`flex items-center justify-center ${
        interactive ? 'builder-no-pan pointer-events-auto cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-40' : ''} ${
        selected ? 'rounded-sm ring-1 ring-cyan-300 ring-inset' : ''
      }`}
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation()
              onSelect?.({ kind: 'rail', id: rail.id })
            }
          : undefined
      }
    >
      <OhtRailGlyph
        type={rail.type}
        rotation={rail.rotation}
        size={cellSize}
        glyphWidth={glyphW}
        glyphHeight={glyphH}
        connectedDirs={connectedDirs}
        emphasized={selected}
      />
    </div>
  )
}

function OhtVehicleCell({
  unit,
  viewport,
  cellSize,
  interactive,
  selected,
  onSelect,
}: {
  unit: OhtUnit
  viewport: OhtViewport
  cellSize: number
  interactive: boolean
  selected: boolean
  onSelect?: (selection: OhtSelection) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ohtGridDragId('unit', unit.id),
    data: { source: 'oht-grid', kind: 'unit', ohtId: unit.id } satisfies OhtGridDragData,
    disabled: !interactive,
  })

  const inset = Math.max(2, cellSize * 0.14)

  return (
    <div
      ref={interactive ? setNodeRef : undefined}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      style={{ ...cellStyle(unit.gridX, unit.gridY, viewport, cellSize), touchAction: 'none' }}
      className={`flex items-center justify-center ${
        interactive ? 'builder-no-pan pointer-events-auto cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
      onPointerDown={
        interactive
          ? (e) => {
              e.stopPropagation()
              onSelect?.({ kind: 'unit', id: unit.id })
            }
          : undefined
      }
      title={unit.name}
    >
      <div
        className={`flex items-center justify-center rounded-sm ${
          selected ? 'ring-2 ring-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.7)]' : ''
        }`}
        style={{ width: cellSize - inset, height: cellSize - inset }}
      >
        <OhtVehicleGlyph size={cellSize - inset * 2} />
      </div>
    </div>
  )
}
