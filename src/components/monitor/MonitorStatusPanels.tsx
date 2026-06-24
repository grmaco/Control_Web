import type { SemiCnvIOStatus } from '../../types/semicnv'
import type { CurrentStatusMode } from '../../utils/monitorStats'

function StatusPanel({
  title,
  value,
  valueClass,
  checks,
}: {
  title: string
  value: string
  valueClass: string
  checks: string[]
}) {
  return (
    <div className="flex flex-1 flex-col rounded border border-slate-700 bg-slate-900/80 p-4">
      <h3 className="text-xs font-semibold tracking-wide text-slate-400">{title}</h3>
      <p className={`mt-3 text-2xl font-bold ${valueClass}`}>{value}</p>
      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        {checks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>
    </div>
  )
}

export function MonitorStatusPanels({
  ioStatus,
  safetyOk: safetyOkFallback,
  autoEnabled: autoEnabledFallback,
  currentStatus: currentStatusFallback,
}: {
  ioStatus?: SemiCnvIOStatus | null
  safetyOk: boolean
  autoEnabled: boolean
  currentStatus: CurrentStatusMode
}) {
  // V3에서 IO_STATUS를 받은 경우 해당 값 우선 사용
  const safetyOk   = ioStatus != null ? ioStatus.safetyOk        : safetyOkFallback
  const autoEnabled = ioStatus != null ? ioStatus.autoConditionOk : autoEnabledFallback
  const currentStatusLabel = ioStatus?.currentStatus ?? currentStatusFallback

  const currentStatusClass =
    currentStatusLabel === 'Error' || currentStatusLabel === 'Idle'
      ? currentStatusLabel === 'Error' ? 'text-red-400' : 'text-slate-300'
      : currentStatusLabel === 'Auto Run'
        ? 'text-blue-400'
        : currentStatusLabel === 'Manual Mode'
          ? 'text-amber-400'
          : 'text-slate-300'

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatusPanel
        title="SAFETY CONDITION"
        value={safetyOk ? 'Safety OK' : 'Safety NG'}
        valueClass={safetyOk ? 'text-blue-400' : 'text-red-400'}
        checks={['Main Power, EMO, EMS Check']}
      />
      <StatusPanel
        title="AUTO CONDITION"
        value={autoEnabled ? 'Enable' : 'Disable'}
        valueClass={autoEnabled ? 'text-emerald-400' : 'text-slate-400'}
        checks={['Safety OK, Power ON, Home Done']}
      />
      <StatusPanel
        title="CURRENT STATUS"
        value={currentStatusLabel}
        valueClass={currentStatusClass}
        checks={['RUN Check, IN/OUT Mode Check']}
      />
    </div>
  )
}
