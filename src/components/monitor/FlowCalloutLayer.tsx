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
import { useSemiCnvStore } from '../../store/useSemiCnvStore'

/** react-zoom-pan-pinch 패닝 제외용 */
export const FLOW_CALLOUT_PANEL_CLASS = 'flow-callout-panel'
/** 맵 유닛 호버·터치 콜아웃 — 패닝 제외 */
export const FLOW_UNIT_PEEK_HIT_CLASS = 'flow-unit-peek-hit'

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
  /** 자재 위치별 시뮬 목적지 (분기·회전·투입점) */
  simDestinationByUnitId?: Record<string, string>
  /** 증가 시 선택 해제 (시뮬레이션 초기화 등) */
  deselectToken?: number
  /** 맵 클릭으로 핀된 유닛 집합 — 강조 표시 */
  peekUnitIds?: ReadonlySet<string>
  /** 경로 시뮬 — LD/ULD/BUSY 판별용 */
  simulationLoads?: PathSimulationLoad[]
  inputIntervalSec?: number
  transitIntervalSec?: number
  dischargeIntervalSec?: number
  continuousInputActive?: boolean
  /** 포트/창고 핸드쉐이크 시뮬 — READY/BUSY 콜아웃 오버라이드 */
  portSimStates?: Record<string, import('../hooks/usePortStorageSimulation').PortSimState>
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
  simDestinationByUnitId = {},
  deselectToken = 0,
  peekUnitIds,
  simulationLoads = [],
  inputIntervalSec,
  transitIntervalSec,
  dischargeIntervalSec,
  continuousInputActive = false,
  portSimStates,
}: FlowCalloutOverlayProps) {
  const unitAlarms = useSemiCnvStore((s) => s.unitAlarms)
  const [positions, setPositions] = useState<Record<string, FlowCalloutPosition>>(() =>
    buildCalloutPositions(callouts, savedPositions),
  )
  const [panelSizes, setPanelSizes] = useState<
    Record<string, { width: number; height: number }>
  >({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const draggingUnitIdRef = useRef<string | null>(null)

  const calloutKey = callouts.map((c) => c.unitId).join('|')
  const savedKey = savedPositions ? JSON.stringify(savedPositions) : ''

  useEffect(() => {
    if (draggingUnitIdRef.current) return
    const next = buildCalloutPositions(callouts, savedPositions)
    setPositions(next)
    positionsRef.current = next
    setPanelSizes({})
    setSelectedId((current) =>
      current && callouts.some((c) => c.unitId === current) ? current : null,
    )
    // calloutKey/savedKey 변경 시에만 동기화 — live 데이터로 callouts 참조만 바뀌면 드래그가 끊김
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callouts, savedPositions는 키 변경 시점의 클로저 사용
  }, [calloutKey, savedKey])

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

  const handleDragStart = useCallback((unitId: string) => {
    draggingUnitIdRef.current = unitId
  }, [])

  const handleDragSessionEnd = useCallback(() => {
    draggingUnitIdRef.current = null
  }, [])

  const handleDragEnd = useCallback(() => {
    draggingUnitIdRef.current = null
    commitPositions()
  }, [commitPositions])

  const updatePanelSize = useCallback(
    (unitId: string, width: number, height: number) => {
      setPanelSizes((current) => {
        const prev = current[unitId]
        if (prev && prev.width === width && prev.height === height) return current
        return { ...current, [unitId]: { width, height } }
      })
    },
    [],
  )

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
        <defs>
          <filter id="sf-line-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {callouts.map((callout) => {
          const active    = activeUnitIds?.has(callout.unitId)
          const peeking   = peekUnitIds?.has(callout.unitId) ?? false
          const selected  = selectedId === callout.unitId
          const hasAlarm  = Boolean(unitAlarms[callout.unitId])
          const pos = positions[callout.unitId] ?? {
            panelX: callout.panelX,
            panelY: callout.panelY,
          }
          const measured = panelSizes[callout.unitId]
          const panelW =
            hasAlarm && measured ? measured.width : callout.panelWidth
          const panelH =
            hasAlarm && measured ? measured.height : callout.panelHeight
          const lineEnd = panelLineEnd(
            pos.panelX,
            pos.panelY,
            panelW,
            panelH,
            callout.lineStart.x,
            callout.lineStart.y,
          )
          const lineColor = hasAlarm
            ? '#ef4444'
            : active || selected || peeking
              ? '#22d3ee'
              : 'rgba(6,182,212,0.7)'
          const glowColor = hasAlarm
            ? 'rgba(239,68,68,0.35)'
            : active || selected || peeking
              ? 'rgba(34,211,238,0.35)'
              : 'rgba(6,182,212,0.15)'

          return (
            <g key={`line-${callout.unitId}`}>
              {/* 글로우 레이어 */}
              <line
                x1={callout.lineStart.x} y1={callout.lineStart.y}
                x2={lineEnd.x} y2={lineEnd.y}
                stroke={glowColor}
                strokeWidth={active || selected || peeking ? 5 : 3.5}
                strokeLinecap="round"
              />
              {/* 메인 라인 */}
              <line
                x1={callout.lineStart.x} y1={callout.lineStart.y}
                x2={lineEnd.x} y2={lineEnd.y}
                stroke={lineColor}
                strokeWidth={active || selected || peeking ? 1.5 : 1}
                strokeLinecap="round"
                strokeDasharray={active || selected || peeking ? undefined : '5 3'}
              />
              {/* 유닛 접점 도트 */}
              <circle
                cx={callout.lineStart.x}
                cy={callout.lineStart.y}
                r={2}
                fill={lineColor}
                opacity={0.9}
              />
            </g>
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
                  simDestination: simDestinationByUnitId[callout.unitId] ?? null,
                  simulationLoads: simulating ? simulationLoads : undefined,
                  unitMap: unitById,
                  inputIntervalSec,
                  transitIntervalSec,
                  dischargeIntervalSec,
                  continuousInputActive,
                  portSimState: portSimStates?.[callout.unitId],
                },
                unitAlarms,
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
            highlighted={(activeUnitIds?.has(callout.unitId) ?? false) || (peekUnitIds?.has(callout.unitId) ?? false)}
            onSelect={() => setSelectedId(callout.unitId)}
            onDrag={(panelX, panelY) => updatePosition(callout.unitId, panelX, panelY)}
            onDragEnd={handleDragEnd}
            onPointerSessionStart={() => handleDragStart(callout.unitId)}
            onPointerSessionEnd={handleDragSessionEnd}
            onDeselect={() => setSelectedId(null)}
            onPanLockChange={onPanLockChange}
            onSizeChange={
              display?.alarm
                ? (width, height) =>
                    updatePanelSize(callout.unitId, width, height)
                : undefined
            }
          />
        )
      })}
    </div>
  )
}

import type { CalloutDisplayInfo } from '../../utils/calloutDisplay'
import type { CalloutTransferStatus } from '../../utils/calloutTransferStatus'
import type { PathSimulationLoad } from '../../types/unitProperties'

function CornerBracket({
  pos,
  color,
}: {
  pos: 'tl' | 'tr' | 'bl' | 'br'
  color: string
}) {
  const size = 6
  const inset = 2
  const borders: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
    ...(pos === 'tl' && { top: inset, left: inset, borderTop: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}` }),
    ...(pos === 'tr' && { top: inset, right: inset, borderTop: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }),
    ...(pos === 'bl' && { bottom: inset, left: inset, borderBottom: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}` }),
    ...(pos === 'br' && { bottom: inset, right: inset, borderBottom: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}` }),
  }
  return <div style={borders} />
}

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
  onPointerSessionStart,
  onPointerSessionEnd,
  onDeselect,
  onPanLockChange,
  onSizeChange,
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
  onPointerSessionStart: () => void
  onPointerSessionEnd: () => void
  onDeselect: () => void
  onPanLockChange?: (locked: boolean) => void
  onSizeChange?: (width: number, height: number) => void
}) {
  const statusColors = STATUS_COLORS[callout.status]
  const hasAlarm = Boolean(display?.alarm)

  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
    dragging: boolean
    wasSelectedBeforeDown: boolean
    scale: number
  } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el || !hasAlarm || !onSizeChange) return

    const report = () => onSizeChange(el.offsetWidth, el.offsetHeight)
    report()

    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [display?.alarm, hasAlarm, onSizeChange])

  const onDragRef = useRef(onDrag)
  const onDragEndRef = useRef(onDragEnd)
  const onPointerSessionStartRef = useRef(onPointerSessionStart)
  const onPointerSessionEndRef = useRef(onPointerSessionEnd)
  const onDeselectRef = useRef(onDeselect)
  const onPanLockChangeRef = useRef(onPanLockChange)
  onDragRef.current = onDrag
  onDragEndRef.current = onDragEnd
  onPointerSessionStartRef.current = onPointerSessionStart
  onPointerSessionEndRef.current = onPointerSessionEnd
  onDeselectRef.current = onDeselect
  onPanLockChangeRef.current = onPanLockChange

  const windowListenersRef = useRef<{
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
  } | null>(null)

  const detachWindowListeners = useCallback(() => {
    const listeners = windowListenersRef.current
    if (!listeners) return
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.up)
    windowListenersRef.current = null
  }, [])

  useEffect(() => () => detachWindowListeners(), [detachWindowListeners])

  const finishDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      detachWindowListeners()
      panelRef.current?.releasePointerCapture(event.pointerId)
      dragRef.current = null
      setDragging(false)
      onPanLockChangeRef.current?.(false)

      if (drag.dragging) onDragEndRef.current()
      else onPointerSessionEndRef.current()
      if (drag.dragging || drag.wasSelectedBeforeDown) onDeselectRef.current()
    },
    [detachWindowListeners],
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const wasSelectedBeforeDown = selected
    onSelect()
    onPointerSessionStartRef.current()
    onPanLockChangeRef.current?.(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: panelX,
      originY: panelY,
      dragging: false,
      wasSelectedBeforeDown,
      scale,
    }
    panelRef.current?.setPointerCapture(event.pointerId)

    const onWindowMove = (moveEvent: PointerEvent) => {
      const activeDrag = dragRef.current
      if (!activeDrag || activeDrag.pointerId !== moveEvent.pointerId) return
      const dx = moveEvent.clientX - activeDrag.startClientX
      const dy = moveEvent.clientY - activeDrag.startClientY
      if (!activeDrag.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        activeDrag.dragging = true
        setDragging(true)
      }
      moveEvent.preventDefault()
      onDragRef.current(
        activeDrag.originX + dx / activeDrag.scale,
        activeDrag.originY + dy / activeDrag.scale,
      )
    }

    detachWindowListeners()
    const onWindowUp = (upEvent: PointerEvent) => finishDrag(upEvent)
    windowListenersRef.current = { move: onWindowMove, up: onWindowUp }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // window 리스너가 드래그 처리 — 요소 위 이동 시 백업
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || windowListenersRef.current) return
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      drag.dragging = true
      setDragging(true)
    }
    event.preventDefault()
    event.stopPropagation()
    onDrag(drag.originX + dx / drag.scale, drag.originY + dy / drag.scale)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (windowListenersRef.current) {
      finishDrag(event.nativeEvent)
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    finishDrag(event.nativeEvent)
  }

  // ── SF 색상 계산 ──────────────────────────────────────────────
  const borderColor = hasAlarm
    ? 'rgba(239,68,68,0.85)'
    : highlighted
      ? 'rgba(34,211,238,0.95)'
      : selected
        ? 'rgba(251,191,36,0.9)'
        : 'rgba(6,182,212,0.55)'

  const glowStrong = hasAlarm
    ? 'rgba(239,68,68,0.5)'
    : highlighted
      ? 'rgba(34,211,238,0.55)'
      : selected
        ? 'rgba(251,191,36,0.45)'
        : 'rgba(6,182,212,0.25)'

  const glowSoft = hasAlarm
    ? 'rgba(239,68,68,0.18)'
    : highlighted
      ? 'rgba(34,211,238,0.18)'
      : selected
        ? 'rgba(251,191,36,0.18)'
        : 'rgba(6,182,212,0.08)'

  const accentColor = hasAlarm
    ? 'rgba(239,68,68,0.9)'
    : highlighted || selected
      ? 'rgba(34,211,238,0.95)'
      : 'rgba(6,182,212,0.75)'

  const headerGradient = hasAlarm
    ? 'linear-gradient(90deg,rgba(239,68,68,0.28) 0%,rgba(239,68,68,0.06) 60%,transparent 100%)'
    : highlighted
      ? 'linear-gradient(90deg,rgba(34,211,238,0.28) 0%,rgba(34,211,238,0.06) 60%,transparent 100%)'
      : selected
        ? 'linear-gradient(90deg,rgba(251,191,36,0.28) 0%,rgba(251,191,36,0.06) 60%,transparent 100%)'
        : 'linear-gradient(90deg,rgba(6,182,212,0.22) 0%,rgba(6,182,212,0.04) 60%,transparent 100%)'

  const headerTextColor = hasAlarm
    ? '#fca5a5'
    : highlighted
      ? '#67e8f9'
      : selected
        ? '#fde68a'
        : '#67e8f9'

  const rowDivider = 'rgba(6,182,212,0.12)'
  const labelColor = 'rgba(6,182,212,0.75)'

  // 상태 도트 색
  const transferStatus = display?.transferStatus
  const statusDotStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 5,
    height: 5,
    borderRadius: '50%',
    marginRight: 3,
    flexShrink: 0,
    background: hasAlarm
      ? '#ef4444'
      : transferStatusDotColor(transferStatus) ?? statusColors.dot ?? '#94a3b8',
    boxShadow: hasAlarm
      ? '0 0 4px #ef4444'
      : transferStatus
        ? `0 0 4px ${transferStatusDotColor(transferStatus)}`
        : undefined,
  }

  const statusTextColor = hasAlarm
    ? '#fca5a5'
    : transferStatusTextColor(transferStatus) ?? '#e2e8f0'

  return (
    <div
      ref={panelRef}
      className={`${FLOW_CALLOUT_PANEL_CLASS} pointer-events-auto absolute touch-none select-none ${
        dragging ? 'cursor-grabbing' : selected ? 'cursor-move' : 'cursor-pointer'
      }`}
      style={{
        left: panelX + offset,
        top: panelY + offset,
        width: hasAlarm ? 'fit-content' : callout.panelWidth,
        minWidth: hasAlarm ? callout.panelWidth : undefined,
        minHeight: callout.panelHeight,
        zIndex: dragging ? 4 : selected ? 3 : 2,
        position: 'absolute',
        background: 'rgba(2,6,23,0.97)',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 14px ${glowStrong}, 0 0 4px ${glowStrong}, inset 0 0 24px ${glowSoft}`,
        borderRadius: 2,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title={selected ? '드래그 후 선택 해제 · 다시 클릭해도 해제' : '클릭하여 선택'}
    >
      {/* 코너 브래킷 */}
      <CornerBracket pos="tl" color={accentColor} />
      <CornerBracket pos="tr" color={accentColor} />
      <CornerBracket pos="bl" color={accentColor} />
      <CornerBracket pos="br" color={accentColor} />

      {/* 헤더 */}
      <div
        style={{
          background: headerGradient,
          borderBottom: `1px solid ${borderColor}`,
          padding: '2px 8px',
          textAlign: 'center',
          fontSize: '7px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: headerTextColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {display?.name ?? callout.unitName}
      </div>

      {/* 데이터 테이블 */}
      <table
        style={{
          width: hasAlarm ? 'max-content' : '100%',
          borderCollapse: 'collapse',
          fontSize: '7px',
          lineHeight: '1.35',
          color: '#e2e8f0',
        }}
      >
        <tbody>
          {/* 상태 */}
          <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
            <th style={{ width: '42%', padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
              STATUS
            </th>
            <td style={{ padding: '2px 4px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span style={statusDotStyle} />
                <span style={{ color: statusTextColor }}>
                  {display?.status ?? callout.statusLabel}
                </span>
              </span>
            </td>
          </tr>

          {/* 역할 */}
          <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
            <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
              ROLE
            </th>
            <td style={{ padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}>
              {display?.role ?? '—'}
            </td>
          </tr>

          {/* CST */}
          <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
            <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
              CST
            </th>
            <td style={{ padding: '2px 4px', color: display?.cstOn === 'On' ? '#34d399' : '#64748b' }}>
              {display?.cstOn === 'On' ? '● ON' : '○ OFF'}
            </td>
          </tr>

          {/* 목적지 (투입 시뮬 — 분기·회전·투입점) */}
          {display?.simDestination != null && (
            <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
              <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
                DEST
              </th>
              <td style={{ padding: '2px 4px', color: '#a5f3fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {display.simDestination}
              </td>
            </tr>
          )}

          {/* 위치 (해당 유닛만) */}
          {display?.location != null && (
            <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
              <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
                POS
              </th>
              <td style={{ padding: '2px 4px', color: '#93c5fd' }}>
                {display.location}
              </td>
            </tr>
          )}

          {/* HOME (회전·리프트만) */}
          {display?.home != null && (
            <tr style={{ borderBottom: `1px solid ${rowDivider}` }}>
              <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
                HOME
              </th>
              <td
                style={{
                  padding: '2px 4px',
                  fontWeight: 600,
                  color: display.home === 'Done' ? '#34d399' : '#fbbf24',
                  textShadow: display.home === 'Done'
                    ? '0 0 6px rgba(52,211,153,0.6)'
                    : '0 0 6px rgba(251,191,36,0.6)',
                }}
              >
                {display.home === 'Done' ? '✔ DONE' : '◌ ' + display.home}
              </td>
            </tr>
          )}

          {/* 제품 ID */}
          <tr style={{ borderBottom: display?.alarm ? `1px solid ${rowDivider}` : undefined }}>
            <th style={{ padding: '2px 4px', fontWeight: 600, color: labelColor, textAlign: 'left', letterSpacing: '0.04em' }}>
              ID
            </th>
            <td style={{ padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}>
              {display?.productId ?? '—'}
            </td>
          </tr>

          {/* 알람 */}
          {display?.alarm && (
            <tr>
              <th
                style={{
                  padding: '2px 4px',
                  fontWeight: 700,
                  color: '#f87171',
                  textAlign: 'left',
                  letterSpacing: '0.04em',
                  textShadow: '0 0 6px rgba(248,113,113,0.7)',
                }}
              >
                ALARM
              </th>
              <td
                style={{
                  padding: '2px 4px',
                  fontWeight: 600,
                  color: '#fca5a5',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 4px rgba(252,165,165,0.5)',
                }}
              >
                {display.alarm}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function transferStatusDotColor(status: CalloutTransferStatus | undefined): string | undefined {
  switch (status) {
    case 'LD':
      return '#22d3ee'
    case 'ULD':
      return '#fbbf24'
    case 'BUSY':
      return '#34d399'
    default:
      return undefined
  }
}

function transferStatusTextColor(status: CalloutTransferStatus | undefined): string | undefined {
  switch (status) {
    case 'LD':
      return '#67e8f9'
    case 'ULD':
      return '#fde68a'
    case 'BUSY':
      return '#6ee7b7'
    default:
      return undefined
  }
}
