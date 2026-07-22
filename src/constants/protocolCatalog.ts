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
      { name: 'sensors', type: '{ name, status }[]', required: false, description: '컨베이어 I/O 센서 상태 (입구/출구 광센서·스토퍼·POT/NOT 등) — "V3 I/O" 탭 표시용' },
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
          sensors: [
            { name: 'IN Photo', status: true },
            { name: 'OUT Photo', status: false },
            { name: 'Stopper Up', status: true },
          ],
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

/**
 * 스토커(STK) 메시지 — docs/V3_프로토콜_정의서(자동 복구됨)_스토커포함.xlsx 기준.
 * V3가 STOCKER 모드로 기동하면 동일 Envelope로 전송하며 data.equipmentType='STOCKER'로 구분.
 * 소스 기준: SS-One BIT/Word Communication · Port Bit/Word (구 STOCKER↔CIM TCP/IP Memory Map).
 */
const STK_MESSAGES: ProtocolMessageDef[] = [
  {
    type: 'SITE_CONNECT',
    direction: 'rx',
    name: '현장 접속 통지 (스토커)',
    description: 'V3가 STOCKER 모드로 연결 직후 1회 전송 — equipmentType=STOCKER, 스토커·랙마스터·포트·셀프 규모를 알린다.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자 (STOCKER 고정)' },
      { name: 'siteName', type: 'string', required: true, description: '현장(Site) 이름' },
      { name: 'programVersion', type: 'string', required: true, description: 'V3 프로그램 버전' },
      { name: 'stockerCount', type: 'number', required: true, description: '스토커 수' },
      { name: 'rackMasterCount', type: 'number', required: true, description: '랙마스터(크레인) 수' },
      { name: 'portCount', type: 'number', required: true, description: '포트 수' },
      { name: 'shelfCount', type: 'number', required: true, description: '셀프(선반) 수' },
    ],
    example: {
      type: 'SITE_CONNECT',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:00.000Z',
      data: {
        equipmentType: 'STOCKER', siteName: '음성공장 STK-A', programVersion: '3.1.0',
        stockerCount: 1, rackMasterCount: 1, portCount: 4, shelfCount: 240,
      },
    },
  },
  {
    type: 'LINE_STATUS',
    direction: 'rx',
    name: '스토커 본체 상태',
    description: '스토커 본체 단위 요약 — 제어/운전 모드·온라인·안전·타워램프·도어·EMO·팬·CST Full·적재수·포트 요약·CPS 전원. 주기 전송.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'stockerId', type: 'number', required: true, description: '스토커 ID' },
      { name: 'stockerName', type: 'string', required: true, description: '스토커 이름' },
      { name: 'controlMode', type: "'MasterMode'|'CIMMode'", required: true, description: '제어 모드 (CIM Mode 여부)' },
      { name: 'operationStatus', type: "'Manual'|'Auto'", required: true, description: '운전 모드 (Master Key Auto)' },
      { name: 'onlineStatus', type: "'Online'|'Offline'", required: true, description: 'SS-One↔MST 온라인 상태' },
      { name: 'safetyStatus', type: "'OK'|'NG'", required: true, description: '안전 종합 (EMO·도어·라이트커튼)' },
      { name: 'alarmStatus', type: 'boolean', required: true, description: '알람 발생 여부 (Master/RM 종합)' },
      { name: 'towerLamp', type: '{ green, yellow, red, buzzer }', required: true, description: '타워램프 상태 (경/중알람·부저)' },
      { name: 'doorOpen', type: 'boolean', required: true, description: '도어 열림 (HP/OP Door)' },
      { name: 'emoPushed', type: 'boolean', required: true, description: '비상정지(EMO) 눌림' },
      { name: 'keyAuto', type: 'boolean', required: true, description: 'Master Key 자동 모드' },
      { name: 'fanStatus', type: '{ intake, exhaust }', required: false, description: '흡기/배기팬 정상 여부' },
      { name: 'cstFull', type: 'boolean', required: true, description: 'CST Full 상태' },
      { name: 'storedCstCount', type: 'number', required: true, description: '적재 CST 수' },
      { name: 'totalPorts', type: 'number', required: true, description: '전체 포트 수' },
      { name: 'runningPorts', type: 'number', required: true, description: '가동 포트 수' },
      { name: 'alarmCount', type: 'number', required: true, description: '알람 발생 수' },
      { name: 'cps', type: '{ no, run, error, failover }[]', required: false, description: 'CPS 전원공급 상태 배열 (CPS#1/#2)' },
    ],
    example: {
      type: 'LINE_STATUS',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:01.000Z',
      data: [
        {
          equipmentType: 'STOCKER', stockerId: 1, stockerName: 'STK-01',
          controlMode: 'CIMMode', operationStatus: 'Auto', onlineStatus: 'Online',
          safetyStatus: 'OK', alarmStatus: false,
          towerLamp: { green: true, yellow: false, red: false, buzzer: false },
          doorOpen: false, emoPushed: false, keyAuto: true,
          fanStatus: { intake: true, exhaust: true },
          cstFull: false, storedCstCount: 128, totalPorts: 4, runningPorts: 3, alarmCount: 0,
          cps: [
            { no: 1, run: true, error: false, failover: false },
            { no: 2, run: true, error: false, failover: false },
          ],
        },
      ],
    },
  },
  {
    type: 'CONVEYOR_STATUS',
    direction: 'rx',
    name: '유닛 상태 (크레인·포트)',
    description: '유닛별 실시간 상태 배열 — unitType으로 Rack Master(크레인)/Port 구분. 크레인 서보·모드·반송동작·스텝, 포트 PIO 핸드셰이크·캐리어ID 등.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'id', type: 'number', required: true, description: '유닛 ID' },
      { name: 'stockerId', type: 'number', required: true, description: '소속 스토커 ID' },
      { name: 'unitType', type: "'RackMaster'|'Port'", required: true, description: '유닛 종류' },
      { name: 'name', type: 'string', required: true, description: '유닛 이름 (RM01 / MGV-IN 등)' },
      { name: 'alarm', type: 'boolean', required: true, description: '알람 발생 여부' },
      { name: 'servoOn', type: 'boolean', required: false, description: '[RackMaster] 서보 온 상태' },
      { name: 'controlMode', type: "'MasterMode'|'CIMMode'", required: false, description: '[RackMaster] 제어 모드' },
      { name: 'operationStatus', type: "'Manual'|'Auto'", required: false, description: '[RackMaster] 운전 모드' },
      { name: 'activity', type: "'Idle'|'Active'", required: false, description: '[RackMaster] IDLE/ACTIVE 상태' },
      { name: 'transferType', type: "'None'|'From'|'To'|'Scan'|'Maint'", required: false, description: '[RackMaster] 반송 동작 종류' },
      { name: 'autoStep', type: 'number', required: false, description: '[RackMaster] 자동 시퀀스 스텝' },
      { name: 'homeDone', type: 'boolean', required: false, description: '[RackMaster] 원점 복귀 완료' },
      { name: 'fromShelfId', type: 'number | null', required: false, description: '[RackMaster] From 셀프 ID' },
      { name: 'toShelfId', type: 'number | null', required: false, description: '[RackMaster] To 셀프 ID' },
      { name: 'accessShelfId', type: 'number | null', required: false, description: '[RackMaster] 현재 접근 셀프 ID' },
      { name: 'cstId', type: 'string | null', required: false, description: '[RackMaster] 포크 적재 CST ID' },
      { name: 'cstPresent', type: 'boolean', required: false, description: '[RackMaster] 포크 카세트 유무' },
      { name: 'portType', type: "'MGV'|'AGV'|'OHT'|'AUTO'", required: false, description: '[Port] 포트 타입' },
      { name: 'direction', type: "'In'|'Out'", required: false, description: '[Port] 입출고 방향 (In/Out Mode)' },
      { name: 'pioStatus', type: "'Idle'|'TR_REQ'|'Busy'|'Transferring'|'Complete'|'Error'", required: false, description: '[Port] PIO 핸드셰이크 상태 (E84)' },
      { name: 'carrierId', type: 'string | null', required: false, description: '[Port] 캐리어(CST) ID' },
      { name: 'runEnable', type: 'boolean', required: false, description: '[Port] Run 가능 상태' },
      { name: 'lightCurtain', type: 'boolean', required: false, description: '[Port] 라이트커튼 감지' },
    ],
    example: {
      type: 'CONVEYOR_STATUS',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:01.000Z',
      data: [
        {
          equipmentType: 'STOCKER', id: 1, stockerId: 1, unitType: 'RackMaster', name: 'RM01',
          alarm: false, servoOn: true, controlMode: 'CIMMode', operationStatus: 'Auto',
          activity: 'Active', transferType: 'To', autoStep: 12, homeDone: true,
          fromShelfId: 15, toShelfId: 132, accessShelfId: 132, cstId: 'CST-0077', cstPresent: true,
        },
        {
          equipmentType: 'STOCKER', id: 101, stockerId: 1, unitType: 'Port', name: 'MGV-IN',
          alarm: false, portType: 'MGV', direction: 'In', pioStatus: 'Transferring',
          carrierId: 'CST-0091', runEnable: true, lightCurtain: false,
        },
      ],
    },
  },
  {
    type: 'ALARM_EVENT',
    direction: 'rx',
    name: '알람 이벤트 (스토커)',
    description: '알람 발생(OCCUR)/해제(CLEAR) — source(Stocker/RackMaster/CPS/Port)로 통지. 에러워드 기반 코드·레벨·메시지.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'eventType', type: "'OCCUR'|'CLEAR'", required: true, description: '발생/해제' },
      { name: 'source', type: "'Stocker'|'RackMaster'|'CPS'|'Port'", required: true, description: '알람 발생원' },
      { name: 'unitId', type: 'number', required: true, description: '대상 유닛 ID (본체=0)' },
      { name: 'stockerId', type: 'number', required: true, description: '소속 스토커 ID' },
      { name: 'alarmCode', type: 'string', required: true, description: '알람 코드 (에러워드 기반)' },
      { name: 'alarmLevel', type: "'Error'|'Warning'|'Info'", required: true, description: '레벨' },
      { name: 'alarmStep', type: 'number', required: false, description: '발생 스텝 (RM 자동 스텝)' },
      { name: 'message', type: 'string', required: true, description: '알람 메시지' },
      { name: 'axis', type: "'X'|'Z'|'A'|'T'|null", required: false, description: '관련 축 (RM 축 알람 시)' },
    ],
    example: {
      type: 'ALARM_EVENT',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:02.000Z',
      data: {
        equipmentType: 'STOCKER', eventType: 'OCCUR', source: 'RackMaster',
        unitId: 1, stockerId: 1, alarmCode: 'RM-2043', alarmLevel: 'Error',
        alarmStep: 12, message: 'RM01 Z-AXIS SERVO ERROR', axis: 'Z',
      },
    },
  },
  {
    type: 'CST_TRACKING',
    direction: 'rx',
    name: 'CST 위치 추적 (스토커)',
    description: 'CST(카세트)가 어느 셀프/포트/포크 위에 있는지 통지 — locationType·shelfId·portId·from/to 셀프.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'cstId', type: 'string', required: true, description: 'CST ID' },
      { name: 'locationType', type: "'Shelf'|'Port'|'Fork'", required: true, description: '현재 위치 종류' },
      { name: 'shelfId', type: 'number | null', required: true, description: '셀프 ID (Shelf일 때)' },
      { name: 'portId', type: 'number | null', required: true, description: '포트 ID (Port일 때)' },
      { name: 'stockerId', type: 'number', required: true, description: '소속 스토커 ID' },
      { name: 'fromShelfId', type: 'number | null', required: false, description: '출발 셀프 ID' },
      { name: 'toShelfId', type: 'number | null', required: false, description: '목적지 셀프 ID' },
    ],
    example: {
      type: 'CST_TRACKING',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:03.000Z',
      data: [
        {
          equipmentType: 'STOCKER', cstId: 'CST-0077', locationType: 'Fork',
          shelfId: null, portId: null, stockerId: 1, fromShelfId: 15, toShelfId: 132,
        },
      ],
    },
  },
  {
    type: 'IO_STATUS',
    direction: 'rx',
    name: 'IO·축 상태 상세',
    description: '안전/Auto 조건 항목별 + 크레인 X/Z/A/T 축 텔레메트리(위치·속도·토크·주행거리) + 주요 센서·프로그램 상태.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'stockerId', type: 'number', required: true, description: '소속 스토커 ID' },
      { name: 'safetyOk', type: 'boolean', required: true, description: 'Safety Condition 종합' },
      { name: 'safetyConditions', type: '{ no, name, status }[]', required: true, description: '안전 조건 항목별 (EMO/Door/Escape/LightCurtain)' },
      { name: 'autoConditionOk', type: 'boolean', required: true, description: 'Auto 전환 가능 종합' },
      { name: 'autoConditions', type: '{ no, name, status }[]', required: true, description: 'Auto 조건 항목별 (ServoOn/HomeDone/NoError)' },
      { name: 'axes', type: '{ axis, currentPos, targetPos, currentSpeed, torque, avgTorque, peakTorque, travelDistance, homeDone, servoOn }[]', required: true, description: '크레인 축(X/Z/A/T) 텔레메트리' },
      { name: 'sensors', type: '{ name, status }[]', required: false, description: '주요 센서 상태 (카세트감지/돌출/Home/POT/NOT)' },
      { name: 'programStatus', type: '{ item, value }[]', required: false, description: '프로그램 상태 항목' },
    ],
    example: {
      type: 'IO_STATUS',
      siteId: 'site-B',
      timestamp: '2026-07-11T09:00:04.000Z',
      data: {
        equipmentType: 'STOCKER',
        stockerId: 1,
        safetyOk: true,
        safetyConditions: [
          { no: 1, name: 'EMO', status: true },
          { no: 2, name: 'Front Door', status: true },
        ],
        autoConditionOk: true,
        autoConditions: [
          { no: 1, name: 'Servo On', status: true },
          { no: 2, name: 'Home Done', status: true },
        ],
        axes: [
          { axis: 'X', currentPos: 12450.5, targetPos: 12450.5, currentSpeed: 0.0, torque: 8.2, avgTorque: 7.5, peakTorque: 22.1, travelDistance: 184203.4, homeDone: true, servoOn: true },
          { axis: 'Z', currentPos: 3200.0, targetPos: 3200.0, currentSpeed: 0.0, torque: 5.1, avgTorque: 4.8, peakTorque: 18.7, travelDistance: 95820.1, homeDone: true, servoOn: true },
        ],
        sensors: [
          { name: 'Fork CST Present', status: true },
          { name: 'Fork Protrusion', status: false },
        ],
        programStatus: [{ item: 'Version', value: '3.1.0' }],
      },
    },
  },
  {
    type: 'COMMAND',
    direction: 'tx',
    name: '제어 명령 (스토커)',
    description:
      'Web → V3 스토커 제어. 본체(비상정지·에러리셋·형광등·타워램프)·크레인(서보·자동·원점·반송·티칭·시간동기)·포트(run/stop/power/in-out mode/reset) 명령을 target으로 지정.',
    fields: [
      { name: 'equipmentType', type: "string ('STOCKER')", required: true, description: '설비 종류 구분자' },
      { name: 'cmd', type: 'string', required: true, description: '명령 이름 — 본체: emergency_stop·error_reset·light_on·light_off·tower_lamp_set / 크레인: rm_servo_on·rm_servo_off·rm_auto_run·rm_auto_stop·rm_home·rm_transfer·rm_teaching_start·rm_scan_start·rm_maint_move·time_sync / 포트: port_run·port_stop·port_power_on·port_power_off·port_in_mode·port_out_mode·port_error_reset·port_interface_reset' },
      { name: 'target', type: "{ kind: 'Stocker'|'RackMaster'|'Port', id: number }", required: true, description: '명령 대상 (본체 id=0)' },
      { name: 'params', type: 'Record<string, unknown>', required: false, description: '명령별 추가 파라미터 (rm_transfer: fromShelfId/toShelfId, rm_teaching_start: shelfId, tower_lamp_set: color/mode 등)' },
    ],
    example: {
      type: 'COMMAND',
      data: {
        equipmentType: 'STOCKER',
        cmd: 'rm_transfer',
        target: { kind: 'RackMaster', id: 1 },
        params: { fromShelfId: 15, toShelfId: 132 },
      },
    },
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
    transport: 'WebSocket · ws://<V3 PC>:8765/ws/dashboard · JSON (V3 STOCKER 모드)',
    status: 'planned',
    envelopeNote:
      'V3와 동일한 envelope { type, siteId, timestamp, data }를 사용하며 data.equipmentType="STOCKER"로 구분한다 (미지정 시 SEMI_CNV로 간주). 소스 기준: SS-One BIT/Word Communication · Port Bit/Word 메모리맵의 WebSocket JSON 재정의.',
    messages: STK_MESSAGES,
    plannedNote:
      'V3 STOCKER 모드 프로토콜 정의(안) — V3_프로토콜_정의서 v1.1 기준이며 실제 연동은 아직 구현 전입니다.',
  },
]
