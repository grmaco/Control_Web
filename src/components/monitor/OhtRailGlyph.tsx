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
  /** 단방향 흐름 출구 방향 — 있으면 중심 점을 키우고 화살표 표시 */
  flowOutDirs?: OhtDir[]
  /** 흐름 점 위치 (멀티셀 앵커 셀 중심) — 기본값: 글리프 중심 */
  flowDotX?: number
  flowDotY?: number
}

const DIR_ANGLE: Record<OhtDir, number> = { E: 0, S: 90, W: 180, N: 270 }

/** 흐름 방향 점 — 살짝 키운 점 안에 진행 방향 화살표(들) */
function FlowArrowDot({
  x,
  y,
  dirs,
  color,
  cellSize,
}: {
  x: number
  y: number
  dirs: OhtDir[]
  color: string
  cellSize: number
}) {
  const r = Math.max(3.4, cellSize * 0.15)
  const a = r * 0.52
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="#0b1220"
        fillOpacity={0.92}
        stroke={color}
        strokeWidth={1.1}
        strokeOpacity={0.85}
      />
      {dirs.map((dir) => (
        <path
          key={dir}
          d={`M ${-a * 0.7} ${-a} L ${a} 0 L ${-a * 0.7} ${a}`}
          transform={`translate(${x} ${y}) rotate(${DIR_ANGLE[dir]})`}
          fill="none"
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
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

/**
 * U-BYPASS / DOUBLE U-BYPASS 공용 경로 함수.
 *
 * 구조: 닫힌 타원 루프 (stadium/discorectangle 형태)
 *  - 위 아치 (N-N 우회): N 진입 OHT가 반대 레인 N으로 이동
 *  - 아래 아치 (S-S 우회): S 진입 OHT가 반대 레인 S로 이동
 *  - N→S 직통 경로 없음
 *
 * U-BYPASS(2cs×1cs): 아치 두 개가 중앙에서 만남 → 눌린 타원
 * DOUBLE U-BYPASS(2cs×2cs): 아치 두 개 사이 직선 구간이 보임 → 캡슐/경기장 형태
 */
function uBypassPaths(w: number, h: number): string[] {
  // SVG y-down 좌표계: 수평 아치는 sweep=0(CCW)이 아래로, sweep=1(CW)이 위로 향함
  // 위 아치(y=0) → sweep=0으로 y=+r까지 내려옴 (안쪽)
  // 아래 아치(y=h) → sweep=1로 y=h-r까지 올라옴 (안쪽)

  if (w === h) {
    // 팔레트 정방형 미리보기
    const cs = w / 2
    const cx1 = 0.5 * cs
    const cx2 = 1.5 * cs
    const r = 0.5 * cs
    return [
      `M ${cx1},0 L ${cx1},${h}`,
      `M ${cx2},0 L ${cx2},${h}`,
      `M ${cx1},0 A ${r},${r} 0 0 0 ${cx2},0`,           // 위 아치만
    ]
  }

  const isWide = w > h
  const cs = isWide ? h : w

  if (isWide) {
    // 가로 배치 (rotation=0 or 180)
    const cx1 = 0.5 * cs
    const cx2 = w - 0.5 * cs
    const r = 0.5 * cs
    return [
      `M ${cx1},0 L ${cx1},${h}`,
      `M ${cx2},0 L ${cx2},${h}`,
      `M ${cx1},0 A ${r},${r} 0 0 0 ${cx2},0`,           // 위 아치만
    ]
  } else {
    // 세로 배치 (rotation=90 or 270) — 왼쪽 아치만 유지
    const cy1 = 0.5 * cs
    const cy2 = h - 0.5 * cs
    const r = 0.5 * cs
    return [
      `M 0,${cy1} L ${w},${cy1}`,
      `M 0,${cy2} L ${w},${cy2}`,
      `M 0,${cy1} A ${r},${r} 0 0 1 0,${cy2}`,           // 왼쪽 아치만
    ]
  }
}


/**
 * DBL BRANCH-R 경로.
 * rot=0/180: w=2cs, h=cs (가로 배치)
 * rot=90/270: w=cs, h=2cs (세로 배치)
 *
 * rot=0: 왼쪽 N-S 직선 + 오른쪽 W-E 직선 + N↔N 반원 아치
 * rot=180: 반전 (S쪽 아치)
 * rot=90: 위 E-W 직선 + 아래 N-S 직선 + 두 개 1/4호 연결
 * rot=270: 아래 E-W 직선 + 위 N-S 직선 + 왼쪽 반원 아치
 */
/**
 * DBL BRANCH-R: 왼쪽(cell0)=branchR + 오른쪽(cell1)=branchR@270° 복합.
 *
 * rot=0 (w=2cs, h=cs):
 *   cell0: N-S 직선 + S→E 1/4호
 *   cell1: W-E 직선 + N→E 1/4호
 *
 * 팔레트 정방형(w=h): cs = w/2
 * 실제 가로(w>h): cs = h
 * 실제 세로(h>w): cs = w  (rot=90/270)
 */
function doubleBranchRPaths(w: number, h: number, rotation: number): string[] {
  if (w >= h) {
    // 가로 배치 or 팔레트 정방형
    const cs = w === h ? w / 2 : h
    const r = cs / 2

    if (rotation === 0 || w === h) {
      // rot=0 / 팔레트
      // cell0(좌): N-S 직선 at x=r, S→E 1/4호 (S=(r,h) → internal-E=(cs,r)), sweep=1 CW
      // cell1(우): W-E 직선 at y=r (from cs to w), N→E 1/4호 (N=(w-r,0) → E=(w,r)), sweep=0 CCW
      return [
        `M ${r},0 L ${r},${h}`,
        `M ${cs},${r} L ${w},${r}`,
        `M ${r},${h} A ${r},${r} 0 0 1 ${cs},${r}`,
        `M ${w - r},0 A ${r},${r} 0 0 0 ${w},${r}`,
      ]
    } else {
      // rot=180: cell0(우)=N-S 직선 + N→internal-W 1/4호, cell1(좌)=W-E 직선 + S→W 1/4호
      // 호는 개구부에서 레일과 접선(수직/수평)으로 만나야 함 — sweep 방향 주의
      return [
        `M ${w - r},0 L ${w - r},${h}`,
        `M 0,${r} L ${cs},${r}`,
        `M ${w - r},0 A ${r},${r} 0 0 1 ${cs},${r}`,
        `M ${r},${h} A ${r},${r} 0 0 0 0,${r}`,
      ]
    }
  } else {
    // 세로 배치 (rot=90 or rot=270), w=cs, h=2cs
    const cs = w
    const r = cs / 2

    if (rotation === 90) {
      // rot=90: top cell = W-E 직선 + W→internal-S 1/4호, bottom cell = N-S 직선 + E→S 1/4호
      return [
        `M 0,${r} L ${w},${r}`,
        `M ${r},${cs} L ${r},${h}`,
        `M 0,${r} A ${r},${r} 0 0 1 ${r},${cs}`,
        `M ${w},${cs + r} A ${r},${r} 0 0 0 ${r},${h}`,
      ]
    } else {
      // rot=270: bottom cell = W-E 직선 + E→internal-N 1/4호, top cell = N-S 직선 + W→N 1/4호
      return [
        `M 0,${h - r} L ${w},${h - r}`,
        `M ${r},0 L ${r},${cs}`,
        `M ${w},${h - r} A ${r},${r} 0 0 1 ${r},${cs}`,
        `M 0,${r} A ${r},${r} 0 0 0 ${r},0`,
      ]
    }
  }
}

/**
 * DBL BRANCH-L: doubleBranchR의 좌우 대칭.
 * cell0(좌)=branchL@270°: W-E 수평 + N→W 1/4호
 * cell1(우)=branchL: N-S 수직 + S→W 1/4호
 */
function doubleBranchLPaths(w: number, h: number, rotation: number): string[] {
  if (w >= h) {
    const cs = w === h ? w / 2 : h
    const r = cs / 2

    if (rotation === 0 || w === h) {
      // rot=0 / 팔레트: 왼 W-E + 오 N-S + N→W 호 + S→W 호
      return [
        `M 0,${r} L ${cs},${r}`,
        `M ${w - r},0 L ${w - r},${h}`,
        `M ${r},0 A ${r},${r} 0 0 1 0,${r}`,
        `M ${w - r},${h} A ${r},${r} 0 0 0 ${cs},${r}`,
      ]
    } else {
      // rot=180: 왼 N-S 직선 + N→internal-E 호, 오 W-E 직선 + S→E 호
      return [
        `M ${cs},${r} L ${w},${r}`,
        `M ${r},0 L ${r},${h}`,
        `M ${w - r},${h} A ${r},${r} 0 0 1 ${w},${r}`,
        `M ${r},0 A ${r},${r} 0 0 0 ${cs},${r}`,
      ]
    }
  } else {
    // 세로 배치 (rot=90 or rot=270), w=cs, h=2cs
    const cs = w
    const r = cs / 2

    if (rotation === 90) {
      // rot=90: top cell = N-S 직선 + E→N 호 / bottom cell = W-E 직선 + W→internal-N 호
      return [
        `M ${r},0 L ${r},${cs}`,
        `M 0,${h - r} L ${w},${h - r}`,
        `M ${w},${r} A ${r},${r} 0 0 1 ${r},0`,
        `M 0,${h - r} A ${r},${r} 0 0 0 ${r},${cs}`,
      ]
    } else {
      // rot=270: top cell = W-E 직선 + E→internal-S 호 / bottom cell = N-S 직선 + W→S 호
      return [
        `M 0,${r} L ${w},${r}`,
        `M ${r},${cs} L ${r},${h}`,
        `M ${w},${r} A ${r},${r} 0 0 0 ${r},${cs}`,
        `M 0,${cs + r} A ${r},${r} 0 0 1 ${r},${h}`,
      ]
    }
  }
}

function doubleUBypassPaths(w: number, h: number): string[] {
  // DOUBLE U-BYPASS는 항상 2×2칸 → cs=w/2로 아치 위치 결정
  // cx1·cx2가 레인 중심, r=0.5*cs → 팔레트(28×28)에서도 아치가 충분히 깊어 U가 명확히 보임
  const cs = w / 2
  const cx1 = 0.5 * cs
  const cx2 = 1.5 * cs
  const r = 0.5 * cs
  return [
    `M ${cx1},0 L ${cx1},${h}`,
    `M ${cx2},0 L ${cx2},${h}`,
    `M ${cx1},0 A ${r},${r} 0 0 0 ${cx2},0`,           // 위 아치 — sweep=0, 아래로
    `M ${cx1},${h} A ${r},${r} 0 0 1 ${cx2},${h}`,     // 아래 아치 — sweep=1, 위로
  ]
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
  flowOutDirs,
  flowDotX,
  flowDotY,
}: OhtRailGlyphProps) {
  const w = glyphWidth ?? size
  const h = glyphHeight ?? size
  const openings = ohtRailOpenings(type, rotation)
  const cx = 0.5 * w
  const cy = 0.5 * h
  const stroke = emphasized ? 2.2 : 1.6
  const baseOpacity = emphasized ? 0.95 : 0.5
  const dashArray = emphasized ? undefined : '3 3'

  // 단방향 흐름 화살표 점 — 직선 레일에만 표시 (분기·곡선 위에는 표시 안 함)
  const flowDot =
    type === 'straight' && flowOutDirs && flowOutDirs.length > 0 ? (
      <FlowArrowDot
        x={flowDotX ?? cx}
        y={flowDotY ?? cy}
        dirs={flowOutDirs}
        color={color}
        cellSize={size}
      />
    ) : null

  const isLarge =
    type === 'doubleUBypass' ||
    type === 'doubleBranchR' ||
    type === 'doubleBranchL'

  const isCurve = type === 'curve90'
  const isBranchR = type === 'branchR'
  const isBranchL = type === 'branchL'
  const isYBypass = type === 'yBypass'

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
        {flowDot}
      </svg>
    )
  }

  // ── U-BYPASS ───────────────────────────────────────────────────────────────
  if (type === 'uBypass') {
    const paths = uBypassPaths(w, h)
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeOpacity={baseOpacity} strokeDasharray={dashArray} />
        ))}
        {flowDot}
      </svg>
    )
  }

  // ── DBL BRANCH-L ──────────────────────────────────────────────────────────
  if (type === 'doubleBranchL') {
    const paths = doubleBranchLPaths(w, h, rotation)
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
          fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeOpacity={baseOpacity} strokeDasharray={dashArray} />
        ))}
        {flowDot}
      </svg>
    )
  }

  // ── DBL BRANCH-R ──────────────────────────────────────────────────────────
  if (type === 'doubleBranchR') {
    const paths = doubleBranchRPaths(w, h, rotation)
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
          fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeOpacity={baseOpacity} strokeDasharray={dashArray} />
        ))}
        {flowDot}
      </svg>
    )
  }

  // ── DOUBLE U-BYPASS ────────────────────────────────────────────────────────
  if (type === 'doubleUBypass') {
    const paths = doubleUBypassPaths(w, h)
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none" aria-hidden>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={3}
          fill="none" stroke="#f97316" strokeWidth={0.8} strokeOpacity={0.3} strokeDasharray="2 3" />
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            strokeOpacity={baseOpacity} strokeDasharray={dashArray} />
        ))}
        {flowDot}
      </svg>
    )
  }

  // ── BRANCH-R / BRANCH-L ────────────────────────────────────
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
          {flowDot}
        </svg>
      )
    }
  }

  // ── Y-BYPASS ───────────────────────────────────────────────────────────────
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
          {flowDot}
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
      {flowDot ?? (
        <circle cx={cx} cy={cy} r={emphasized ? 2.6 : 2}
          fill={color} fillOpacity={baseOpacity + 0.1} />
      )}
    </svg>
  )
}
