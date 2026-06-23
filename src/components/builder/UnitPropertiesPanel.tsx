import { useMemo } from 'react'
import type {
  ConveyorLine,
  ConveyorUnit,
  ConveyorStatus,
  TestMaterialFlag,
  PortDirection,
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
import { updateUnitInLine, updateUnitsStatusInLine, updateUnitsTestMaterialInLine } from '../../utils/units'
import type { InterfaceUnitType, FlowRole } from '../../types/conveyor'
import {
  formatFlowRoleLabel,
  isFlowCapableUnit,
} from '../../utils/flowEntries'
import { RolePropertySections } from './UnitRolePropertySections'
import { computeMinimapFlowMap } from '../../utils/flowDirection'
import {
  getPortProperties,
  portRoleFromDirection,
  readPortProperties,
  unitDisplayCode,
} from '../../utils/unitPropertyHelpers'

interface UnitPropertiesPanelProps {
  line: ConveyorLine
  unit: ConveyorUnit | null
  selectedUnitIds?: string[]
  onSetFlowRole: (unitId: string, role: FlowRole | null) => void
  onChange: (line: ConveyorLine) => void
  onDelete: (unitId: string) => void
  onRotate: (unitId: string) => void
  outputDestinationPickPortId?: string | null
  onStartPickOutputDestination?: (portId: string) => void
  onCancelPickOutputDestination?: () => void
}

const STATUSES = Object.entries(STATUS_COLORS).map(([value, colors]) => ({
  value: value as ConveyorUnit['status'],
  label: colors.label,
}))

export function UnitPropertiesPanel({
  line,
  unit,
  selectedUnitIds = [],
  onSetFlowRole,
  onChange,
  onDelete,
  onRotate,
  outputDestinationPickPortId = null,
  onStartPickOutputDestination,
  onCancelPickOutputDestination,
}: UnitPropertiesPanelProps) {
  const unitFlowMap = useMemo(() => computeMinimapFlowMap(line), [line])

  if (selectedUnitIds.length > 1) {
    const selectedUnits = line.units.filter((item) =>
      selectedUnitIds.includes(item.id),
    )
    const uniqueStatuses = new Set(selectedUnits.map((item) => item.status))
    const bulkStatus =
      uniqueStatuses.size === 1 ? [...uniqueStatuses][0]! : ''

    const materialUnits = selectedUnits.filter((item) => !isStorageUnit(item))
    const uniqueMaterials = new Set(
      materialUnits.map((item) => item.testMaterial ?? 0),
    )
    const bulkMaterial =
      uniqueMaterials.size === 1 ? [...uniqueMaterials][0]! : ''

    return (
      <div className="space-y-4">
        <p className="text-sm text-violet-300">
          {selectedUnitIds.length}개 모듈 선택됨
          {selectedUnitIds.length === line.units.length ? ' (전체)' : ''}
        </p>

        <div>
          <label className="mb-1 block text-xs text-slate-400">상태 (일괄 적용)</label>
          <select
            value={bulkStatus}
            onChange={(e) => {
              const nextStatus = e.target.value as ConveyorStatus
              if (!nextStatus) return
              onChange(updateUnitsStatusInLine(line, selectedUnitIds, nextStatus))
            }}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
          >
            {uniqueStatuses.size > 1 ? (
              <option value="">— 여러 상태 —</option>
            ) : null}
            {STATUSES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {materialUnits.length > 0 ? (
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              테스트 자재 (미니맵, 일괄 적용)
            </label>
            <select
              value={bulkMaterial === '' ? '' : String(bulkMaterial)}
              onChange={(e) => {
                if (e.target.value === '') return
                const nextMaterial = Number(e.target.value) as TestMaterialFlag
                onChange(
                  updateUnitsTestMaterialInLine(
                    line,
                    materialUnits.map((item) => item.id),
                    nextMaterial,
                  ),
                )
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {uniqueMaterials.size > 1 ? (
                <option value="">— 여러 값 —</option>
              ) : null}
              <option value={0}>0 — 없음</option>
              <option value={1}>1 — 있음 (네온 표시)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              적재창고를 제외한 {materialUnits.length}개 모듈에 적용됩니다.
            </p>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-slate-500">
          선택된 모듈을 드래그해 함께 이동할 수 있습니다. 상태·자재 설정은 선택된
          모듈에 일괄 적용됩니다.
        </p>
      </div>
    )
  }

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
        <label className="mb-1 block text-xs text-slate-400">코드</label>
        <input
          type="text"
          value={unit.code ?? unit.name}
          onChange={(e) =>
            onChange(updateUnitInLine(line, unit.id, { code: e.target.value }))
          }
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">이름</label>
        <input
          type="text"
          value={unit.name}
          onChange={(e) => {
            const nextName = e.target.value
            const prevCode = unit.code?.trim()
            const prevName = unit.name.trim()
            onChange(
              updateUnitInLine(line, unit.id, {
                name: nextName,
                ...(!prevCode || prevCode === prevName ? { code: nextName } : {}),
              }),
            )
          }}
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
            <label className="mb-1 block text-xs text-slate-400">
              방향 · 역할 (투입고 / 출고구)
            </label>
            <select
              value={unit.portDirection ?? 'IN'}
              onChange={(e) => {
                const portDirection = e.target.value as PortDirection
                const role = portRoleFromDirection(portDirection)
                onChange(
                  updateUnitInLine(line, unit.id, {
                    portDirection,
                    role,
                    properties: readPortProperties(line, unit),
                  }),
                )
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
            >
              {PORT_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {direction === 'IN' ? 'IN · 투입고' : 'OUT · 출고구'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              방향과 역할(투입고/출고구)은 함께 결정됩니다. STK는 인접 배치 시 자동 인식되며, LOAD/UNLOAD UNIT은 아래에서 지정하세요.
            </p>
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
            주화면 미니맵 화살표 네온 효과 테스트용입니다.
          </p>
        </div>
      )}

      <RolePropertySections
        line={line}
        unit={unit}
        onChange={onChange}
        pickingOutputDestination={
          isPortUnit(unit) &&
          (unit.portDirection ?? 'IN') === 'OUT' &&
          outputDestinationPickPortId === unit.id
        }
        onStartPickOutputDestination={
          onStartPickOutputDestination
            ? () => onStartPickOutputDestination(unit.id)
            : undefined
        }
        onCancelPickOutputDestination={onCancelPickOutputDestination}
      />

      <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <p>위치: ({unit.gridX}, {unit.gridY})</p>
        {canRotate && (
          <p>
            {isLiftUnit(unit) ? '높이' : '회전'}:{' '}
            {formatRotationDisplay(unit, unitFlowMap.get(unit.id) ?? null)}
          </p>
        )}
        {isPort ? (
          <>
            <p>방향: {unit.portDirection ?? 'IN'}</p>
            <p>역할: {unit.portDirection === 'OUT' ? '출고구' : '투입고'}</p>
            <p>레시피: {unit.portRecipe ?? '2BP1ST'}</p>
            {getPortProperties(unit)?.linkedUnitId ? (
              <p>
                연동:{' '}
                {unitDisplayCode(
                  line.units.find((item) => item.id === getPortProperties(unit)?.linkedUnitId) ??
                    unit,
                )}
              </p>
            ) : null}
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
        {unit.flowRole && (
          <p className={unit.flowRole === 'entry' ? 'text-amber-300' : 'text-emerald-300'}>
            {formatFlowRoleLabel(unit.flowRole)}점
            {unit.flowRole === 'entry' ? ' (순번 시작)' : ' (물류 종료)'}
          </p>
        )}
      </div>

      {isFlowCapableUnit(unit) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onSetFlowRole(unit.id, unit.flowRole === 'entry' ? null : 'entry')
            }
            className="flex-1 rounded-md border border-amber-800/60 px-2 py-1.5 text-xs text-amber-200 hover:bg-amber-950/40"
          >
            {unit.flowRole === 'entry' ? '투입 해제' : '투입 지정'}
          </button>
          <button
            type="button"
            onClick={() =>
              onSetFlowRole(unit.id, unit.flowRole === 'exit' ? null : 'exit')
            }
            className="flex-1 rounded-md border border-emerald-800/60 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-950/40"
          >
            {unit.flowRole === 'exit' ? '출고 해제' : '출고 지정'}
          </button>
        </div>
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
