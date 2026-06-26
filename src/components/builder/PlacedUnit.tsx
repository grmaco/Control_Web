import { useDraggable } from '@dnd-kit/core'
import type { ConveyorUnit, FlowRole } from '../../types/conveyor'
import type { TurnFlowDisplay } from '../../constants/conveyorTypes'
import { STATUS_COLORS } from '../../constants/statusColors'
import { RollerConveyorCell } from '../monitor/RollerConveyorCell'
import { TurnConveyorCell } from '../monitor/TurnConveyorCell'
import { StorageConveyorCell } from '../monitor/StorageConveyorCell'
import {
  isPortUnit,
  isStorageUnit,
  showsRotation,
  showsTypeLabelInCell,
  formatRotationDisplay,
  typeLabel,
  unitTitle,
} from '../../constants/conveyorTypes'
import { formatFlowRoleLabel } from '../../utils/flowEntries'
import type { UnitFootprint } from '../../utils/unitFootprint'
import { type GridDragData, unitDragId } from './dnd'

interface PlacedUnitProps {
  unit: ConveyorUnit
  selected: boolean
  routingHighlighted?: boolean
  routingTooltip?: string | null
  showLabels?: boolean
  cellSize: number
  footprint?: UnitFootprint
  dragEnabled?: boolean
  flow?: TurnFlowDisplay | null
  pickHighlight?: 'source' | 'target' | null
  onPanLock?: () => void
  onSelect: () => void
}

function flowRoleBadgeClass(role: FlowRole): string {
  if (role === 'entry') return 'bg-amber-600'
  return 'bg-emerald-600'
}

function getHighlightOverlayClass(
  selected: boolean,
  pickHighlight: 'source' | 'target' | null,
  routingHighlighted: boolean,
  flowRole: FlowRole | null,
): string | null {
  if (pickHighlight === 'source') return 'ring-2 ring-inset ring-cyan-300 brightness-125'
  if (pickHighlight === 'target') return 'ring-2 ring-inset ring-emerald-300 brightness-125'
  if (routingHighlighted) return 'ring-2 ring-inset ring-violet-300 brightness-125'
  if (selected) return 'ring-2 ring-inset ring-white'
  if (flowRole === 'entry') return 'ring-2 ring-inset ring-amber-400'
  if (flowRole === 'exit') return 'ring-2 ring-inset ring-emerald-400'
  return null
}

export function PlacedUnit({
  unit,
  selected,
  routingHighlighted = false,
  routingTooltip = null,
  showLabels = true,
  cellSize,
  footprint = { cols: 1, rows: 1 },
  dragEnabled = true,
  flow = null,
  pickHighlight = null,
  onPanLock,
  onSelect,
}: PlacedUnitProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: unitDragId(unit.id),
    data: { source: 'grid', unitId: unit.id } satisfies GridDragData,
    disabled: !dragEnabled,
  })

  const colors = STATUS_COLORS[unit.status]
  const isPort = isPortUnit(unit)
  const isStorage = isStorageUnit(unit)
  const isTurn = unit.type === 'turn' || unit.type === 'junction'
  const spanWidth = footprint.cols * cellSize
  const spanHeight = footprint.rows * cellSize
  const flowRole = unit.flowRole ?? null
  const flowRoleLabel = formatFlowRoleLabel(flowRole)
  const useRollerSvg  = !isStorage && !isTurn
  const useTurnSvg    = isTurn
  const useStorageSvg = isStorage
  const highlightOverlayClass = getHighlightOverlayClass(
    selected,
    pickHighlight,
    routingHighlighted,
    flowRole,
  )

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPanLock?.()
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      style={{
        width: spanWidth,
        height: spanHeight,
        touchAction: 'none',
      }}
      className={`builder-no-pan absolute top-0 left-0 flex cursor-grab flex-col items-center justify-center border p-1 text-[10px] leading-tight active:cursor-grabbing relative overflow-hidden ${(useRollerSvg || useTurnSvg || useStorageSvg) ? colors.border : `${colors.bg} ${colors.border}`} ${
        pickHighlight === 'target' ? 'cursor-crosshair' : ''
      } ${isDragging ? 'opacity-30' : 'hover:brightness-110'}`}
      title={
        routingTooltip ??
        (flowRoleLabel
          ? `${unitTitle(unit, flow)} · ${flowRoleLabel}`
          : unitTitle(unit, flow))
      }
    >
      {useRollerSvg && (
        <RollerConveyorCell
          width={spanWidth}
          height={spanHeight}
          status={unit.status}
          rotation={unit.rotation ?? 0}
          isRunning={unit.status === 'running'}
          uid={`builder-${unit.id}`}
        />
      )}
      {useTurnSvg && (
        <TurnConveyorCell
          width={spanWidth}
          height={spanHeight}
          status={unit.status}
          rotation={unit.rotation ?? 0}
          isRunning={unit.status === 'running'}
          uid={`builder-${unit.id}`}
          isJunction={unit.type === 'junction'}
        />
      )}
      {useStorageSvg && (
        <StorageConveyorCell
          width={spanWidth}
          height={spanHeight}
          status={unit.status}
          uid={`builder-${unit.id}`}
        />
      )}
      {flowRole && showLabels && (
        <span
          className={`absolute top-0.5 left-0.5 rounded px-0.5 text-[8px] font-bold text-white ${flowRoleBadgeClass(flowRole)}`}
        >
          {flowRoleLabel}
        </span>
      )}
      {showLabels ? (
        <div className="relative z-10 flex flex-col items-center text-center">
          <span className="font-semibold text-white">{unit.name}</span>
          {isPort ? (
            <span className="text-white/70">{unit.portDirection ?? 'IN'}</span>
          ) : isStorage ? null : (
            <>
              {showsTypeLabelInCell(unit.type) && (
                <span className="text-white/70">{typeLabel(unit.type)}</span>
              )}
              {showsRotation(unit.type) && (
                <span className="text-white/60">{formatRotationDisplay(unit, flow)}</span>
              )}
            </>
          )}
        </div>
      ) : null}
      {highlightOverlayClass ? (
        <span
          className={`pointer-events-none absolute inset-0 z-20 ${highlightOverlayClass}`}
          aria-hidden
        />
      ) : null}
    </button>
  )
}

export function UnitDragPreview({
  unit,
  cellSize = 36,
}: {
  unit: ConveyorUnit
  cellSize?: number
}) {
  const colors = STATUS_COLORS[unit.status]
  const isStorage = isStorageUnit(unit)
  const footprint = isStorage ? { cols: 3, rows: 3 } : { cols: 1, rows: 1 }

  return (
    <div
      style={{
        width: footprint.cols * cellSize,
        height: footprint.rows * cellSize,
      }}
      className={`flex flex-col items-center justify-center rounded border text-[10px] shadow-lg ${colors.bg} ${colors.border}`}
    >
      <span className="font-semibold text-white">{unit.name}</span>
    </div>
  )
}

export function PaletteDragPreview({ label }: { label: string }) {
  return (
    <div className="rounded border border-blue-500 bg-slate-800 px-3 py-2 text-sm text-white shadow-lg">
      {label}
    </div>
  )
}
