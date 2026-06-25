import type { ConveyorStatus } from '../../types/conveyor'
import { oppositeFlowDir, unitTravelDir, type FlowDir } from '../../utils/flowDirection'
import { isValidTurnThrough, turnFlowRotationSign } from '../../utils/turnArc'

/**
 * 회전 컨베이어 셀 배경 SVG — 원형 턴테이블 디자인.
 * running 시 물류 화살표(inDir→outDir)와 같은 방향으로 롤러 모션.
 */

const S = 100
const CX = 50
const CY = 50
const R_OUTER = 46
const R_INNER = 38
const R_NOTCH = 42

const COLORS = {
  idle: {
    base: '#0c1520', ring: '#1e3a50', ringInner: '#0f1e30',
    roller: '#1e3348', rollerHi: '#2e4a68',
    notch: '#2e4a68', glow: 'none', glowOp: 0,
  },
  running: {
    base: '#011a0d', ring: '#10b981', ringInner: '#032914',
    roller: '#065f35', rollerHi: '#10b981',
    notch: '#10b981', glow: '#10b981', glowOp: 0.6,
  },
  error: {
    base: '#1a0505', ring: '#ef4444', ringInner: '#300a0a',
    roller: '#7f1d1d', rollerHi: '#ef4444',
    notch: '#ef4444', glow: '#ef4444', glowOp: 0.65,
  },
  maintenance: {
    base: '#140d00', ring: '#fbbf24', ringInner: '#2a1800',
    roller: '#78350f', rollerHi: '#fbbf24',
    notch: '#fbbf24', glow: '#f59e0b', glowOp: 0.5,
  },
}

/** rotation 기준 개구부 — flow 없을 때 폴백 */
const OPENINGS: Record<number, [[number, number], [number, number]]> = {
  0: [[-1, 0], [0, 1]],
  90: [[0, -1], [-1, 0]],
  180: [[1, 0], [0, -1]],
  270: [[0, 1], [1, 0]],
}

const DIR_VEC: Record<FlowDir, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
}

type MotionKind = 'arc' | 'linear' | 'default'

interface ResolvedMotion {
  kind: MotionKind
  rotateSign?: 1 | -1
  travelDir?: FlowDir
}

function resolveTurnMotion(
  flowInDir?: FlowDir | null,
  flowOutDir?: FlowDir | null,
): ResolvedMotion {
  if (flowInDir && flowOutDir) {
    const sign = turnFlowRotationSign(flowInDir, flowOutDir)
    if (sign != null) return { kind: 'arc', rotateSign: sign }
    if (isValidTurnThrough(flowInDir, flowOutDir)) {
      return { kind: 'linear', travelDir: flowOutDir }
    }
  }

  const travelDir = unitTravelDir({
    inDir: flowInDir ?? null,
    outDir: flowOutDir ?? null,
  })
  if (travelDir) return { kind: 'linear', travelDir }

  return { kind: 'default' }
}

function linearRollAnim(travelDir: FlowDir, step: number): { from: string; to: string } {
  switch (travelDir) {
    case 'E':
      return { from: `${-step} 0`, to: '0 0' }
    case 'W':
      return { from: `${step} 0`, to: '0 0' }
    case 'S':
      return { from: `0 ${-step}`, to: '0 0' }
    case 'N':
      return { from: `0 ${step}`, to: '0 0' }
  }
}

function resolveOpeningDirs(
  rotation: number,
  flowInDir?: FlowDir | null,
  flowOutDir?: FlowDir | null,
): [[number, number], [number, number]] {
  if (flowInDir && flowOutDir) {
    return [DIR_VEC[flowInDir], DIR_VEC[flowOutDir]]
  }
  if (flowInDir) {
    return [DIR_VEC[flowInDir], DIR_VEC[oppositeFlowDir(flowInDir)]]
  }
  return OPENINGS[rotation] ?? OPENINGS[0]
}

interface TurnConveyorCellProps {
  width: number
  height: number
  status: ConveyorStatus
  rotation?: number
  /** 물류 화살표 방향 — 있으면 롤러 모션이 화살표와 일치 */
  flowInDir?: FlowDir | null
  flowOutDir?: FlowDir | null
  isRunning?: boolean
  uid: string
  isJunction?: boolean
}

export function TurnConveyorCell({
  width,
  height,
  status,
  rotation = 0,
  flowInDir = null,
  flowOutDir = null,
  isRunning = false,
  uid,
  isJunction = false,
}: TurnConveyorCellProps) {
  const cfg = COLORS[status]
  const motion = resolveTurnMotion(flowInDir, flowOutDir)
  const openingDirs = resolveOpeningDirs(rotation, flowInDir, flowOutDir)

  const rollerThickness = 4.5
  const rollerGap = 4
  const rollerStep = rollerThickness + rollerGap
  const rollerPositions: number[] = []
  for (let x = CX - R_INNER + 1; x + rollerThickness <= CX + R_INNER; x += rollerStep) {
    rollerPositions.push(x)
  }

  const linearAnim =
    motion.kind === 'linear' && motion.travelDir
      ? linearRollAnim(motion.travelDir, rollerStep)
      : null

  const clipId = `tc-clip-${uid}`
  const filtId = `tc-flt-${uid}`
  const gradId = `tc-grd-${uid}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${S} ${S}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.rollerHi} stopOpacity="0.8" />
          <stop offset="40%" stopColor={cfg.roller} stopOpacity="1" />
          <stop offset="60%" stopColor={cfg.roller} stopOpacity="1" />
          <stop offset="100%" stopColor={cfg.rollerHi} stopOpacity="0.7" />
        </linearGradient>

        <clipPath id={clipId}>
          <circle cx={CX} cy={CY} r={R_INNER} />
        </clipPath>

        {cfg.glowOp > 0 && (
          <filter id={filtId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feFlood floodColor={cfg.glow} floodOpacity={cfg.glowOp} result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <rect width={S} height={S} fill={cfg.base} />

      <circle
        cx={CX}
        cy={CY}
        r={R_OUTER}
        fill={cfg.ringInner}
        stroke={cfg.ring}
        strokeWidth="2.5"
        filter={cfg.glowOp > 0 ? `url(#${filtId})` : undefined}
      />

      <g clipPath={`url(#${clipId})`}>
        <circle cx={CX} cy={CY} r={R_INNER} fill={cfg.ringInner} />
        <g>
          {rollerPositions.map((x, i) => (
            <rect
              key={i}
              x={x}
              y={CY - R_INNER}
              width={rollerThickness}
              height={R_INNER * 2}
              fill={`url(#${gradId})`}
              rx="0.8"
            />
          ))}

          {isJunction &&
            rollerPositions.map((y, i) => (
              <rect
                key={`h${i}`}
                x={CX - R_INNER}
                y={y}
                width={R_INNER * 2}
                height={rollerThickness}
                fill={`url(#${gradId})`}
                rx="0.8"
                opacity="0.6"
              />
            ))}

          {isRunning && motion.kind === 'arc' && motion.rotateSign != null && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${CX} ${CY}`}
              to={`${motion.rotateSign * 360} ${CX} ${CY}`}
              dur="1.8s"
              repeatCount="indefinite"
            />
          )}

          {isRunning && motion.kind === 'linear' && linearAnim && (
            <animateTransform
              attributeName="transform"
              type="translate"
              from={linearAnim.from}
              to={linearAnim.to}
              dur="0.6s"
              repeatCount="indefinite"
            />
          )}

          {isRunning && motion.kind === 'default' && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${CX} ${CY}`}
              to={`360 ${CX} ${CY}`}
              dur="1.8s"
              repeatCount="indefinite"
            />
          )}
        </g>
      </g>

      <circle cx={CX} cy={CY} r="4.5" fill={cfg.ring} opacity="0.85" />
      <circle cx={CX} cy={CY} r="2" fill={cfg.base} />

      {openingDirs.map(([dx, dy], i) => {
        const nx = CX + dx * R_NOTCH
        const ny = CY + dy * R_NOTCH
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        return (
          <g key={i} transform={`rotate(${angle} ${nx} ${ny})`}>
            <polygon
              points={`${nx + 6},${ny}  ${nx - 3},${ny - 4}  ${nx - 3},${ny + 4}`}
              fill={cfg.notch}
              opacity="0.95"
              filter={cfg.glowOp > 0 ? `url(#${filtId})` : undefined}
            />
          </g>
        )
      })}

      {([
        [1.5, 1.5, 10, 1.5, 1.5, 10],
        [S - 10, 1.5, S - 1.5, 1.5, S - 1.5, 10],
        [1.5, S - 10, 1.5, S - 1.5, 10, S - 1.5],
        [S - 1.5, S - 10, S - 1.5, S - 1.5, S - 10, S - 1.5],
      ] as [number, number, number, number, number, number][]).map(([x1, y1, x2, y2, x3, y3], i) => (
        <polyline
          key={i}
          points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
          fill="none"
          stroke={cfg.ring}
          strokeWidth="1.2"
          strokeOpacity="0.6"
          strokeLinecap="square"
        />
      ))}

      {status === 'error' && (
        <rect width={S} height={S} fill={cfg.glow} opacity="0">
          <animate attributeName="opacity" values="0;0.1;0" dur="1.2s" repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  )
}
