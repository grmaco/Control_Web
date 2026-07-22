import type { ConveyorType } from '../../types/conveyor'

/**
 * 라인 빌더 팔레트용 컨베이어 타입 도식 — 아이소메트릭 3D 모델 스타일.
 * 스틸 상판(그라디언트) + 좌/우 측면 음영으로 입체감, 타입별 특징을 상단에 표현.
 * OHT 팔레트 글리프(OhtVehicleGlyph)와 톤을 맞춘 slate + cyan 팔레트.
 */
export function ConveyorTypeGlyph({
  type,
  size = 30,
}: {
  type: ConveyorType
  size?: number
}) {
  const uid = `cvg-${type}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`${uid}-top`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="45%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#556170" />
        </linearGradient>
        <linearGradient id={`${uid}-left`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#3b4657" />
        </linearGradient>
        <linearGradient id={`${uid}-right`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3f4a5a" />
          <stop offset="100%" stopColor="#26303d" />
        </linearGradient>
        <linearGradient id={`${uid}-disc`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id={`${uid}-amber`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${uid}-violet`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="20" cy="33.5" rx="13" ry="3" fill="#020617" opacity="0.32" />

      <GlyphBody type={type} uid={uid} />
    </svg>
  )
}

const STROKE = '#1e293b'

/** 아이소메트릭 큐브 (상판 다이아몬드 + 좌/우 전면 측면). height 만큼 하강 압출. */
function IsoCube({ uid, height = 7 }: { uid: string; height?: number }) {
  const h = height
  return (
    <>
      {/* 좌 측면 (W-S) */}
      <path
        d={`M7 15 L20 21.5 L20 ${21.5 + h} L7 ${15 + h} Z`}
        fill={`url(#${uid}-left)`}
        stroke={STROKE}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* 우 측면 (E-S) */}
      <path
        d={`M33 15 L20 21.5 L20 ${21.5 + h} L33 ${15 + h} Z`}
        fill={`url(#${uid}-right)`}
        stroke={STROKE}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* 상판 다이아몬드 */}
      <path
        d="M20 8.5 L33 15 L20 21.5 L7 15 Z"
        fill={`url(#${uid}-top)`}
        stroke={STROKE}
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </>
  )
}

/** 상판 위 롤러선 (흐름과 직교) */
function Rollers({ color = '#0f172a', accent = '#38bdf8' }: { color?: string; accent?: string }) {
  const lines: Array<[number, number, number]> = [
    // [x, topY, bottomY]
    [12, 12.5, 17.5],
    [16, 10.5, 19.5],
    [20, 9, 21],
    [24, 10.5, 19.5],
    [28, 12.5, 17.5],
  ]
  return (
    <g>
      {lines.map(([x, ty, by], i) => (
        <line
          key={i}
          x1={x}
          y1={ty}
          x2={x}
          y2={by}
          stroke={i % 2 === 0 ? accent : color}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity={i % 2 === 0 ? 0.85 : 0.5}
        />
      ))}
    </g>
  )
}

function GlyphBody({ type, uid }: { type: ConveyorType; uid: string }) {
  switch (type) {
    case 'straight':
      return (
        <>
          <IsoCube uid={uid} />
          <Rollers />
          {/* 흐름 화살표 (W→E) */}
          <path d="M11 15 L27 15" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          <path d="M25 12.6 L29 15 L25 17.4 Z" fill="#22d3ee" />
        </>
      )

    case 'turn':
      return (
        <>
          <IsoCube uid={uid} />
          {/* 회전 디스크 */}
          <ellipse cx="20" cy="15" rx="9" ry="4.5" fill={`url(#${uid}-disc)`} stroke={STROKE} strokeWidth="0.6" />
          <ellipse cx="20" cy="15" rx="9" ry="4.5" fill="none" stroke="#e0f2fe" strokeWidth="0.5" opacity="0.5" />
          {/* 회전 화살표 */}
          <path d="M25 13.2 A 9 4.5 0 1 1 14.6 12.4" fill="none" stroke="#0f172a" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M13.4 10.6 L14.4 13.2 L17 12 Z" fill="#0f172a" />
        </>
      )

    case 'junction':
      return (
        <>
          <IsoCube uid={uid} />
          {/* 직교 분기 — 두 방향 흐름 */}
          <path d="M11 15 L29 15" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          <path d="M27 12.6 L30 15 L27 17.4 Z" fill="#22d3ee" />
          {/* 세로(직교) 방향 — 상판 대각 */}
          <path d="M20 9.5 L20 20.5" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          <path d="M17.6 19 L20 22 L22.4 19 Z" fill="#a78bfa" />
        </>
      )

    case 'lift':
      return (
        <>
          <IsoCube uid={uid} height={8} />
          {/* 상승한 플랫폼 (상판 위에 뜬 작은 다이아몬드) */}
          <g transform="translate(0 -6)">
            <path
              d="M20 9 L31 14.5 L20 20 L9 14.5 Z"
              fill={`url(#${uid}-disc)`}
              stroke={STROKE}
              strokeWidth="0.6"
              strokeLinejoin="round"
              opacity="0.95"
            />
          </g>
          {/* 지지 컬럼 */}
          <line x1="20" y1="14.5" x2="20" y2="15" stroke="#94a3b8" strokeWidth="2.4" opacity="0.7" />
          {/* 상하 화살표 */}
          <path d="M32 12 L32 20" stroke="#22d3ee" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
          <path d="M30.4 13.4 L32 11.4 L33.6 13.4 Z" fill="#22d3ee" />
          <path d="M30.4 18.6 L32 20.6 L33.6 18.6 Z" fill="#22d3ee" />
        </>
      )

    case 'port':
      return (
        <>
          {/* 포트 받침 (낮은 페데스탈) */}
          <IsoCube uid={uid} height={6} />
          {/* 카세트 (상판 위 적재물) — 앰버 */}
          <g transform="translate(0 -5)">
            <path d="M20 11 L29 15.5 L20 20 L11 15.5 Z" fill={`url(#${uid}-amber)`} stroke="#78350f" strokeWidth="0.6" strokeLinejoin="round" />
            <path d="M11 15.5 L20 20 L20 23 L11 18.5 Z" fill="#92400e" opacity="0.85" />
            <path d="M29 15.5 L20 20 L20 23 L29 18.5 Z" fill="#7c2d12" opacity="0.85" />
          </g>
          {/* 운동학 핀 3점 (E84 느낌) */}
          <circle cx="20" cy="14" r="0.9" fill="#0f172a" />
          <circle cx="16" cy="16" r="0.9" fill="#0f172a" />
          <circle cx="24" cy="16" r="0.9" fill="#0f172a" />
        </>
      )

    case 'storage':
      return (
        <>
          {/* 키 큰 스토커 캐비닛 */}
          <IsoCube uid={uid} height={17} />
          {/* 전면 랙 슬롯 (좌 측면에 3단) */}
          <g stroke="#0b1220" strokeWidth="0.5" opacity="0.7">
            <line x1="7" y1="19" x2="20" y2="25.5" />
            <line x1="7" y1="24" x2="20" y2="30.5" />
            <line x1="7" y1="29" x2="20" y2="35.5" />
          </g>
          {/* 슬롯 점유 표시 (violet) */}
          <g fill={`url(#${uid}-violet)`} opacity="0.9">
            <circle cx="11" cy="19.5" r="1" />
            <circle cx="15" cy="21.5" r="1" />
            <circle cx="11" cy="24.5" r="1" />
            <circle cx="15" cy="26.5" r="1" />
          </g>
          {/* 우 측면 하이라이트 랙 라인 */}
          <g stroke="#0b1220" strokeWidth="0.5" opacity="0.5">
            <line x1="33" y1="19" x2="20" y2="25.5" />
            <line x1="33" y1="24" x2="20" y2="30.5" />
            <line x1="33" y1="29" x2="20" y2="35.5" />
          </g>
        </>
      )
  }
}
