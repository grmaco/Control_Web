interface MonitorMapControlsProps {
  is25DView: boolean
  hideModuleNames: boolean
  onToggle25DView: () => void
  onToggleHideModuleNames: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  onLineFit: () => void
  onFullMap: () => void
}

export function MonitorMapControls({
  is25DView,
  hideModuleNames,
  onToggle25DView,
  onToggleHideModuleNames,
  onZoomOut,
  onZoomIn,
  onLineFit,
  onFullMap,
}: MonitorMapControlsProps) {
  return (
    <div className="grid w-full grid-cols-3 grid-rows-[2.75rem_2.75rem] gap-2">
      <MapControlButton
        label={is25DView ? '2D 보기' : '3D 보기'}
        active={is25DView}
        onClick={onToggle25DView}
        block
      />
      <MapControlButton
        label={hideModuleNames ? '이름 보기' : '이름 숨기기'}
        active={hideModuleNames}
        onClick={onToggleHideModuleNames}
        block
      />
      <MapControlButton label="+" onClick={onZoomIn} zoom block />
      <MapControlButton label="라인 맞춤" onClick={onLineFit} block />
      <MapControlButton label="전체 맵" onClick={onFullMap} block />
      <MapControlButton label="−" onClick={onZoomOut} zoom block />
    </div>
  )
}

function MapControlButton({
  label,
  onClick,
  active = false,
  zoom = false,
  block = false,
}: {
  label: string
  onClick: () => void
  active?: boolean
  zoom?: boolean
  block?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center rounded border hover:bg-slate-700 ${
        block ? 'h-full w-full' : ''
      } ${
        active
          ? 'border-cyan-500/70 bg-cyan-950/30 text-cyan-200'
          : 'border-slate-700 bg-slate-800 text-slate-200'
      } ${
        zoom
          ? 'min-w-[4.5rem] px-3 text-2xl leading-none'
          : 'px-2 text-sm'
      }`}
    >
      {label}
    </button>
  )
}
