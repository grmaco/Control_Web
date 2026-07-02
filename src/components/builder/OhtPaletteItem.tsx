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
