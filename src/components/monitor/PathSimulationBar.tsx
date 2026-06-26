import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import type { ConveyorUnit } from '../../types/conveyor'
import type { MultiPathSimulationPlan } from '../../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../../types/unitProperties'
import type { PathSimulationMode, PathSimulationStatus } from '../../hooks/usePathSimulation'
import type { LoadTackTimeSummary } from '../../utils/pathSimulation'
import { formatTackTimeSec } from '../../utils/pathSimulation'
import { unitDisplayCode } from '../../utils/unitPropertyHelpers'

interface PathSimulationBarProps {
  unitCount?: number
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
  tackTimeSummaries?: LoadTackTimeSummary[]
  mapControls?: ReactNode
}

interface PathSimulationPlaybackControlsProps {
  plan: MultiPathSimulationPlan | null
  status: PathSimulationStatus
  canSimulate: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onStepForward: () => void
}

export function PathSimulationPlaybackControls({
  plan,
  status,
  canSimulate,
  onStart,
  onPause,
  onResume,
  onReset,
  onStepForward,
}: PathSimulationPlaybackControlsProps) {
  const isBusy = status === 'playing' || status === 'revealing' || status === 'endHold'

  return (
    <div className="flex flex-wrap items-center justify-end gap-1 border-b border-slate-800 bg-slate-900/80 px-3 py-2 sm:px-4">
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
  )
}

export function PathSimulationBar({
  unitCount,
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
  tackTimeSummaries = [],
  mapControls,
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
  const timingLocked = status === 'playing'

  const sourceLabel = mode === 'inbound' ? '투입점 (동시 출발)' : 'OUT 포트 (동시 출발)'
  const emptyHint =
    mode === 'inbound' ? '투입점 없음' : '시뮬레이션 가능한 OUT 포트 없음'
  const setupHint =
    mode === 'inbound'
      ? conveyorOnlyLine
        ? '투입·출고(flowRole)를 지정하거나 CV01 등 시작 모듈을 연결하세요.'
        : '라인 빌더에서 투입점을 지정하세요.'
      : 'OUT 포트·출고구·연결 컨베이어를 확인하세요.'

  return (
    <div className="border-b border-slate-800 px-3 py-2 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-slate-200">경로 시뮬레이션</span>
        {unitCount != null ? (
          <span className="text-xs text-slate-500">유닛 {unitCount}개</span>
        ) : null}
        <span className="text-xs text-slate-500">
          틱 {PATH_SIMULATION_STEP_MS / 1000}초 · 비가동 우회
        </span>
        <span className="text-xs text-slate-400">
          <span className="text-slate-500">상태</span>{' '}
          <span className="text-violet-300">{statusText}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SimPanel title="시뮬레이션 설정">
          <div className="flex flex-wrap items-end justify-center gap-3">
            <TimingField
              label="투입 (초)"
              hint="시작점 체류"
              value={inputIntervalSec}
              disabled={timingLocked}
              onChange={onInputIntervalSecChange}
            />
            <TimingField
              label="이송 (초)"
              hint="모듈 간 이동"
              value={transitIntervalSec}
              disabled={timingLocked}
              onChange={onTransitIntervalSecChange}
            />
            <TimingField
              label="출고 (초)"
              hint="출고점 체류"
              value={dischargeIntervalSec}
              disabled={timingLocked}
              onChange={onDischargeIntervalSecChange}
            />
          </div>
        </SimPanel>

        <SimPanel title="방향 · 투입점" contentAlign="start">
          <div className="w-full space-y-2.5">
            <div className="flex w-full gap-2">
              <ModeButton
                label="투입 (IN)"
                active={mode === 'inbound'}
                disabled={isBusy}
                wide
                onClick={() => onModeChange('inbound')}
              />
              <ModeButton
                label="출고 (OUT)"
                active={mode === 'outbound'}
                disabled={isBusy}
                wide
                onClick={() => onModeChange('outbound')}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] text-slate-500">{sourceLabel}</p>
              {sources.length === 0 ? (
                <p className="text-xs text-amber-300">{emptyHint}</p>
              ) : (
                <div className="flex flex-wrap justify-start gap-2">
                  {sources.map((source) => {
                    const checked = selectedSourceUnitIds.includes(source.id)
                    return (
                      <label
                        key={source.id}
                        className={`flex min-h-[2.5rem] cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-sm ${
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
          </div>
        </SimPanel>

        <SimPanel title="Tack Time" contentAlign="start">
          {tackTimeSummaries.length > 0 ? (
            <div className="w-full">
              <ul className="space-y-1">
                {tackTimeSummaries.map((summary) => (
                  <li
                    key={summary.loadId}
                    className="grid grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 text-sm"
                  >
                    <span className="text-right text-slate-300" title={`${summary.moduleCount}구간`}>
                      {summary.label}
                    </span>
                    <TackTimeFlowArrow />
                    <span className="truncate text-slate-300" title={`${summary.moduleCount}구간`}>
                      {summary.exitLabel}
                      <span className="ml-1 text-[10px] text-slate-500">({summary.moduleCount}구간)</span>
                    </span>
                    <span className="shrink-0 text-right font-medium text-violet-300">
                      {formatTackTimeSec(summary.tackTimeSec)}
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                        예상 {formatTackTimeSec(summary.estimatedTackTimeSec)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] text-slate-600">
                실측 0.1초 단위 · 구간당 약 {PATH_SIMULATION_STEP_MS / 1000}초(틱) — 렉이 아니라 경로 구간 수에 비례
              </p>
            </div>
          ) : (
            <p className="w-full text-xs text-slate-500">
              투입점 선택 시 경로별 소요 시간이 표시됩니다.
            </p>
          )}
        </SimPanel>

        {mapControls ? (
          <SimPanel title="맵 제어" contentAlign="start">
            {mapControls}
          </SimPanel>
        ) : null}
      </div>

      {(progressLabel ||
        plan?.message ||
        !canSimulate ||
        testMaterialCount > 0 ||
        activeUnitLabel ||
        (incompleteLoadCount > 0 && status !== 'idle') ||
        waitingLabels.length > 0) && (
        <div className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {progressLabel ? (
            <>
              <span className="text-slate-500">진행</span>{' '}
              <span className="text-slate-200">{progressLabel}</span>
            </>
          ) : null}
          {plan?.message ? (
            <>
              {progressLabel ? ' · ' : null}
              <span className={mode === 'outbound' ? 'text-amber-300' : 'text-cyan-300'}>
                {plan.message}
              </span>
            </>
          ) : !canSimulate ? (
            <>
              {progressLabel ? ' · ' : null}
              <span className="text-amber-300">{setupHint}</span>
            </>
          ) : null}
          {testMaterialCount > 0 ? (
            <>
              {' · '}
              <span className="text-cyan-300">테스트 자재 {testMaterialCount}개 출고 포함</span>
            </>
          ) : null}
          {activeUnitLabel ? (
            <>
              {' · '}
              <span className="text-slate-500">자재</span>{' '}
              <span className="text-emerald-300">{activeUnitLabel}</span>
            </>
          ) : null}
          {incompleteLoadCount > 0 && status !== 'idle' ? (
            <>
              {' · '}
              <span className="text-slate-500">잔여</span>{' '}
              <span className="text-violet-300">{incompleteLoadCount}개</span>
            </>
          ) : null}
          {waitingLabels.length > 0 ? (
            <>
              {' · '}
              <span className="text-slate-500">대기</span>{' '}
              <span className="text-amber-300">{waitingLabels.join(', ')}</span>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function SimPanel({
  title,
  children,
  contentAlign = 'center',
}: {
  title: string
  children: ReactNode
  contentAlign?: 'center' | 'start'
}) {
  return (
    <div className="flex min-h-[96px] flex-col rounded-lg border border-slate-700/70 bg-slate-800/35 px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400">{title}</p>
      <div
        className={`flex flex-1 flex-col justify-center ${
          contentAlign === 'start' ? 'items-stretch' : 'items-center'
        }`}
      >
        {children}
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
  const [draft, setDraft] = useState(formatTimingDraft(value))

  useEffect(() => {
    setDraft(formatTimingDraft(value))
  }, [value])

  const commit = () => {
    const normalized = draft.trim().replace(',', '.')
    if (normalized === '') {
      setDraft(formatTimingDraft(value))
      return
    }
    const next = Number(normalized)
    if (Number.isFinite(next)) {
      onChange(next)
      return
    }
    setDraft(formatTimingDraft(value))
  }

  return (
    <label className="block text-center text-xs text-slate-400" title={hint}>
      <span className="mb-1 block whitespace-nowrap">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
        className="mx-auto block w-[5rem] rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-center text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={label}
      />
    </label>
  )
}

function formatTimingDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

function TackTimeFlowArrow() {
  const uid = useId().replace(/:/g, '')
  const gradId = `tack-arrow-grad-${uid}`

  return (
    <svg
      viewBox="0 0 56 10"
      className="tack-time-flow-arrow mx-auto h-2.5 w-14 shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#a78bfa" stopOpacity="1" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* 미리 그려진 베이스 화살표 */}
      <g className="tack-time-arrow-base">
        <line
          x1="2"
          y1="5"
          x2="40"
          y2="5"
          stroke="#64748b"
          strokeOpacity="0.55"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="4" cy="5" r="1.35" fill="#94a3b8" fillOpacity="0.45" />
        <path d="M44 5 L38 1.75 L38 8.25 Z" fill="#64748b" fillOpacity="0.55" />
      </g>

      {/* 베이스 위 흐름 하이라이트 */}
      <line
        x1="2"
        y1="5"
        x2="40"
        y2="5"
        stroke={`url(#${gradId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tack-time-arrow-flow"
      />
      <circle cx="4" cy="5" r="1.6" fill="#c4b5fd" className="tack-time-arrow-dot" />
    </svg>
  )
}

function ModeButton({
  label,
  active,
  disabled,
  wide = false,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  wide?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[2.5rem] rounded border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
        wide ? 'flex-1 px-3' : 'px-4'
      } ${
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
