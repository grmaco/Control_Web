import type { ConveyorStatus } from '../../types/conveyor'

/**
 * 회전 컨베이어 셀 배경 SVG — 원형 턴테이블 디자인.
 * 원 안에 롤러 바가 배치되고, running 상태에서 전체가 회전합니다.
 *
 * TURN_OPENINGS 기준 개구부:
 *   0   → W(왼), S(아래)
 *   90  → N(위), W(왼)
 *   180 → E(오른), N(위)
 *   270 → S(아래), E(오른)
 */

const S = 100  // 내부 정규화 좌표 크기
const CX = 50
const CY = 50
const R_OUTER = 46   // 바깥 원 반경
const R_INNER = 38   // 롤러 클립 반경
const R_NOTCH = 42   // 개구부 표시 반경

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

/** rotation 기준 개구부 2방향 — 단위 벡터 (SVG 좌표계: y 아래) */
const OPENINGS: Record<number, [[number, number], [number, number]]> = {
  0:   [[-1, 0], [0, 1]],   // W, S
  90:  [[0, -1], [-1, 0]],  // N, W
  180: [[1, 0],  [0, -1]],  // E, N
  270: [[0, 1],  [1, 0]],   // S, E
}

interface TurnConveyorCellProps {
  width: number
  height: number
  status: ConveyorStatus
  rotation?: number
  isRunning?: boolean
  uid: string
  isJunction?: boolean
}

export function TurnConveyorCell({
  width,
  height,
  status,
  rotation = 0,
  isRunning = false,
  uid,
  isJunction = false,
}: TurnConveyorCellProps) {
  const cfg = COLORS[status]

  // 롤러 바 (수직 줄 — 원 안에 클립됨)
  const rollerThickness = 4.5
  const rollerGap = 4
  const rollerStep = rollerThickness + rollerGap
  const rollerPositions: number[] = []
  for (let x = CX - R_INNER + 1; x + rollerThickness <= CX + R_INNER; x += rollerStep) {
    rollerPositions.push(x)
  }

  // 개구부 방향 (노치 표시)
  const openingDirs = OPENINGS[rotation] ?? OPENINGS[0]

  const clipId  = `tc-clip-${uid}`
  const filtId  = `tc-flt-${uid}`
  const gradId  = `tc-grd-${uid}`

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
        {/* 롤러 그라디언트 (위→아래) */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={cfg.rollerHi} stopOpacity="0.8" />
          <stop offset="40%"  stopColor={cfg.roller}   stopOpacity="1" />
          <stop offset="60%"  stopColor={cfg.roller}   stopOpacity="1" />
          <stop offset="100%" stopColor={cfg.rollerHi} stopOpacity="0.7" />
        </linearGradient>

        {/* 원형 클립 */}
        <clipPath id={clipId}>
          <circle cx={CX} cy={CY} r={R_INNER} />
        </clipPath>

        {/* 글로우 필터 */}
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

      {/* 배경 */}
      <rect width={S} height={S} fill={cfg.base} />

      {/* 바깥 원 (링) */}
      <circle
        cx={CX} cy={CY} r={R_OUTER}
        fill={cfg.ringInner}
        stroke={cfg.ring}
        strokeWidth="2.5"
        filter={cfg.glowOp > 0 ? `url(#${filtId})` : undefined}
      />

      {/* 내부 롤러 그룹 (클립 + running 시 회전) */}
      <g clipPath={`url(#${clipId})`}>
        {/* 롤러 내부 배경 */}
        <circle cx={CX} cy={CY} r={R_INNER} fill={cfg.ringInner} />
        <g>
          {/* 롤러 바 */}
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

          {/* 정션: 가로 롤러도 추가 */}
          {isJunction && rollerPositions.map((y, i) => (
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

          {/* Running: 원 중심으로 롤러 그룹 회전 */}
          {isRunning && (
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

      {/* 중심 허브 */}
      <circle cx={CX} cy={CY} r="4.5" fill={cfg.ring} opacity="0.85" />
      <circle cx={CX} cy={CY} r="2"   fill={cfg.base} />

      {/* 개구부 노치 (진입/진출 방향 표시) */}
      {openingDirs.map(([dx, dy], i) => {
        const nx = CX + dx * R_NOTCH
        const ny = CY + dy * R_NOTCH
        // 노치: 원 테두리에 작은 삼각형 화살표
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

      {/* 외곽 프레임 (코너) */}
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

      {/* error 깜박임 */}
      {status === 'error' && (
        <rect width={S} height={S} fill={cfg.glow} opacity="0">
          <animate attributeName="opacity" values="0;0.1;0" dur="1.2s" repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  )
}
