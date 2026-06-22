import type { ConveyorUnit } from '../../types/conveyor'
import { unitTitle } from '../../constants/conveyorTypes'

interface PlacementToolbarProps {
  units: ConveyorUnit[]
  selectedUnit: ConveyorUnit | null
  selectedCount: number
  allSelected: boolean
  baseUnitId: string | null
  completionMessage: string | null
  onSetBase: (unitId: string) => void
  onComplete: () => void
  onSelectAll: () => void
  onClearSelection: () => void
}

export function PlacementToolbar({
  units,
  selectedUnit,
  selectedCount,
  allSelected,
  baseUnitId,
  completionMessage,
  onSetBase,
  onComplete,
  onSelectAll,
  onClearSelection,
}: PlacementToolbarProps) {
  const baseUnit = units.find((unit) => unit.id === baseUnitId) ?? null
  const canComplete = units.length > 0 && baseUnitId !== null

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="text-slate-400">기준 컨베이어</span>
          <span className="ml-2 font-medium text-amber-300">
            {baseUnit ? baseUnit.name : '미지정'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={units.length === 0}
            onClick={allSelected ? onClearSelection : onSelectAll}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allSelected ? '선택 해제' : '전체 선택'}
          </button>
          <button
            type="button"
            disabled={!selectedUnit || selectedCount > 1}
            onClick={() => selectedUnit && onSetBase(selectedUnit.id)}
            className="rounded-md border border-amber-800/60 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            선택 모듈을 기준으로 지정
          </button>
          <button
            type="button"
            disabled={!canComplete}
            onClick={onComplete}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            배치 완료
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        기준 컨베이어에서 연결 순서대로 이름 끝 숫자를 기준으로 1씩 증가해 순번을 부여합니다.
        {allSelected && units.length > 0 ? (
          <>
            {' '}
            <span className="text-violet-300">
              전체 {units.length}개 모듈 선택됨 — 아무 모듈이나 드래그해 라인 전체를
              이동할 수 있습니다.
            </span>
          </>
        ) : selectedUnit ? (
          <>
            {' '}
            선택 중:{' '}
            <span className="text-slate-300" title={unitTitle(selectedUnit)}>
              {selectedUnit.name}
            </span>
            {selectedCount > 1 ? (
              <span className="text-slate-400"> 외 {selectedCount - 1}개</span>
            ) : null}
          </>
        ) : null}
      </p>

      {completionMessage && (
        <p className="text-xs text-emerald-300">{completionMessage}</p>
      )}
    </div>
  )
}
