import { useMemo } from 'react'
import type { ConveyorLine, ConveyorUnit, InterfaceUnitType } from '../../types/conveyor'
import type {
  PortProperties,
  StkProperties,
  TransitLinkedUnitsProperties,
  UnitRole,
} from '../../types/unitProperties'
import {
  UNIT_ROLES,
  UNIT_ROLE_LABELS,
} from '../../constants/unitRoles'
import { isPortUnit, isStorageUnit } from '../../constants/conveyorTypes'
import { INTERFACE_UNIT_TYPES } from '../../constants/interfaceUnits'
import {
  computeStkLoadRate,
  listPortLinkedUnitCandidates,
  mergePortProperties,
  readPortProperties,
  getStkProperties,
  getTransitLinkedUnitsProperties,
  isTurnRoutingUnit,
  listTransitLinkedUnitCandidates,
  unitDisplayCode,
  validateTransitLinkedUnits,
  validatePortConfiguration,
  syncFlowRoleUnitRole,
  canSelectInterfaceUnit,
} from '../../utils/unitPropertyHelpers'
import { updateUnitInLine } from '../../utils/units'
import { outboundPathLabelForPort } from '../../utils/outboundFlow'

interface RoleSectionsProps {
  line: ConveyorLine
  unit: ConveyorUnit
  onChange: (line: ConveyorLine) => void
}

function patchProperties(
  line: ConveyorLine,
  unit: ConveyorUnit,
  properties: ConveyorUnit['properties'],
  onChange: (line: ConveyorLine) => void,
) {
  onChange(updateUnitInLine(line, unit.id, { properties }))
}

function patchTransitLinkedUnits(
  line: ConveyorLine,
  unit: ConveyorUnit,
  transitLinkedUnits: TransitLinkedUnitsProperties,
  onChange: (line: ConveyorLine) => void,
) {
  onChange(
    updateUnitInLine(line, unit.id, {
      transitLinkedUnits,
      junctionRouting: null,
    }),
  )
}

function patchRole(
  line: ConveyorLine,
  unit: ConveyorUnit,
  role: UnitRole,
  onChange: (line: ConveyorLine) => void,
) {
  onChange(
    updateUnitInLine(line, unit.id, syncFlowRoleUnitRole(unit, { role })),
  )
}

export function UnitRoleSelector({ line, unit, onChange }: RoleSectionsProps) {
  if (isPortUnit(unit) || isStorageUnit(unit)) return null

  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">역할</label>
      <select
        value={unit.role ?? 'TRANSFER'}
        onChange={(e) => patchRole(line, unit, e.target.value as UnitRole, onChange)}
        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
      >
        {UNIT_ROLES.filter(
          (role) => role !== 'PORT_IN' && role !== 'PORT_OUT' && role !== 'STORAGE',
        ).map((role) => (
          <option key={role} value={role}>
            {UNIT_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </div>
  )
}

export function StraightInterfaceUnitSection({
  line,
  unit,
  onChange,
}: RoleSectionsProps) {
  if (!canSelectInterfaceUnit(unit)) return null

  const isInput = unit.flowRole === 'entry' || unit.role === 'INPUT'

  return (
    <div className="rounded-md border border-cyan-900/40 bg-cyan-950/20 p-3">
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
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {isInput
          ? '투입구와 연결되는 외부 설비(OHT·AGV 등)를 선택하세요. 지정하면 라인 CV 없이도 이 설비가 자재를 직접 투입합니다.'
          : '출고구와 연결되는 외부 설비(OHT·AGV 등)를 선택하세요. 지정하면 라인 CV 없이도 이 설비가 자재를 직접 반출합니다.'}
      </p>
    </div>
  )
}

export function TransitLinkedUnitsSection({ line, unit, onChange }: RoleSectionsProps) {
  if (!isTurnRoutingUnit(unit)) return null

  const props = getTransitLinkedUnitsProperties(unit, line)
  if (!props) return null

  const candidates = useMemo(
    () => listTransitLinkedUnitCandidates(line, unit),
    [line, unit],
  )
  const issues = useMemo(() => validateTransitLinkedUnits(line, unit), [line, unit])

  const toggleLinkedUnit = (unitId: string, checked: boolean) => {
    const nextIds = checked
      ? [...new Set([...props.linkedUnitIds, unitId])]
      : props.linkedUnitIds.filter((id) => id !== unitId)
    patchTransitLinkedUnits(line, unit, { linkedUnitIds: nextIds }, onChange)
  }

  return (
    <div className="rounded-md border border-cyan-900/40 bg-cyan-950/20 p-3">
      <label className="mb-1 block text-xs text-slate-400">연동 유닛</label>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
        인접한 출고점(flowRole=출고) 또는 포트만 선택할 수 있습니다. 투입 경로 목적지·시뮬
        연동에 사용됩니다.
      </p>
      {candidates.length === 0 ? (
        <p className="text-xs text-amber-300">
          인접 출고점·포트가 없습니다. 출고점 CV 또는 포트를 유닛 옆에 배치하세요.
        </p>
      ) : (
        <div className="max-h-28 space-y-1 overflow-auto text-xs">
          {candidates.map((candidate) => (
            <label key={candidate.id} className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={props.linkedUnitIds.includes(candidate.id)}
                onChange={(e) => toggleLinkedUnit(candidate.id, e.target.checked)}
              />
              {unitDisplayCode(candidate)}
            </label>
          ))}
        </div>
      )}
      {issues.map((issue) => (
        <p
          key={issue.message}
          className={`mt-2 text-xs ${issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'}`}
        >
          {issue.message}
        </p>
      ))}
    </div>
  )
}

export function StkRoleSection({ line, unit, onChange }: RoleSectionsProps) {
  const props = getStkProperties(unit)
  if (!props) return null

  const update = (patch: Partial<StkProperties>) => {
    patchProperties(line, unit, { ...props, ...patch }, onChange)
  }

  const loadRate = computeStkLoadRate(unit)

  return (
    <div className="space-y-2 rounded-md border border-sky-900/50 bg-sky-950/20 p-3">
      <p className="text-xs font-medium text-sky-200">스토커 속성</p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        STK 활성
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-400">capacity</label>
          <input
            type="number"
            min={1}
            value={props.capacity}
            onChange={(e) => update({ capacity: Number(e.target.value) || 1 })}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">currentLoad</label>
          <input
            type="number"
            min={0}
            value={props.currentLoad}
            onChange={(e) => update({ currentLoad: Number(e.target.value) || 0 })}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-slate-400">적재율: {loadRate}%</p>
    </div>
  )
}

function PortValidationAlerts({ line, unit }: { line: ConveyorLine; unit: ConveyorUnit}) {
  const issues = validatePortConfiguration(line, unit)
  if (issues.length === 0) return null

  return (
    <div className="space-y-1 rounded-md border border-amber-700/60 bg-amber-950/40 p-2">
      {issues.map((issue) => (
        <p key={issue.message} className="text-xs leading-relaxed text-amber-200">
          {issue.message}
        </p>
      ))}
    </div>
  )
}

export function PortRoleSection({
  line,
  unit,
  onChange,
}: RoleSectionsProps) {
  const portUnit = useMemo(
    () => line.units.find((item) => item.id === unit.id) ?? unit,
    [line.units, unit],
  )
  const props = useMemo(
    () => readPortProperties(line, portUnit),
    [line, portUnit],
  )

  const isOut = (portUnit.portDirection ?? 'IN') === 'OUT'
  const linkCandidates = useMemo(
    () => listPortLinkedUnitCandidates(line, portUnit),
    [line, portUnit],
  )

  const selectedLinkedCv = props.linkedUnitId
    ? line.units.find((item) => item.id === props.linkedUnitId)
    : null

  const update = (patch: Partial<PortProperties>) => {
    patchProperties(
      line,
      portUnit,
      mergePortProperties(line, portUnit, patch),
      onChange,
    )
  }

  const outboundPath = isOut ? outboundPathLabelForPort(line, portUnit.id) : null

  if (!isPortUnit(portUnit)) return null

  return (
    <div className="space-y-2 rounded-md border border-blue-900/50 bg-blue-950/20 p-3">
      <p className="text-xs font-medium text-blue-200">
        {isOut ? '출고구' : '투입고'}
      </p>
      <PortValidationAlerts line={line} unit={portUnit} />
      <div>
        <label className="mb-1 block text-xs text-slate-400">
          {isOut ? 'UNLOAD UNIT' : 'LOAD UNIT'}
        </label>
        <select
          value={props.linkedUnitId}
          onChange={(e) => update({ linkedUnitId: e.target.value })}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">— 선택 —</option>
          {linkCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {unitDisplayCode(candidate)}
            </option>
          ))}
        </select>
        <p
          className={`mt-1 text-xs leading-relaxed ${
            selectedLinkedCv ? 'text-emerald-300' : 'text-slate-400'
          }`}
        >
          {selectedLinkedCv
            ? isOut
              ? `STK에서 자재를 받아 ${unitDisplayCode(selectedLinkedCv)}으로 배출됩니다.`
              : `${unitDisplayCode(selectedLinkedCv)}에서 자재를 받아 STK로 투입됩니다.`
            : isOut
              ? '사용자가 직접 자재를 가져가는 포트로 사용됩니다.'
              : '사용자가 직접 자재를 입고하는 포트로 사용됩니다.'}
        </p>
        {linkCandidates.length === 0 ? (
          portUnit.interfaceUnit ? (
            <p className="mt-1 text-xs text-emerald-300">
              인접 {isOut ? 'UNLOAD' : 'LOAD'} UNIT은 없지만, 연동 유닛(
              {portUnit.interfaceUnit})이 자재를 직접 {isOut ? '반출' : '투입'}
              합니다.
            </p>
          ) : portUnit.flowRole != null ? (
            <p className="mt-1 text-xs text-emerald-300">
              인접 {isOut ? 'UNLOAD' : 'LOAD'} UNIT은 없지만 {isOut ? '출고' : '투입'}
              점으로 지정돼, {isOut ? '사람이 직접 자재를 반출' : '시뮬레이션 시작 시 프로브가 자재를 직접 투입'}
              합니다.
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-300">
              인접 {isOut ? 'UNLOAD' : 'LOAD'} UNIT이 없습니다. STK 반대편에 라인
              CV/회전/분기/리프트를 배치하거나, 이 포트를 투입·출고점으로
              지정하거나, 연동 유닛(OHT·AGV 등)을 지정하세요.
            </p>
          )
        ) : null}
      </div>
      {isOut ? (
        <p className="text-xs leading-relaxed text-slate-500">
          출고 시 STK에서 자재를 받아 UNLOAD UNIT과 핸드셰이크 후 라인 흐름을 따라
          종료점까지 반송됩니다. (목적지 CV 지정 불필요)
        </p>
      ) : null}
      {outboundPath ? (
        <p className="text-xs leading-relaxed text-emerald-300">출고 경로: {outboundPath}</p>
      ) : null}
    </div>
  )
}

export function RolePropertySections({
  line,
  unit,
  onChange,
}: RoleSectionsProps) {
  return (
    <div className="space-y-3">
      <UnitRoleSelector line={line} unit={unit} onChange={onChange} />
      <StraightInterfaceUnitSection line={line} unit={unit} onChange={onChange} />
      {isTurnRoutingUnit(unit) ? (
        <TransitLinkedUnitsSection line={line} unit={unit} onChange={onChange} />
      ) : null}
      {isStorageUnit(unit) ? (
        <StkRoleSection line={line} unit={unit} onChange={onChange} />
      ) : null}
      {isPortUnit(unit) ? (
        <PortRoleSection line={line} unit={unit} onChange={onChange} />
      ) : null}
    </div>
  )
}
