import type { ConveyorUnit } from '../../types/conveyor'
import { unitTitle } from '../../constants/conveyorTypes'
import {
  formatFlowRoleLabel,
  getEntryUnits,
  getExitUnits,
  hasFlowEntries,
} from '../../utils/flowEntries'
import type { ConveyorLine } from '../../types/conveyor'
import type { FlowRole } from '../../types/conveyor'

interface PlacementToolbarProps {
  line: ConveyorLine
  selectedUnit: ConveyorUnit | null
  selectedCount: number
  allSelected: boolean
  completionMessage: string | null
  onSetFlowRole: (unitId: string, role: FlowRole | null) => void
  onComplete: () => void
  onSelectAll: () => void
  onClearSelection: () => void
}

export function PlacementToolbar({
  line,
  selectedUnit,
  selectedCount,
  allSelected,
  completionMessage,
  onSetFlowRole,
  onComplete,
  onSelectAll,
  onClearSelection,
}: PlacementToolbarProps) {
  const entryUnits = getEntryUnits(line)
  const exitUnits = getExitUnits(line)
  const canComplete = line.units.length > 0 && hasFlowEntries(line)
  const canSetFlowRole =
    selectedUnit != null &&
    selectedCount === 1 &&
    ['straight', 'turn', 'junction', 'lift'].includes(selectedUnit.type)

  const entryLabel =
    entryUnits.length > 0
      ? entryUnits.map((unit) => unit.name).join(', ')
      : '미지정'
  const exitLabel =
    exitUnits.length > 0 ? exitUnits.map((unit) => unit.name).join(', ') : '미지정'

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-400">투입점</span>
          <span className="ml-2 font-medium text-amber-300">{entryLabel}</span>
        </div>
        <div>
          <span className="text-slate-400">출고점</span>
          <span className="ml-2 font-medium text-emerald-300">{exitLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          disabled={line.units.length === 0}
          onClick={allSelected ? onClearSelection : onSelectAll}
          className="min-h-[44px] rounded-md border border-slate-600 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {allSelected ? '선택 해제' : '전체 선택'}
        </button>
        <button
          type="button"
          disabled={!canSetFlowRole}
          onClick={() =>
            selectedUnit &&
            onSetFlowRole(
              selectedUnit.id,
              selectedUnit.flowRole === 'entry' ? null : 'entry',
            )
          }
          className="min-h-[44px] rounded-md border border-amber-800/60 px-3 py-2.5 text-sm text-amber-200 hover:bg-amber-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selectedUnit?.flowRole === 'entry' ? '투입 해제' : '투입 지정'}
        </button>
        <button
          type="button"
          disabled={!canSetFlowRole}
          onClick={() =>
            selectedUnit &&
            onSetFlowRole(
              selectedUnit.id,
              selectedUnit.flowRole === 'exit' ? null : 'exit',
            )
          }
          className="col-span-2 min-h-[44px] rounded-md border border-emerald-800/60 px-3 py-2.5 text-sm text-emerald-200 hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 sm:col-auto"
        >
          {selectedUnit?.flowRole === 'exit' ? '출고 해제' : '출고 지정'}
        </button>
        <button
          type="button"
          disabled={!canComplete}
          onClick={onComplete}
          className="col-span-2 min-h-[44px] rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:col-auto"
        >
          배치 완료
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        투입점에서 연결 순서대로 이름 끝 숫자를 기준으로 1씩 증가해 순번을 부여합니다. 분기
        라인은 투입점을 여러 개 지정할 수 있습니다.
        {allSelected && line.units.length > 0 ? (
          <>
            {' '}
            <span className="text-violet-300">
              전체 {line.units.length}개 모듈 선택됨 — 아무 모듈이나 드래그해 라인 전체를
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
            {selectedUnit.flowRole ? (
              <span className="text-slate-400">
                {' '}
                ({formatFlowRoleLabel(selectedUnit.flowRole)})
              </span>
            ) : null}
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
