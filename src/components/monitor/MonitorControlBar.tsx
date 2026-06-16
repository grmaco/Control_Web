interface ControlButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

export function MonitorControlBar({
  etherCatConnected,
  allPowerOn,
  onToggleEtherCat,
  onToggleAllPower,
  onAllAutoRun,
}: {
  etherCatConnected: boolean
  allPowerOn: boolean
  onToggleEtherCat: () => void
  onToggleAllPower: () => void
  onAllAutoRun: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton
        label="EtherCAT"
        active={etherCatConnected}
        onClick={onToggleEtherCat}
      />
      <ControlButton
        label="All Power On"
        active={allPowerOn}
        onClick={onToggleAllPower}
      />
      <ControlButton label="All Auto Run" active={false} onClick={onAllAutoRun} />
    </div>
  )
}

function ControlButton({ label, active, onClick }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[120px] rounded border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-blue-500 bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.45)]'
          : 'border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  )
}
