import { useDraggable } from '@dnd-kit/core'
import type { OhtRailType } from '../../types/oht'
import { ohtRailDescription, ohtRailLabel } from '../../constants/ohtRail'
import { ohtPaletteId, type OhtPaletteDragData } from './dnd'
import { OhtRailGlyph } from '../monitor/OhtRailGlyph'

interface OhtRailPaletteItemProps {
  railType: OhtRailType
}

export function OhtRailPaletteItem({ railType }: OhtRailPaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ohtPaletteId('rail', railType),
    data: { source: 'oht-palette', kind: 'rail', railType } satisfies OhtPaletteDragData,
  })

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none' }}
      className={`flex min-h-[52px] cursor-grab items-center gap-2 rounded border border-dashed border-cyan-700/60 bg-slate-800/80 px-2 py-2.5 text-left active:cursor-grabbing lg:px-3 ${
        isDragging ? 'opacity-40' : 'hover:border-cyan-500 hover:bg-slate-800'
      }`}
    >
      <span className="shrink-0 rounded bg-slate-950/60 p-0.5">
        <OhtRailGlyph type={railType} size={28} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-cyan-100">
          {ohtRailLabel(railType)}
        </span>
        <span className="mt-0.5 hidden text-[11px] text-slate-500 lg:block">
          {ohtRailDescription(railType)}
        </span>
      </span>
    </li>
  )
}

export function OhtUnitPaletteItem() {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ohtPaletteId('unit'),
    data: { source: 'oht-palette', kind: 'unit' } satisfies OhtPaletteDragData,
  })

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none' }}
      className={`flex min-h-[52px] cursor-grab items-center gap-2 rounded border border-dashed border-amber-600/60 bg-slate-800/80 px-2 py-2.5 text-left active:cursor-grabbing lg:px-3 ${
        isDragging ? 'opacity-40' : 'hover:border-amber-400 hover:bg-slate-800'
      }`}
    >
      <span className="shrink-0 rounded bg-slate-950/60 p-1">
        <OhtVehicleGlyph size={24} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-amber-100">OHT 대차</span>
        <span className="mt-0.5 hidden text-[11px] text-slate-500 lg:block">
          레일 위 출발 지점 · 시뮬 시 이동
        </span>
      </span>
    </li>
  )
}

/**
 * OHT 대차 — 입체 메탈릭 호이스트 유닛 (테란 느낌 · 불투명, 홀로그램 아님).
 * 프로브처럼 그라디언트·하이라이트·글로우로 입체감을 준다. `carrying` 시 하부에 카세트 표시.
 */
export function OhtVehicleGlyph({
  size = 24,
  carrying = false,
  materialOpacity,
}: {
  size?: number
  carrying?: boolean
  materialOpacity?: number
}) {
  const uid = 'ohtv'
  // materialOpacity가 명시되면 그 값 사용, 없으면 carrying 상태 기반
  const mOpacity = materialOpacity ?? (carrying ? 1 : 0)
  const showMaterial = mOpacity > 0.01
  const neonBlur = Math.round(mOpacity * 4)
  const neonSpread = Math.round(mOpacity * 9)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`${uid}-hull`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="18%" stopColor="#fcd34d" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id={`${uid}-hull-side`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${uid}-cabin`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="45%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#b45309" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-cassette`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#164e63" />
          <stop offset="50%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#083344" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="20" cy="34" rx="12" ry="2.6" fill="#020617" opacity="0.34" />
      {/* 하부 호버 글로우 */}
      <ellipse cx="20" cy="30" rx="10.5" ry="3.4" fill={`url(#${uid}-glow)`} />

      {/* 호이스트 카세트 (자재 — 네온 페이드인) */}
      {showMaterial ? (
        <g
          opacity={mOpacity}
          style={{
            filter: `drop-shadow(0 0 ${neonBlur}px rgba(34,211,238,0.9)) drop-shadow(0 0 ${neonSpread}px rgba(6,182,212,0.6))`,
          }}
        >
          {/* 와이어 */}
          <line x1="14.5" y1="26" x2="14.5" y2="30" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity={0.7 * mOpacity} />
          <line x1="25.5" y1="26" x2="25.5" y2="30" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity={0.7 * mOpacity} />
          {/* 카세트 본체 */}
          <rect x="12.5" y="30" width="15" height="7" rx="1.2" fill={`url(#${uid}-cassette)`} stroke="#22d3ee" strokeWidth="1.3" />
          {/* 상단 하이라이트 */}
          <rect x="13.5" y="30.8" width="13" height="1.4" rx="0.5" fill="rgba(255,255,255,0.22)" />
          {/* 네온 스캔라인 */}
          <rect x="15" y="32.5" width="10" height="1.4" rx="0.4" fill="#a5f3fc" opacity={0.75 * mOpacity} />
          <rect x="15" y="34.5" width="7" height="0.8" rx="0.3" fill="#67e8f9" opacity={0.45 * mOpacity} />
          {/* 코너 핀 */}
          <rect x="13" y="30.2" width="1.5" height="1.5" rx="0.3" fill="#38bdf8" opacity={0.9} />
          <rect x="25.5" y="30.2" width="1.5" height="1.5" rx="0.3" fill="#38bdf8" opacity={0.9} />
        </g>
      ) : null}

      {/* 상단 레일 브래킷 */}
      <rect x="16" y="4" width="8" height="3.4" rx="1" fill={`url(#${uid}-cabin)`} stroke="#1e293b" strokeWidth="0.6" />
      <rect x="18.5" y="2.4" width="3" height="2.4" rx="0.6" fill="#64748b" />

      {/* 본체 (베벨 육각) */}
      <path
        d="M 8 12 L 12 8 L 28 8 L 32 12 L 32 24 L 28 27 L 12 27 L 8 24 Z"
        fill={`url(#${uid}-hull)`}
        stroke="#78350f"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* 우측 음영 면 (입체) */}
      <path d="M 28 8 L 32 12 L 32 24 L 28 27 Z" fill={`url(#${uid}-hull-side)`} opacity="0.85" />
      {/* 좌상단 하이라이트 */}
      <path d="M 12 8 L 28 8 L 26 10 L 12.5 10 Z" fill="#fffbeb" opacity="0.55" />

      {/* 센서 캐빈 */}
      <rect x="14" y="12" width="12" height="7.5" rx="1.4" fill={`url(#${uid}-cabin)`} stroke="#1e293b" strokeWidth="0.7" />
      <rect x="15.5" y="13.4" width="9" height="3" rx="0.8" fill="#0f172a" />
      <circle cx="20" cy="14.9" r="1.15" fill="#38bdf8">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
      </circle>

      {/* 하부 위험 스트라이프 */}
      <g>
        <rect x="10.5" y="21.5" width="19" height="3.6" fill="#1c1917" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M ${11 + i * 4} 21.5 l 2.4 0 l -2.4 3.6 l -2.4 0 Z`}
            fill="#fbbf24"
          />
        ))}
      </g>

      {/* 하부 스러스터/휠 */}
      <circle cx="13" cy="27" r="1.7" fill="#fde68a" stroke="#78350f" strokeWidth="0.6" />
      <circle cx="27" cy="27" r="1.7" fill="#fde68a" stroke="#78350f" strokeWidth="0.6" />
      <circle cx="13" cy="27" r="0.7" fill="#78350f" />
      <circle cx="27" cy="27" r="0.7" fill="#78350f" />
    </svg>
  )
}

/**
 * 황금 푸들 얼굴 글리프 — OHT 반송 "푸들 모드" 전용.
 * running=true 일 때 달리는 바운스 애니메이션 적용.
 * materialOpacity > 0 일 때 뼈다귀(Bone) 표시.
 */
export function PoodleGlyph({
  size = 24,
  materialOpacity = 0,
  running = false,
}: {
  size?: number
  materialOpacity?: number
  running?: boolean
}) {
  const showBone = materialOpacity > 0.01
  const boneBlur  = Math.round(materialOpacity * 5)
  const boneSoftBlur = Math.round(materialOpacity * 11)

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: running
          ? 'poodle-run 0.34s ease-in-out infinite'
          : 'poodle-idle 2.2s ease-in-out infinite',
      }}
    >
      {/* 뼈다귀 (자재) — 머리 위에 표시 */}
      {showBone && (
        <svg
          viewBox="0 0 38 16"
          width={size * 1.3}
          height={size * 0.45}
          style={{
            position: 'absolute',
            top: '-42%',
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: materialOpacity,
            filter: `drop-shadow(0 0 ${boneBlur}px rgba(255,240,160,0.95)) drop-shadow(0 0 ${boneSoftBlur}px rgba(255,215,80,0.6))`,
            overflow: 'visible',
          }}
          aria-hidden
        >
          {/* 가운데 막대 */}
          <rect x="10" y="6" width="18" height="4" rx="2" fill="#FFF8DC" />
          {/* 왼쪽 골단 */}
          <circle cx="8.5"  cy="5"  r="4" fill="#FFF8DC" />
          <circle cx="8.5"  cy="11" r="4" fill="#FFF8DC" />
          {/* 오른쪽 골단 */}
          <circle cx="29.5" cy="5"  r="4" fill="#FFF8DC" />
          <circle cx="29.5" cy="11" r="4" fill="#FFF8DC" />
        </svg>
      )}

      {/* 푸들 얼굴 */}
      <svg
        viewBox="0 0 44 44"
        width={size}
        height={size}
        aria-hidden
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="pdl-ear-l" cx="60%" cy="40%" r="55%">
            <stop offset="0%"   stopColor="#E8A010" />
            <stop offset="100%" stopColor="#A06808" />
          </radialGradient>
          <radialGradient id="pdl-ear-r" cx="40%" cy="40%" r="55%">
            <stop offset="0%"   stopColor="#E8A010" />
            <stop offset="100%" stopColor="#A06808" />
          </radialGradient>
          <radialGradient id="pdl-head" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stopColor="#FADA5E" />
            <stop offset="50%"  stopColor="#F0B830" />
            <stop offset="100%" stopColor="#C88010" />
          </radialGradient>
          <radialGradient id="pdl-top" cx="50%" cy="30%" r="55%">
            <stop offset="0%"   stopColor="#FDE07A" />
            <stop offset="100%" stopColor="#E0A020" />
          </radialGradient>
        </defs>

        {/* 귀 (왼쪽) — 크고 둥글고 푹신 */}
        <circle cx="7"  cy="20" r="10" fill="url(#pdl-ear-l)" />
        <circle cx="5"  cy="16" r="7"  fill="url(#pdl-ear-l)" opacity="0.9" />

        {/* 귀 (오른쪽) */}
        <circle cx="37" cy="20" r="10" fill="url(#pdl-ear-r)" />
        <circle cx="39" cy="16" r="7"  fill="url(#pdl-ear-r)" opacity="0.9" />

        {/* 머리 */}
        <circle cx="22" cy="25" r="16" fill="url(#pdl-head)" />

        {/* 탑 폼폼 (금발 곱슬머리) */}
        <circle cx="22" cy="10" r="8"  fill="url(#pdl-top)" />
        <circle cx="16" cy="12" r="6"  fill="url(#pdl-top)" />
        <circle cx="28" cy="12" r="6"  fill="url(#pdl-top)" />
        <circle cx="13" cy="16" r="4.5" fill="url(#pdl-top)" opacity="0.85" />
        <circle cx="31" cy="16" r="4.5" fill="url(#pdl-top)" opacity="0.85" />

        {/* 탑 폼폼 윤기 하이라이트 */}
        <ellipse cx="19" cy="7" rx="4" ry="2.5" fill="#FFF5C0" opacity="0.45" />


        {/* 눈 */}
        <circle cx="15" cy="22" r="3.2" fill="#1A0800" />
        <circle cx="29" cy="22" r="3.2" fill="#1A0800" />
        {/* 눈 광택 1 */}
        <circle cx="16.2" cy="20.6" r="1.2" fill="white" opacity="0.9" />
        <circle cx="30.2" cy="20.6" r="1.2" fill="white" opacity="0.9" />
        {/* 눈 광택 2 (작은 반짝이) */}
        <circle cx="14"   cy="23"   r="0.6" fill="white" opacity="0.55" />
        <circle cx="28"   cy="23"   r="0.6" fill="white" opacity="0.55" />

        {/* 볼 홍조 */}
        <circle cx="9"  cy="29" r="4.5" fill="#FF8FAB" opacity="0.28" />
        <circle cx="35" cy="29" r="4.5" fill="#FF8FAB" opacity="0.28" />

        {/* 주둥이 (밝은 영역) */}
        <ellipse cx="22" cy="32" rx="7" ry="5.5" fill="#FADA5E" opacity="0.7" />

        {/* 코 */}
        <ellipse cx="22" cy="29" rx="3.5" ry="2.5" fill="#1A0800" />
        <ellipse cx="21" cy="28.2" rx="1.2" ry="0.8" fill="white" opacity="0.38" />

        {/* 인중 */}
        <line x1="22" y1="31" x2="22" y2="33" stroke="#1A0800" strokeWidth="1.2" strokeLinecap="round" />

        {/* 미소 */}
        <path d="M16 33 Q22 38 28 33" stroke="#1A0800" strokeWidth="1.6" fill="none" strokeLinecap="round" />

        {/* 혀 (살짝 내밀어) */}
        <ellipse cx="22" cy="36" rx="3" ry="2.2" fill="#FF6B8A" />
        <ellipse cx="22" cy="35.5" rx="2" ry="1.2" fill="#FF8FAB" opacity="0.7" />
      </svg>

      <style>{`
        @keyframes poodle-run {
          0%   { transform: translateY(0px)  rotate(-7deg) scaleX(1.06); }
          20%  { transform: translateY(-5px) rotate(-3deg) scaleX(1); }
          40%  { transform: translateY(-6px) rotate(0deg)  scaleX(0.97); }
          60%  { transform: translateY(-5px) rotate(3deg)  scaleX(1); }
          80%  { transform: translateY(-2px) rotate(7deg)  scaleX(1.06); }
          100% { transform: translateY(0px)  rotate(-7deg) scaleX(1.06); }
        }
        @keyframes poodle-idle {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          30%      { transform: translateY(-3px) rotate(-2deg); }
          70%      { transform: translateY(-2px) rotate(2deg); }
        }
      `}</style>
    </div>
  )
}
