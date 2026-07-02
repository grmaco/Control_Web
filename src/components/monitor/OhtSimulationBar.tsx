import type { OhtSimulationStatus } from '../../hooks/useOhtSimulation'

interface OhtSimulationBarProps {
  status: OhtSimulationStatus
  railCount: number
  vehicleCount: number
  targetCount: number
  canSimulate: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  poodleMode?: boolean
  onPoodleModeToggle?: () => void
}

export function OhtSimulationBar({
  status,
  railCount,
  vehicleCount,
  targetCount,
  canSimulate,
  onStart,
  onPause,
  onResume,
  onReset,
  poodleMode = false,
  onPoodleModeToggle,
}: OhtSimulationBarProps) {
  const statusText =
    status === 'playing' ? '반송 중' : status === 'paused' ? '일시정지' : '대기'

  const setupHint =
    railCount === 0
      ? '라인 빌더 OHT 팔레트에서 레일을 배치하세요.'
      : vehicleCount === 0
        ? '라인 빌더에서 OHT 대차를 배치하세요.'
        : targetCount === 0
          ? '연동 속성이 OHT인 유닛(목적지)이 없습니다.'
          : null

  return (
    <div className="border-b border-slate-800 px-3 py-2 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-cyan-200">OHT 반송 시뮬레이션</span>
        <span className="text-xs text-slate-500">
          레일 {railCount} · 대차 {vehicleCount} · 연동 유닛 {targetCount}
        </span>
        <span className="text-xs text-slate-400">
          <span className="text-slate-500">상태</span>{' '}
          <span className="text-cyan-300">{statusText}</span>
        </span>

        {/* 변환 토글 버튼 */}
        <button
          type="button"
          onClick={onPoodleModeToggle}
          title={poodleMode ? 'OHT 모드로 전환' : '푸들 모드로 변환 🐩'}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
            poodleMode
              ? 'border-amber-400/70 bg-amber-900/40 text-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
              : 'border-slate-600 bg-slate-800/80 text-slate-400 hover:border-cyan-600 hover:text-cyan-300'
          }`}
        >
          {/* 변환 아이콘 (swap arrows) */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 5h9M8 2l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 11H5M8 14l-3-3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {poodleMode ? '🤖 OHT' : '🐩 푸들'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <SimBtn
          label="시작"
          disabled={!canSimulate || status === 'playing'}
          onClick={onStart}
          accent
        />
        <SimBtn label="일시정지" disabled={status !== 'playing'} onClick={onPause} />
        <SimBtn label="재개" disabled={status !== 'paused'} onClick={onResume} />
        <SimBtn label="초기화" disabled={status === 'idle'} onClick={onReset} />
      </div>

      {setupHint ? (
        <p className="mt-1.5 text-xs text-amber-300">{setupHint}</p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          OHT가 레일을 따라 연동 유닛으로 이동하며 LD/ULD 인터페이스로 자재를 주고받습니다.
        </p>
      )}
    </div>
  )
}

function SimBtn({
  label,
  disabled,
  onClick,
  accent,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[40px] rounded-lg border py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        accent
          ? 'border-cyan-600/70 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/60'
          : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  )
}
