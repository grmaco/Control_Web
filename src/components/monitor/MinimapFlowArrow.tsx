import type { CSSProperties, ReactNode } from 'react'
import type { ConveyorType, ConveyorUnit, Rotation } from '../../types/conveyor'
import type { FlowDir, UnitFlowDirs } from '../../utils/flowDirection'
import {
  LABEL_LINE_HEIGHT,
  minimapInnerSize,
  minimapPortNameHalfInner,
  pickMinimapLabelLines,
  pickMinimapPortName,
  portDisplayName,
} from '../../utils/monitorLabel'
import {
  buildTurnFlowPath,
  buildTurnFlowPathFull,
  TURN_EDGE,
} from '../../utils/turnArc'

const EDGE = TURN_EDGE

const NEON = {
  outer: '#06b6d4',
  glow: '#22d3ee',
  hot: '#cffafe',
  badgeGlow: '#4ade80',
  badgeEndGlow: '#f87171',
} as const

function oppositeDir(dir: FlowDir): FlowDir {
  switch (dir) {
    case 'N':
      return 'S'
    case 'S':
      return 'N'
    case 'E':
      return 'W'
    case 'W':
      return 'E'
  }
}

function flowDir(flow: UnitFlowDirs): FlowDir | null {
  if (flow.outDir) return flow.outDir
  if (flow.inDir) return oppositeDir(flow.inDir)
  return null
}

function arrowHead(tipX: number, tipY: number, dir: FlowDir, size = 10): string {
  switch (dir) {
    case 'E':
      return `${tipX},${tipY} ${tipX - size},${tipY - size * 0.55} ${tipX - size},${tipY + size * 0.55}`
    case 'W':
      return `${tipX},${tipY} ${tipX + size},${tipY - size * 0.55} ${tipX + size},${tipY + size * 0.55}`
    case 'S':
      return `${tipX},${tipY} ${tipX - size * 0.55},${tipY - size} ${tipX + size * 0.55},${tipY - size}`
    case 'N':
      return `${tipX},${tipY} ${tipX - size * 0.55},${tipY + size} ${tipX + size * 0.55},${tipY + size}`
  }
}

function straightLineCoords(dir: FlowDir): { x1: number; y1: number; x2: number; y2: number } {
  const tip = EDGE[dir]
  switch (dir) {
    case 'E':
      return { x1: 22, y1: tip.y, x2: tip.x - 11, y2: tip.y }
    case 'W':
      return { x1: 78, y1: tip.y, x2: tip.x + 11, y2: tip.y }
    case 'S':
      return { x1: tip.x, y1: 22, x2: tip.x, y2: tip.y - 11 }
    case 'N':
      return { x1: tip.x, y1: 78, x2: tip.x, y2: tip.y + 11 }
  }
}

/** 직선 화살표 전체 — 몸통 + 촉 (회전 유닛처럼 한 path에 네온) */
const STRAIGHT_ARROW_PATH: Record<FlowDir, string> = {
  E: 'M 22,50 L 75,50 M 75,44 L 86,50 L 75,56',
  W: 'M 78,50 L 25,50 M 25,44 L 14,50 L 25,56',
  S: 'M 50,22 L 50,75 M 44,75 L 50,86 L 56,75',
  N: 'M 50,78 L 50,25 M 44,25 L 50,14 L 56,25',
}

interface MinimapFlowArrowProps {
  unitType: ConveyorType
  flow: UnitFlowDirs
  rotation: Rotation
  unitName?: string
  showUnitName?: boolean
  cellSize?: number
  hasMaterial: boolean
  filterId: string
}

function NeonFilter({ id }: { id: string }) {
  const haloId = `${id}-halo`
  return (
    <defs>
      <filter id={haloId} x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="5" result="b1" />
        <feGaussianBlur stdDeviation="10" result="b2" />
        <feGaussianBlur stdDeviation="16" result="b3" />
        <feMerge>
          <feMergeNode in="b3" />
          <feMergeNode in="b2" />
          <feMergeNode in="b1" />
        </feMerge>
      </filter>
      <filter id={id} x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="2.5" result="b1" />
        <feGaussianBlur stdDeviation="5" result="b2" />
        <feGaussianBlur stdDeviation="8" result="b3" />
        <feMerge>
          <feMergeNode in="b3" />
          <feMergeNode in="b2" />
          <feMergeNode in="b1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

function neonHaloId(filterId: string): string {
  return `${filterId}-halo`
}

function FlowSvg({
  filterId,
  hasMaterial,
  children,
}: {
  filterId: string
  hasMaterial: boolean
  children: ReactNode
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`pointer-events-none absolute inset-0 z-[5] h-full w-full ${
        hasMaterial ? 'minimap-flow-neon' : ''
      }`}
      aria-hidden
    >
      {hasMaterial ? <NeonFilter id={filterId} /> : null}
      {children}
    </svg>
  )
}

function FlowLine({
  x1,
  y1,
  x2,
  y2,
  hasMaterial,
  filterId,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  hasMaterial: boolean
  filterId: string
}) {
  return (
    <>
      {hasMaterial ? (
        <>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={NEON.outer}
            strokeWidth={20}
            strokeLinecap="round"
            opacity={0.5}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={NEON.glow}
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.9}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={NEON.hot}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray="8 4"
            opacity={0.85}
            filter={`url(#${filterId})`}
            className="minimap-neon-flow"
          />
        </>
      ) : null}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#ffffff"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.35}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#38bdf8"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </>
  )
}

function FlowPath({
  d,
  hasMaterial,
  filterId,
}: {
  d: string
  hasMaterial: boolean
  filterId: string
}) {
  return (
    <>
      {hasMaterial ? (
        <>
          <path
            d={d}
            fill="none"
            stroke={NEON.outer}
            strokeWidth={20}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <path
            d={d}
            fill="none"
            stroke={NEON.glow}
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
          <path
            d={d}
            fill="none"
            stroke={NEON.hot}
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="8 4"
            opacity={0.85}
            filter={`url(#${filterId})`}
            className="minimap-neon-flow"
          />
        </>
      ) : null}
      <path
        d={d}
        fill="none"
        stroke="#ffffff"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.35}
      />
      <path
        d={d}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

function FlowHead({
  tipX,
  tipY,
  dir,
  hasMaterial,
  filterId,
}: {
  tipX: number
  tipY: number
  dir: FlowDir
  hasMaterial: boolean
  filterId: string
}) {
  return (
    <>
      {hasMaterial ? (
        <>
          <polygon
            points={arrowHead(tipX, tipY, dir, 16)}
            fill={NEON.outer}
            opacity={0.45}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <polygon
            points={arrowHead(tipX, tipY, dir, 14)}
            fill={NEON.glow}
            opacity={0.9}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
          <polygon
            points={arrowHead(tipX, tipY, dir, 12)}
            fill={NEON.hot}
            opacity={0.85}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </>
      ) : null}
      <polygon
        points={arrowHead(tipX, tipY, dir, 11)}
        fill="#ffffff"
        stroke="#0284c7"
        strokeWidth={1}
      />
    </>
  )
}

function StraightFlowArrow({
  dir,
  hasMaterial,
  filterId,
}: {
  dir: FlowDir
  hasMaterial: boolean
  filterId: string
}) {
  if (hasMaterial) {
    return <FlowPath d={STRAIGHT_ARROW_PATH[dir]} hasMaterial filterId={filterId} />
  }

  const { x1, y1, x2, y2 } = straightLineCoords(dir)
  const tip = EDGE[dir]

  return (
    <g>
      <FlowLine x1={x1} y1={y1} x2={x2} y2={y2} hasMaterial={false} filterId={filterId} />
      <FlowHead tipX={tip.x} tipY={tip.y} dir={dir} hasMaterial={false} filterId={filterId} />
    </g>
  )
}

function TurnFlowArrow({
  flow,
  hasMaterial,
  filterId,
}: {
  flow: UnitFlowDirs
  hasMaterial: boolean
  filterId: string
}) {
  const { inDir, outDir } = flow

  if (inDir && outDir) {
    const pathInfo = buildTurnFlowPath(inDir, outDir)
    if (pathInfo) {
      if (hasMaterial) {
        const neonPath = buildTurnFlowPathFull(inDir, outDir)
        if (neonPath) {
          return <FlowPath d={neonPath} hasMaterial filterId={filterId} />
        }
      }

      return (
        <g>
          <FlowPath d={pathInfo.d} hasMaterial={false} filterId={filterId} />
          <FlowHead
            tipX={pathInfo.tip.x}
            tipY={pathInfo.tip.y}
            dir={pathInfo.outDir}
            hasMaterial={false}
            filterId={filterId}
          />
        </g>
      )
    }
  }

  const fallbackDir = outDir ?? (inDir ? oppositeDir(inDir) : null)
  if (!fallbackDir) return null

  return (
    <StraightFlowArrow
      dir={fallbackDir}
      hasMaterial={hasMaterial}
      filterId={filterId}
    />
  )
}

/** 포트 전용 — 방향 삼각형 + 이름 (CV 화살표와 별도) */
const PORT_DIRECTION_TRIANGLE: Record<FlowDir, string> = {
  E: 'M 50,0 L 100,50 L 50,100 Z',
  W: 'M 50,0 L 0,50 L 50,100 Z',
  N: 'M 0,50 L 50,0 L 100,50 Z',
  S: 'M 0,50 L 50,100 L 100,50 Z',
}

function portNameHalfStyle(dir: FlowDir): CSSProperties {
  switch (dir) {
    case 'E':
      return { left: 0, top: 0, width: '50%', height: '100%' }
    case 'W':
      return { right: 0, top: 0, width: '50%', height: '100%' }
    case 'N':
      return { left: 0, bottom: 0, width: '100%', height: '50%' }
    case 'S':
      return { left: 0, top: 0, width: '100%', height: '50%' }
  }
}

function PortNameHalf({
  dir,
  unitName,
  cellSize,
}: {
  dir: FlowDir
  unitName: string
  cellSize: number
}) {
  const { displayName, fontSize, vertical } = pickMinimapPortName(
    minimapPortNameHalfInner(cellSize, dir),
    unitName,
    dir,
  )
  if (!displayName || fontSize <= 0) return null

  return (
    <div
      className="pointer-events-none absolute z-[6] flex flex-col items-center justify-center overflow-hidden px-0.5 text-center font-bold text-white"
      style={{
        ...portNameHalfStyle(dir),
        fontSize,
        lineHeight: vertical ? 1 : LABEL_LINE_HEIGHT,
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}
    >
      {vertical ? (
        [...displayName].map((char, index) => (
          <span key={index} className="block leading-none">
            {char}
          </span>
        ))
      ) : (
        <span className="block max-w-full truncate leading-none">{displayName}</span>
      )}
    </div>
  )
}

function PortTriangleHalf({
  dir,
  flow,
  hasMaterial,
  filterId,
}: {
  dir: FlowDir
  flow: UnitFlowDirs
  hasMaterial: boolean
  filterId: string
}) {
  const triangle = PORT_DIRECTION_TRIANGLE[dir]
  const fill = flow.portDirection === 'OUT' ? '#1d4ed8' : '#b45309'

  return (
    <>
      {dir === 'E' || dir === 'W' ? (
        <line x1={50} y1={0} x2={50} y2={100} stroke="#ffffff" strokeWidth={0.5} opacity={0.15} />
      ) : (
        <line x1={0} y1={50} x2={100} y2={50} stroke="#ffffff" strokeWidth={0.5} opacity={0.15} />
      )}
      {hasMaterial ? (
        <>
          <path
            d={triangle}
            fill={NEON.outer}
            opacity={0.45}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <path
            d={triangle}
            fill={NEON.glow}
            opacity={0.35}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </>
      ) : null}
      <path d={triangle} fill={fill} opacity={0.88} />
      <path d={triangle} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.35} />
    </>
  )
}

function MinimapPortFlow({
  flow,
  unitName,
  showUnitName = true,
  cellSize,
  hasMaterial,
  filterId,
}: {
  flow: UnitFlowDirs
  unitName: string
  showUnitName?: boolean
  cellSize: number
  hasMaterial: boolean
  filterId: string
}) {
  const dir = flowDir(flow)
  if (!dir) return null

  const neonId = hasMaterial ? filterId : 'neon'

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        hasMaterial ? 'minimap-flow-neon' : ''
      }`}
      aria-hidden
    >
      <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
        <PortTriangleHalf dir={dir} flow={flow} hasMaterial={hasMaterial} filterId={neonId} />
      </FlowSvg>
      <PortNameHalf
        dir={dir}
        unitName={showUnitName ? unitName : ''}
        cellSize={cellSize}
      />
    </div>
  )
}

/** 포트 — 적재창고 미연결 등 flow 없을 때 */
export function MinimapPortFallback({
  unit,
  cellSize,
  showName = true,
}: {
  unit: ConveyorUnit
  cellSize: number
  showName?: boolean
}) {
  if (!showName) return null

  const displayName = portDisplayName(unit.name)
  const { fontSize } = pickMinimapLabelLines(minimapInnerSize(cellSize, 1, 1), [displayName])
  if (!displayName || fontSize <= 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center overflow-hidden px-0.5 text-center font-bold text-white"
      style={{
        fontSize,
        lineHeight: LABEL_LINE_HEIGHT,
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}
      aria-hidden
    >
      <span className="block max-w-full truncate leading-none">{displayName}</span>
    </div>
  )
}

export function MinimapStorageLabel({
  name,
  cellSize,
  footprintCols,
  footprintRows,
}: {
  name: string
  cellSize: number
  footprintCols: number
  footprintRows: number
}) {
  const { lines, fontSize } = pickMinimapLabelLines(
    minimapInnerSize(cellSize, footprintCols, footprintRows),
    [name],
  )
  if (lines.length === 0 || fontSize <= 0) return null

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-[6] flex flex-col items-center justify-center overflow-hidden px-1 text-center font-bold text-white"
      style={{
        width: footprintCols * cellSize,
        height: footprintRows * cellSize,
        fontSize,
        lineHeight: LABEL_LINE_HEIGHT,
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}
      aria-hidden
    >
      {lines.map((line, index) => (
        <span key={index} className="block max-w-full truncate leading-none">
          {line}
        </span>
      ))}
    </div>
  )
}

export function MinimapFlowArrow({
  unitType,
  flow,
  rotation: _rotation,
  unitName = '',
  showUnitName = true,
  cellSize = 40,
  hasMaterial,
  filterId,
}: MinimapFlowArrowProps) {
  if (unitType === 'port') {
    return (
      <MinimapPortFlow
        flow={flow}
        unitName={unitName}
        showUnitName={showUnitName}
        cellSize={cellSize}
        hasMaterial={hasMaterial}
        filterId={filterId}
      />
    )
  }

  const neonId = hasMaterial ? filterId : 'neon'

  if (flow.role === 'start' && !flow.outDir) {
    return null
  }

  if (flow.role === 'end' && !flow.inDir) {
    return null
  }

  const dir = flowDir(flow)
  if (!dir) return null

  const isTurnLike = unitType === 'turn' || unitType === 'junction'

  return (
    <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
      {isTurnLike ? (
        <TurnFlowArrow
          flow={flow}
          hasMaterial={hasMaterial}
          filterId={neonId}
        />
      ) : (
        <StraightFlowArrow dir={dir} hasMaterial={hasMaterial} filterId={neonId} />
      )}
    </FlowSvg>
  )
}
