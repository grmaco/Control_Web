import type {
  ConveyorLine,
  ConveyorUnit,
  PortDirection,
  PortLinkedUnit,
  PortRecipe,
  StorageMaintenanceArea,
  StorageRobotCount,
  StorageShape,
} from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import {
  CONVEYOR_TYPES,
  isDualModule,
  isPortUnit,
  isStorageUnit,
  showsRotation,
  formatRotationDisplay,
  isLiftUnit,
  typeDescription,
  typeLabel,
} from '../../constants/conveyorTypes'
import { INTERFACE_UNIT_TYPES } from '../../constants/interfaceUnits'
import {
  PORT_DIRECTIONS,
  PORT_LINKED_UNITS,
  PORT_RECIPES,
} from '../../constants/port'
import {
  WAREHOUSE_FOOTPRINT_SIZE,
  WAREHOUSE_MAINTENANCE_AREAS,
  WAREHOUSE_ROBOT_COUNTS,
  WAREHOUSE_SHAPES,
  warehouseMaintenanceAreaLabel,
  warehouseShapeLabel,
} from '../../constants/warehouseUnit'
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
  const isPort = isPortUnit(unit)
  const isStorage = isStorageUnit(unit)

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
        {isPort || isStorage ? (
          <p className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200">
            {typeLabel(unit.type)}
          </p>
        ) : (
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
        )}
        <p className="mt-1 text-xs text-slate-500">{typeDescription(unit.type)}</p>
      </div>

      {isDualModule(unit.type) && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
          이 모듈은 서로 다른 방향의 컨베이어 2개가 한 칸에 겹쳐 배치됩니다.
        </div>
      )}

      {isPort ? (
        <>
          <div>
            <label className="mb-1 block text-xs text-slate-400">방향 (IN/OUT)</label>
            <select
              value={unit.portDirection ?? 'IN'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    portDirection: e.target.value as PortDirection,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {PORT_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {direction}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">레시피</label>
            <select
              value={unit.portRecipe ?? '2BP1ST'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    portRecipe: e.target.value as PortRecipe,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {PORT_RECIPES.map((recipe) => (
                <option key={recipe} value={recipe}>
                  {recipe}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">연동 유닛</label>
            <select
              value={unit.portLinkedUnit ?? 'OHT'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    portLinkedUnit: e.target.value as PortLinkedUnit,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {PORT_LINKED_UNITS.map((linkedUnit) => (
                <option key={linkedUnit} value={linkedUnit}>
                  {linkedUnit}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              OHT, STK, AGV 중 연동 설비를 선택하세요.
            </p>
          </div>
        </>
      ) : isStorage ? (
        <>
          <div>
            <label className="mb-1 block text-xs text-slate-400">형상</label>
            <select
              value={unit.storageShape ?? 'flat'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    storageShape: e.target.value as StorageShape,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {WAREHOUSE_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {warehouseShapeLabel(shape)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">ROBOT 수량</label>
            <select
              value={unit.storageRobotCount ?? '01'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    storageRobotCount: e.target.value as StorageRobotCount,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {WAREHOUSE_ROBOT_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">유지보수 영역</label>
            <select
              value={unit.storageMaintenanceArea ?? 'ALL'}
              onChange={(e) =>
                onChange(
                  updateUnitInLine(line, unit.id, {
                    storageMaintenanceArea: e.target.value as StorageMaintenanceArea,
                  }),
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {WAREHOUSE_MAINTENANCE_AREAS.map((area) => (
                <option key={area} value={area}>
                  {warehouseMaintenanceAreaLabel(area)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-orange-900/50 bg-orange-950/30 px-3 py-2 text-xs text-orange-200/90">
            {WAREHOUSE_FOOTPRINT_SIZE}×{WAREHOUSE_FOOTPRINT_SIZE} 정사각형(9칸)을 차지합니다.
          </div>
        </>
      ) : (
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
      )}

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

      {!isStorage && (
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            테스트 자재 (미니맵)
          </label>
          <select
            value={unit.testMaterial ?? 0}
            onChange={(e) =>
              onChange(
                updateUnitInLine(line, unit.id, {
                  testMaterial: Number(e.target.value) as ConveyorUnit['testMaterial'],
                }),
              )
            }
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value={0}>0 — 없음</option>
            <option value={1}>1 — 있음 (네온 표시)</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            HOME 미니맵 화살표 네온 효과 테스트용입니다.
          </p>
        </div>
      )}

      <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <p>위치: ({unit.gridX}, {unit.gridY})</p>
        {canRotate && (
          <p>
            {isLiftUnit(unit) ? '높이' : '회전'}: {formatRotationDisplay(unit)}
          </p>
        )}
        {isPort ? (
          <>
            <p>방향: {unit.portDirection ?? 'IN'}</p>
            <p>레시피: {unit.portRecipe ?? '2BP1ST'}</p>
            <p>연동 유닛: {unit.portLinkedUnit ?? 'OHT'}</p>
          </>
        ) : isStorage ? (
          <>
            <p>
              점유: {WAREHOUSE_FOOTPRINT_SIZE}×{WAREHOUSE_FOOTPRINT_SIZE} (
              {WAREHOUSE_FOOTPRINT_SIZE * WAREHOUSE_FOOTPRINT_SIZE}칸)
            </p>
            <p>
              형상:{' '}
              {unit.storageShape ? warehouseShapeLabel(unit.storageShape) : '평상형'}
            </p>
            <p>ROBOT 수량: {unit.storageRobotCount ?? '01'}</p>
            <p>
              유지보수 영역:{' '}
              {unit.storageMaintenanceArea
                ? warehouseMaintenanceAreaLabel(unit.storageMaintenanceArea)
                : 'ALL'}
            </p>
          </>
        ) : (
          <p>
            연동 유닛:{' '}
            {unit.interfaceUnit ? unit.interfaceUnit : '없음'}
          </p>
        )}
        <p>연결: {unit.connections.length}개</p>
        {isBase && <p className="text-amber-300">기준 컨베이어 (CV01 시작점)</p>}
      </div>

      {!isBase && !isPort && !isStorage && (
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
