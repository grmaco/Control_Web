import { useCallback, useRef } from 'react'

interface ControlButtonProps {
  label: string
  active: boolean
  onClick?: () => void
  onLongPress?: () => void
  longPressMs?: number
}

function ControlButton({ label, active, onClick, onLongPress, longPressMs = 1000 }: ControlButtonProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const startPress = useCallback(() => {
    firedRef.current = false
    if (onLongPress) {
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        onLongPress()
      }, longPressMs)
    }
  }, [onLongPress, longPressMs])

  const endPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!firedRef.current) {
      onClick?.()
    }
  }, [onClick])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    firedRef.current = false
  }, [])

  return (
    <button
      type="button"
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={cancel}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      className={`relative min-w-[120px] rounded border px-4 py-2 text-sm font-semibold transition-colors select-none ${
        active
          ? 'border-blue-500 bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.45)]'
          : 'border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'
      }`}
    >
      {label}
      {onLongPress && (
        <span className="absolute bottom-0.5 right-1 text-[9px] text-slate-400 opacity-60">
          hold
        </span>
      )}
    </button>
  )
}

export function MonitorControlBar({
  etherCatConnected,
  allPowerOn,
  allAutoRun,
  onToggleEtherCat,
  onToggleAllPower,
  onAllPowerOn,
  onAllAutoRun,
  onAllAutoStop,
  onAlarmReset,
}: {
  etherCatConnected: boolean
  allPowerOn: boolean
  allAutoRun: boolean
  onToggleEtherCat: () => void
  onToggleAllPower: () => void
  onAllPowerOn: () => void
  onAllAutoRun: () => void
  onAllAutoStop: () => void
  onAlarmReset: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton label="EtherCAT"     active={etherCatConnected} onClick={onToggleEtherCat} />
      <ControlButton
        label="All Power On"
        active={allPowerOn}
        onClick={onToggleAllPower}
        onLongPress={onAllPowerOn}
        longPressMs={1000}
      />
      <ControlButton
        label="All Auto Run"
        active={allAutoRun}
        onClick={onAllAutoRun}
        onLongPress={onAllAutoStop}
        longPressMs={1000}
      />
      <ControlButton label="Alarm Reset"  active={false} onClick={onAlarmReset} />
    </div>
  )
}
