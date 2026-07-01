import { useCallback, useRef } from 'react'

// ── Icons ────────────────────────────────────────────────────────────────────

function EtherCATIcon({ active }: { active: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle
        cx="12" cy="12" r="6"
        stroke="currentColor" strokeWidth="1.5" fill="none"
        className={active ? 'ctrl-icon-spin-slow' : undefined}
      />
      <circle
        cx="12" cy="12" r="9.5"
        stroke="currentColor" strokeWidth="1" fill="none"
        strokeOpacity="0.55" strokeDasharray="3 2"
        className={active ? 'ctrl-icon-spin-rev' : undefined}
      />
    </svg>
  )
}

function PowerIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden
      className={active ? 'ctrl-icon-pulse' : undefined}
    >
      <line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6.5 5.5A9 9 0 1 0 17.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g className={active ? 'ctrl-gear-spin' : undefined}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="11" y="1.5" width="2" height="3.5" rx="1"
            fill="currentColor"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="5.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </g>
    </svg>
  )
}

function AlarmIcon({ hasAlarm }: { hasAlarm: boolean }) {
  return (
    <svg
      width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden
      className={hasAlarm ? 'ctrl-icon-alarm' : undefined}
    >
      <path
        d="M12 3L2.5 20.5h19L12 3z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
        fill="currentColor" fillOpacity="0.12"
      />
      <line x1="12" y1="9.5" x2="12" y2="14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────

interface ControlButtonProps {
  label: string
  active: boolean
  emergency?: boolean
  disabled?: boolean
  icon: React.ReactNode
  onClick?: () => void
  debounceMs?: number
}

function ControlButton({
  label,
  active,
  emergency = false,
  disabled = false,
  icon,
  onClick,
  debounceMs = 500,
}: ControlButtonProps) {
  const lastClickAt = useRef(0)

  const handleClick = useCallback(() => {
    const now = Date.now()
    if (now - lastClickAt.current < debounceMs) return
    lastClickAt.current = now
    onClick?.()
  }, [onClick, debounceMs])

  const stateClass = disabled
    ? 'border-slate-700/40 bg-slate-800/40 text-slate-600 cursor-not-allowed'
    : emergency
      ? 'ctrl-btn-alarm-glow border-red-500/70 bg-red-950/60 text-red-300 hover:bg-red-900/60'
      : active
        ? 'ctrl-btn-glow border-blue-500/50 bg-blue-950/50 text-blue-200 hover:bg-blue-900/40'
        : 'border-slate-600/60 bg-slate-800/70 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200 hover:border-slate-500/70'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center rounded-xl border p-4 select-none transition-colors duration-200 ${stateClass}`}
    >
      {icon}
    </button>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function MonitorControlBar({
  etherCatConnected,
  allPowerOn,
  allAutoRun,
  autoCondEnabled,
  hasActiveAlarm,
  onToggleEtherCat,
  onToggleAllPower,
  onAllAutoRun,
  onAllAutoStop,
  onAlarmReset,
}: {
  etherCatConnected: boolean
  allPowerOn: boolean
  allAutoRun: boolean
  autoCondEnabled: boolean
  hasActiveAlarm: boolean
  onToggleEtherCat: () => void
  onToggleAllPower: () => void
  onAllAutoRun: () => void
  onAllAutoStop?: () => void
  onAlarmReset: () => void
}) {

  const handleRunToggle = useCallback(() => {
    if (allAutoRun) {
      onAllAutoStop?.()
    } else {
      onAllAutoRun()
    }
  }, [allAutoRun, onAllAutoRun, onAllAutoStop])

  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton
        icon={<EtherCATIcon active={etherCatConnected} />}
        label="EtherCAT"
        active={etherCatConnected}
        onClick={onToggleEtherCat}
      />
      <ControlButton
        icon={<PowerIcon active={allPowerOn} />}
        label="설비 전원"
        active={allPowerOn}
        onClick={onToggleAllPower}
      />
      <ControlButton
        icon={<GearIcon active={allAutoRun} />}
        label="설비 가동"
        active={allAutoRun}
        disabled={!autoCondEnabled}
        onClick={handleRunToggle}
      />
      <ControlButton
        icon={<AlarmIcon hasAlarm={hasActiveAlarm} />}
        label="이상 복귀"
        active={!hasActiveAlarm}
        emergency={hasActiveAlarm}
        onClick={onAlarmReset}
      />
    </div>
  )
}
