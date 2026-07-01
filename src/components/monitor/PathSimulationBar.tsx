import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import { useTouchLayout } from '../../hooks/useTouchLayout'
import type { ConveyorUnit } from '../../types/conveyor'
import type { MultiPathSimulationPlan } from '../../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../../types/unitProperties'
import type { PathSimulationMode, PathSimulationStatus } from '../../hooks/usePathSimulation'
import type { LoadTackTimeSummary } from '../../utils/pathSimulation'
import { formatTackTimeSec } from '../../utils/pathSimulation'
import { CONTINUOUS_INPUT_INTERVAL_SEC, CONTINUOUS_PROBE_CYCLE_SEC } from '../../utils/continuousInputGather'
import { SIM_STK_IO_ENABLED } from '../../constants/simStkIo'
import { unitDisplayCode } from '../../utils/unitPropertyHelpers'

interface PathSimulationBarProps {
  unitCount?: number
  mode: PathSimulationMode
  onModeChange: (mode: PathSimulationMode) => void
  conveyorOnlyLine?: boolean
  sources: ConveyorUnit[]
  selectedSourceUnitIds: string[]
  onToggleSource: (sourceUnitId: string) => void
  inboundDestinationsByEntryId?: Record<string, ConveyorUnit[]>
  inboundDestinationByEntryId?: Record<string, string>
  onSetInboundDestination?: (entryUnitId: string, destinationUnitId: string) => void
  plan: MultiPathSimulationPlan | null
  status: PathSimulationStatus
  progressLabel: string | null
  progressDetail?: string | null
  canSimulate: boolean
  testMaterialCount?: number
  inputIntervalSec: number
  dischargeIntervalSec: number
  transitIntervalSec: number
  onInputIntervalSecChange: (value: number) => void
  onDischargeIntervalSecChange: (value: number) => void
  onTransitIntervalSecChange: (value: number) => void
  turn90Sec?: number
  turn180Sec?: number
  turn270Sec?: number
  onTurn90SecChange?: (value: number) => void
  onTurn180SecChange?: (value: number) => void
  onTurn270SecChange?: (value: number) => void
  tackTimeSummaries?: LoadTackTimeSummary[]
  mapControls?: ReactNode
  continuousInputActive?: boolean
  /** 모바일 접힘 요약 — 맵 제어 */
  mapControlSummary?: string
}

interface PathSimulationPlaybackControlsProps {
  plan: MultiPathSimulationPlan | null
  status: PathSimulationStatus
  mode: PathSimulationMode
  canSimulate: boolean
  onStart: () => void
  onStartContinuous?: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onStepForward: () => void
  continuousInputActive?: boolean
}

export function PathSimulationPlaybackControls({
  plan,
  status,
  mode,
  canSimulate,
  onStart,
  onStartContinuous,
  onPause,
  onResume,
  onReset,
  onStepForward,
  continuousInputActive = false,
}: PathSimulationPlaybackControlsProps) {
  const isBusy = status === 'playing' || status === 'revealing' || status === 'endHold'
  const sessionActive = status !== 'idle' && status !== 'complete'
  const normalSessionActive = sessionActive && !continuousInputActive

  return (
    <div className="grid grid-cols-3 gap-1.5 border-b border-slate-800 bg-slate-900/80 px-3 py-2 sm:grid-cols-6 sm:px-4">
      <SimButton
        icon={<SimPlayIcon />}
        label="시작"
        disabled={!canSimulate || isBusy || continuousInputActive || normalSessionActive}
        onClick={onStart}
        accent
      />
      {mode === 'inbound' && onStartContinuous ? (
        <SimButton
          icon={<SimContinuousIcon />}
          label="연속 투입"
          disabled={!canSimulate || isBusy || normalSessionActive}
          onClick={onStartContinuous}
          accent={continuousInputActive ? 'cyan' : undefined}
        />
      ) : (
        <div />
      )}
      <SimButton
        icon={<SimPauseIcon />}
        label="일시정지"
        disabled={!isBusy}
        onClick={onPause}
      />
      <SimButton
        icon={<SimResumeIcon />}
        label="재개"
        disabled={!plan || status === 'idle' || status === 'complete' || isBusy}
        onClick={onResume}
      />
      <SimButton icon={<SimStepIcon />} label="한 칸" disabled={!canSimulate} onClick={onStepForward} />
      <SimButton icon={<SimResetIcon />} label="초기화" disabled={status === 'idle' && !plan} onClick={onReset} />
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
  inboundDestinationsByEntryId = {},
  inboundDestinationByEntryId = {},
  onSetInboundDestination,
  plan,
  status,
  progressLabel,
  progressDetail = null,
  canSimulate,
  testMaterialCount = 0,
  inputIntervalSec,
  dischargeIntervalSec,
  transitIntervalSec,
  onInputIntervalSecChange,
  onDischargeIntervalSecChange,
  onTransitIntervalSecChange,
  turn90Sec = 1.0,
  turn180Sec = 1.6,
  turn270Sec = 2.2,
  onTurn90SecChange,
  onTurn180SecChange,
  onTurn270SecChange,
  tackTimeSummaries = [],
  mapControls,
  continuousInputActive = false,
  mapControlSummary,
}: PathSimulationBarProps) {
  const touchLayout = useTouchLayout()
  const [mobilePanelsOpen, setMobilePanelsOpen] = useState(false)
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
  const inputDisplaySec = continuousInputActive
    ? CONTINUOUS_INPUT_INTERVAL_SEC
    : inputIntervalSec
  const inputLocked = timingLocked || continuousInputActive

  const sourceLabel = mode === 'inbound' ? '투입점 (동시 출발)' : 'OUT 포트 (동시 출발)'
  const emptyHint =
    mode === 'inbound' ? '투입점 없음' : '시뮬레이션 가능한 OUT 포트 없음'
  const setupHint =
    mode === 'inbound'
      ? conveyorOnlyLine
        ? '투입·출고(flowRole)를 지정하거나 CV01 등 시작 모듈을 연결하세요.'
        : '라인 빌더에서 투입점을 지정하세요.'
      : 'OUT 포트·출고구·연결 컨베이어를 확인하세요.'

  const timingSummary = `투입 ${inputDisplaySec}s · 이송 ${transitIntervalSec}s · 출고 ${dischargeIntervalSec}s`
  const directionSummary =
    mode === 'inbound' ? '투입 (IN)' : '출고 (OUT)'
  const sourceSummary =
    selectedSourceUnitIds.length > 0
      ? `${selectedSourceUnitIds.length}개 선택`
      : sources.length > 0
        ? '미선택'
        : emptyHint
  const tackSummary =
    tackTimeSummaries.length > 0
      ? `${tackTimeSummaries.length}경로 · ${formatTackTimeSec(tackTimeSummaries[0]!.tackTimeSec)}`
      : '경로 미계산'

  const isSimActive =
    status === 'playing' ||
    status === 'paused' ||
    status === 'revealing' ||
    status === 'endHold'

  const progressFooter =
    progressLabel ||
    (!isSimActive && plan?.message) ||
    !canSimulate ||
    (!isSimActive && testMaterialCount > 0) ? (
      <div
        className="mt-1.5 text-xs leading-relaxed text-slate-400"
        title={progressDetail ?? undefined}
      >
        {progressLabel ? (
          <p className={isSimActive ? 'truncate' : undefined}>
            <span className="text-slate-500">진행</span>{' '}
            <span className="text-slate-200">{progressLabel}</span>
          </p>
        ) : null}
        {!isSimActive && plan?.message ? (
          <p className={progressLabel ? 'mt-1 truncate' : 'truncate'}>
            <span className={mode === 'outbound' ? 'text-amber-300' : 'text-cyan-300'}>
              {plan.message}
            </span>
          </p>
        ) : !canSimulate ? (
          <p className={progressLabel ? 'mt-1' : undefined}>
            <span className="text-amber-300">{setupHint}</span>
          </p>
        ) : null}
        {!isSimActive && testMaterialCount > 0 ? (
          <p className="mt-1">
            <span className="text-cyan-300">테스트 자재 {testMaterialCount}개 출고 포함</span>
          </p>
        ) : null}
      </div>
    ) : null

  if (touchLayout && !mobilePanelsOpen) {
    return (
      <div className="border-b border-slate-800 px-3 py-2 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-slate-200">경로 시뮬레이션</span>
          <span className="text-xs text-slate-400">
            <span className="text-slate-500">상태</span>{' '}
            <span className="text-violet-300">{statusText}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobilePanelsOpen(true)}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-violet-600/50 bg-violet-950/30 px-3 py-2.5 text-left active:bg-violet-950/50"
        >
          <span className="shrink-0 text-sm font-medium text-violet-100">시뮬 설정 · 맵 제어</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
            {directionSummary} · {sourceSummary}
          </span>
          <span className="shrink-0 text-slate-500">▼</span>
        </button>
        {progressFooter}
      </div>
    )
  }

  return (
    <div className="border-b border-slate-800 px-3 py-2 sm:px-4">
      {touchLayout ? (
        <button
          type="button"
          onClick={() => setMobilePanelsOpen(false)}
          className="mb-2 flex min-h-[36px] w-full items-center justify-between rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-300 active:bg-slate-700"
        >
          <span>시뮬 설정 접기</span>
          <span className="text-slate-500">▲</span>
        </button>
      ) : null}
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
        <SimPanel
          title="시뮬레이션 설정"
          contentAlign="start"
          collapsible={touchLayout}
          defaultOpen={false}
          summary={timingSummary}
        >
          <div className="w-full space-y-2.5">
            <TimingField
              label="투입 대기"
              hint={
                continuousInputActive
                  ? `프로브 2대 ${CONTINUOUS_INPUT_INTERVAL_SEC}초 교대 · ${CONTINUOUS_PROBE_CYCLE_SEC}초 왕복`
                  : '시작점 체류'
              }
              value={inputDisplaySec}
              disabled={inputLocked}
              onChange={onInputIntervalSecChange}
            />
            <TimingField
              label="이송"
              hint="모듈 간 이동"
              value={transitIntervalSec}
              disabled={timingLocked}
              onChange={onTransitIntervalSecChange}
            />
            <TimingField
              label="출고 대기"
              hint="출고점 체류"
              value={dischargeIntervalSec}
              disabled={timingLocked}
              onChange={onDischargeIntervalSecChange}
            />
          </div>
          {onTurn90SecChange && (
            <div className="mt-3 w-full border-t border-slate-700/60 pt-2.5">
              <p className="mb-2 text-[10px] text-slate-500">회전 유닛 통과</p>
              <div className="space-y-2.5">
                <TimingField label="90°" hint="90° 꺾임" value={turn90Sec} disabled={timingLocked} onChange={onTurn90SecChange} />
                <TimingField label="180°" hint="직통" value={turn180Sec} disabled={timingLocked} onChange={onTurn180SecChange ?? (() => {})} />
                <TimingField label="270°" hint="270° 역방향" value={turn270Sec} disabled={timingLocked} onChange={onTurn270SecChange ?? (() => {})} />
              </div>
            </div>
          )}
        </SimPanel>

        <SimPanel
          title="방향 · 투입점"
          contentAlign="start"
          collapsible={touchLayout}
          defaultOpen={false}
          summary={`${directionSummary} · ${sourceSummary}`}
        >
          <div className="w-full space-y-2.5">
            <div className="flex w-full gap-2">
              <ModeButton
                icon={<InboundIcon />}
                label="투입"
                active={mode === 'inbound'}
                disabled={isBusy}
                wide
                onClick={() => onModeChange('inbound')}
              />
              <ModeButton
                icon={<OutboundIcon />}
                label="출고"
                active={mode === 'outbound'}
                disabled={isBusy || !SIM_STK_IO_ENABLED}
                wide
                onClick={() => onModeChange('outbound')}
              />
            </div>
            {!SIM_STK_IO_ENABLED ? (
              <p className="text-[10px] leading-relaxed text-slate-500">
                STK 출고는 추후 명령 버튼으로 연동됩니다. 현재는 투입·연속 투입으로 STK
                앞 라인 만재만 확인할 수 있습니다.
              </p>
            ) : null}
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
            {mode === 'inbound' &&
            selectedSourceUnitIds.length > 0 &&
            onSetInboundDestination ? (
              <div>
                <p className="mb-1.5 text-[10px] text-slate-500">목적지</p>
                <div className="space-y-2">
                  {selectedSourceUnitIds.map((entryId) => {
                    const entry = sources.find((source) => source.id === entryId)
                    const destinations = inboundDestinationsByEntryId[entryId] ?? []
                    const selectedDestId = inboundDestinationByEntryId[entryId] ?? ''
                    if (destinations.length === 0) {
                      return (
                        <p key={entryId} className="text-xs text-amber-300">
                          {entry ? unitDisplayCode(entry) : entryId}: 도달 가능한 목적지 없음
                        </p>
                      )
                    }
                    return (
                      <div key={entryId}>
                        {selectedSourceUnitIds.length > 1 && entry ? (
                          <p className="mb-1 text-[10px] text-slate-500">
                            {unitDisplayCode(entry)}
                          </p>
                        ) : null}
                        <select
                          value={selectedDestId}
                          disabled={isBusy}
                          onChange={(e) => onSetInboundDestination(entryId, e.target.value)}
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {destinations.map((dest) => (
                            <option key={dest.id} value={dest.id}>
                              {unitDisplayCode(dest)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </SimPanel>

        <SimPanel
          title="Tack Time"
          contentAlign="start"
          collapsible={touchLayout}
          defaultOpen={false}
          summary={tackSummary}
        >
          {tackTimeSummaries.length > 0 ? (
            <div className="w-full space-y-3">
              {tackTimeSummaries.map((summary) => (
                <div key={summary.loadId}>
                  <ConstellationPath summary={summary} />
                  <div className="mt-1 flex items-center justify-between px-1">
                    <span className="text-[10px] text-slate-500">{summary.moduleCount}구간</span>
                    <span className="font-medium text-violet-300 text-sm">
                      {formatTackTimeSec(summary.tackTimeSec)}
                      <span className="ml-1 text-[10px] font-normal text-slate-500">
                        (예상 {formatTackTimeSec(summary.estimatedTackTimeSec)})
                      </span>
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-600">
                실측 0.1초 단위 · 구간당 약 {PATH_SIMULATION_STEP_MS / 1000}초(틱)
              </p>
            </div>
          ) : (
            <p className="w-full text-xs text-slate-500">
              투입점 선택 시 경로별 소요 시간이 표시됩니다.
            </p>
          )}
        </SimPanel>

        {mapControls ? (
          <SimPanel
            title="맵 제어"
            contentAlign="start"
            collapsible={touchLayout}
            defaultOpen={false}
            summary={mapControlSummary ?? '줌 · 맞춤'}
          >
            {mapControls}
          </SimPanel>
        ) : null}
      </div>

      {progressFooter}
    </div>
  )
}

function SimPanel({
  title,
  children,
  contentAlign = 'center',
  collapsible = false,
  defaultOpen = true,
  summary,
}: {
  title: string
  children: ReactNode
  contentAlign?: 'center' | 'start'
  collapsible?: boolean
  defaultOpen?: boolean
  summary?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen, collapsible])

  const panelOpen = collapsible ? open : true

  return (
    <div
      className={`flex flex-col rounded-lg border border-slate-700/70 bg-slate-800/35 px-3 ${
        collapsible && !panelOpen ? 'py-2' : 'py-2.5'
      } ${!collapsible ? 'min-h-[96px]' : ''}`}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-[40px] w-full items-center gap-2 text-left"
        >
          <span className="shrink-0 text-[11px] font-semibold tracking-wide text-slate-300">
            {title}
          </span>
          {!panelOpen && summary ? (
            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">{summary}</span>
          ) : (
            <span className="flex-1" />
          )}
          <span className="shrink-0 text-slate-500">{panelOpen ? '▲' : '▼'}</span>
        </button>
      ) : (
        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400">{title}</p>
      )}
      {panelOpen ? (
        <div
          className={`flex flex-col ${collapsible ? 'pb-1 pt-1' : 'flex-1 justify-center'} ${
            contentAlign === 'start' ? 'items-stretch' : 'items-center'
          }`}
        >
          {children}
        </div>
      ) : null}
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
    <div className="w-full" title={hint}>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-semibold text-slate-100">{value.toFixed(1)}s</span>
      </div>
      <input
        type="range"
        min={0}
        max={5}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={label}
      />
    </div>
  )
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
  icon,
  label,
  active,
  disabled,
  wide = false,
  onClick,
}: {
  icon?: React.ReactNode
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
      className={`flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
        wide ? 'flex-1 px-3' : 'px-4'
      } ${
        active
          ? 'border-violet-600 bg-violet-900/50 text-violet-100'
          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function InboundIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="9" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 2v8M4 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OutboundIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="9" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V1M4 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ConstellationPath({ summary }: { summary: LoadTackTimeSummary }) {
  const nodes = [summary.label, ...summary.waypointLabels, summary.exitLabel]
  const n = nodes.length
  const W = 240
  const H = 64
  const cy = 28
  const r = 6
  const xs = nodes.map((_, i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - r * 4) + r * 2))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      {xs.slice(0, -1).map((x, i) => {
        const x2 = xs[i + 1]!
        const pid = `cpath-${summary.loadId}-${i}`
        return (
          <g key={i}>
            <line x1={x} y1={cy} x2={x2} y2={cy} stroke="#334155" strokeWidth="1.5" />
            <path id={pid} d={`M${x},${cy} L${x2},${cy}`} fill="none" />
            <circle r="2.5" fill="#a78bfa">
              <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${i * 0.45}s`}>
                <mpath href={`#${pid}`} />
              </animateMotion>
            </circle>
          </g>
        )
      })}
      {nodes.map((label, i) => {
        const x = xs[i]!
        const isEntry = i === 0
        const isExit = i === n - 1
        const fill = isEntry ? '#0e7490' : isExit ? '#92400e' : '#3730a3'
        const stroke = isEntry ? '#22d3ee' : isExit ? '#f59e0b' : '#818cf8'
        return (
          <g key={i}>
            <circle cx={x} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="1.5" />
            <text x={x} y={cy + r + 13} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SimPlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polygon points="5,3 17,10 5,17" fill="currentColor" />
    </svg>
  )
}

function SimContinuousIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="3.5" cy="5" r="1.8" fill="currentColor" />
      <circle cx="3.5" cy="10" r="1.8" fill="currentColor" />
      <circle cx="3.5" cy="15" r="1.8" fill="currentColor" />
      <polygon points="8,4 18,10 8,16" fill="currentColor" />
    </svg>
  )
}

function SimPauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="4" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="12" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function SimResumeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="3" width="3" height="14" rx="1" fill="currentColor" />
      <polygon points="9,4 18,10 9,16" fill="currentColor" />
    </svg>
  )
}

function SimStepIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polygon points="3,4 13,10 3,16" fill="currentColor" />
      <rect x="14" y="3" width="3" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function SimResetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M15 5A7 7 0 1 0 16.5 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <polygon points="14,2 18,6 14,9" fill="currentColor" />
    </svg>
  )
}

function SimButton({
  icon,
  label,
  onClick,
  disabled,
  accent,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean | 'cyan'
}) {
  const accentClass =
    accent === 'cyan'
      ? 'border-cyan-600/70 bg-cyan-950/50 text-cyan-300 hover:bg-cyan-900/60 shadow-[0_0_8px_rgba(34,211,238,0.18)]'
      : accent
        ? 'border-emerald-600/70 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60 shadow-[0_0_8px_rgba(52,211,153,0.18)]'
        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex w-full items-center justify-center rounded-lg border py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${accentClass}`}
    >
      {icon}
    </button>
  )
}
