import type { ConveyorLine, ConveyorUnit } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import {
  CONVEYOR_TYPES,
  isDualModule,
  showsRotation,
  typeDescription,
  typeLabel,
} from '../../constants/conveyorTypes'
import { INTERFACE_UNIT_TYPES } from '../../constants/interfaceUnits'
import { updateUnitInLine } from '../../utils/units'
import type { InterfaceUnitType } from '../../types/conveyor'

interface UnitPropertiesPanelProps {
  line: ConveyorLine
  unit: ConveyorUnit | null
  isBase: boolean
  onSetBase: (unitId: string) => void
  onChange: (line: ConveyorLine) => void
  onDelete: (unitId: string) => void
  onRotate: (unitId: string) => void
}

const STATUSES = Object.entries(STATUS_COLORS).map(([value, colors]) => ({
  value: value as ConveyorUnit['status'],
  label: colors.label,
}))

export function UnitPropertiesPanel({
  line,
  unit,
  isBase,
  onSetBase,
  onChange,
  onDelete,
  onRotate,
}: UnitPropertiesPanelProps) {
  if (!unit) {
    return (
      <p className="text-sm text-slate-500">
        유닛을 클릭해 선택하세요. 팔레트에서 그리드로 드래그해 배치할 수 있습니다.
      </p>
    )
  }

  const canRotate = showsRotation(unit.type)

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-slate-400">이름</label>
        <input
          type="text"
          value={unit.name}
          onChange={(e) =>
            onChange(updateUnitInLine(line, unit.id, { name: e.target.value }))
          }
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">타입</label>
        <select
          value={unit.type}
          onChange={(e) =>
            onChange(
              updateUnitInLine(line, unit.id, {
                type: e.target.value as ConveyorUnit['type'],
              }),
            )
          }
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          {CONVEYOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">{typeDescription(unit.type)}</p>
      </div>

      {isDualModule(unit.type) && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
          이 모듈은 서로 다른 방향의 컨베이어 2개가 한 칸에 겹쳐 배치됩니다.
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-slate-400">연동 유닛</label>
        <select
          value={unit.interfaceUnit ?? ''}
          onChange={(e) =>
            onChange(
              updateUnitInLine(line, unit.id, {
                interfaceUnit: (e.target.value || null) as InterfaceUnitType | null,
              }),
            )
          }
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">없음</option>
          {INTERFACE_UNIT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          외부 설비와 연동되는 유닛 타입을 선택하세요.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">상태</label>
        <select
          value={unit.status}
          onChange={(e) =>
            onChange(
              updateUnitInLine(line, unit.id, {
                status: e.target.value as ConveyorUnit['status'],
              }),
            )
          }
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          {STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <p>위치: ({unit.gridX}, {unit.gridY})</p>
        {canRotate && <p>회전: {unit.rotation}°</p>}
        <p>
          연동 유닛:{' '}
          {unit.interfaceUnit ? unit.interfaceUnit : '없음'}
        </p>
        <p>연결: {unit.connections.length}개</p>
        {isBase && <p className="text-amber-300">기준 컨베이어 (CV-01 시작점)</p>}
      </div>

      {!isBase && (
        <button
          type="button"
          onClick={() => onSetBase(unit.id)}
          className="w-full rounded-md border border-amber-800/60 px-2 py-1.5 text-xs text-amber-200 hover:bg-amber-950/40"
        >
          기준 컨베이어로 지정
        </button>
      )}

      <div className="flex gap-2">
        {canRotate && (
          <button
            type="button"
            onClick={() => onRotate(unit.id)}
            className="flex-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-800"
          >
            회전 (R)
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(unit.id)}
          className={`rounded-md border border-red-900 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950/40 ${
            canRotate ? 'flex-1' : 'w-full'
          }`}
        >
          삭제
        </button>
      </div>
    </div>
  )
}
