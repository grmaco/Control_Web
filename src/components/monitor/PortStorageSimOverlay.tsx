import { useCallback, useEffect, useRef, useState } from 'react'
import { isStorageUnit } from '../../constants/conveyorTypes'
import { getUnitFootprint } from '../../utils/unitFootprint'
import { panelLineEnd } from '../../utils/flowCallouts'
import type { StorageSimState } from '../../hooks/usePortStorageSimulation'
import type { ConveyorLine, ConveyorUnit } from '../../types/conveyor'

// ── 상태별 색상 ────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  IDLE: '#94a3b8',
  TR: '#fbbf24',
  BUSY: '#f59e0b',
  COMPLETE: '#60a5fa',
}
const STATUS_TEXT: Record<string, string> = {
  IDLE: '#94a3b8',
  TR: '#fde68a',
  BUSY: '#fcd34d',
  COMPLETE: '#93c5fd',
}

const PANEL_W = 104
const DRAG_THRESHOLD_PX = 4

const ROW_DIVIDER = 'rgba(6,182,212,0.12)'
const LABEL_COLOR = 'rgba(6,182,212,0.75)'
const BORDER_COLOR = 'rgba(6,182,212,0.55)'
const GLOW_STRONG = 'rgba(6,182,212,0.25)'
const GLOW_SOFT = 'rgba(6,182,212,0.08)'
const ACCENT = 'rgba(6,182,212,0.75)'
const HEADER_GRADIENT =
  'linear-gradient(90deg,rgba(6,182,212,0.22) 0%,rgba(6,182,212,0.04) 60%,transparent 100%)'

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 6
  const inset = 2
  const style: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
    ...(pos === 'tl' && {
      top: inset, left: inset,
      borderTop: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}`,
    }),
    ...(pos === 'tr' && {
      top: inset, right: inset,
      borderTop: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}`,
    }),
    ...(pos === 'bl' && {
      bottom: inset, left: inset,
      borderBottom: `1.5px solid ${ACCENT}`, borderLeft: `1.5px solid ${ACCENT}`,
    }),
    ...(pos === 'br' && {
      bottom: inset, right: inset,
      borderBottom: `1.5px solid ${ACCENT}`, borderRight: `1.5px solid ${ACCENT}`,
    }),
  }
  return <div style={style} />
}

interface StorageSimCalloutOverlayProps {
  storageStates: Record<string, StorageSimState>
  line: ConveyorLine
  viewport: { minX: number; minY: number; cols: number; rows: number }
  cellSize: number
  scale?: number
  hiddenIds?: Set<string>
}

export function StorageSimCalloutOverlay({
  storageStates,
  line,
  viewport,
  cellSize,
  scale = 1,
  hiddenIds,
}: StorageSimCalloutOverlayProps) {
  const { minX, minY, cols, rows } = viewport

  // 창고 목록 계산 (앵커 셀 기준)
  const entries = line.units
    .filter((u) => isStorageUnit(u) && storageStates[u.id])
    .map((unit) => {
      const state = storageStates[unit.id]!
      const fp = getUnitFootprint(unit)
      const cx = (unit.gridX - minX + fp.cols / 2) * cellSize
      const cy = (unit.gridY - minY + fp.rows / 2) * cellSize
      // 초기 패널 위치: 창고 오른쪽 + 8px 여백
      const initX = (unit.gridX - minX + fp.cols) * cellSize + 8
      const initY = (unit.gridY - minY) * cellSize
      return { unit, state, cx, cy, initX, initY }
    })

  // ── 패널 위치 상태 ─────────────────────────────────────────────
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const init: Record<string, { x: number; y: number }> = {}
    for (const { unit, initX, initY } of entries) {
      init[unit.id] = { x: initX, y: initY }
    }
    return init
  })

  // 새로 나타난 창고에만 초기 위치 추가 (기존 드래그 위치 보존)
  useEffect(() => {
    setPositions((prev) => {
      let changed = false
      const next = { ...prev }
      for (const { unit, initX, initY } of entries) {
        if (!next[unit.id]) {
          next[unit.id] = { x: initX, y: initY }
          changed = true
        }
      }
      return changed ? next : prev
    })
    // entries가 바뀔 때(line 변경)만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line])

  // ── 패널 실제 크기 (ResizeObserver) ────────────────────────────
  const [panelSizes, setPanelSizes] = useState<Record<string, { w: number; h: number }>>({})

  // ── 드래그 상태 ────────────────────────────────────────────────
  const dragRef = useRef<{
    unitId: string
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
    scale: number
  } | null>(null)

  const handlePointerDown = useCallback(
    (unitId: string, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      const pos = positions[unitId] ?? { x: 0, y: 0 }
      dragRef.current = {
        unitId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
        scale,
      }
      ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)
    },
    [positions, scale],
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    event.preventDefault()
    setPositions((prev) => ({
      ...prev,
      [drag.unitId]: {
        x: drag.originX + dx / drag.scale,
        y: drag.originY + dy / drag.scale,
      },
    }))
  }, [])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
  }, [])

  if (entries.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[35] overflow-visible"
      style={{ width: cols * cellSize, height: rows * cellSize }}
    >
      {/* SVG 연결선 */}
      <svg
        className="pointer-events-none absolute overflow-visible"
        width={cols * cellSize}
        height={rows * cellSize}
        aria-hidden
      >
        {entries
          .filter(({ unit }) => !(hiddenIds?.has(unit.id)))
          .map(({ unit, cx, cy }) => {
            const pos = positions[unit.id] ?? { x: 0, y: 0 }
            const sz = panelSizes[unit.id] ?? { w: PANEL_W, h: 72 }
            const lineEnd = panelLineEnd(pos.x, pos.y, sz.w, sz.h, cx, cy)
            return (
              <g key={`line-${unit.id}`}>
                <line
                  x1={cx} y1={cy} x2={lineEnd.x} y2={lineEnd.y}
                  stroke="rgba(6,182,212,0.15)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
                <line
                  x1={cx} y1={cy} x2={lineEnd.x} y2={lineEnd.y}
                  stroke={BORDER_COLOR}
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeDasharray="5 3"
                />
                <circle cx={cx} cy={cy} r={2} fill={BORDER_COLOR} opacity={0.9} />
              </g>
            )
          })}
      </svg>

      {/* 패널 */}
      {entries
        .filter(({ unit }) => !(hiddenIds?.has(unit.id)))
        .map(({ unit, state }) => {
          const pos = positions[unit.id] ?? { x: 0, y: 0 }
          const dotColor = STATUS_DOT[state.status] ?? '#94a3b8'
          const textColor = STATUS_TEXT[state.status] ?? '#e2e8f0'
          const isDragging = dragRef.current?.unitId === unit.id

          return (
            <div
              key={unit.id}
              className={`pointer-events-auto touch-none select-none ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: PANEL_W,
                background: 'rgba(2,6,23,0.97)',
                border: `1px solid ${BORDER_COLOR}`,
                boxShadow: `0 0 14px ${GLOW_STRONG}, 0 0 4px ${GLOW_STRONG}, inset 0 0 24px ${GLOW_SOFT}`,
                borderRadius: 2,
                zIndex: isDragging ? 4 : 2,
              }}
              ref={(el) => {
                if (!el) return
                const observer = new ResizeObserver(() => {
                  setPanelSizes((prev) => {
                    const w = el.offsetWidth
                    const h = el.offsetHeight
                    const prev_ = prev[unit.id]
                    if (prev_ && prev_.w === w && prev_.h === h) return prev
                    return { ...prev, [unit.id]: { w, h } }
                  })
                })
                observer.observe(el)
                // cleanup은 ref callback이 null로 호출될 때 처리할 수 없으므로
                // ResizeObserver는 el이 unmount 될 때 GC됨
              }}
              onPointerDown={(e) => handlePointerDown(unit.id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title="드래그로 위치 이동"
            >
              <CornerBracket pos="tl" />
              <CornerBracket pos="tr" />
              <CornerBracket pos="bl" />
              <CornerBracket pos="br" />

              {/* 헤더 */}
              <div
                style={{
                  background: HEADER_GRADIENT,
                  borderBottom: `1px solid ${BORDER_COLOR}`,
                  padding: '2px 8px',
                  textAlign: 'center',
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#67e8f9',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {unit.name}
              </div>

              {/* 데이터 테이블 */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 7,
                  lineHeight: 1.35,
                  color: '#e2e8f0',
                }}
              >
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                    <th style={{ width: '42%', padding: '2px 4px', fontWeight: 600, color: LABEL_COLOR, textAlign: 'left', letterSpacing: '0.04em' }}>
                      STATUS
                    </th>
                    <td style={{ padding: '2px 4px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 5, height: 5, borderRadius: '50%',
                            marginRight: 3, flexShrink: 0,
                            background: dotColor,
                            boxShadow: `0 0 4px ${dotColor}`,
                          }}
                        />
                        <span style={{ color: textColor, fontWeight: 700 }}>{state.status}</span>
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                    <th style={{ padding: '2px 4px', fontWeight: 600, color: LABEL_COLOR, textAlign: 'left', letterSpacing: '0.04em' }}>
                      CST
                    </th>
                    <td style={{ padding: '2px 4px', color: state.hasCst ? '#34d399' : '#64748b' }}>
                      {state.hasCst ? '● ON' : '○ OFF'}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ padding: '2px 4px', fontWeight: 600, color: LABEL_COLOR, textAlign: 'left', letterSpacing: '0.04em' }}>
                      SLOTS
                    </th>
                    <td style={{ padding: '2px 4px', color: '#e2e8f0' }}>
                      {state.filledSlots} / 48
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}
    </div>
  )
}

// ── 포트 선택 모달 ────────────────────────────────────────────────
const PORT_STATUS_STYLE: Record<string, string> = {
  LD: 'text-slate-400 bg-slate-700/60',
  ULD: 'text-cyan-300 bg-cyan-900/60',
  BUSY: 'text-amber-300 bg-amber-900/60',
  READY: 'text-green-300 bg-green-900/60',
}

import type { PortSimState } from '../../hooks/usePortStorageSimulation'

interface PortSelectModalProps {
  storageUnit: ConveyorUnit
  connectablePorts: Array<{ state: PortSimState; unit: ConveyorUnit }>
  /** 출고(STK→OUT포트) 가능 여부 판정용 — 창고 적재 슬롯 수 */
  storageFilledSlots: number
  onSelect: (portId: string) => void
  onDismiss: () => void
}

export function PortSelectModal({
  storageUnit,
  connectablePorts,
  storageFilledSlots,
  onSelect,
  onDismiss,
}: PortSelectModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onDismiss}
    >
      <div
        className="mx-4 w-full max-w-xs rounded-lg border border-blue-500/50 bg-slate-800 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-sm font-bold text-blue-300">반송 포트 선택</p>
        <p className="mb-3 text-xs text-slate-400">
          {storageUnit.name} — IN 포트는 회수(포트→창고), OUT 포트는 출고(창고→포트→라인)
        </p>
        {connectablePorts.length === 0 ? (
          <p className="mb-3 text-xs text-slate-500">포트가 없습니다.</p>
        ) : (
          <div className="mb-3 flex flex-col gap-1">
            {connectablePorts.map(({ state, unit }) => {
              const isOut = (unit.portDirection ?? 'IN') === 'OUT'
              const busy = state.status === 'BUSY' || state.status === 'READY'
              // 회수: 포트에 자재 필요 · 출고: 포트 비어 있고 창고에 자재 필요
              const selectable = !busy && (isOut
                ? !state.hasCst && storageFilledSlots > 0
                : state.hasCst)
              const reason = busy
                ? '핸드셰이크 중'
                : isOut
                  ? state.hasCst
                    ? '포트 점유 중'
                    : storageFilledSlots <= 0
                      ? '창고 자재 없음'
                      : null
                  : state.hasCst
                    ? null
                    : '포트 자재 없음'
              return (
                <button
                  key={unit.id}
                  type="button"
                  disabled={!selectable}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-xs transition-colors ${
                    selectable
                      ? 'border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-600 cursor-pointer'
                      : 'border-slate-700 bg-slate-800/40 text-slate-500 cursor-not-allowed'
                  }`}
                  onClick={() => selectable && onSelect(unit.id)}
                  title={reason ?? undefined}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                        isOut
                          ? 'bg-violet-900/70 text-violet-300'
                          : 'bg-sky-900/70 text-sky-300'
                      }`}
                    >
                      {isOut ? 'OUT 출고' : 'IN 회수'}
                    </span>
                    {unit.name}
                  </span>
                  <span className="ml-2 flex items-center gap-1.5">
                    {reason ? (
                      <span className="text-[9px] text-slate-500">{reason}</span>
                    ) : null}
                    <span
                      className={`rounded px-1.5 py-0.5 font-bold ${
                        PORT_STATUS_STYLE[state.status] ?? 'text-slate-400'
                      }`}
                    >
                      {state.status}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-slate-600 bg-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
