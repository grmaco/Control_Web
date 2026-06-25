import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConveyorUnit } from '../../types/conveyor'
import type { SemiCnvUnitRuntime } from '../../types/semicnv'
import type { FlowCallout, FlowCalloutPosition } from '../../utils/flowCallouts'
import {
  FLOW_CALLOUT_OVERLAY_PAD,
  buildCalloutPositions,
  panelLineEnd,
} from '../../utils/flowCallouts'
import type { UnitFlowDirs } from '../../utils/flowDirection'
import { buildCalloutDisplayInfo } from '../../utils/calloutDisplay'
import { STATUS_COLORS } from '../../constants/statusColors'

/** react-zoom-pan-pinch 패닝 제외용 */
export const FLOW_CALLOUT_PANEL_CLASS = 'flow-callout-panel'

const DRAG_THRESHOLD_PX = 4

interface FlowCalloutOverlayProps {
  callouts: FlowCallout[]
  unitById: Map<string, ConveyorUnit>
  flowByUnitId: Map<string, UnitFlowDirs>
  unitRuntime: Record<string, SemiCnvUnitRuntime>
  gridWidth: number
  gridHeight: number
  scale: number
  savedPositions?: Record<string, FlowCalloutPosition>
  onSavePositions: (positions: Record<string, FlowCalloutPosition>) => void
  onPanLockChange?: (locked: boolean) => void
  activeUnitIds?: Set<string>
  staticTestMaterialUnitIds?: Set<string>
  simulating?: boolean
  /** 증가 시 선택 해제 (시뮬레이션 초기화 등) */
  deselectToken?: number
}

export function FlowCalloutOverlay({
  callouts,
  unitById,
  flowByUnitId,
  unitRuntime,
  gridWidth,
  gridHeight,
  scale,
  savedPositions,
  onSavePositions,
  onPanLockChange,
  activeUnitIds,
  staticTestMaterialUnitIds,
  simulating = false,
  deselectToken = 0,
}: FlowCalloutOverlayProps) {
  const [positions, setPositions] = useState<Record<string, FlowCalloutPosition>>(() =>
    buildCalloutPositions(callouts, savedPositions),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const calloutKey = callouts.map((c) => c.unitId).join('|')
  const savedKey = savedPositions ? JSON.stringify(savedPositions) : ''

  useEffect(() => {
    const next = buildCalloutPositions(callouts, savedPositions)
    setPositions(next)
    positionsRef.current = next
    setSelectedId((current) =>
      current && callouts.some((c) => c.unitId === current) ? current : null,
    )
  }, [calloutKey, savedKey, callouts, savedPositions])

  useEffect(() => {
    if (deselectToken > 0) setSelectedId(null)
  }, [deselectToken])

  const updatePosition = useCallback((unitId: string, panelX: number, panelY: number) => {
    setPositions((current) => {
      const next = { ...current, [unitId]: { panelX, panelY } }
      positionsRef.current = next
      return next
    })
  }, [])

  const commitPositions = useCallback(() => {
    onSavePositions(positionsRef.current)
  }, [onSavePositions])

  if (callouts.length === 0) return null

  const pad = FLOW_CALLOUT_OVERLAY_PAD

  return (
    <div
      className="pointer-events-none absolute z-[25] overflow-visible"
      style={{
        left: -pad,
        top: -pad,
        width: gridWidth + pad * 2,
        height: gridHeight + pad * 2,
      }}
    >
      <svg
        className="pointer-events-none absolute overflow-visible"
        style={{ left: pad, top: pad }}
        width={gridWidth}
        height={gridHeight}
        aria-hidden
      >
        {callouts.map((callout) => {
          const active = activeUnitIds?.has(callout.unitId)
          const selected = selectedId === callout.unitId
          const pos = positions[callout.unitId] ?? {
            panelX: callout.panelX,
            panelY: callout.panelY,
          }
          const lineEnd = panelLineEnd(
            pos.panelX,
            pos.panelY,
            callout.panelWidth,
            callout.panelHeight,
            callout.lineStart.x,
            callout.lineStart.y,
          )
          return (
            <line
              key={`line-${callout.unitId}`}
              x1={callout.lineStart.x}
              y1={callout.lineStart.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={active || selected ? '#22d3ee' : 'rgba(148,163,184,0.95)'}
              strokeWidth={active || selected ? 2.5 : 1.75}
              strokeLinecap="round"
              strokeDasharray={active || selected ? undefined : '5 4'}
            />
          )
        })}
      </svg>
      {callouts.map((callout) => {
        const unit = unitById.get(callout.unitId)
        const flow = flowByUnitId.get(callout.unitId)
        const display =
          unit != null
            ? buildCalloutDisplayInfo(
                unit,
                flow,
                unitRuntime,
                activeUnitIds?.has(callout.unitId) ?? false,
                {
                  simulating,
                  staticTestAtOrigin:
                    staticTestMaterialUnitIds?.has(callout.unitId) ?? false,
                },
              )
            : null
        const pos = positions[callout.unitId] ?? {
          panelX: callout.panelX,
          panelY: callout.panelY,
        }
        return (
          <SelectableFlowCalloutTable
            key={callout.unitId}
            callout={callout}
            display={display}
            offset={pad}
            panelX={pos.panelX}
            panelY={pos.panelY}
            scale={scale}
            selected={selectedId === callout.unitId}
            highlighted={activeUnitIds?.has(callout.unitId) ?? false}
            onSelect={() => setSelectedId(callout.unitId)}
            onDrag={(panelX, panelY) => updatePosition(callout.unitId, panelX, panelY)}
            onDragEnd={commitPositions}
            onDeselect={() => setSelectedId(null)}
            onPanLockChange={onPanLockChange}
          />
        )
      })}
    </div>
  )
}

import type { CalloutDisplayInfo } from '../../utils/calloutDisplay'

function SelectableFlowCalloutTable({
  callout,
  display,
  offset,
  panelX,
  panelY,
  scale,
  selected,
  highlighted,
  onSelect,
  onDrag,
  onDragEnd,
  onDeselect,
  onPanLockChange,
}: {
  callout: FlowCallout
  display: CalloutDisplayInfo | null
  offset: number
  panelX: number
  panelY: number
  scale: number
  selected: boolean
  highlighted: boolean
  onSelect: () => void
  onDrag: (panelX: number, panelY: number) => void
  onDragEnd: () => void
  onDeselect: () => void
  onPanLockChange?: (locked: boolean) => void
}) {
  const statusColors = STATUS_COLORS[callout.status]
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
    dragging: boolean
    wasSelectedBeforeDown: boolean
  } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const endDrag = useCallback(
    (didMove: boolean, wasSelectedBeforeDown: boolean) => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
      onPanLockChange?.(false)
      if (didMove) onDragEnd()
      if (didMove || wasSelectedBeforeDown) onDeselect()
    },
    [onDeselect, onDragEnd, onPanLockChange],
  )

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      const dx = event.clientX - drag.startClientX
      const dy = event.clientY - drag.startClientY
      if (!drag.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        drag.dragging = true
        setDragging(true)
      }

      event.preventDefault()
      event.stopPropagation()
      onDrag(drag.originX + dx / scale, drag.originY + dy / scale)
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      endDrag(drag.dragging, drag.wasSelectedBeforeDown)
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true })
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true })
    window.addEventListener('pointercancel', handleWindowPointerUp, { capture: true })

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true })
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true })
      window.removeEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    }
  }, [endDrag, onDrag, scale])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    const wasSelectedBeforeDown = selected
    onSelect()
    onPanLockChange?.(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: panelX,
      originY: panelY,
      dragging: false,
      wasSelectedBeforeDown,
    }
    panelRef.current?.setPointerCapture(event.pointerId)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    event.preventDefault()
    if (panelRef.current?.hasPointerCapture(event.pointerId)) {
      panelRef.current.releasePointerCapture(event.pointerId)
    }
    endDrag(drag.dragging, drag.wasSelectedBeforeDown)
  }

  return (
    <div
      ref={panelRef}
      className={`${FLOW_CALLOUT_PANEL_CLASS} pointer-events-auto absolute touch-none select-none rounded border shadow-md ${
        highlighted
          ? 'border-cyan-300 bg-slate-900 ring-1 ring-cyan-400/60'
          : selected
            ? 'border-amber-400 bg-slate-900 ring-2 ring-amber-400/80'
            : 'border-slate-400 bg-slate-900 hover:border-slate-300'
      } ${dragging ? 'cursor-grabbing' : selected ? 'cursor-move' : 'cursor-pointer'}`}
      style={{
        left: panelX + offset,
        top: panelY + offset,
        width: callout.panelWidth,
        minHeight: callout.panelHeight,
        zIndex: dragging ? 4 : selected ? 3 : 2,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      title={selected ? '드래그 후 선택 해제 · 다시 클릭해도 해제' : '클릭하여 선택'}
    >
      <div
        className={`truncate border-b px-1 py-px text-center text-[7px] font-bold ${
          selected
            ? 'border-amber-500/50 text-amber-100'
            : 'border-slate-600 text-white'
        }`}
      >
        {display?.name ?? callout.unitName}
      </div>
      <table className="w-full border-collapse text-left text-[7px] leading-none text-slate-100">
        <tbody>
          <tr className="border-b border-slate-600">
            <th className="w-[42%] px-1 py-px font-semibold text-slate-400">상태</th>
            <td className="px-1 py-px">
              <span className="inline-flex items-center gap-0.5">
                <span
                  className={`inline-block h-1 w-1 rounded-full ${statusColors.bg}`}
                  aria-hidden
                />
                <span>{display?.status ?? callout.statusLabel}</span>
              </span>
            </td>
          </tr>
          <tr className="border-b border-slate-600">
            <th className="px-1 py-px font-semibold text-slate-400">역할</th>
            <td className="truncate px-1 py-px text-slate-100">{display?.role ?? '—'}</td>
          </tr>
          <tr className="border-b border-slate-600">
            <th className="px-1 py-px font-semibold text-slate-400">CST On</th>
            <td className="px-1 py-px text-slate-100">{display?.cstOn ?? 'Off'}</td>
          </tr>
          <tr className="border-b border-slate-600">
            <th className="px-1 py-px font-semibold text-slate-400">위치</th>
            <td className="px-1 py-px text-slate-100">{display?.location ?? '—'}</td>
          </tr>
          <tr>
            <th className="px-1 py-px font-semibold text-slate-400">제품ID</th>
            <td className="truncate px-1 py-px text-slate-100">{display?.productId ?? '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
