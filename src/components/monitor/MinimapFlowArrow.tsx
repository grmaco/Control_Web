import type { ReactNode } from 'react'
import type { ConveyorType, Rotation } from '../../types/conveyor'
import type { FlowDir, UnitFlowDirs } from '../../utils/flowDirection'
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
  switch (dir) {
    case 'E':
      return { x1: 22, y1: 50, x2: 72, y2: 50 }
    case 'W':
      return { x1: 78, y1: 50, x2: 28, y2: 50 }
    case 'S':
      return { x1: 50, y1: 22, x2: 50, y2: 72 }
    case 'N':
      return { x1: 50, y1: 78, x2: 50, y2: 28 }
  }
}

interface MinimapFlowArrowProps {
  unitType: ConveyorType
  flow: UnitFlowDirs
  rotation: Rotation
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
            fill="none"
            stroke={NEON.outer}
            strokeWidth={3}
            strokeLinejoin="round"
            opacity={0.55}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <polygon
            points={arrowHead(tipX, tipY, dir, 14)}
            fill="none"
            stroke={NEON.glow}
            strokeWidth={3}
            strokeLinejoin="round"
            opacity={0.95}
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
  const { x1, y1, x2, y2 } = straightLineCoords(dir)
  const tip = EDGE[dir]

  return (
    <g>
      <FlowLine x1={x1} y1={y1} x2={x2} y2={y2} hasMaterial={hasMaterial} filterId={filterId} />
      <FlowHead tipX={tip.x} tipY={tip.y} dir={dir} hasMaterial={hasMaterial} filterId={filterId} />
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

export function MinimapFlowArrow({
  unitType,
  flow,
  rotation,
  hasMaterial,
  filterId,
}: MinimapFlowArrowProps) {
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
