import type { ConveyorStatus } from '../../types/conveyor'

interface RollerConfig {
  base: string
  frame: string
  rollerDark: string
  rollerMid: string
  rollerLight: string
  glowColor: string
  glowOpacity: number
}

const ROLLER_CFG: Record<ConveyorStatus, RollerConfig> = {
  idle: {
    base: '#0c1520',
    frame: '#1e293b',
    rollerDark: '#0f1e30',
    rollerMid: '#1e3348',
    rollerLight: '#2e4a68',
    glowColor: '#94a3b8',
    glowOpacity: 0,
  },
  running: {
    base: '#011a0d',
    frame: '#064e2c',
    rollerDark: '#022a14',
    rollerMid: '#065f35',
    rollerLight: '#10b981',
    glowColor: '#10b981',
    glowOpacity: 0.55,
  },
  error: {
    base: '#1a0505',
    frame: '#7f1d1d',
    rollerDark: '#300a0a',
    rollerMid: '#7f1d1d',
    rollerLight: '#ef4444',
    glowColor: '#ef4444',
    glowOpacity: 0.65,
  },
  maintenance: {
    base: '#140d00',
    frame: '#78350f',
    rollerDark: '#2a1800',
    rollerMid: '#92400e',
    rollerLight: '#fbbf24',
    glowColor: '#f59e0b',
    glowOpacity: 0.45,
  },
}

interface RollerConveyorCellProps {
  width: number
  height: number
  status: ConveyorStatus
  /** 0=right, 90=down, 180=left, 270=up */
  rotation?: number
  /** 실제 물류 흐름 방향 — flowByUnitId.outDir (N/S/E/W). 있으면 rotation보다 우선 */
  flowOutDir?: 'N' | 'S' | 'E' | 'W' | null
  isRunning?: boolean
  /** SVG filter/gradient ID prefix — 충돌 방지용 */
  uid: string
}

const DIR_TO_ROT: Record<'N' | 'S' | 'E' | 'W', number> = { N: 270, S: 90, E: 0, W: 180 }

export function RollerConveyorCell({
  width,
  height,
  status,
  rotation = 0,
  flowOutDir = null,
  isRunning = false,
  uid,
}: RollerConveyorCellProps) {
  const cfg = ROLLER_CFG[status]
  const w = width
  const h = height

  // flowOutDir(실제 물류 흐름)이 있으면 우선 적용, 없으면 unit.rotation 폴백
  const effectiveRot = flowOutDir != null ? DIR_TO_ROT[flowOutDir] : rotation

  // 롤러 방향: 컨베이어 진행방향과 수직
  const isVerticalMotion = effectiveRot === 90 || effectiveRot === 270
  // 수직 이동 컨베이어 → 롤러는 가로 방향(수평 바)
  // 수평 이동 컨베이어 → 롤러는 세로 방향(수직 바)
  const rollerIsHorizontal = isVerticalMotion

  const pad = 2
  const innerW = w - pad * 2
  const innerH = h - pad * 2

  // 롤러 바 크기 계산
  const rollerThickness = Math.max(2, Math.floor(Math.min(w, h) * 0.09))
  const rollerGap = Math.max(1, Math.floor(Math.min(w, h) * 0.06))
  const rollerStep = rollerThickness + rollerGap

  // 롤러 위치 목록
  const rollerPositions: number[] = []
  if (rollerIsHorizontal) {
    for (let y = pad; y + rollerThickness <= h - pad; y += rollerStep) {
      rollerPositions.push(y)
    }
  } else {
    for (let x = pad; x + rollerThickness <= w - pad; x += rollerStep) {
      rollerPositions.push(x)
    }
  }

  // 애니메이션: 컨베이어 진행 방향으로 롤러가 흐르는 효과 (effectiveRot 기준)
  const animDur = '0.6s'
  let animFrom: string
  let animTo: string
  if (rollerIsHorizontal) {
    // 수직 이동: 90=아래, 270=위
    animFrom = effectiveRot === 270 ? `0 ${rollerStep}` : `0 ${-rollerStep}`
    animTo = '0 0'
  } else {
    // 수평 이동: 0=오른쪽, 180=왼쪽
    animFrom = effectiveRot === 180 ? `${rollerStep} 0` : `${-rollerStep} 0`
    animTo = '0 0'
  }

  // 코너 브라켓 크기
  const br = Math.max(3, Math.floor(Math.min(w, h) * 0.15))

  const gradId = `rg-${uid}`
  const clipId = `rc-${uid}`
  const filterId = `rf-${uid}`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
      aria-hidden
    >
      <defs>
        {/* 롤러 실린더 그라디언트 */}
        <linearGradient
          id={gradId}
          x1="0" y1="0"
          x2={rollerIsHorizontal ? '0' : '1'}
          y2={rollerIsHorizontal ? '1' : '0'}
        >
          <stop offset="0%"   stopColor={cfg.rollerLight} stopOpacity="0.9" />
          <stop offset="30%"  stopColor={cfg.rollerMid}   stopOpacity="1" />
          <stop offset="70%"  stopColor={cfg.rollerMid}   stopOpacity="1" />
          <stop offset="100%" stopColor={cfg.rollerLight} stopOpacity="0.7" />
        </linearGradient>

        {/* 롤러 영역 클립 */}
        <clipPath id={clipId}>
          <rect x={pad} y={pad} width={innerW} height={innerH} />
        </clipPath>

        {/* 글로우 필터 (running / error) */}
        {cfg.glowOpacity > 0 && (
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feFlood floodColor={cfg.glowColor} floodOpacity={cfg.glowOpacity} result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* 기본 배경 */}
      <rect x="0" y="0" width={w} height={h} fill={cfg.base} />

      {/* 내부 어두운 면 (약간의 깊이감) */}
      <rect x={pad} y={pad} width={innerW} height={innerH} fill={cfg.rollerDark} />

      {/* 롤러 그룹 */}
      <g clipPath={`url(#${clipId})`} filter={cfg.glowOpacity > 0 ? `url(#${filterId})` : undefined}>
        <g>
          {rollerPositions.map((pos, i) =>
            rollerIsHorizontal ? (
              <rect
                key={i}
                x={pad}
                y={pos}
                width={innerW}
                height={rollerThickness}
                fill={`url(#${gradId})`}
                rx="0.5"
              />
            ) : (
              <rect
                key={i}
                x={pos}
                y={pad}
                width={rollerThickness}
                height={innerH}
                fill={`url(#${gradId})`}
                rx="0.5"
              />
            ),
          )}

          {/* 롤러 스크롤 애니메이션 (running 상태) */}
          {isRunning && (
            <animateTransform
              attributeName="transform"
              type="translate"
              from={animFrom}
              to={animTo}
              dur={animDur}
              repeatCount="indefinite"
            />
          )}
        </g>
      </g>

      {/* 외곽 프레임 */}
      <rect
        x="0.75" y="0.75"
        width={w - 1.5} height={h - 1.5}
        fill="none"
        stroke={cfg.frame}
        strokeWidth="1.5"
      />

      {/* 코너 L-브라켓 (SF 산업용 느낌) */}
      {[
        [0, 0, br, 1.5, 1.5, br],           // top-left
        [w - br, 0, br, w - 1.5, 1.5, br],  // top-right
        [0, h - br, br, 1.5, h - 1.5, br],  // bottom-left
        [w - br, h - br, br, w - 1.5, h - 1.5, br], // bottom-right
      ].map(([x, y, , lx, ly, lb], i) => (
        <g key={i}>
          {i === 0 && (
            <>
              <line x1={lx} y1={ly} x2={lx + lb} y2={ly} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
              <line x1={lx} y1={ly} x2={lx} y2={ly + lb} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
            </>
          )}
          {i === 1 && (
            <>
              <line x1={lx} y1={ly} x2={lx - lb} y2={ly} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
              <line x1={lx} y1={ly} x2={lx} y2={ly + lb} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
            </>
          )}
          {i === 2 && (
            <>
              <line x1={lx} y1={ly} x2={lx + lb} y2={ly} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
              <line x1={lx} y1={ly} x2={lx} y2={ly - lb} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
            </>
          )}
          {i === 3 && (
            <>
              <line x1={lx} y1={ly} x2={lx - lb} y2={ly} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
              <line x1={lx} y1={ly} x2={lx} y2={ly - lb} stroke={cfg.rollerLight} strokeWidth="1.2" strokeOpacity="0.8" />
            </>
          )}
        </g>
      ))}

      {/* 상태 표시 띠 (상단 1px 선) */}
      <line
        x1={pad} y1={pad}
        x2={w - pad} y2={pad}
        stroke={cfg.rollerLight}
        strokeWidth={status === 'idle' ? '0.5' : '1.2'}
        strokeOpacity={status === 'idle' ? '0.3' : '0.9'}
      />

      {/* error 상태: 깜박임 오버레이 */}
      {status === 'error' && (
        <rect x="0" y="0" width={w} height={h} fill={cfg.glowColor} opacity="0">
          <animate
            attributeName="opacity"
            values="0;0.12;0"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      )}
    </svg>
  )
}
