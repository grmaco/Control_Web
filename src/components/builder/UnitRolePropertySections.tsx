import { useEffect, useMemo } from 'react'
import type { ConveyorLine, ConveyorUnit, InterfaceUnitType } from '../../types/conveyor'
import type {
  PortProperties,
  JunctionRoutingProperties,
  StkProperties,
  StkPolicy,
  StkRoutingProperties,
  UnitRole,
} from '../../types/unitProperties'
import {
  STK_POLICIES,
  STK_POLICY_LABELS,
  UNIT_ROLES,
  UNIT_ROLE_LABELS,
} from '../../constants/unitRoles'
import { isPortUnit, isStorageUnit } from '../../constants/conveyorTypes'
import { INTERFACE_UNIT_TYPES } from '../../constants/interfaceUnits'
import {
  computeStkLoadRate,
  defaultJunctionRoutingProperties,
  defaultStkRoutingProperties,
  getPortProperties,
  listPortLinkedUnitCandidates,
  mergePortProperties,
  readPortProperties,
  getStkProperties,
  getJunctionRoutingProperties,
  getJunctionRequestUnitIds,
  getStkRoutingProperties,
  isJunctionUnit,
  isTurnRoutingUnit,
  listJunctionRequestUnitCandidates,
  listJunctionRequestSecondaryUnitCandidates,
  unitDisplayCode,
  validateJunctionConfiguration,
  validatePortConfiguration,
  syncFlowRoleUnitRole,
  canSelectInterfaceUnit,
} from '../../utils/unitPropertyHelpers'
import { buildOutputDestinationOptions } from '../../utils/flowEntries'
import { resolveOutputDestinationId } from '../../utils/unitRefs'
import { updateUnitInLine } from '../../utils/units'
import { outboundPathLabelForPort } from '../../utils/outboundFlow'

interface RoleSectionsProps {
  line: ConveyorLine
  unit: ConveyorUnit
  onChange: (line: ConveyorLine) => void
  pickingOutputDestination?: boolean
  onStartPickOutputDestination?: () => void
  onCancelPickOutputDestination?: () => void
}

function patchProperties(
  line: ConveyorLine,
  unit: ConveyorUnit,
  properties: ConveyorUnit['properties'],
  onChange: (line: ConveyorLine) => void,
) {
  onChange(updateUnitInLine(line, unit.id, { properties }))
}

function patchStkRouting(
  line: ConveyorLine,
  unit: ConveyorUnit,
  stkRouting: StkRoutingProperties,
  onChange: (line: ConveyorLine) => void,
) {
  onChange(updateUnitInLine(line, unit.id, { stkRouting }))
}

function patchJunctionRouting(
  line: ConveyorLine,
  unit: ConveyorUnit,
  junctionRouting: JunctionRoutingProperties,
  onChange: (line: ConveyorLine) => void,
) {
  onChange(updateUnitInLine(line, unit.id, { junctionRouting }))
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
          ? '투입구 직선 CV와 연결되는 외부 설비(OHT·AGV 등)를 선택하세요.'
          : '출고구 직선 CV와 연결되는 외부 설비(OHT·AGV 등)를 선택하세요.'}
      </p>
    </div>
  )
}

export function TurnStkRoutingSection({ line, unit, onChange }: RoleSectionsProps) {
  const props = getStkRoutingProperties(unit, line)
  if (!props) return null

  const stks = line.units.filter(isStorageUnit)

  const update = (patch: Partial<StkRoutingProperties>) => {
    patchStkRouting(line, unit, { ...props, ...patch }, onChange)
  }

  const toggleAllowedStk = (stkId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...props.allowedStkIds, stkId])]
      : props.allowedStkIds.filter((id) => id !== stkId)
    update({ allowedStkIds: next })
  }

  return (
    <div className="space-y-2 rounded-md border border-violet-900/50 bg-violet-950/20 p-3">
      <p className="text-xs font-medium text-violet-200">
        STK 분기 ({isJunctionUnit(unit) ? '분기' : '회전'} 유닛)
      </p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        분기 라우팅 활성
      </label>
      <div>
        <label className="mb-1 block text-xs text-slate-400">우선순위</label>
        <input
          type="number"
          min={1}
          step={1}
          value={props.priority}
          onChange={(e) => update({ priority: Number(e.target.value) || 1 })}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          투입 경로에 STK 분기가 여러 개일 때 적용 순서입니다. 숫자가 작을수록 먼저
          사용됩니다.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">STK 정책</label>
        <select
          value={props.targetStkPolicy}
          onChange={(e) => update({ targetStkPolicy: e.target.value as StkPolicy })}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          {STK_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {STK_POLICY_LABELS[policy]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">허용 STK</label>
        <p className="mb-1 text-[11px] leading-relaxed text-slate-500">
          체크한 STK만 라우팅·시뮬 대상입니다. 라운드 로빈은 2개 이상 체크하세요.
        </p>
        <div className="max-h-28 space-y-1 overflow-auto text-xs">
          {stks.map((stk) => (
            <label key={stk.id} className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={props.allowedStkIds.includes(stk.id)}
                onChange={(e) => toggleAllowedStk(stk.id, e.target.checked)}
              />
              {unitDisplayCode(stk)}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export function JunctionRequestSection({ line, unit, onChange }: RoleSectionsProps) {
  const props = getJunctionRoutingProperties(unit, line)
  if (!props) return null

  const requestUnitIds = getJunctionRequestUnitIds(props)
  const primaryId = requestUnitIds[0] ?? ''
  const secondaryId = requestUnitIds[1] ?? ''

  const primaryCandidates = useMemo(
    () => listJunctionRequestUnitCandidates(line, unit),
    [line, unit],
  )
  const secondaryCandidates = useMemo(
    () => listJunctionRequestSecondaryUnitCandidates(line, unit),
    [line, unit],
  )
  const issues = useMemo(() => validateJunctionConfiguration(line, unit), [line, unit])

  const update = (patch: Partial<JunctionRoutingProperties>) => {
    const merged = { ...props, ...patch }
    const ids = getJunctionRequestUnitIds(merged)
    patchJunctionRouting(
      line,
      unit,
      {
        ...merged,
        requestUnitIds: ids,
        requestUnitId: ids[0] ?? '',
      },
      onChange,
    )
  }

  const setPrimary = (nextId: string) => {
    const nextIds = nextId ? [nextId] : []
    if (nextId && secondaryId && secondaryCandidates.some((c) => c.id === secondaryId)) {
      nextIds.push(secondaryId)
    }
    update({ requestUnitIds: nextIds })
  }

  const setSecondary = (nextId: string) => {
    const nextIds = primaryId ? (nextId ? [primaryId, nextId] : [primaryId]) : []
    update({ requestUnitIds: nextIds })
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-3">
      <p className="text-xs font-medium text-amber-200">분기 물류</p>
      <p className="text-[11px] leading-relaxed text-slate-400">
        평시에는 경유 컨베이어처럼 직진으로 물류가 흐릅니다. 요청 CV 1·2가 양쪽에서
        요청하면 1→2로 교차 흐름이 가능하며, 직진 물류가 항상 우선합니다.
      </p>
      <div>
        <label className="mb-1 block text-xs text-slate-400">분기 요청 컨베이어 1</label>
        <select
          value={primaryId}
          onChange={(e) => setPrimary(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
        >
          <option value="">선택</option>
          {primaryCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {unitDisplayCode(candidate)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">
          분기 요청 컨베이어 2 (선택)
        </label>
        <select
          value={secondaryId}
          onChange={(e) => setSecondary(e.target.value)}
          disabled={!primaryId}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="">없음</option>
          {secondaryCandidates
            .filter((candidate) => candidate.id !== primaryId)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {unitDisplayCode(candidate)}
              </option>
            ))}
        </select>
        {primaryId ? (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            분기와 가로·세로 직선으로 연결된 CV가 표시됩니다. 1번과 다른 축·측면도 선택할 수
            있습니다.
          </p>
        ) : null}
      </div>
      {issues.map((issue) => (
        <p
          key={issue.message}
          className={`text-xs ${issue.severity === 'error' ? 'text-red-300' : 'text-amber-300'}`}
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
  pickingOutputDestination = false,
  onStartPickOutputDestination,
  onCancelPickOutputDestination,
}: RoleSectionsProps) {
  const portUnit = useMemo(
    () => line.units.find((item) => item.id === unit.id) ?? unit,
    [line.units, unit],
  )
  const props = useMemo(
    () => readPortProperties(line, portUnit),
    [line, portUnit],
  )
  const staleOutputLabel = useMemo(() => {
    const stored = getPortProperties(portUnit)?.outputDestination?.trim()
    if (!stored) return null
    const valid = resolveOutputDestinationId(line, portUnit.id, stored)
    return valid ? null : stored
  }, [line, portUnit])
  const resolvedOutputDestination = props.outputDestination ?? ''

  const isOut = (portUnit.portDirection ?? 'IN') === 'OUT'
  const linkCandidates = useMemo(
    () => listPortLinkedUnitCandidates(line, portUnit),
    [line, portUnit],
  )
  const outputOptions = useMemo(
    () =>
      buildOutputDestinationOptions(
        line,
        portUnit.id,
        resolvedOutputDestination || undefined,
      ),
    [line, portUnit.id, resolvedOutputDestination],
  )
  const selectedDestination = resolvedOutputDestination
    ? line.units.find((item) => item.id === resolvedOutputDestination)
    : null

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
          <p className="mt-1 text-xs text-amber-300">
            인접 {isOut ? 'UNLOAD' : 'LOAD'} UNIT이 없습니다. STK 반대편 라인 CV를
            포트 옆에 배치하세요.
          </p>
        ) : null}
      </div>
      {isOut ? (
        <div>
          <label className="mb-1 block text-xs text-slate-400">출고구 (목적지 CV)</label>
          {staleOutputLabel ? (
            <p className="mb-2 text-xs text-amber-300">
              저장된 목적지 「{staleOutputLabel}」는 이 라인에 없습니다. 다시 선택하세요.
            </p>
          ) : null}
          {pickingOutputDestination ? (
            <div className="mb-2 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2 py-1.5 text-xs text-emerald-200">
              캔버스에서 목적지 CV를 클릭하세요 · Esc 취소
            </div>
          ) : null}
          <div className="flex gap-1">
            <select
              value={resolvedOutputDestination}
              onChange={(e) => update({ outputDestination: e.target.value })}
              disabled={pickingOutputDestination}
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">— 선택 —</option>
              {outputOptions.map((output) => (
                <option key={output.id} value={output.id}>
                  {unitDisplayCode(output)}
                  {output.id === resolvedOutputDestination ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                pickingOutputDestination
                  ? onCancelPickOutputDestination?.()
                  : onStartPickOutputDestination?.()
              }
              className={`shrink-0 rounded-md border px-2 py-1.5 text-xs whitespace-nowrap ${
                pickingOutputDestination
                  ? 'border-amber-700 bg-amber-950/50 text-amber-200 hover:bg-amber-950'
                  : 'border-emerald-700 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950'
              }`}
            >
              {pickingOutputDestination ? '취소' : '캔버스'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            포트와 연결된 컨베이어에서 도달 가능한 CV만 표시됩니다. 드롭다운 또는
            캔버스 클릭으로 지정할 수 있습니다.
            {selectedDestination ? (
              <>
                {' '}
                · 현재{' '}
                <span className="text-emerald-300">{unitDisplayCode(selectedDestination)}</span>
              </>
            ) : null}
          </p>
        </div>
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
  pickingOutputDestination,
  onStartPickOutputDestination,
  onCancelPickOutputDestination,
}: RoleSectionsProps) {
  useEffect(() => {
    if (!isTurnRoutingUnit(unit)) return
    const needsStk = !unit.stkRouting
    const needsJunction = isJunctionUnit(unit) && !unit.junctionRouting
    if (!needsStk && !needsJunction) return

    const patch: {
      stkRouting?: StkRoutingProperties
      junctionRouting?: JunctionRoutingProperties
    } = {}
    if (needsStk) patch.stkRouting = defaultStkRoutingProperties(line)
    if (needsJunction) patch.junctionRouting = defaultJunctionRoutingProperties(line, unit)
    onChange(updateUnitInLine(line, unit.id, patch))
  }, [unit.id, unit.stkRouting, unit.junctionRouting, line.id, line.units.length])

  return (
    <div className="space-y-3">
      <UnitRoleSelector line={line} unit={unit} onChange={onChange} />
      <StraightInterfaceUnitSection line={line} unit={unit} onChange={onChange} />
      {isTurnRoutingUnit(unit) ? (
        <TurnStkRoutingSection line={line} unit={unit} onChange={onChange} />
      ) : null}
      {isJunctionUnit(unit) ? (
        <JunctionRequestSection line={line} unit={unit} onChange={onChange} />
      ) : null}
      {isStorageUnit(unit) ? (
        <StkRoleSection line={line} unit={unit} onChange={onChange} />
      ) : null}
      {isPortUnit(unit) ? (
        <PortRoleSection
          line={line}
          unit={unit}
          onChange={onChange}
          pickingOutputDestination={pickingOutputDestination}
          onStartPickOutputDestination={onStartPickOutputDestination}
          onCancelPickOutputDestination={onCancelPickOutputDestination}
        />
      ) : null}
    </div>
  )
}
