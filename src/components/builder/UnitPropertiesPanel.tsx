import { useMemo, useState } from 'react'
import { useTouchLayout } from '../../hooks/useTouchLayout'
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
import { formatFlowRoleLabel } from '../../utils/flowEntries'
import { getTurnOpenings } from '../../utils/turnArc'
import { RolePropertySections } from './UnitRolePropertySections'
import { computeMinimapFlowMap } from '../../utils/flowDirection'
import {
  canSelectInterfaceUnit,
  getPortProperties,
  portRoleFromDirection,
  readPortProperties,
  unitDisplayCode,
} from '../../utils/unitPropertyHelpers'

interface UnitPropertiesPanelProps {
  line: ConveyorLine
  unit: ConveyorUnit | null
  selectedUnitIds?: string[]
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
  onChange,
  onDelete,
  onRotate,
  outputDestinationPickPortId = null,
  onStartPickOutputDestination,
  onCancelPickOutputDestination,
}: UnitPropertiesPanelProps) {
  const touchLayout = useTouchLayout()
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const unitFlowMap = useMemo(() => computeMinimapFlowMap(line), [line])

  const propertiesToggleLabel = unit
    ? `${unit.name} 속성`
    : selectedUnitIds.length > 1
      ? `${selectedUnitIds.length}개 선택 속성`
      : '속성 · V3 설정'

  const showPropertyDetails = !touchLayout || propertiesOpen

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
        {touchLayout ? (
          <button
            type="button"
            onClick={() => setPropertiesOpen((open) => !open)}
            className="flex min-h-[40px] w-full items-center justify-between rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200"
          >
            <span className="font-medium">{propertiesToggleLabel}</span>
            <span className="text-slate-500">{propertiesOpen ? '▲' : '▼'}</span>
          </button>
        ) : null}

        {showPropertyDetails ? (
          <>
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
              <option value={0}>무</option>
              <option value={1}>유</option>
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
          </>
        ) : null}
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="space-y-4">
        {touchLayout ? (
          <button
            type="button"
            onClick={() => setPropertiesOpen((open) => !open)}
            className="flex min-h-[40px] w-full items-center justify-between rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200"
          >
            <span className="font-medium">{propertiesToggleLabel}</span>
            <span className="text-slate-500">{propertiesOpen ? '▲' : '▼'}</span>
          </button>
        ) : null}

        {showPropertyDetails ? (
          <>
        <p className="text-sm text-slate-500">
          유닛을 클릭해 선택하세요. 팔레트에서 그리드로 드래그해 배치할 수 있습니다.
        </p>

        {/* ── 라인 V3 연결 설정 ── */}
        <div className="rounded border border-slate-700 bg-slate-800/50 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-400 tracking-wide">V3 연결 설정</p>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              V3 URL
              <span className="ml-1 text-slate-600">(이 라인 전용)</span>
            </label>
            <input
              type="text"
              placeholder="ws://10.200.30.99:8765/ws/dashboard/"
              value={line.semiCnvWsUrl ?? ''}
              onChange={(e) => {
                const val = e.target.value.trim()
                onChange({ ...line, semiCnvWsUrl: val || undefined })
              }}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
            />
            <p className="mt-1 text-[10px] text-slate-600">
              비우면 전역 설정 URL 사용
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              V3 Line ID
              <span className="ml-1 text-slate-600">(LINE_STATUS 매핑)</span>
            </label>
            <input
              type="number"
              min={0}
              placeholder="V3의 Line 인덱스 (0부터)"
              value={line.semiCnvLineId ?? ''}
              onChange={(e) => {
                const val = e.target.value
                onChange({
                  ...line,
                  semiCnvLineId: val === '' ? undefined : parseInt(val, 10),
                })
              }}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
            />
            <p className="mt-1 text-[10px] text-slate-600">
              V3 라인 인덱스 (0, 1, 2…). 비우면 순서 자동 매핑
            </p>
          </div>
        </div>
          </>
        ) : null}
      </div>
    )
  }

  const canRotate = showsRotation(unit.type)
  const isPort = isPortUnit(unit)
  const isStorage = isStorageUnit(unit)

  return (
    <div className="space-y-4">
      {touchLayout ? (
        <button
          type="button"
          onClick={() => setPropertiesOpen((open) => !open)}
          className="flex min-h-[40px] w-full items-center justify-between rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200"
        >
          <span className="min-w-0 truncate font-medium">{propertiesToggleLabel}</span>
          <span className="shrink-0 text-slate-500">{propertiesOpen ? '▲' : '▼'}</span>
        </button>
      ) : null}

      {showPropertyDetails ? (
        <>
      <div>
        <label className="mb-1 block text-xs text-slate-400">이름</label>
        <input
          type="text"
          value={unit.name}
          onChange={(e) => {
            const nextName = e.target.value
            onChange(
              updateUnitInLine(line, unit.id, {
                name: nextName,
                code: nextName,
              }),
            )
          }}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">
          V3 컨베이어 ID
          <span className="ml-1 text-slate-600">(V3 연동 매칭용)</span>
        </label>
        <input
          type="number"
          min={0}
          placeholder="V3 Conveyor.ID (예: 1)"
          value={unit.semiCnvId ?? ''}
          onChange={(e) => {
            const val = e.target.value
            onChange(
              updateUnitInLine(line, unit.id, {
                semiCnvId: val === '' ? undefined : parseInt(val, 10),
              }),
            )
          }}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-slate-600">
          설정 시 이름 매칭보다 우선 적용됩니다.
        </p>
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
      ) : null}

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
            <option value={0}>무</option>
            <option value={1}>유</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            물류맵상 자재 표시와 시뮬레이션용입니다.
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
        {canRotate && unit.type !== 'junction' && (
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
        ) : canSelectInterfaceUnit(unit) ? (
          <p>
            연동 유닛:{' '}
            {unit.interfaceUnit ? unit.interfaceUnit : '없음'}
          </p>
        ) : null}
        <p>연결: {unit.connections.length}개</p>
        {unit.flowRole && (
          <p className={unit.flowRole === 'entry' ? 'text-amber-300' : 'text-emerald-300'}>
            {formatFlowRoleLabel(unit.flowRole)}점
            {unit.flowRole === 'entry' ? ' (순번 시작)' : ' (물류 종료)'}
          </p>
        )}
      </div>
        </>
      ) : null}

      {unit.type === 'turn' && (() => {
        const DIRS = ['N', 'E', 'S', 'W'] as const
        const DIR_LABEL: Record<string, string> = { N: '상(N)', E: '우(E)', S: '하(S)', W: '좌(W)' }
        const defaultPair = getTurnOpenings(unit.rotation)
        const customOpenings = unit.turnOpeningsConfig?.[unit.rotation]
        const effectiveOpenings: readonly string[] = customOpenings ?? defaultPair

        const handleToggle = (dir: 'N' | 'E' | 'S' | 'W') => {
          const current = effectiveOpenings as string[]
          const next = current.includes(dir)
            ? current.filter((d) => d !== dir)
            : [...current, dir]
          if (next.length === 0) return
          const isDefault = next.length === defaultPair.length && defaultPair.every((d) => next.includes(d))
          const nextConfig = { ...(unit.turnOpeningsConfig ?? {}) }
          if (isDefault) {
            delete nextConfig[unit.rotation]
          } else {
            nextConfig[unit.rotation] = next as ('N' | 'E' | 'S' | 'W')[]
          }
          onChange(updateUnitInLine(line, unit.id, { turnOpeningsConfig: nextConfig }))
        }

        const handleReset = () => {
          const nextConfig = { ...(unit.turnOpeningsConfig ?? {}) }
          delete nextConfig[unit.rotation]
          onChange(updateUnitInLine(line, unit.id, { turnOpeningsConfig: nextConfig }))
        }

        return (
          <div className="border-t border-slate-700 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">개구방향</span>
              {customOpenings != null && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {DIRS.map((dir) => {
                const checked = effectiveOpenings.includes(dir)
                const isDefault = defaultPair.includes(dir)
                return (
                  <label key={dir} className="flex cursor-pointer items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(dir)}
                      className="accent-sky-400"
                    />
                    <span className={isDefault && customOpenings == null ? 'text-sky-300' : 'text-slate-300'}>
                      {DIR_LABEL[dir]}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })()}

      <div className="flex gap-2">
        {canRotate && (
          <button
            type="button"
            onClick={() => onRotate(unit.id)}
            className="flex-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-800"
          >
            {unit.type === 'junction' ? '전환 (R)' : '회전 (R)'}
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
