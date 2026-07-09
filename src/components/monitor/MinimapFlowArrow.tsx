import type { ReactNode } from 'react'
import type { ConveyorType, ConveyorUnit, Rotation } from '../../types/conveyor'
import type { FlowDir, UnitFlowDirs } from '../../utils/flowDirection'
import {
  LABEL_LINE_HEIGHT,
  minimapInnerSize,
  minimapPortNameBandHeight,
  pickMinimapLabelLines,
  pickMinimapPortName,
} from '../../utils/monitorLabel'
import {
  buildJunctionElbowPath,
  buildJunctionElbowPathFull,
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

/** 포트 홀로 방향 — outDir 우선, 없으면 inDir 역방향 */
function portHoloDir(flow: UnitFlowDirs): FlowDir | null {
  return flow.outDir ?? (flow.inDir ? oppositeDir(flow.inDir) : null)
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

function JunctionFlowArrow({
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
    const pathInfo = buildJunctionElbowPath(inDir, outDir)
    if (pathInfo) {
      if (hasMaterial) {
        const neonPath = buildJunctionElbowPathFull(inDir, outDir)
        if (neonPath) {
          return <FlowPath d={neonPath} hasMaterial filterId={filterId} />
        }
        return <FlowPath d={pathInfo.d} hasMaterial filterId={filterId} />
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

  return (
    <TurnFlowArrow flow={flow} hasMaterial={hasMaterial} filterId={filterId} />
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
        return <FlowPath d={pathInfo.d} hasMaterial filterId={filterId} />
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

/** 포트 — 프로토스 홀로그램 방향 삼각형 + 하단 가로 이름 */
const PORT_HOLO = {
  IN: {
    glow: '#fcd34d',
    line: '#fef3c7',
    core: '#fffef8',
    beam: '#fbbf24',
    fill: 'rgba(251,191,36,0.1)',
    fillInner: 'rgba(254,240,138,0.16)',
    ring: 'rgba(251,191,36,0.35)',
  },
  OUT: {
    glow: '#67e8f9',
    line: '#cffafe',
    core: '#f0fdff',
    beam: '#22d3ee',
    fill: 'rgba(34,211,238,0.09)',
    fillInner: 'rgba(125,211,252,0.14)',
    ring: 'rgba(34,211,238,0.38)',
  },
} as const

interface PortHoloGraphic {
  outer: string
  inner: string
  spine: string
  base: string
  ring: string
  arc: string
  scans: string
  tipX: number
  tipY: number
}

/** tip = dir 방향(좁은 점), base = 반대쪽(넓은 변) */
function buildPortHoloGraphic(dir: FlowDir): PortHoloGraphic {
  const cy = 34
  switch (dir) {
    case 'E':
      return {
        outer: `M 74,${cy} L 36,${cy - 16} L 36,${cy + 16} Z`,
        inner: `M 66,${cy} L 42,${cy - 10} L 42,${cy + 10} Z`,
        spine: `M 36,${cy} L 74,${cy}`,
        base: `M 36,${cy - 12} L 36,${cy + 12}`,
        ring: `M 50,${cy - 22} A 22,22 0 1,1 49.9,${cy - 22}`,
        arc: `M 28,${cy - 20} A 24,24 0 0,1 28,${cy + 20}`,
        scans: `M 44,${cy - 6} L 68,${cy - 6} M 44,${cy} L 64,${cy} M 44,${cy + 6} L 60,${cy + 6}`,
        tipX: 74,
        tipY: cy,
      }
    case 'W':
      return {
        outer: `M 26,${cy} L 64,${cy - 16} L 64,${cy + 16} Z`,
        inner: `M 34,${cy} L 58,${cy - 10} L 58,${cy + 10} Z`,
        spine: `M 64,${cy} L 26,${cy}`,
        base: `M 64,${cy - 12} L 64,${cy + 12}`,
        ring: `M 50,${cy - 22} A 22,22 0 1,1 49.9,${cy - 22}`,
        arc: `M 72,${cy - 20} A 24,24 0 0,0 72,${cy + 20}`,
        scans: `M 56,${cy - 6} L 32,${cy - 6} M 56,${cy} L 36,${cy} M 56,${cy + 6} L 40,${cy + 6}`,
        tipX: 26,
        tipY: cy,
      }
    case 'N':
      return {
        outer: `M 50,18 L 34,${cy + 14} L 66,${cy + 14} Z`,
        inner: `M 50,26 L 38,${cy + 6} L 62,${cy + 6} Z`,
        spine: `M 50,${cy + 14} L 50,18`,
        base: `M 38,${cy + 14} L 62,${cy + 14}`,
        ring: `M 50,${cy - 8} A 20,20 0 1,1 49.9,${cy - 8}`,
        arc: `M 30,${cy + 8} A 22,22 0 0,1 70,${cy + 8}`,
        scans: `M 42,${cy + 2} L 42,24 M 50,${cy + 2} L 50,26 M 58,${cy + 2} L 58,28`,
        tipX: 50,
        tipY: 18,
      }
    case 'S':
      return {
        outer: `M 50,${cy + 20} L 34,${cy - 4} L 66,${cy - 4} Z`,
        inner: `M 50,${cy + 12} L 38,${cy} L 62,${cy} Z`,
        spine: `M 50,${cy - 4} L 50,${cy + 20}`,
        base: `M 38,${cy - 4} L 62,${cy - 4}`,
        ring: `M 50,${cy - 2} A 20,20 0 1,1 49.9,${cy - 2}`,
        arc: `M 30,${cy - 8} A 22,22 0 0,0 70,${cy - 8}`,
        scans: `M 42,${cy + 4} L 42,${cy + 16} M 50,${cy + 4} L 50,${cy + 14} M 58,${cy + 4} L 58,${cy + 12}`,
        tipX: 50,
        tipY: cy + 20,
      }
  }
}

function PortHoloDefs({
  id,
  variant,
  tipX,
  tipY,
}: {
  id: string
  variant: 'IN' | 'OUT'
  tipX: number
  tipY: number
}) {
  const c = PORT_HOLO[variant]
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <defs>
      <radialGradient
        id={`${safeId}-tip-glow`}
        cx={tipX}
        cy={tipY}
        r="28"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor={c.core} stopOpacity={0.95} />
        <stop offset="35%" stopColor={c.glow} stopOpacity={0.45} />
        <stop offset="100%" stopColor={c.beam} stopOpacity={0} />
      </radialGradient>
      <linearGradient id={`${safeId}-holo-fill`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={c.core} stopOpacity={0.5} />
        <stop offset="45%" stopColor={c.glow} stopOpacity={0.22} />
        <stop offset="100%" stopColor={c.beam} stopOpacity={0.04} />
      </linearGradient>
      <linearGradient id={`${safeId}-holo-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={c.glow} stopOpacity={0.2} />
        <stop offset="40%" stopColor={c.line} />
        <stop offset="100%" stopColor={c.core} stopOpacity={0.9} />
      </linearGradient>
      <filter id={`${safeId}-holo-bloom`} x="-140%" y="-140%" width="380%" height="380%">
        <feGaussianBlur stdDeviation="2.8" result="b1" />
        <feGaussianBlur stdDeviation="5.5" result="b2" />
        <feGaussianBlur stdDeviation="9" result="b3" />
        <feMerge>
          <feMergeNode in="b3" />
          <feMergeNode in="b2" />
          <feMergeNode in="b1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${safeId}-holo-soft`} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="0.9" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <pattern
        id={`${safeId}-grid`}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 6,0 L 0,0 0,6"
          fill="none"
          stroke={c.glow}
          strokeOpacity={0.08}
          strokeWidth={0.35}
        />
      </pattern>
    </defs>
  )
}

function PortNameOverlay({
  unitName,
  cellSize,
}: {
  unitName: string
  cellSize: number
}) {
  const { displayName, fontSize } = pickMinimapPortName(cellSize, unitName)
  if (!displayName || fontSize <= 0) return null

  const bandHeight = minimapPortNameBandHeight(cellSize)

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] flex items-center justify-center px-1 text-center font-bold text-white"
      style={{
        height: bandHeight,
        fontSize,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        textShadow: '0 0 8px rgba(0,0,0,0.95), 0 0 12px rgba(103,232,249,0.35)',
      }}
    >
      {displayName}
    </div>
  )
}

function PortHoloArrow({
  dir,
  flow,
  hasMaterial,
  filterId,
  gfxId,
}: {
  dir: FlowDir
  flow: UnitFlowDirs
  hasMaterial: boolean
  filterId: string
  gfxId: string
}) {
  const g = buildPortHoloGraphic(dir)
  const variant = flow.portDirection === 'OUT' ? 'OUT' : 'IN'
  const c = PORT_HOLO[variant]
  const safeId = gfxId.replace(/[^a-zA-Z0-9_-]/g, '')

  return (
    <>
      <PortHoloDefs id={gfxId} variant={variant} tipX={g.tipX} tipY={g.tipY} />
      <rect x="4" y="4" width="92" height="52" fill={`url(#${safeId}-grid)`} opacity={0.55} />
      <circle
        cx={g.tipX}
        cy={g.tipY}
        r="26"
        fill={`url(#${safeId}-tip-glow)`}
        opacity={0.7}
      />
      <path
        d={g.ring}
        fill="none"
        stroke={c.ring}
        strokeWidth={0.7}
        strokeDasharray="3 2.5"
        opacity={0.55}
        filter={`url(#${safeId}-holo-bloom)`}
      />
      <path
        d={g.arc}
        fill="none"
        stroke={c.line}
        strokeWidth={0.55}
        strokeOpacity={0.35}
        strokeDasharray="1.5 3"
      />
      <path d={g.outer} fill={c.fill} />
      <path d={g.inner} fill={c.fillInner} />
      <path d={g.outer} fill={`url(#${safeId}-holo-fill)`} opacity={0.9} />
      {hasMaterial ? (
        <g className="minimap-port-triangle-neon">
          <path
            d={g.outer}
            fill={NEON.outer}
            opacity={0.1}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <path
            d={g.outer}
            fill="none"
            stroke={NEON.outer}
            strokeWidth={8}
            strokeLinejoin="round"
            opacity={0.38}
            filter={`url(#${neonHaloId(filterId)})`}
            className="minimap-neon-halo"
          />
          <path
            d={g.outer}
            fill="none"
            stroke={NEON.glow}
            strokeWidth={4.5}
            strokeLinejoin="round"
            opacity={0.62}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </g>
      ) : null}
      <path
        d={g.scans}
        fill="none"
        stroke={c.line}
        strokeWidth={0.45}
        strokeOpacity={0.4}
        strokeLinecap="round"
      />
      <path
        d={g.outer}
        fill="none"
        stroke={c.glow}
        strokeWidth={2.8}
        strokeOpacity={0.22}
        strokeLinejoin="round"
        filter={`url(#${safeId}-holo-bloom)`}
      />
      <path
        d={g.outer}
        fill="none"
        stroke={`url(#${safeId}-holo-stroke)`}
        strokeWidth={1.15}
        strokeLinejoin="round"
        filter={`url(#${safeId}-holo-soft)`}
      />
      <path
        d={g.inner}
        fill="none"
        stroke={c.core}
        strokeWidth={0.7}
        strokeOpacity={0.8}
        strokeLinejoin="round"
      />
      <path
        d={g.spine}
        fill="none"
        stroke={c.beam}
        strokeWidth={1.1}
        strokeOpacity={0.75}
        strokeLinecap="round"
        filter={`url(#${safeId}-holo-bloom)`}
      />
      <path
        d={g.base}
        fill="none"
        stroke={c.glow}
        strokeWidth={1.4}
        strokeOpacity={0.45}
        strokeLinecap="round"
        filter={`url(#${safeId}-holo-soft)`}
      />
      <circle cx={g.tipX} cy={g.tipY} r="2.2" fill={c.core} filter={`url(#${safeId}-holo-bloom)`} />
      {hasMaterial ? (
        <>
          <path
            d={g.outer}
            fill="none"
            stroke={NEON.hot}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeDasharray="5 3"
            opacity={0.72}
            filter={`url(#${filterId})`}
            className="minimap-neon-flow"
          />
          <circle
            cx={g.tipX}
            cy={g.tipY}
            r="3.5"
            fill={NEON.glow}
            opacity={0.45}
            filter={`url(#${filterId})`}
            className="minimap-neon-glow"
          />
        </>
      ) : null}
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
  const dir = portHoloDir(flow)
  if (!dir) return null

  const neonId = hasMaterial ? filterId : 'neon'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
        <PortHoloArrow
          dir={dir}
          flow={flow}
          hasMaterial={hasMaterial}
          filterId={neonId}
          gfxId={filterId}
        />
      </FlowSvg>
      <PortNameOverlay unitName={showUnitName ? unitName : ''} cellSize={cellSize} />
    </div>
  )
}

/** 포트 — flow 맵만 있을 때(경로 미포함) 이름 표시 */
export function MinimapPortFallback({
  unit,
  cellSize,
  showName = true,
  flow = null,
  hasMaterial = false,
}: {
  unit: ConveyorUnit
  cellSize: number
  showName?: boolean
  flow?: UnitFlowDirs | null
  hasMaterial?: boolean
}) {
  if (flow && flowDir(flow)) {
    return (
      <MinimapPortFlow
        flow={flow}
        unitName={unit.name}
        showUnitName={showName}
        cellSize={cellSize}
        hasMaterial={hasMaterial}
        filterId={`neon-${unit.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
      />
    )
  }

  // 방향(flow) 없는 단독 포트(STK 반대편에 라인 CV 없음) — 방향 화살표 대신
  // 자재 유무를 은은한 펄스 글로우로 표시 (연동 유닛·프로브 직접 투입 구성)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {hasMaterial && (
        <span
          className="absolute inset-[8%] rounded-md"
          style={{
            boxShadow: '0 0 0 1.5px rgba(34,211,238,0.75), 0 0 14px rgba(34,211,238,0.55)',
            animation: 'port-standalone-material-pulse 1.4s ease-in-out infinite',
          }}
        />
      )}
      {showName ? <PortNameOverlay unitName={unit.name} cellSize={cellSize} /> : null}
      <style>{`
        @keyframes port-standalone-material-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.95; }
        }
      `}</style>
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

  const isTurn = unitType === 'turn'
  const isJunction = unitType === 'junction'

  return (
    <FlowSvg filterId={neonId} hasMaterial={hasMaterial}>
      {isJunction ? (
        <JunctionFlowArrow
          flow={flow}
          hasMaterial={hasMaterial}
          filterId={neonId}
        />
      ) : isTurn ? (
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
