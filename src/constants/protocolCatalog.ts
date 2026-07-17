/**
 * 프로토콜 카탈로그 — "데이터" 메뉴에서 조회하는 프로그램별 인터페이스 정의.
 *
 * 이 파일은 문서가 아니라 코드에 실제 구현된 프로토콜(types/semicnv.ts,
 * SemiCnvClient/useSemiCnvStore)을 그대로 옮긴 레퍼런스다.
 * 프로토콜을 바꾸면 이 카탈로그도 함께 갱신할 것.
 */

export type ProtocolDirection = 'rx' | 'tx'

export interface ProtocolField {
  name: string
  type: string
  required: boolean
  description: string
}

export interface ProtocolMessageDef {
  /** 메시지 타입 (envelope.type / COMMAND) */
  type: string
  direction: ProtocolDirection
  /** 한글 이름 */
  name: string
  description: string
  /** data 필드 구조 (envelope 공통 필드 제외) */
  fields: ProtocolField[]
  /** 원본 예시 JSON */
  example: unknown
}

export interface ProtocolProgramDef {
  id: string
  name: string
  /** 통신 방식·엔드포인트 요약 */
  transport: string
  status: 'active' | 'planned'
  /** 공통 envelope 설명 (있으면 메시지 목록 위에 표시) */
  envelopeNote?: string
  messages: ProtocolMessageDef[]
  /** planned 프로그램의 안내 문구 */
  plannedNote?: string
}

const V3_MESSAGES: ProtocolMessageDef[] = [
  {
    type: 'SITE_CONNECT',
    direction: 'rx',
    name: '현장 접속 통지',
    description: 'V3가 연결 직후 1회 전송 — 현장 이름·프로그램 버전·설비 규모를 알린다.',
    fields: [
      { name: 'siteName', type: 'string', required: true, description: '현장(Site) 이름' },
      { name: 'programVersion', type: 'string', required: true, description: 'V3 프로그램 버전' },
      { name: 'apiKey', type: 'string', required: false, description: '인증 키 (옵션)' },
      { name: 'lineCount', type: 'number', required: true, description: '라인 수' },
      { name: 'conveyorCount', type: 'number', required: true, description: '컨베이어 수' },
    ],
    example: {
      type: 'SITE_CONNECT',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:00.000Z',
      data: { siteName: '음성공장', programVersion: '3.1.0', lineCount: 2, conveyorCount: 24 },
    },
  },
  {
    type: 'CONVEYOR_STATUS',
    direction: 'rx',
    name: '컨베이어 상태',
    description: '유닛별 실시간 상태 배열 — 가동/알람/자재(cstId)/회전각 등. 주기 전송.',
    fields: [
      { name: 'id', type: 'number', required: true, description: 'Conveyor.ID (semiCnvId 매핑)' },
      { name: 'lineId', type: 'number', required: true, description: '소속 라인 ID' },
      { name: 'name', type: 'string', required: true, description: '유닛 이름 (CV01 등)' },
      { name: 'conveyorType', type: "'None'|'Normal'|'Turn'|'LFT'|'ZT'|'RX'|'Up_Down'", required: true, description: '유닛 타입' },
      { name: 'controlMode', type: "'MasterMode'|'CIMMode'", required: true, description: '제어 모드' },
      { name: 'runStatus', type: "'Run'|'Stop'", required: true, description: '구동 여부' },
      { name: 'operationStatus', type: "'Manual'|'Auto'", required: true, description: '운전 모드' },
      { name: 'autoStatus', type: "'None'|'Idle'|'Load'|'Busy'|'Unload'|'Compt'", required: true, description: '자동 시퀀스 상태' },
      { name: 'autoStep', type: 'number', required: true, description: '자동 시퀀스 스텝' },
      { name: 'power', type: "'On'|'Off'", required: true, description: '전원' },
      { name: 'alarm', type: 'boolean', required: true, description: '알람 발생 여부' },
      { name: 'cstId', type: 'string | null', required: true, description: '적재 중인 CST ID' },
      { name: 'destination', type: 'number', required: true, description: '자재 목적지 Conveyor.ID' },
      { name: 'currentDegree', type: 'string', required: false, description: '회전 유닛 현재 각도' },
      { name: 'axis', type: '{ torque, homeDone }', required: false, description: '축 상태 (토크·HOME 완료)' },
      { name: 'alarmCode', type: 'number', required: false, description: '알람 코드' },
      { name: 'alarmMessage', type: 'string', required: false, description: '알람 메시지' },
    ],
    example: {
      type: 'CONVEYOR_STATUS',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:01.000Z',
      data: [
        {
          id: 1, lineId: 0, name: 'CV01', conveyorType: 'Normal', controlMode: 'MasterMode',
          runStatus: 'Run', operationStatus: 'Auto', autoStatus: 'Busy', autoStep: 3,
          power: 'On', alarm: false, cstId: 'CST-0077', destination: 5,
        },
      ],
    },
  },
  {
    type: 'LINE_STATUS',
    direction: 'rx',
    name: '라인 상태',
    description: '라인 단위 요약 배열 — Safety/Key/Auto Condition·가동/알람 컨베이어 수.',
    fields: [
      { name: 'lineId', type: 'number', required: true, description: 'V3 라인 ID' },
      { name: 'lineName', type: 'string', required: true, description: '라인 이름' },
      { name: 'safetyStatus', type: "'OK'|'NG'", required: true, description: '안전 상태' },
      { name: 'keyStatus', type: "'Manual'|'Auto'", required: true, description: '키 스위치' },
      { name: 'autoCondition', type: "'Possible'|'Impossible'", required: true, description: 'Auto 전환 가능 여부' },
      { name: 'operationStatus', type: "'Manual'|'Auto'", required: true, description: '운전 모드' },
      { name: 'controlMode', type: "'MasterMode'|'CIMMode'", required: true, description: '제어 모드' },
      { name: 'totalConveyors', type: 'number', required: true, description: '전체 컨베이어 수' },
      { name: 'runningConveyors', type: 'number', required: true, description: '가동 중 수' },
      { name: 'alarmConveyors', type: 'number', required: true, description: '알람 발생 수' },
    ],
    example: {
      type: 'LINE_STATUS',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:01.000Z',
      data: [
        {
          lineId: 0, lineName: 'LINE-1', safetyStatus: 'OK', keyStatus: 'Auto',
          autoCondition: 'Possible', operationStatus: 'Auto', controlMode: 'MasterMode',
          totalConveyors: 12, runningConveyors: 9, alarmConveyors: 0,
        },
      ],
    },
  },
  {
    type: 'ALARM_EVENT',
    direction: 'rx',
    name: '알람 이벤트',
    description: '알람 발생(OCCUR)/해제(CLEAR) 즉시 통지 — 알람 리스트·이력에 반영.',
    fields: [
      { name: 'eventType', type: "'OCCUR'|'CLEAR'", required: true, description: '발생/해제' },
      { name: 'conveyorId', type: 'number', required: true, description: '대상 Conveyor.ID' },
      { name: 'lineId', type: 'number', required: true, description: '소속 라인 ID' },
      { name: 'alarmCode', type: 'string', required: true, description: '알람 코드' },
      { name: 'alarmLevel', type: "'Error'|'Warning'|'Info'", required: true, description: '레벨' },
      { name: 'alarmStep', type: 'number', required: true, description: '발생 시퀀스 스텝' },
      { name: 'message', type: 'string', required: true, description: '알람 메시지' },
    ],
    example: {
      type: 'ALARM_EVENT',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:02.000Z',
      data: {
        eventType: 'OCCUR', conveyorId: 3, lineId: 0, alarmCode: '3001',
        alarmLevel: 'Error', alarmStep: 4, message: 'CV03 MOTOR OVERLOAD',
      },
    },
  },
  {
    type: 'CST_TRACKING',
    direction: 'rx',
    name: 'CST 위치 추적',
    description: '자재(CST)가 어느 유닛에 있는지 배열로 통지 — 타임차트 V3 핸드셰이크 기록의 근거.',
    fields: [
      { name: 'cstId', type: 'string', required: true, description: 'CST ID' },
      { name: 'conveyorId', type: 'number', required: true, description: '현재 위치 Conveyor.ID' },
      { name: 'lineId', type: 'number', required: true, description: '소속 라인 ID' },
      { name: 'destination', type: 'number', required: true, description: '목적지 Conveyor.ID' },
    ],
    example: {
      type: 'CST_TRACKING',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:03.000Z',
      data: [{ cstId: 'CST-0077', conveyorId: 2, lineId: 0, destination: 5 }],
    },
  },
  {
    type: 'IO_STATUS',
    direction: 'rx',
    name: 'IO 상태 상세',
    description: 'Safety/Auto Condition 항목별 ON/OFF + 프로그램 상태 — 설비 상태 탭·조건 팝업에 표시.',
    fields: [
      { name: 'safetyOk', type: 'boolean', required: true, description: 'Safety Condition 종합' },
      { name: 'safetyConditions', type: '{ no, name, status }[]', required: true, description: '안전 조건 항목별 상태' },
      { name: 'autoConditionOk', type: 'boolean', required: true, description: 'Auto Condition 종합 — 설비 가동 버튼 활성 조건' },
      { name: 'autoConditions', type: '{ no, name, status }[]', required: true, description: 'Auto 조건 항목별 상태' },
      { name: 'currentStatus', type: 'string', required: true, description: '현재 상태 문자열' },
      { name: 'programStatus', type: '{ item, value }[]', required: true, description: '프로그램 상태 항목' },
    ],
    example: {
      type: 'IO_STATUS',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:04.000Z',
      data: {
        safetyOk: true,
        safetyConditions: [{ no: 1, name: 'EMO', status: true }],
        autoConditionOk: false,
        autoConditions: [{ no: 1, name: 'Home Done', status: false }],
        currentStatus: 'Standby',
        programStatus: [{ item: 'Version', value: '3.1.0' }],
      },
    },
  },
  {
    type: 'LOG_EVENT',
    direction: 'rx',
    name: '로그 스트리밍',
    description: 'V3 로그 실시간 전송 — "V3 이력" 탭·이력 화면에 축적.',
    fields: [
      { name: 'logTime', type: 'string (ISO8601)', required: true, description: '로그 발생 시각' },
      { name: 'logType', type: 'string', required: true, description: 'Application / Conveyor n / Master 등' },
      { name: 'logLevel', type: "'Normal'|'Warning'|'Error'", required: true, description: '레벨' },
      { name: 'title', type: 'string', required: true, description: '제목' },
      { name: 'description', type: 'string', required: true, description: '내용' },
    ],
    example: {
      type: 'LOG_EVENT',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:05.000Z',
      data: {
        logTime: '2026-07-11T09:00:05.000', logType: 'Application',
        logLevel: 'Normal', title: 'Auto Run', description: 'All conveyor auto run started',
      },
    },
  },
  {
    type: 'HEARTBEAT',
    direction: 'rx',
    name: '하트비트',
    description: '생존 신호 — 15초(SEMICNV_HEARTBEAT_TIMEOUT_MS) 무수신 시 Web이 강제 재연결.',
    fields: [
      { name: 'status', type: "'ALIVE'", required: true, description: '고정값' },
    ],
    example: {
      type: 'HEARTBEAT',
      siteId: 'site-A',
      timestamp: '2026-07-11T09:00:06.000Z',
      data: { status: 'ALIVE' },
    },
  },
  {
    type: 'COMMAND',
    direction: 'tx',
    name: '제어 명령',
    description:
      'Web → V3 제어 명령. 현재 정의된 cmd: all_power_on · all_power_off · all_auto_run · all_auto_stop · alarm_reset (전체 대상). 개별 유닛 명령은 미정의 — 스펙 확정 시 확장 예정.',
    fields: [
      { name: 'cmd', type: 'string', required: true, description: '명령 이름 (위 5종)' },
      { name: '...extra', type: 'Record<string, unknown>', required: false, description: '명령별 추가 파라미터 (확장용)' },
    ],
    example: { type: 'COMMAND', data: { cmd: 'all_auto_run' } },
  },
]

export const PROTOCOL_PROGRAMS: ProtocolProgramDef[] = [
  {
    id: 'semicnv-v3',
    name: 'V3 (Semi C/V)',
    transport: 'WebSocket · ws://<V3 PC>:8765/ws/dashboard · JSON',
    status: 'active',
    envelopeNote:
      '모든 수신 메시지는 공통 envelope { type, siteId, timestamp, data }로 감싸진다. 송신(COMMAND)은 { type: "COMMAND", data: { cmd, ... } } 형태.',
    messages: V3_MESSAGES,
  },
  {
    id: 'stocker',
    name: '스토커 (STK)',
    transport: '미정 — 인터페이스 협의 예정',
    status: 'planned',
    messages: [],
    plannedNote:
      '스토커 제어 프로그램과의 프로토콜은 아직 정의되지 않았습니다. 스펙이 확정되면 이 카탈로그(src/constants/protocolCatalog.ts)에 추가하세요.',
  },
]
