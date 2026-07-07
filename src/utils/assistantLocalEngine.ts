import { useConveyorStore } from '../store/useConveyorStore'
import { useSemiCnvStore } from '../store/useSemiCnvStore'
import { usePioStore } from '../store/usePioStore'
import { unitTitle } from '../constants/conveyorTypes'
import { STATUS_COLORS } from '../constants/statusColors'
import { pioProtocolForPair } from '../constants/pioSignals'
import { computePioMeasures, pioTransactionDuration } from './pioMeasure'
import type { ConveyorStatus, ConveyorUnit } from '../types/conveyor'

/**
 * 로컬 분석 엔진 — API 키 없이 동작하는 데모용 규칙 기반 답변.
 * 고정 문구가 아니라 호출 시점의 스토어 실데이터(알람·로그·상태)를 분석해 생성한다.
 */

type Topic = 'pio' | 'alarm' | 'log' | 'simulation' | 'status' | 'usage' | 'unknown'

function classify(question: string): Topic {
  const q = question.toLowerCase()
  if (/pio|핸드셰이크|핸드쉐이크|handshake|타임\s?차트|time\s?chart|e84|기준.*(초과|비교)|베이스라인|baseline/.test(q))
    return 'pio'
  if (/알람|alarm|경보|오류.*원인|왜.*(발생|났)/.test(q)) return 'alarm'
  if (/로그|log|이력|기록|이상.*징후/.test(q)) return 'log'
  if (/시뮬|simul|투입|출고|반송|경로/.test(q)) return 'simulation'
  if (/상태|요약|현황|status|summary|어때/.test(q)) return 'status'
  if (/사용법|어떻게|기능|방법|뭐.*할|help|도움/.test(q)) return 'usage'
  return 'unknown'
}

function getContext() {
  const conveyor = useConveyorStore.getState()
  const semiCnv = useSemiCnvStore.getState()
  const line =
    conveyor.lines.find((l) => l.id === conveyor.selectedLineId) ?? conveyor.lines[0]
  const unitById = new Map<string, ConveyorUnit>()
  for (const l of conveyor.lines) for (const u of l.units) unitById.set(u.id, u)
  return { conveyor, semiCnv, line, unitById }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR')
  } catch {
    return iso
  }
}

// ── 알람 분석 ─────────────────────────────────────────────
function analyzeAlarms(): string {
  const { conveyor, semiCnv, unitById } = getContext()
  const active = Object.entries(semiCnv.unitAlarms)

  if (active.length === 0) {
    const recent = conveyor.alarmHistory.slice(-3).reverse()
    const historyPart =
      recent.length > 0
        ? '\n\n최근 알람 이력:\n' +
          recent.map((a) => `· [${a.level}] ${fmtTime(a.timestamp)} ${a.alarmId} — ${a.alarmText}`).join('\n')
        : ''
    return `✅ 현재 활성 알람이 없습니다.${historyPart}`
  }

  const lines: string[] = [`🔴 활성 알람 ${active.length}건을 분석했습니다.`, '']
  for (const [unitId, code] of active) {
    const unit = unitById.get(unitId)
    const name = unit?.name ?? unitId
    const type = unit ? unitTitle(unit) : '알 수 없음'
    const at = semiCnv.unitAlarmAt[unitId]
    lines.push(`■ ${name} (${type}) — 알람 코드 ${code}${at ? `, 발생 ${fmtTime(at)}` : ''}`)

    // 알람 발생 시각 전후 V3 로그 상관 분석
    if (at) {
      const alarmMs = new Date(at).getTime()
      const related = semiCnv.v3Logs.filter((l) => {
        const t = new Date(l.receivedAt || l.logTime).getTime()
        return Number.isFinite(t) && Math.abs(t - alarmMs) < 5 * 60_000
      })
      if (related.length > 0) {
        lines.push(`  ↳ 발생 전후 5분 내 V3 로그 ${related.length}건:`)
        for (const l of related.slice(-3)) {
          lines.push(`    · [${l.logLevel}] ${l.title}: ${l.description}`)
        }
      }
    }
  }
  lines.push('')
  lines.push('권장 조치: ① 해당 유닛 콜아웃(ALARM 행)에서 코드 확인 ② 설비 상태 탭에서 상세 확인 ③ 조치 후 V3 이력에서 해제 여부 확인')
  return lines.join('\n')
}

// ── V3 로그 분석 ──────────────────────────────────────────
function analyzeLogs(): string {
  const { semiCnv, conveyor } = getContext()
  const logs = semiCnv.v3Logs

  if (logs.length === 0) {
    const appHistory = conveyor.history.slice(0, 5)
    if (appHistory.length === 0) return '수신된 V3 로그와 어플리케이션 이력이 없습니다. V3 연결 상태를 확인해주세요.'
    return (
      'V3 로그는 아직 수신되지 않았습니다. 어플리케이션 이력 최근 5건:\n' +
      appHistory.map((h) => `· ${fmtTime(h.timestamp)} [${h.eventType}] ${h.message}`).join('\n')
    )
  }

  // 레벨별 집계
  const byLevel = new Map<string, number>()
  for (const l of logs) byLevel.set(l.logLevel, (byLevel.get(l.logLevel) ?? 0) + 1)
  const levelSummary = [...byLevel.entries()].map(([lv, n]) => `${lv} ${n}건`).join(' · ')

  const warnings = logs.filter((l) => /error|warn|fail|알람|오류/i.test(l.logLevel + l.title))
  const lines: string[] = [
    `📊 V3 로그 ${logs.length}건 분석 — ${levelSummary}`,
    '',
  ]
  if (warnings.length > 0) {
    lines.push(`⚠ 주의 필요 로그 ${warnings.length}건 (최근 5건):`)
    for (const l of warnings.slice(-5)) {
      lines.push(`· [${l.logLevel}] ${fmtTime(l.receivedAt || l.logTime)} ${l.title}: ${l.description}`)
    }
  } else {
    lines.push('✅ 오류/경고성 로그는 발견되지 않았습니다. 최근 로그 3건:')
    for (const l of logs.slice(-3)) {
      lines.push(`· [${l.logLevel}] ${fmtTime(l.receivedAt || l.logTime)} ${l.title}: ${l.description}`)
    }
  }
  return lines.join('\n')
}

// ── 시뮬레이션 해석 ───────────────────────────────────────
function analyzeSimulation(): string {
  const { conveyor, line } = getContext()
  const simHistory = conveyor.history
    .filter((h) => /simul|시뮬|투입|출고/i.test(`${h.logTitle ?? ''} ${h.message}`))
    .slice(0, 5)

  const lines: string[] = []
  if (line) {
    const ports = line.units.filter((u) => u.type === 'port').length
    const storages = line.units.filter((u) => u.type === 'storage').length
    const entries = line.units.filter((u) => u.flowRole === 'entry' || u.role === 'INPUT').length
    lines.push(
      `현재 라인 "${line.name}" 시뮬레이션 구성: 투입점 ${entries}개, 포트 ${ports}개, 적재창고 ${storages}개.`,
    )
  }
  if (simHistory.length > 0) {
    lines.push('', '최근 시뮬레이션 관련 이력:')
    for (const h of simHistory) lines.push(`· ${fmtTime(h.timestamp)} ${h.logTitle ?? h.eventType}: ${h.message}`)
  } else {
    lines.push('', '최근 시뮬레이션 실행 이력이 없습니다.')
  }
  lines.push(
    '',
    '시뮬레이션은 라인 현황 화면 하단 "경로 시뮬레이션" 패널에서 실행합니다. 방향(투입/출고)·투입점·목적지를 선택하고 ▶ 버튼으로 시작하세요. 실행 중 콜아웃의 STATUS/SLOTS로 진행 상황을 확인할 수 있습니다.',
  )
  return lines.join('\n')
}

// ── 시스템 상태 요약 ──────────────────────────────────────
function summarizeStatus(): string {
  const { conveyor, semiCnv, line } = getContext()
  const lines: string[] = []

  if (line) {
    const byStatus = new Map<ConveyorStatus, number>()
    for (const u of line.units) byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1)
    const dist = [...byStatus.entries()]
      .map(([s, n]) => `${STATUS_COLORS[s].label} ${n}`)
      .join(' · ')
    lines.push(`📋 라인 "${line.name}" — 유닛 ${line.units.length}개 (${dist})`)
  } else {
    lines.push('선택된 라인이 없습니다.')
  }

  lines.push(`V3 연결: ${semiCnv.connectionState}${semiCnv.isLive ? ' (실시간 수신 중)' : ''}`)

  const activeAlarms = Object.keys(semiCnv.unitAlarms).length
  lines.push(activeAlarms > 0 ? `🔴 활성 알람: ${activeAlarms}건 — "알람 분석해줘"로 상세 확인` : '✅ 활성 알람 없음')

  if (semiCnv.v3Logs.length > 0) lines.push(`V3 로그 수신: ${semiCnv.v3Logs.length}건`)
  if (conveyor.history.length > 0) {
    const last = conveyor.history[0]
    lines.push(`최근 이벤트: ${fmtTime(last.timestamp)} ${last.logTitle ?? last.eventType} — ${last.message}`)
  }
  return lines.join('\n')
}

// ── PIO 핸드셰이크 분석 ───────────────────────────────────
function analyzePio(): string {
  const pio = usePioStore.getState()
  if (pio.transactions.length === 0) {
    return 'PIO 핸드셰이크 기록이 없습니다. 차트 메뉴에서 데모를 생성하거나 라인 현황에서 시뮬레이션(경로·OHT·포트반송)을 실행해보세요.'
  }

  const recent = pio.transactions.slice(0, 15)
  const errors = recent.filter((t) => t.status === 'error')
  const lines: string[] = [
    `📈 PIO 핸드셰이크 ${recent.length}건 분석 (오류 ${errors.length}건)`,
    '',
  ]

  let anomalyFound = false
  for (const tx of recent) {
    if (tx.status === 'running') continue
    const baseline = pio.baselines[tx.pairKind]
    const overs = computePioMeasures(tx, baseline).filter((m) => m.status === 'over')
    if (tx.status === 'error') {
      anomalyFound = true
      const isE84 = pioProtocolForPair(tx.pairKind) === 'E84'
      const haltDesc = isE84 ? '(ES/HO_AVBL 강하)' : '(정지/미완료)'
      lines.push(
        `■ ${tx.activeName}→${tx.passiveName} (${tx.operation}) — ❌ 오류 중단${tx.errorStep ? ` @${tx.errorStep}` : ''} ${haltDesc}`,
      )
      const errorDef = tx.errorStep ? baseline.stepDefs[tx.errorStep] : undefined
      if (errorDef) lines.push(`  ↳ 점검: ${errorDef.cause}`)
    } else if (overs.length > 0) {
      anomalyFound = true
      lines.push(
        `■ ${tx.activeName}→${tx.passiveName} (${tx.operation}, 총 ${Math.round(pioTransactionDuration(tx))}ms) — 기준 초과 ${overs.length}구간`,
      )
      for (const m of overs) {
        lines.push(`  · ${m.label}: 측정 ${m.durationMs}ms / 기준 ${m.baselineMs}ms (+${m.deviationMs}ms)`)
        lines.push(`    ↳ 점검: ${m.cause}`)
      }
    }
  }

  if (!anomalyFound) {
    lines.push('✅ 모든 핸드셰이크가 골든 베이스라인 허용 범위 내에 있습니다.')
  } else {
    lines.push('')
    lines.push(
      '개선 제안: 반복 초과 구간이 특정 단계에 집중되면 해당 설비의 PLC 스캔타임·센서 응답을 우선 점검하고, 차트 메뉴에서 정상 트랜잭션을 "기준으로 설정"해 현장 기준을 재정렬하세요.',
    )
  }
  return lines.join('\n')
}

// ── 사용법 안내 ───────────────────────────────────────────
function usageGuide(): string {
  return [
    '주요 기능 안내:',
    '· 주화면 — Safety/Auto/Status 패널, 버퍼 사용률, 라인 미니맵, 알람 이력',
    '· 라인 현황 — 실시간 맵, 유닛 콜아웃(클릭), 경로 시뮬레이션, OHT 모드, 2.5D 뷰',
    '· 라인 빌더 — 유닛·OHT 레일 드래그 배치, 속성 편집',
    '· 설비 상태 / CV 현황 / V3 이력 — 상세 표와 로그 조회',
    '',
    '저에게는 "알람 왜 발생했어?", "V3 로그 분석해줘", "시스템 상태 요약해줘" 같은 질문을 할 수 있습니다.',
  ].join('\n')
}

export function localAssistantAnswer(question: string): string {
  const topic = classify(question)
  const body = (() => {
    switch (topic) {
      case 'pio': return analyzePio()
      case 'alarm': return analyzeAlarms()
      case 'log': return analyzeLogs()
      case 'simulation': return analyzeSimulation()
      case 'status': return summarizeStatus()
      case 'usage': return usageGuide()
      default:
        return (
          summarizeStatus() +
          '\n\n(질문을 정확히 이해하지 못해 상태 요약을 보여드렸어요. "알람", "로그", "시뮬레이션" 키워드로 물어보시면 해당 분석을 제공합니다.)'
        )
    }
  })()
  return `${body}\n\n—\n🔌 로컬 분석 모드 (⚙에서 API 키 등록 시 생성형 AI가 답변합니다)`
}
