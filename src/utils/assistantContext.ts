import { useConveyorStore } from '../store/useConveyorStore'
import { useSemiCnvStore } from '../store/useSemiCnvStore'
import { unitTitle } from '../constants/conveyorTypes'

const MAX_V3_LOGS = 30
const MAX_HISTORY = 20
const MAX_ALARM_HISTORY = 15

/**
 * 관제시스템 실시간 상태를 모아 AI 어시스턴트의 시스템 프롬프트를 구성한다.
 * 호출 시점의 스토어 스냅샷 기반 — 질문할 때마다 최신 상태가 반영된다.
 */
export function buildAssistantSystemPrompt(): string {
  const conveyor = useConveyorStore.getState()
  const semiCnv = useSemiCnvStore.getState()

  const line = conveyor.lines.find((l) => l.id === conveyor.selectedLineId) ?? conveyor.lines[0]
  const unitNameById = new Map<string, string>()
  for (const l of conveyor.lines) {
    for (const u of l.units) unitNameById.set(u.id, u.name)
  }

  const sections: string[] = []

  // ── 시스템 개요
  sections.push(
    [
      '당신은 반도체 물류 PC제어 관제시스템에 내장된 AI 어시스턴트 "코비(COVY)"입니다.',
      '컨베이어 라인, OHT 반송, 적재창고, V3 하위 제어 프로그램을 모니터링하는 관제시스템 안에서 운영자·엔지니어의 질문에 답합니다.',
      '',
      '역할:',
      '- 알람 발생 원인 분석과 조치 가이드',
      '- V3 로그 및 이력 분석',
      '- 경로/포트·창고 시뮬레이션 결과 해석',
      '- 어플리케이션 기능·사용법 안내',
      '',
      '답변 원칙: 한국어로 간결하게. 현장 운영자가 바로 조치할 수 있게 결론부터. 아래 실시간 데이터에 근거해 답하고, 데이터에 없는 내용은 추측임을 밝힐 것.',
    ].join('\n'),
  )

  // ── 라인 구성
  if (line) {
    const unitSummary = line.units
      .slice(0, 60)
      .map((u) => `- ${u.name} (${unitTitle(u)}, 상태: ${u.status})`)
      .join('\n')
    sections.push(
      `## 현재 선택 라인: ${line.name}\n` +
        `유닛 ${line.units.length}개, 그리드 ${line.gridSize?.cols ?? '?'}×${line.gridSize?.rows ?? '?'}\n` +
        unitSummary,
    )
  }

  // ── V3 연결 상태
  sections.push(
    `## V3 연결\n상태: ${semiCnv.connectionState}${semiCnv.isLive ? ' (실시간 수신 중)' : ''}`,
  )

  // ── 활성 알람
  const activeAlarms = Object.entries(semiCnv.unitAlarms)
  if (activeAlarms.length > 0) {
    const lines = activeAlarms.map(([unitId, code]) => {
      const name = unitNameById.get(unitId) ?? unitId
      const at = semiCnv.unitAlarmAt[unitId]
      return `- ${name}: ${code}${at ? ` (발생: ${at})` : ''}`
    })
    sections.push(`## 활성 알람 (${activeAlarms.length}건)\n${lines.join('\n')}`)
  } else {
    sections.push('## 활성 알람\n현재 활성 알람 없음')
  }

  // ── 실시간 알람 피드
  if (semiCnv.liveAlarms.length > 0) {
    const lines = semiCnv.liveAlarms
      .slice(-MAX_ALARM_HISTORY)
      .map((a) => `- [${a.level}] ${a.timestamp} ${a.alarmId}: ${a.alarmText}`)
    sections.push(`## 최근 실시간 알람\n${lines.join('\n')}`)
  }

  // ── 알람 이력
  if (conveyor.alarmHistory.length > 0) {
    const lines = conveyor.alarmHistory
      .slice(-MAX_ALARM_HISTORY)
      .map((a) => `- [${a.level}] ${a.timestamp} ${a.alarmId}: ${a.alarmText}`)
    sections.push(`## 알람 이력 (최근 ${Math.min(conveyor.alarmHistory.length, MAX_ALARM_HISTORY)}건)\n${lines.join('\n')}`)
  }

  // ── V3 로그
  if (semiCnv.v3Logs.length > 0) {
    const lines = semiCnv.v3Logs
      .slice(-MAX_V3_LOGS)
      .map((l) => `- [${l.logLevel}] ${l.logTime} ${l.logType} | ${l.title}: ${l.description}`)
    sections.push(`## V3 로그 (최근 ${Math.min(semiCnv.v3Logs.length, MAX_V3_LOGS)}건)\n${lines.join('\n')}`)
  }

  // ── 어플리케이션 이력
  if (conveyor.history.length > 0) {
    const lines = conveyor.history
      .slice(0, MAX_HISTORY)
      .map((h) => {
        const name = unitNameById.get(h.unitId) ?? h.unitId
        return `- ${h.timestamp} [${h.eventType}] ${name}: ${h.logTitle ? `${h.logTitle} — ` : ''}${h.message}`
      })
    sections.push(`## 어플리케이션 이력 (최근 ${Math.min(conveyor.history.length, MAX_HISTORY)}건)\n${lines.join('\n')}`)
  }

  // ── 어플리케이션 기능 안내 (사용법 질문 대응)
  sections.push(
    [
      '## 어플리케이션 기능 요약',
      '- 라인 현황(모니터링): 실시간 유닛 상태, 콜아웃(STATUS/ROLE/CST/SLOTS), 경로 시뮬레이션(투입/출고, Tack Time, 연속 투입), 포트·창고 핸드쉐이크 시뮬, OHT 모드(레일·대차 시뮬), 2.5D 뷰',
      '- 라인 빌더: 유닛 드래그 배치(직선·회전·분기·리프트·포트·적재창고), OHT 레일 배치, 속성 편집',
      '- 설비 상태 / CV 현황 / V3 이력 탭: 상세 상태 표, V3 로그 조회',
      '- 알람: 유닛 알람 코드 실시간 표시(콜아웃 빨간 강조), 알람 이력 저장',
      '- 계정: 오퍼레이터(현장 모니터링)/엔지니어(설비 제어)/개발자 역할',
    ].join('\n'),
  )

  sections.push(`현재 시각: ${new Date().toLocaleString('ko-KR')}`)

  return sections.join('\n\n')
}
