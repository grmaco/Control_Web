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

  const arcPath = type === 'curve' ? curveArcPath(openings, size) : null

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none"
      aria-hidden
    >
      {/* 곡선 레일 — 부드러운 1/4 원호 */}
      {arcPath ? (
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeOpacity={baseOpacity + 0.05}
          strokeDasharray={emphasized ? undefined : '3 3'}
        />
      ) : null}

      {/* 개구부 → 중심 레일 선 (곡선은 원호로 대체) */}
      {!arcPath && openings.map((dir) => {
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
      {/* 중심 노드 (곡선은 원호가 지나므로 생략) */}
      {arcPath ? null : (
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
