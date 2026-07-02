import type { ConveyorLine, Rotation } from '../../types/conveyor'
import type { OhtSelection } from '../../types/oht'
import { ohtRailLabel } from '../../constants/ohtRail'
import { getOhtRails, getOhtUnits } from '../../utils/ohtLayer'
import { OhtRailGlyph } from '../monitor/OhtRailGlyph'
import { OhtVehicleGlyph } from './OhtPaletteItem'

interface OhtBuilderPropertiesPanelProps {
  line: ConveyorLine
  selection: OhtSelection
  onRotate: () => void
  onSetRotation?: (rotation: Rotation) => void
  onDelete: () => void
  onRename: (name: string) => void
}

function DirBtn({
  label,
  rotation,
  current,
  onClick,
  title,
}: {
  label: string
  rotation: Rotation
  current: Rotation
  onClick?: (r: Rotation) => void
  title?: string
}) {
  const active = current === rotation
  return (
    <button
      type="button"
      onClick={() => onClick?.(rotation)}
      disabled={active}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded text-base font-bold transition-colors disabled:cursor-default ${
        active
          ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

const ROTATION_LABEL: Record<Rotation, { dir: string; arrow: string }> = {
  0:   { dir: '북 (↑)', arrow: '↑' },
  90:  { dir: '동 (→)', arrow: '→' },
  180: { dir: '남 (↓)', arrow: '↓' },
  270: { dir: '서 (←)', arrow: '←' },
}

export function OhtBuilderPropertiesPanel({
  line,
  selection,
  onRotate,
  onSetRotation,
  onDelete,
  onRename,
}: OhtBuilderPropertiesPanelProps) {
  const rail =
    selection.kind === 'rail'
      ? getOhtRails(line).find((r) => r.id === selection.id) ?? null
      : null
  const unit =
    selection.kind === 'unit'
      ? getOhtUnits(line).find((u) => u.id === selection.id) ?? null
      : null

  if (!rail && !unit) {
    return <p className="text-xs text-slate-500">선택된 OHT 요소가 없습니다.</p>
  }

  const unitDirInfo = unit ? ROTATION_LABEL[unit.rotation] : null

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 rounded-md border border-cyan-800/50 bg-slate-950/50 p-3">
        <span className="shrink-0 rounded bg-slate-900 p-1">
          {rail ? (
            <OhtRailGlyph type={rail.type} rotation={rail.rotation} size={36} emphasized />
          ) : (
            <OhtVehicleGlyph size={32} />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cyan-100">
            {rail ? ohtRailLabel(rail.type) : (unit?.name ?? 'OHT 대차')}
          </p>
          <p className="text-[11px] text-slate-500">
            {rail
              ? `레일 · 회전 ${rail.rotation}° · (${rail.gridX}, ${rail.gridY})`
              : `OHT 대차 · (${unit?.gridX}, ${unit?.gridY})`}
          </p>
        </div>
      </div>

      {/* OHT 대차 전용 */}
      {unit ? (
        <>
          {/* 이름 */}
          <label className="block">
            <span className="text-xs text-slate-400">이름</span>
            <input
              type="text"
              value={unit.name}
              onChange={(e) => onRename(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>

          {/* 출발 방향 */}
          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-medium text-slate-400">초기 출발 방향</p>
            <div className="flex items-center gap-3">
              {/* 방향 화살표 4방향 선택 */}
              <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-0.5">
                {/* 북 */}
                <span />
                <DirBtn label="↑" rotation={0} current={unit.rotation} onClick={onSetRotation} title="북 (↑) — rotation 0°" />
                <span />
                {/* 서 / 중앙 / 동 */}
                <DirBtn label="←" rotation={270} current={unit.rotation} onClick={onSetRotation} title="서 (←) — rotation 270°" />
                <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-950 text-lg text-slate-600">
                  ⊕
                </span>
                <DirBtn label="→" rotation={90} current={unit.rotation} onClick={onSetRotation} title="동 (→) — rotation 90°" />
                {/* 남 */}
                <span />
                <DirBtn label="↓" rotation={180} current={unit.rotation} onClick={onSetRotation} title="남 (↓) — rotation 180°" />
                <span />
              </div>
              <div>
                <p className="text-sm font-semibold text-cyan-200">
                  {unitDirInfo?.arrow} {unitDirInfo?.dir}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  rotation {unit.rotation}°
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  시뮬레이션 시작 시<br />이 방향으로 첫 출발합니다.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* 버튼 */}
      <div className="grid grid-cols-2 gap-2">
        {rail ? (
          <button
            type="button"
            onClick={onRotate}
            className="rounded border border-slate-600 bg-slate-800 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            회전 (R)
          </button>
        ) : (
          <button
            type="button"
            onClick={onRotate}
            className="rounded border border-slate-600 bg-slate-800 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            회전 (R)
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-red-700/60 bg-red-950/40 py-2 text-sm text-red-200 hover:bg-red-900/50"
        >
          삭제 (Del)
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        {rail
          ? '레일을 드래그해 이동, R로 회전할 수 있습니다. 개구부가 이웃 레일과 마주보면 연결선이 이어집니다.'
          : '방향 버튼 또는 R키로 출발 방향을 설정하세요. 루프 레일에서는 이 방향으로만 주행합니다.'}
      </p>
    </div>
  )
}
