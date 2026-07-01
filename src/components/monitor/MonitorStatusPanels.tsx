import type { ReactNode } from 'react'
import type { SemiCnvIOStatus } from '../../types/semicnv'
import {
  autoConditionValueClass,
  currentStatusValueClass,
  type CurrentStatusMode,
  safetyConditionValueClass,
} from '../../utils/monitorStats'

// ── Panel icons ───────────────────────────────────────────────────────────────

function SafetyIcon({ ok }: { ok: boolean }) {
  return (
    <svg
      width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
      className={ok ? 'text-blue-400 panel-icon-ok' : 'text-red-400 panel-icon-ng'}
    >
      {/* Shield — path stays within 0-52 viewBox (bottom ≈ y47) */}
      <path
        d="M26 4L7 13v12c0 10 8 19 19 22 11-3 19-12 19-22V13L26 4z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
        fill="currentColor" fillOpacity="0.1"
      />
      {ok ? (
        <path
          d="M17 26l7 8 13-15"
          stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      ) : (
        <>
          <line x1="19" y1="19" x2="33" y2="33" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="33" y1="19" x2="19" y2="33" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

function AutoConditionIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
      {/* Gear — spins when enabled */}
      <g className={enabled ? 'text-emerald-400 panel-gear-spin' : 'text-slate-500'}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="24" y="3" width="4" height="8.5" rx="2"
            fill="currentColor"
            transform={`rotate(${deg} 26 26)`}
          />
        ))}
        <circle cx="26" cy="26" r="11" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" />
        <circle cx="26" cy="26" r="5" fill="currentColor" fillOpacity="0.85" />
      </g>
      {/* Status badge (top-right, outside spin group) */}
      {enabled ? (
        <g className="text-emerald-400 panel-icon-ok">
          <circle cx="40" cy="12" r="8" fill="rgb(5 46 22)" stroke="currentColor" strokeWidth="1.5" />
          <path d="M36.5 12l3 3.5 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      ) : (
        <g className="text-red-500">
          <circle cx="40" cy="12" r="8" fill="rgb(40 8 8)" stroke="currentColor" strokeWidth="1.5" />
          <line x1="37.5" y1="9.5" x2="42.5" y2="14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="42.5" y1="9.5" x2="37.5" y2="14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}

function CurrentStatusIcon({ status }: { status: string }) {
  if (status === 'Auto Run' || status === 'Cycle Mode') {
    return (
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
        className="text-blue-400 panel-icon-run">
        {/* Spinning dashed ring */}
        <circle
          cx="26" cy="26" r="19"
          stroke="currentColor" strokeWidth="3" fill="none"
          strokeDasharray="22 8" strokeLinecap="round"
          className="panel-gear-spin"
        />
        {/* Static play triangle */}
        <polygon points="20,18 20,34 36,26" fill="currentColor" fillOpacity="0.9" />
      </svg>
    )
  }

  if (status === 'Manual Mode') {
    return (
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
        className="text-amber-400 panel-icon-ok">
        {/* Hand outline */}
        <path
          d="M20 32V20a4 4 0 0 1 8 0v6m0 0V18a4 4 0 0 1 8 0v14c0 7-5 13-12 14-6-1-11-7-11-14v-6a4 4 0 0 1 8 0v6"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          fill="currentColor" fillOpacity="0.1"
        />
      </svg>
    )
  }

  if (status === 'Error') {
    return (
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
        className="text-red-400 panel-icon-ng">
        <circle cx="26" cy="26" r="21" stroke="currentColor" strokeWidth="2.5" fill="currentColor" fillOpacity="0.08" />
        <line x1="18" y1="18" x2="34" y2="34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <line x1="34" y1="18" x2="18" y2="34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  }

  /* Standby / default — clock */
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden
      className="text-slate-500">
      <circle cx="26" cy="26" r="19" stroke="currentColor" strokeWidth="2" fill="none" />
      <line x1="26" y1="12" x2="26" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="26" y1="26" x2="36" y2="33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="26" r="2" fill="currentColor" />
    </svg>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function StatusPanel({
  title,
  value,
  valueClass,
  checks,
  icon,
}: {
  title: string
  value: string
  valueClass: string
  checks: string[]
  icon: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col rounded border border-slate-700 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold tracking-wide text-slate-400">{title}</h3>
          <p className={`mt-3 text-2xl font-bold ${valueClass}`}>{value}</p>
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            {checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>
        <div className="mr-8 shrink-0">{icon}</div>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

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
  const safetyOk           = ioStatus != null ? ioStatus.safetyOk        : safetyOkFallback
  const autoEnabled        = ioStatus != null ? ioStatus.autoConditionOk : autoEnabledFallback
  const currentStatusLabel = ioStatus?.currentStatus ?? currentStatusFallback

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatusPanel
        title="SAFETY CONDITION"
        value={safetyOk ? 'Safety OK' : 'Safety NG'}
        valueClass={safetyConditionValueClass(safetyOk)}
        checks={['Main Power, EMO, EMS Check']}
        icon={<SafetyIcon ok={safetyOk} />}
      />
      <StatusPanel
        title="AUTO CONDITION"
        value={autoEnabled ? 'Enable' : 'Disable'}
        valueClass={autoConditionValueClass(autoEnabled)}
        checks={['Safety OK, Power ON, Home Done']}
        icon={<AutoConditionIcon enabled={autoEnabled} />}
      />
      <StatusPanel
        title="CURRENT STATUS"
        value={currentStatusLabel}
        valueClass={currentStatusValueClass(currentStatusLabel)}
        checks={['RUN Check, IN/OUT Mode Check']}
        icon={<CurrentStatusIcon status={currentStatusLabel} />}
      />
    </div>
  )
}
