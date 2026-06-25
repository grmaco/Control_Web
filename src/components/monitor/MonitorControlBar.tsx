import { useCallback, useRef } from 'react'

interface ControlButtonProps {
  label: string
  active: boolean
  onClick?: () => void
  onLongPress?: () => void
  longPressMs?: number
  debounceMs?: number
}

function ControlButton({ label, active, onClick, onLongPress, longPressMs = 1000, debounceMs = 1000 }: ControlButtonProps) {
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef    = useRef(false)
  const lastClickAt = useRef(0)

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
      const now = Date.now()
      if (now - lastClickAt.current < debounceMs) return  // 연속 클릭 무시
      lastClickAt.current = now
      onClick?.()
    }
  }, [onClick, debounceMs])

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
      className={`relative min-w-[120px] rounded border px-4 py-3 text-sm font-semibold transition-colors select-none sm:py-2 ${
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
  onAllAutoRun,
  onAllAutoStop,
  onAlarmReset,
}: {
  etherCatConnected: boolean
  allPowerOn: boolean
  allAutoRun: boolean
  onToggleEtherCat: () => void
  onToggleAllPower: () => void
  onAllAutoRun: () => void
  onAllAutoStop: () => void
  onAlarmReset: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton label="EtherCAT"     active={etherCatConnected} onClick={onToggleEtherCat} />
      <ControlButton
        label="설비 전원"
        active={allPowerOn}
        onClick={onToggleAllPower}
      />
      <ControlButton
        label="설비 가동"
        active={allAutoRun}
        onClick={onAllAutoRun}
        onLongPress={onAllAutoStop}
        longPressMs={1000}
      />
      <ControlButton label="이상 복귀" active={false} onClick={onAlarmReset} />
    </div>
  )
}
