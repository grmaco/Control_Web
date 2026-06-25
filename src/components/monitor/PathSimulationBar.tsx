import type { ConveyorUnit } from '../../types/conveyor'
import type { MultiPathSimulationPlan } from '../../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../../types/unitProperties'
import type { PathSimulationMode, PathSimulationStatus } from '../../hooks/usePathSimulation'
import { unitDisplayCode } from '../../utils/unitPropertyHelpers'

interface PathSimulationBarProps {
  mode: PathSimulationMode
  onModeChange: (mode: PathSimulationMode) => void
  conveyorOnlyLine?: boolean
  sources: ConveyorUnit[]
  selectedSourceUnitIds: string[]
  onToggleSource: (sourceUnitId: string) => void
  plan: MultiPathSimulationPlan | null
  status: PathSimulationStatus
  progressLabel: string | null
  canSimulate: boolean
  testMaterialCount?: number
  activeUnitLabel: string | null
  waitingLabels: string[]
  inputIntervalSec: number
  dischargeIntervalSec: number
  transitIntervalSec: number
  onInputIntervalSecChange: (value: number) => void
  onDischargeIntervalSecChange: (value: number) => void
  onTransitIntervalSecChange: (value: number) => void
  incompleteLoadCount?: number
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onStepForward: () => void
}

export function PathSimulationBar({
  mode,
  onModeChange,
  conveyorOnlyLine = false,
  sources,
  selectedSourceUnitIds,
  onToggleSource,
  plan,
  status,
  progressLabel,
  canSimulate,
  testMaterialCount = 0,
  activeUnitLabel,
  waitingLabels,
  inputIntervalSec,
  dischargeIntervalSec,
  transitIntervalSec,
  onInputIntervalSecChange,
  onDischargeIntervalSecChange,
  onTransitIntervalSecChange,
  incompleteLoadCount = 0,
  onStart,
  onPause,
  onResume,
  onReset,
  onStepForward,
}: PathSimulationBarProps) {
  const statusText =
    status === 'revealing'
      ? '경로 점등'
      : status === 'endHold'
        ? '종료점 유지'
        : status === 'playing'
          ? '재생 중'
          : status === 'paused'
            ? '일시정지'
            : status === 'complete'
              ? '완료'
              : '대기'

  const isBusy = status === 'playing' || status === 'revealing' || status === 'endHold'

  const sourceLabel = mode === 'inbound' ? '투입점 (동시 출발)' : 'OUT 포트 (동시 출발)'
  const emptyHint =
    mode === 'inbound'
      ? '투입점 없음'
      : '시뮬레이션 가능한 OUT 포트 없음'
  const setupHint =
    mode === 'inbound'
      ? conveyorOnlyLine
        ? '투입·출고(flowRole)를 지정하거나 CV01 등 시작 모듈을 연결하세요.'
        : '라인 빌더에서 투입점을 지정하세요.'
      : 'OUT 포트·출고구·연결 컨베이어를 확인하세요.'

  return (
    <div className="space-y-2 border-b border-slate-800 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-200">경로 시뮬레이션</div>
        <span className="text-xs text-slate-500">
          틱 {PATH_SIMULATION_STEP_MS / 1000}초 · 비가동(대기/점검/오류) 우회
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <TimingField
          label="투입 시간 (초)"
          hint="시작점(출발 모듈) 체류"
          value={inputIntervalSec}
          disabled={isBusy}
          onChange={onInputIntervalSecChange}
        />
        <div className="flex items-end gap-4">
          <TimingField
            label="이송 시간 (초)"
            hint="모듈 간 이동 시간"
            value={transitIntervalSec}
            disabled={isBusy}
            onChange={onTransitIntervalSecChange}
          />
          <TimingField
            label="출고 시간 (초)"
            hint="종료점(출고 모듈) 체류"
            value={dischargeIntervalSec}
            disabled={isBusy}
            onChange={onDischargeIntervalSecChange}
          />
        </div>
      </div>


      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">방향</span>
        <ModeButton
          label="투입 (IN)"
          active={mode === 'inbound'}
          disabled={isBusy}
          onClick={() => onModeChange('inbound')}
        />
        <ModeButton
          label="출고 (OUT)"
          active={mode === 'outbound'}
          disabled={isBusy}
          onClick={() => onModeChange('outbound')}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-slate-400">{sourceLabel}</label>
          {sources.length === 0 ? (
            <p className="text-xs text-amber-300">{emptyHint}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => {
                const checked = selectedSourceUnitIds.includes(source.id)
                return (
                  <label
                    key={source.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                      checked
                        ? mode === 'outbound'
                          ? 'border-amber-600/70 bg-amber-950/40 text-amber-100'
                          : 'border-cyan-600/70 bg-cyan-950/40 text-cyan-100'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    } ${isBusy ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isBusy}
                      onChange={() => onToggleSource(source.id)}
                      className={mode === 'outbound' ? 'accent-amber-400' : 'accent-cyan-400'}
                    />
                    {unitDisplayCode(source)}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <SimButton
            label="시작"
            disabled={!canSimulate || isBusy}
            onClick={onStart}
            accent
          />
          {isBusy ? (
            <SimButton label="일시정지" onClick={onPause} />
          ) : (
            <SimButton
              label="재개"
              disabled={!plan || status === 'idle' || status === 'complete'}
              onClick={onResume}
            />
          )}
          <SimButton label="한 칸" disabled={!canSimulate} onClick={onStepForward} />
          <SimButton label="초기화" disabled={status === 'idle' && !plan} onClick={onReset} />
        </div>
      </div>

      <div className="text-xs leading-relaxed text-slate-400">
        <span className="text-slate-500">상태</span>{' '}
        <span className="text-violet-300">{statusText}</span>
        {progressLabel ? (
          <>
            {' '}
            · <span className="text-slate-500">진행</span>{' '}
            <span className="text-slate-200">{progressLabel}</span>
          </>
        ) : null}
        {plan?.message ? (
          <>
            {' '}
            · <span className={mode === 'outbound' ? 'text-amber-300' : 'text-cyan-300'}>
              {plan.message}
            </span>
          </>
        ) : !canSimulate ? (
          <>
            {' '}
            · <span className="text-amber-300">{setupHint}</span>
          </>
        ) : null}
        {testMaterialCount > 0 ? (
          <>
            {' '}
            · <span className="text-cyan-300">
              테스트 자재 {testMaterialCount}개 출고 포함
            </span>
          </>
        ) : null}
        {activeUnitLabel ? (
          <>
            {' '}
            · <span className="text-slate-500">자재</span>{' '}
            <span className="text-emerald-300">{activeUnitLabel}</span>
          </>
        ) : null}
        {incompleteLoadCount > 0 && status !== 'idle' ? (
          <>
            {' '}
            · <span className="text-slate-500">잔여 자재</span>{' '}
            <span className="text-violet-300">{incompleteLoadCount}개</span>
          </>
        ) : null}
        {waitingLabels.length > 0 ? (
          <>
            {' '}
            · <span className="text-slate-500">대기</span>{' '}
            <span className="text-amber-300">{waitingLabels.join(', ')}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function TimingField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        min={0.1}
        max={60}
        step={0.1}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next) && next >= 0.1) onChange(next)
        }}
        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 disabled:opacity-50"
      />
      <span className="mt-0.5 block text-[10px] text-slate-600">{hint}</span>
    </label>
  )
}

function ModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-violet-600 bg-violet-900/50 text-violet-100'
          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  )
}

function SimButton({
  label,
  onClick,
  disabled,
  accent,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded border px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
        accent
          ? 'border-emerald-700 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-900'
          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  )
}
