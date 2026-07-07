import { useEffect, useMemo, useState } from 'react'
import { AppCard, PageHeader } from '../components/common/PageUi'
import { PioTimeChart } from '../components/pio/PioTimeChart'
import { PioStepTable } from '../components/pio/PioStepTable'
import { PioTransactionList } from '../components/pio/PioTransactionList'
import { PIO_PAIR_LABELS, pioProtocolForPair } from '../constants/pioSignals'
import { V3EventTimeline } from '../components/pio/V3EventTimeline'
import { usePioStore } from '../store/usePioStore'
import { useAssistantStore } from '../store/useAssistantStore'
import { useAssistantChat } from '../hooks/useAssistantChat'
import { runPioSequence } from '../utils/pioSequence'
import { computePioMeasures, pioTransactionDuration } from '../utils/pioMeasure'
import type { PioPairKind } from '../types/pio'

const REPLAY_SPEEDS = [0.5, 1, 2, 4]

const DEMO_PAIR_KINDS: PioPairKind[] = [
  'CNV_CNV',
  'CNV_PORT',
  'PORT_STK',
  'MODULE_OHT',
  'MODULE_AGV',
]

/** 쌍 유형별 지연/오류 데모를 주입할 대표 단계 — 각 프로토콜의 실제 stepOrder에 맞춤 */
function demoAnomalyStep(kind: PioPairKind, kindOf: 'delay' | 'error'): string {
  if (pioProtocolForPair(kind) === 'E84') {
    return kindOf === 'delay' ? 'T3_TRREQ_READY' : 'T5_BUSY_CARRIER'
  }
  if (kind === 'PORT_STK') return kindOf === 'delay' ? 'S1_WAIT' : 'S2_TRANSFER'
  return 'S1_TRANSFER'
}

/**
 * 쌍 유형별 데모 Active/Passive 이름·모듈 타입 — 실제 시뮬레이션의 역할 배정과 일치시킴.
 * PORT_STK는 쌍 라벨(PORT↔STK) 순서와 달리 실제로는 창고(STK)가 Active, 포트가 Passive
 * (usePortStorageSimulation.ts) — 라벨을 그대로 나열하면 역할이 뒤바뀌므로 별도 지정.
 */
function demoParticipants(kind: PioPairKind): {
  activeName: string
  activeType: string
  passiveName: string
  passiveType: string
} {
  switch (kind) {
    case 'CNV_CNV':
      return { activeName: 'DEMO-CV', activeType: '직선', passiveName: 'DEMO-CV', passiveType: '직선' }
    case 'CNV_PORT':
      return { activeName: 'DEMO-CV', activeType: '직선', passiveName: 'DEMO-PORT', passiveType: '포트' }
    case 'PORT_STK':
      return { activeName: 'DEMO-STK', activeType: '적재창고', passiveName: 'DEMO-PORT', passiveType: '포트' }
    case 'MODULE_OHT':
      return { activeName: 'DEMO-OHT', activeType: 'OHT', passiveName: 'DEMO-MODULE', passiveType: '포트' }
    case 'MODULE_AGV':
      return { activeName: 'DEMO-AGV', activeType: 'AGV', passiveName: 'DEMO-MODULE', passiveType: '포트' }
  }
}

export function ChartPage() {
  const transactions = usePioStore((s) => s.transactions)
  const baselines = usePioStore((s) => s.baselines)
  const setBaselineFromTransaction = usePioStore((s) => s.setBaselineFromTransaction)
  const resetBaseline = usePioStore((s) => s.resetBaseline)
  const clearTransactions = usePioStore((s) => s.clearTransactions)
  const setAssistantOpen = useAssistantStore((s) => s.setOpen)
  const { send: sendToCovy } = useAssistantChat()

  // null = 최신 트랜잭션 자동 추적 (라이브)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replay, setReplay] = useState({ playing: false, ms: 0, speed: 1 })
  const [liveNowMs, setLiveNowMs] = useState(0)
  const [demoPair, setDemoPair] = useState<PioPairKind>('CNV_CNV')

  const tx = useMemo(() => {
    if (selectedId) {
      const found = transactions.find((t) => t.id === selectedId)
      if (found) return found
    }
    return transactions[0] ?? null
  }, [transactions, selectedId])

  const baseline = tx ? baselines[tx.pairKind] : null
  const measures = useMemo(
    () => (tx && baseline ? computePioMeasures(tx, baseline) : []),
    [tx, baseline],
  )
  const duration = tx ? pioTransactionDuration(tx) : 0
  const isRunning = tx?.status === 'running'

  // ── 라이브: 진행 중 트랜잭션은 100ms마다 커서 갱신 ──
  const startedAt = tx?.startedAt ?? 0
  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(
      () => setLiveNowMs(Date.now() - startedAt),
      100,
    )
    return () => window.clearInterval(timer)
  }, [isRunning, startedAt])

  // ── 리플레이 재생 루프 (interval 기반 — 백그라운드 탭 rAF 스로틀에도 동작) ──
  useEffect(() => {
    if (!replay.playing) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      setReplay((r) => {
        const next = r.ms + dt * r.speed
        if (next >= duration) return { ...r, ms: duration, playing: false }
        return { ...r, ms: next }
      })
    }, 33)
    return () => window.clearInterval(timer)
  }, [replay.playing, replay.speed, duration])

  // 트랜잭션 변경 시 리플레이 초기화 — 렌더 중 상태 조정 패턴 (이펙트 대신)
  const [replayTxId, setReplayTxId] = useState<string | null>(tx?.id ?? null)
  if ((tx?.id ?? null) !== replayTxId) {
    setReplayTxId(tx?.id ?? null)
    setReplay((r) => ({ ...r, playing: false, ms: 0 }))
  }

  const replayActive = !isRunning && (replay.playing || replay.ms > 0)
  const cursorMs = isRunning ? liveNowMs : replayActive ? replay.ms : null

  const handleSelect = (id: string | null) => setSelectedId(id)

  const runDemo = (kind: 'normal' | 'delay' | 'error') => {
    setSelectedId(null) // 최신 추적으로 전환 → 라이브 애니메이션 표시
    const { activeName, activeType, passiveName, passiveType } = demoParticipants(demoPair)
    if (kind === 'normal') {
      runPioSequence({
        pairKind: demoPair,
        operation: 'LOAD',
        activeName,
        activeType,
        passiveName,
        passiveType,
        source: 'demo',
      })
    } else if (kind === 'delay') {
      runPioSequence({
        pairKind: demoPair,
        operation: 'LOAD',
        activeName,
        activeType,
        passiveName,
        passiveType,
        source: 'demo',
        anomaly: { type: 'delay', step: demoAnomalyStep(demoPair, 'delay'), extraMs: 700 },
      })
    } else {
      runPioSequence({
        pairKind: demoPair,
        operation: 'UNLOAD',
        activeName,
        activeType,
        passiveName,
        passiveType,
        source: 'demo',
        anomaly: { type: 'error', atStep: demoAnomalyStep(demoPair, 'error') },
      })
    }
  }

  const handleCovyAnalyze = () => {
    if (!tx) return
    const anomalies = measures.filter((m) => m.status === 'over' || m.status === 'warn')
    const lines = [
      `PIO 타임차트 분석 요청 — [${PIO_PAIR_LABELS[tx.pairKind]}] ${tx.operation} ${tx.activeName} → ${tx.passiveName}, 총 ${Math.round(duration)}ms, 상태: ${tx.status === 'error' ? '오류' : '완료'}.`,
    ]
    if (anomalies.length > 0) {
      lines.push(
        '기준 초과 단계: ' +
          anomalies
            .map(
              (m) =>
                `${m.label} 측정 ${m.durationMs}ms / 기준 ${m.baselineMs}ms (+${m.deviationMs}ms)`,
            )
            .join(' · '),
      )
    }
    if (tx.status === 'error') {
      const haltDesc =
        pioProtocolForPair(tx.pairKind) === 'E84' ? 'ES/HO_AVBL 신호 강하 감지' : '정지/미완료'
      lines.push(`오류 발생 단계: ${tx.errorStep ?? '알 수 없음'} (${haltDesc})`)
    }
    lines.push('원인 분석과 개선 제안을 해줘.')
    setAssistantOpen(true)
    void sendToCovy(lines.join('\n'))
  }

  const handleCaptureBaseline = () => {
    if (!tx) return
    const ok = setBaselineFromTransaction(tx.id)
    if (!ok) {
      window.alert('완료된 트랜잭션(모든 단계 측정)만 기준으로 설정할 수 있습니다.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="차트"
        subtitle="PIO Time Chart — Active ↔ Passive 핸드셰이크 관제 (MODULE↔OHT/AGV: SEMI E84 · 그 외(CV↔CV/CV↔PORT/PORT↔STK): 실제 시뮬 상태값 LD/ULD/BUSY)"
      />

      {/* ── V3 이벤트 차트 ── */}
      <AppCard>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">V3 이벤트 타임라인</h3>
        <V3EventTimeline />
      </AppCard>

      {/* ── PIO 타임차트 ── */}
      <AppCard>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            PIO Time Chart
            {tx && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                [{PIO_PAIR_LABELS[tx.pairKind]}]{' '}
                <b className={tx.operation === 'LOAD' ? 'text-cyan-300' : 'text-violet-300'}>
                  {tx.operation}
                </b>{' '}
                {tx.activeName} → {tx.passiveName}
                {isRunning && <span className="ml-1.5 animate-pulse text-cyan-300">● LIVE</span>}
              </span>
            )}
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <select
              value={demoPair}
              onChange={(e) => setDemoPair(e.target.value as PioPairKind)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300"
              title="데모 대상 쌍 유형"
            >
              {DEMO_PAIR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PIO_PAIR_LABELS[k]} ({pioProtocolForPair(k)})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => runDemo('normal')}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
            >
              정상 데모
            </button>
            <button
              type="button"
              onClick={() => runDemo('delay')}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20"
            >
              지연 데모
            </button>
            <button
              type="button"
              onClick={() => runDemo('error')}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              오류 데모
            </button>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={handleCovyAnalyze}
              disabled={!tx}
              className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] text-fuchsia-300 hover:bg-fuchsia-500/20 disabled:opacity-40"
            >
              코비 AI 분석
            </button>
          </div>
        </div>

        {tx && baseline ? (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <PioTimeChart transaction={tx} baseline={baseline} cursorMs={cursorMs} />
              <div className="mt-1 flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
                <span>
                  <span className="mr-1 inline-block h-0.5 w-5 bg-cyan-400 align-middle" />
                  Active 신호
                </span>
                <span>
                  <span className="mr-1 inline-block h-0.5 w-5 bg-violet-400 align-middle" />
                  Passive 신호
                </span>
                <span>
                  <span className="mr-1 inline-block h-0 w-5 border-t border-dashed border-amber-400 align-middle" />
                  Golden Baseline ({baseline.source})
                </span>
                <span className="text-red-400/80">■ 기준 초과 구간</span>
              </div>
            </div>

            {/* ── 리플레이 컨트롤 ── */}
            {!isRunning && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                <span className="text-[11px] font-semibold text-slate-400">PIO Replay</span>
                <button
                  type="button"
                  onClick={() =>
                    setReplay((r) => ({
                      ...r,
                      playing: !r.playing,
                      ms: !r.playing && r.ms >= duration ? 0 : r.ms,
                    }))
                  }
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-500/20"
                >
                  {replay.playing ? '⏸ 일시정지' : '▶ 재생'}
                </button>
                <select
                  value={replay.speed}
                  onChange={(e) =>
                    setReplay((r) => ({ ...r, speed: Number(e.target.value) }))
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-300"
                >
                  {REPLAY_SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 1)}
                  value={Math.min(replay.ms, duration)}
                  onChange={(e) =>
                    setReplay((r) => ({ ...r, playing: false, ms: Number(e.target.value) }))
                  }
                  className="min-w-0 flex-1 accent-cyan-500"
                />
                <span className="w-24 text-right font-mono text-[11px] text-slate-400">
                  {Math.round(replayActive ? replay.ms : 0)} / {Math.round(duration)}ms
                </span>
                {replayActive && (
                  <button
                    type="button"
                    onClick={() => setReplay((r) => ({ ...r, playing: false, ms: 0 }))}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-slate-500"
                  >
                    전체 보기
                  </button>
                )}
              </div>
            )}

            {/* ── 단계별 응답시간 ── */}
            <div className="mt-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-semibold text-slate-300">
                  단계별 응답시간 자동 측정
                </h4>
                <span className="text-[10px] text-slate-500">
                  허용 편차: 주의 +{baseline.warnPct}% · 이상 +{baseline.overPct}%
                </span>
                <div className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleCaptureBaseline}
                    disabled={tx.status !== 'complete'}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
                    title="이 트랜잭션의 측정값을 해당 쌍 유형의 골든 베이스라인으로 설정"
                  >
                    이 측정을 기준으로 설정
                  </button>
                  <button
                    type="button"
                    onClick={() => resetBaseline(tx.pairKind)}
                    className="rounded border border-slate-700 px-2 py-0.5 text-[10.5px] text-slate-400 hover:border-slate-500"
                  >
                    기준 초기화
                  </button>
                </div>
              </div>
              <PioStepTable measures={measures} />
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-slate-800 bg-slate-950/60 py-10 text-center text-sm text-slate-500">
            표시할 핸드셰이크가 없습니다.
            <br />
            <span className="text-xs">
              라인 현황에서 시뮬레이션(경로·OHT·포트반송)을 실행하거나, 위의 데모 버튼으로
              기준 타임차트를 생성해보세요.
            </span>
          </p>
        )}
      </AppCard>

      {/* ── 트랜잭션 목록 ── */}
      <AppCard>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">핸드셰이크 이력</h3>
          <button
            type="button"
            onClick={clearTransactions}
            className="ml-auto rounded border border-slate-700 px-2 py-0.5 text-[10.5px] text-slate-400 hover:border-red-400 hover:text-red-300"
          >
            목록 지우기
          </button>
        </div>
        <PioTransactionList selectedId={selectedId} onSelect={handleSelect} />
      </AppCard>
    </div>
  )
}
