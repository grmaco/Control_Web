import type { OhtDir, OhtRailType } from '../../types/oht'
import type { Rotation } from '../../types/conveyor'
import { ohtRailOpenings } from '../../constants/ohtRail'

interface OhtRailGlyphProps {
  type: OhtRailType
  rotation?: Rotation
  size: number
  /** 개구부별 이웃 연결 여부 — 연결된 방향은 셀 경계까지 실선 강조 */
  connectedDirs?: Set<string>
  /** true: 불투명 강조(선택), false: 반투명 홀로그램 */
  emphasized?: boolean
  color?: string
}

const DIR_POINT: Record<OhtDir, { x: number; y: number }> = {
  N: { x: 0.5, y: 0 },
  E: { x: 1, y: 0.5 },
  S: { x: 0.5, y: 1 },
  W: { x: 0, y: 0.5 },
}

/** 곡선 레일 1/4 원호 sweep (turnArc.ts TURN_SWEEP와 동일 규약, 화면 y↓) */
const CURVE_SWEEP: Record<string, 0 | 1> = {
  'N-E': 0,
  'E-N': 1,
  'N-W': 1,
  'W-N': 0,
  'S-E': 1,
  'E-S': 0,
  'S-W': 0,
  'W-S': 1,
}

/** 두 개구부(수직·수평)를 잇는 부드러운 1/4 원호 path. 실패 시 null */
function curveArcPath(openings: OhtDir[], size: number): string | null {
  if (openings.length !== 2) return null
  const [a, b] = openings
  const sweep = CURVE_SWEEP[`${a}-${b}`]
  if (sweep == null) return null
  const p1 = DIR_POINT[a!]
  const p2 = DIR_POINT[b!]
  const r = size / 2
  return `M ${p1.x * size},${p1.y * size} A ${r},${r} 0 0 ${sweep} ${p2.x * size},${p2.y * size}`
}

/**
 * U-BYPASS 전용 path.
 * 메인 직선 N-S + 우측 반원 루프 (오른쪽 사이딩).
 * doubleU=true 이면 좌측 루프도 추가.
 */
function uBypassPaths(size: number, doubleU: boolean): string[] {
  const cx = 0.5 * size
  const r = 0.28 * size   // 루프 반지름
  const y1 = (0.5 - 0.28) * size  // 루프 상단 접점
  const y2 = (0.5 + 0.28) * size  // 루프 하단 접점

  const rightArc = `M ${cx},${y1} A ${r},${r} 0 0 1 ${cx},${y2}`
  const paths = [
    `M ${cx},0 L ${cx},${size}`,  // 메인 직선
    rightArc,
  ]
  if (doubleU) {
    const leftArc = `M ${cx},${y1} A ${r},${r} 0 0 0 ${cx},${y2}`
    paths.push(leftArc)
  }
  return paths
}

/**
 * OHT 레일 1칸 글리프. 개구부(openings)에서 중심까지 선을 그어 레일을 표현.
 * 홀로그램 점선(기본) / 불투명 실선(강조) 두 가지 모드.
 */
export function OhtRailGlyph({
  type,
  rotation = 0,
  size,
  connectedDirs,
  emphasized = false,
  color = '#22d3ee',
}: OhtRailGlyphProps) {
  const openings = ohtRailOpenings(type, rotation)
  const cx = 0.5 * size
  const cy = 0.5 * size
  const stroke = emphasized ? 2.2 : 1.6
  const baseOpacity = emphasized ? 0.95 : 0.5
  const dashArray = emphasized ? undefined : '3 3'

  const isCurve = type === 'curve90'
  const isUBypass = type === 'uBypass' || type === 'doubleUBypass'

  const arcPath = isCurve ? curveArcPath(openings, size) : null

  // 대형 레일(1900) 시각 표시 — 배경 강조
  const isLarge = type === 'doubleUBypass' || type === 'doubleBranchR' || type === 'doubleBranchL' || type === 'doubleBranch2'

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none"
      aria-hidden
    >
      {/* 1900 대형 레일 배경 표시 */}
      {isLarge && (
        <rect
          x={1} y={1} width={size - 2} height={size - 2}
          rx={3}
          fill="none"
          stroke="#f97316"
          strokeWidth={0.8}
          strokeOpacity={0.3}
          strokeDasharray="2 3"
        />
      )}

      {/* 곡선 레일 — 부드러운 1/4 원호 */}
      {arcPath ? (
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeOpacity={baseOpacity + 0.05}
          strokeDasharray={dashArray}
        />
      ) : null}

      {/* U-BYPASS 전용 렌더 */}
      {isUBypass
        ? uBypassPaths(size, type === 'doubleUBypass').map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={i === 0 ? stroke : stroke * 0.85}
              strokeLinecap="round"
              strokeOpacity={baseOpacity + (i === 0 ? 0.05 : -0.05)}
              strokeDasharray={dashArray}
            />
          ))
        : null}

      {/* 개구부 → 중심 레일 선 (곡선·U 제외) */}
      {!arcPath && !isUBypass && openings.map((dir) => {
        const p = DIR_POINT[dir]
        const connected = connectedDirs?.has(dir) ?? false
        return (
          <line
            key={dir}
            x1={p.x * size}
            y1={p.y * size}
            x2={cx}
            y2={cy}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeOpacity={connected ? baseOpacity + 0.05 : baseOpacity}
            strokeDasharray={emphasized || connected ? undefined : '3 3'}
          />
        )
      })}

      {/* 중심 노드 */}
      {!arcPath && !isUBypass && (
        <circle
          cx={cx}
          cy={cy}
          r={emphasized ? 2.6 : 2}
          fill={color}
          fillOpacity={baseOpacity + 0.1}
        />
      )}
    </svg>
  )
}
