import type { SemiCnvIOStatus } from '../../types/semicnv'

interface IOStatusPanelProps {
  ioStatus: SemiCnvIOStatus | null
}

function ConditionBadge({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block min-w-[42px] rounded px-2 py-0.5 text-center text-xs font-bold ${
        on ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-300'
      }`}
    >
      {on ? 'On' : 'Off'}
    </span>
  )
}

function StatusCard({
  title,
  subtitle,
  statusLabel,
  statusOk,
  children,
}: {
  title: string
  subtitle: string
  statusLabel: string
  statusOk: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded border border-slate-700 bg-slate-900/80 p-4">
      <p className="text-xs font-semibold tracking-wide text-slate-400">{title}</p>
      <p
        className={`mt-1 text-2xl font-bold ${statusOk ? 'text-cyan-400' : 'text-red-400'}`}
      >
        {statusLabel}
      </p>
      <p className="mb-3 text-[10px] text-slate-500">{subtitle}</p>
      {children}
    </div>
  )
}

function ConditionTable({
  rows,
}: {
  rows: { no: number; name: string; status: boolean }[]
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          <th className="py-1 pr-2 text-left font-medium">No</th>
          <th className="py-1 pr-2 text-left font-medium">CONDITION</th>
          <th className="py-1 text-center font-medium">STATUS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.no} className="border-b border-slate-800">
            <td className="py-1 pr-2 text-slate-400">{r.no}</td>
            <td className="py-1 pr-2 text-slate-200">{r.name}</td>
            <td className="py-1 text-center">
              <ConditionBadge on={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Dashboard의 3-panel 그리드 자리에 들어가는 Safety/Auto/Program 패널 */
export function IOStatusPanels({ ioStatus }: IOStatusPanelProps) {
  const noDataCard = (title: string) => (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded border border-slate-700 bg-slate-900/80 text-sm text-slate-500">
      {title}
      <span className="mt-1 text-xs text-slate-600">V3 연결 대기 중</span>
    </div>
  )

  if (!ioStatus) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {noDataCard('SAFETY CONDITION')}
        {noDataCard('AUTO CONDITION')}
        {noDataCard('CURRENT STATUS')}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* SAFETY CONDITION */}
      <StatusCard
        title="SAFETY CONDITION"
        subtitle="Main Power, EMO, EMS Check"
        statusLabel={ioStatus.safetyOk ? 'Safety OK' : 'Safety NG'}
        statusOk={ioStatus.safetyOk}
      >
        <ConditionTable rows={ioStatus.safetyConditions} />
      </StatusCard>

      {/* AUTO CONDITION */}
      <StatusCard
        title="AUTO CONDITION"
        subtitle="Safety OK, Power ON, Home Done"
        statusLabel={ioStatus.autoConditionOk ? 'Enable' : 'Disable'}
        statusOk={ioStatus.autoConditionOk}
      >
        <ConditionTable rows={ioStatus.autoConditions} />
      </StatusCard>

      {/* CURRENT STATUS + PROGRAM STATUS */}
      <StatusCard
        title="CURRENT STATUS"
        subtitle="RUN Check, IN/OUT Mode Check"
        statusLabel={ioStatus.currentStatus}
        statusOk={ioStatus.currentStatus === 'Auto Run'}
      >
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
          PROGRAM STATUS
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-1 pr-2 text-left font-medium">ITEM</th>
              <th className="py-1 text-left font-medium">VALUE</th>
            </tr>
          </thead>
          <tbody>
            {ioStatus.programStatus.map((p, i) => (
              <tr key={i} className="border-b border-slate-800">
                <td className="py-1 pr-2 text-slate-400">{p.item}</td>
                <td className="py-1 text-slate-200">{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </StatusCard>
    </div>
  )
}

export function IOStatusPanel({ ioStatus }: IOStatusPanelProps) {
  if (!ioStatus) {
    return (
      <div className="flex h-64 items-center justify-center rounded border border-slate-700 bg-slate-900/80 text-sm text-slate-500">
        V3 연결 후 I/O 데이터가 표시됩니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 상단 3개 카드 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* SAFETY CONDITION */}
        <StatusCard
          title="SAFETY CONDITION"
          subtitle="Main Power, EMO, EMS Check"
          statusLabel={ioStatus.safetyOk ? 'Safety OK' : 'Safety NG'}
          statusOk={ioStatus.safetyOk}
        >
          <ConditionTable rows={ioStatus.safetyConditions} />
        </StatusCard>

        {/* AUTO CONDITION */}
        <StatusCard
          title="AUTO CONDITION"
          subtitle="Safety OK, Power ON, Home Done"
          statusLabel={ioStatus.autoConditionOk ? 'Enable' : 'Disable'}
          statusOk={ioStatus.autoConditionOk}
        >
          <ConditionTable rows={ioStatus.autoConditions} />
        </StatusCard>

        {/* CURRENT STATUS */}
        <StatusCard
          title="CURRENT STATUS"
          subtitle="RUN Check, IN/OUT Mode Check"
          statusLabel={ioStatus.currentStatus}
          statusOk={ioStatus.currentStatus === 'Auto Run'}
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">
            PROGRAM STATUS
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-1 pr-2 text-left font-medium">ITEM</th>
                <th className="py-1 text-left font-medium">VALUE</th>
              </tr>
            </thead>
            <tbody>
              {ioStatus.programStatus.map((p, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1 pr-2 text-slate-400">{p.item}</td>
                  <td className="py-1 text-slate-200">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatusCard>
      </div>

      <p className="text-right text-[10px] text-slate-600">
        마지막 수신: {new Date(ioStatus.updatedAt).toLocaleTimeString()}
      </p>
    </div>
  )
}
