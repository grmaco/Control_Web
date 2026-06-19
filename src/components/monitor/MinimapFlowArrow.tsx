import type { CSSProperties, ReactNode } from 'react'
import type { ConveyorType, ConveyorUnit, Rotation } from '../../types/conveyor'
import type { FlowDir, UnitFlowDirs } from '../../utils/flowDirection'
import {
  LABEL_LINE_HEIGHT,
  minimapInnerSize,
  minimapPortNameHalfInner,
  pickMinimapLabelLines,
} from '../../utils/monitorLabel'
import {
  buildTurnArcPath,
  resolveTurnFlowDirs,
  TURN_EDGE,
  turnArcEdge,
} from '../../utils/turnArc'

const EDGE = TURN_EDGE

const NEON = {
  outer: '#06b6d4',
  glow: '#22d3ee',
  hot: '#cffafe',
  badgeGlow: '#4ade80',
  badgeEndGlow: '#f87171',
} as const

const JUNCTION_PATH: Record<string, string> = {
  'S-E': 'M 50,86 L 50,50 L 86,50',
  'E-S': 'M 86,50 L 50,50 L 50,86',
  'S-W': 'M 50,86 L 50,50 L 14,50',
  'W-S': 'M 14,50 L 50,50 L 50,86',
  'N-E': 'M 50,14 L 50,50 L 86,50',
  'E-N': 'M 86,50 L 50,50 L 50,14',
  'N-W': 'M 50,14 L 50,50 L 14,50',
  'W-N': 'M 14,50 L 50,50 L 50,14',
}

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

function StartBadge({ hasMaterial, filterId }: { hasMaterial: boolean; filterId: string }) {
  return (
    <g>
      {hasMaterial ? (
        <>
          <rect
            x="10"
            y="28"
            width="80"
            height="44"
            rx="9"
            fill="none"
            stroke={NEON.badgeGlow}
            strokeWidth={6}
            opacity={0.45}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <rect
            x="14"
            y="32"
            width="72"
            height="36"
            rx="7"
            fill="none"
            stroke={NEON.badgeGlow}
            strokeWidth={4}
            opacity={0.95}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </>
      ) : null}
      <rect
        x="18"
        y="36"
        width="64"
        height="28"
        rx="5"
        fill="#16a34a"
        stroke="#fff"
        strokeWidth={1.5}
      />
      <text x="50" y="55" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff">
        시작
      </text>
    </g>
  )
}

function EndBadge({ hasMaterial, filterId }: { hasMaterial: boolean; filterId: string }) {
  return (
    <g>
      {hasMaterial ? (
        <>
          <rect
            x="10"
            y="28"
            width="80"
            height="44"
            rx="9"
            fill="none"
            stroke={NEON.badgeEndGlow}
            strokeWidth={6}
            opacity={0.45}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <rect
            x="14"
            y="32"
            width="72"
            height="36"
            rx="7"
            fill="none"
            stroke={NEON.badgeEndGlow}
            strokeWidth={4}
            opacity={0.95}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </>
      ) : null}
      <rect
        x="18"
        y="36"
        width="64"
        height="28"
        rx="5"
        fill="#dc2626"
        stroke="#fff"
        strokeWidth={1.5}
      />
      <text x="50" y="55" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff">
        종료
      </text>
    </g>
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
  rotation,
  hasMaterial,
  filterId,
}: {
  flow: UnitFlowDirs
  rotation: Rotation
  hasMaterial: boolean
  filterId: string
}) {
  const dirs = resolveTurnFlowDirs(flow.inDir, flow.outDir, rotation)
  if (!dirs) return null

  const arc = buildTurnArcPath(dirs.inDir, dirs.outDir)
  const tipInfo = turnArcEdge(dirs.inDir, dirs.outDir)
  if (!arc || !tipInfo) return null

  return (
    <g>
      <FlowPath d={arc} hasMaterial={hasMaterial} filterId={filterId} />
      <FlowHead
        tipX={tipInfo.tip.x}
        tipY={tipInfo.tip.y}
        dir={tipInfo.outDir}
        hasMaterial={hasMaterial}
        filterId={filterId}
      />
    </g>
  )
}

function JunctionFlowArrow({
  flow,
  hasMaterial,
  filterId,
}: {
  flow: UnitFlowDirs
  hasMaterial: boolean
  filterId: string
}) {
  if (!flow.inDir || !flow.outDir) return null
  const path = JUNCTION_PATH[`${flow.inDir}-${flow.outDir}`]
  if (!path) return null

  const tip = EDGE[flow.outDir]

  return (
    <g>
      <FlowPath d={path} hasMaterial={hasMaterial} filterId={filterId} />
      <FlowHead
        tipX={tip.x}
        tipY={tip.y}
        dir={flow.outDir}
        hasMaterial={hasMaterial}
        filterId={filterId}
      />
    </g>
  )
}

/** 포트 전용 — 방향 삼각형 + IN/OUT·이름 (CV 화살표와 별도) */
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

function portLabelCandidates(unitName: string, direction: string): string[] {
  return [direction, unitName]
}

function PortNameHalf({
  dir,
  lines,
  fontSize,
}: {
  dir: FlowDir
  lines: string[]
  fontSize: number
}) {
  if (lines.length === 0 || fontSize <= 0) return null

  return (
    <div
      className="pointer-events-none absolute z-[6] flex flex-col items-center justify-center overflow-hidden px-0.5 text-center font-bold text-white"
      style={{
        ...portNameHalfStyle(dir),
        fontSize,
        lineHeight: LABEL_LINE_HEIGHT,
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}
    >
      {lines.map((line, index) => (
        <span key={index} className="block max-w-full truncate leading-none">
          {line}
        </span>
      ))}
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
  cellSize,
  hasMaterial,
  filterId,
}: {
  flow: UnitFlowDirs
  unitName: string
  cellSize: number
  hasMaterial: boolean
  filterId: string
}) {
  const dir = flowDir(flow)
  if (!dir) return null

  const neonId = hasMaterial ? filterId : 'neon'
  const direction = flow.portDirection ?? 'IN'
  const { lines, fontSize } = pickMinimapLabelLines(
    minimapPortNameHalfInner(cellSize, dir),
    portLabelCandidates(unitName, direction),
  )

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
      <PortNameHalf dir={dir} lines={lines} fontSize={fontSize} />
    </div>
  )
}

/** 포트 — 적재창고 미연결 등 flow 없을 때 */
export function MinimapPortFallback({
  unit,
  cellSize,
}: {
  unit: ConveyorUnit
  cellSize: number
}) {
  const direction = unit.portDirection ?? 'IN'
  const { lines, fontSize } = pickMinimapLabelLines(
    minimapInnerSize(cellSize, 1, 1),
    portLabelCandidates(unit.name, direction),
  )
  if (lines.length === 0 || fontSize <= 0) return null

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
      {lines.map((line, index) => (
        <span key={index} className="block max-w-full truncate leading-none">
          {line}
        </span>
      ))}
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
  rotation,
  unitName = '',
  cellSize = 40,
  hasMaterial,
  filterId,
}: MinimapFlowArrowProps) {
  if (unitType === 'port') {
    return (
      <MinimapPortFlow
        flow={flow}
        unitName={unitName}
        cellSize={cellSize}
        hasMaterial={hasMaterial}
        filterId={filterId}
      />
    )
  }

  const neonId = hasMaterial ? filterId : 'neon'

  if (flow.role === 'start') {
    return (
      <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
        <StartBadge hasMaterial={hasMaterial} filterId={neonId} />
      </FlowSvg>
    )
  }

  if (flow.role === 'end') {
    return (
      <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
        <EndBadge hasMaterial={hasMaterial} filterId={neonId} />
      </FlowSvg>
    )
  }

  const dir = flowDir(flow)
  if (!dir) return null

  return (
    <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
      {unitType === 'turn' ? (
        <TurnFlowArrow
          flow={flow}
          rotation={rotation}
          hasMaterial={hasMaterial}
          filterId={neonId}
        />
      ) : unitType === 'junction' ? (
        <JunctionFlowArrow flow={flow} hasMaterial={hasMaterial} filterId={neonId} />
      ) : (
        <StraightFlowArrow dir={dir} hasMaterial={hasMaterial} filterId={neonId} />
      )}
    </FlowSvg>
  )
}
