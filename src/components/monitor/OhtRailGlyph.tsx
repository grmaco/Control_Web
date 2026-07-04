import type { OhtDir, OhtRailType } from '../../types/oht'
import type { Rotation } from '../../types/conveyor'
import { ohtRailOpenings } from '../../constants/ohtRail'

interface OhtRailGlyphProps {
  type: OhtRailType
  rotation?: Rotation
  size: number
  /** 멀티셀 레일용 — 기본값: size */
  glyphWidth?: number
  glyphHeight?: number
  connectedDirs?: Set<string>
  emphasized?: boolean
  color?: string
}

const DIR_POINT: Record<OhtDir, { x: number; y: number }> = {
  N: { x: 0.5, y: 0 },
  E: { x: 1, y: 0.5 },
  S: { x: 0.5, y: 1 },
  W: { x: 0, y: 0.5 },
}

/** 1/4 원호 sweep 방향 (SVG y-down 기준) */
const CURVE_SWEEP: Record<string, 0 | 1> = {
  'N-E': 0, 'E-N': 1,
  'N-W': 1, 'W-N': 0,
  'S-E': 1, 'E-S': 0,
  'S-W': 0, 'W-S': 1,
}

const CW_ORDER: OhtDir[] = ['N', 'E', 'S', 'W']
function prevCW(dir: OhtDir): OhtDir { return CW_ORDER[(CW_ORDER.indexOf(dir) + 3) % 4]! }
function nextCW(dir: OhtDir): OhtDir { return CW_ORDER[(CW_ORDER.indexOf(dir) + 1) % 4]! }

const OPPOSITE: Record<OhtDir, OhtDir> = { N: 'S', S: 'N', E: 'W', W: 'E' }

/** 두 방향 사이 1/4 원호 path 문자열 */
function arcPath(from: OhtDir, to: OhtDir, size: number): string | null {
  const sweep = CURVE_SWEEP[`${from}-${to}`]
  if (sweep == null) return null
  const p1 = DIR_POINT[from]
  const p2 = DIR_POINT[to]
  const r = size / 2
  return `M ${p1.x * size},${p1.y * size} A ${r},${r} 0 0 ${sweep} ${p2.x * size},${p2.y * size}`
}

/**
 * 3-방향 개구부에서 직선 쌍과 분기를 찾는다.
 * BRANCH-R/L: 직선 통과 + 1개 분기 호
 */
function findStraightAndBranch(openings: OhtDir[]) {
  if (openings.length !== 3) return null
  for (const a of openings) {
    const b = OPPOSITE[a]
    if (openings.includes(b)) {
      const branch = openings.find((d) => d !== a && d !== b)!
      return { pairA: a, pairB: b, branch }
    }
  }
  return null
}

/**
 * Y-BYPASS / doubleBranch2: 줄기(Stem) 1개 + 가지 2개.
 * 줄기가 반대 방향을 가지지 않는 쪽 → 두 개의 호를 줄기에서 그린다.
 */
function findStem(openings: OhtDir[]) {
  if (openings.length !== 3) return null
  for (const dir of openings) {
    if (!openings.includes(OPPOSITE[dir])) {
      const branches = openings.filter((d) => d !== dir) as [OhtDir, OhtDir]
      return { stem: dir, branches }
    }
  }
  return null
}

/** U-BYPASS 경로 목록 (멀티셀 치수 기준) */
function uBypassPaths(w: number, h: number, doubleU: boolean): string[] {
  const isVertical = h >= w
  if (isVertical) {
    const cx = 0.5 * w
    const r = 0.35 * w       // 루프 반지름 ≈ 35% of width
    const y1 = 0.5 * h - r
    const y2 = 0.5 * h + r
    const paths = [
      `M ${cx},0 L ${cx},${h}`,                            // 메인 직선
      `M ${cx},${y1} A ${r},${r} 0 0 1 ${cx},${y2}`,      // 오른쪽 반원
    ]
    if (doubleU) paths.push(`M ${cx},${y1} A ${r},${r} 0 0 0 ${cx},${y2}`) // 왼쪽 반원
    return paths
  } else {
    const cy = 0.5 * h
    const r = 0.35 * h
    const x1 = 0.5 * w - r
    const x2 = 0.5 * w + r
    const paths = [
      `M 0,${cy} L ${w},${cy}`,
      `M ${x1},${cy} A ${r},${r} 0 0 1 ${x2},${cy}`,
    ]
    if (doubleU) paths.push(`M ${x1},${cy} A ${r},${r} 0 0 0 ${x2},${cy}`)
    return paths
  }
}

export function OhtRailGlyph({
  type,
  rotation = 0,
  size,
  glyphWidth,
  glyphHeight,
  connectedDirs,
  emphasized = false,
  color = '#22d3ee',
}: OhtRailGlyphProps) {
  const w = glyphWidth ?? size
  const h = glyphHeight ?? size
  const openings = ohtRailOpenings(type, rotation)
  const cx = 0.5 * w
  const cy = 0.5 * h
  const stroke = emphasized ? 2.2 : 1.6
  const baseOpacity = emphasized ? 0.95 : 0.5
  const dashArray = emphasized ? undefined : '3 3'

  const isLarge =
    type === 'doubleUBypass' ||
    type === 'doubleBranchR' ||
    type === 'doubleBranchL' ||
    type === 'doubleBranch2'

  const isCurve = type === 'curve90'
  const isUBypass = type === 'uBypass' || type === 'doubleUBypass'
  const isBranchR = type === 'branchR' || type === 'doubleBranchR'
  const isBranchL = type === 'branchL' || type === 'doubleBranchL'
  const isYBypass = type === 'yBypass' || type === 'doubleBranch2'

  // ── 곡선 레일 ─────────────────────────────────────────────────────────────
  if (isCurve) {
    const [a, b] = openings as [OhtDir, OhtDir]
    const sweep = CURVE_SWEEP[`${a}-${b}`]
    if (sweep == null) return null
    const p1 = DIR_POINT[a]
    const p2 = DIR_POINT[b]
    const r = size / 2
    const d = `M ${p1.x * size},${p1.y * size} A ${r},${r} 0 0 ${sweep} ${p2.x * size},${p2.y * size}`
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeOpacity={baseOpacity + 0.05} strokeDasharray={dashArray} />
      </svg>
    )
  }

  // ── U-BYPASS / DOUBLE U-BYPASS ─────────────────────────────────────────────
  if (isUBypass) {
    const paths = uBypassPaths(w, h, type === 'doubleUBypass')
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        {isLarge && (
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
            fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
        )}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={i === 0 ? stroke : stroke * 0.85}
            strokeLinecap="round"
            strokeOpacity={baseOpacity + (i === 0 ? 0.05 : -0.05)}
            strokeDasharray={dashArray} />
        ))}
      </svg>
    )
  }

  // ── BRANCH-R / BRANCH-L / DBL variants ────────────────────────────────────
  if (isBranchR || isBranchL) {
    const found = findStraightAndBranch(openings)
    if (found) {
      const { pairA, pairB, branch } = found
      const p1 = DIR_POINT[pairA]
      const p2 = DIR_POINT[pairB]
      const arcFrom = isBranchR ? prevCW(branch) : nextCW(branch)
      const branchArc = arcPath(arcFrom, branch, size)
      const straightD = `M ${p1.x * size},${p1.y * size} L ${p2.x * size},${p2.y * size}`
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
          {isLarge && (
            <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
              fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
          )}
          {/* 직선 통과 */}
          <path d={straightD} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeOpacity={baseOpacity} strokeDasharray={dashArray} />
          {/* 분기 호 */}
          {branchArc && (
            <path d={branchArc} fill="none" stroke={color} strokeWidth={stroke}
              strokeLinecap="round" strokeOpacity={baseOpacity + 0.05} strokeDasharray={dashArray} />
          )}
        </svg>
      )
    }
  }

  // ── Y-BYPASS / DBL BRANCH-2 ────────────────────────────────────────────────
  if (isYBypass) {
    const found = findStem(openings)
    if (found) {
      const { stem, branches } = found
      const arc1 = arcPath(stem, branches[0], size)
      const arc2 = arcPath(stem, branches[1], size)
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
          {isLarge && (
            <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
              fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
          )}
          {arc1 && (
            <path d={arc1} fill="none" stroke={color} strokeWidth={stroke}
              strokeLinecap="round" strokeOpacity={baseOpacity + 0.05} strokeDasharray={dashArray} />
          )}
          {arc2 && (
            <path d={arc2} fill="none" stroke={color} strokeWidth={stroke}
              strokeLinecap="round" strokeOpacity={baseOpacity + 0.05} strokeDasharray={dashArray} />
          )}
        </svg>
      )
    }
  }

  // ── 기본: 개구부 → 중심 스포크 선 (straight 등) ──────────────────────────────
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
      {openings.map((dir) => {
        const p = DIR_POINT[dir]
        const connected = connectedDirs?.has(dir) ?? false
        return (
          <line key={dir}
            x1={p.x * size} y1={p.y * size}
            x2={cx} y2={cy}
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeOpacity={connected ? baseOpacity + 0.05 : baseOpacity}
            strokeDasharray={emphasized || connected ? undefined : '3 3'} />
        )
      })}
      <circle cx={cx} cy={cy} r={emphasized ? 2.6 : 2}
        fill={color} fillOpacity={baseOpacity + 0.1} />
    </svg>
  )
}
