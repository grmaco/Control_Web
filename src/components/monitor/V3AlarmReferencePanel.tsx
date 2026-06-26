import { useState, useMemo } from 'react'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { useConveyorStore } from '../../store/useConveyorStore'
import {
  buildActiveV3AlarmOccurrences,
  formatOccurrenceLocation,
  groupOccurrencesByAlarmCode,
} from '../../utils/activeV3Alarms'

type AlarmLevel = 'Error' | 'Warning' | 'Info'

interface AlarmReference {
  code: string
  /** V3 Conveyor_Alarm enum 값 (10진수) — Conveyor_Alarm.cs 기준 */
  v3Code?: number
  name: string
  nameEn: string
  level: AlarmLevel
  category: string
  cause: string
  remedy: string[]
}

/**
 * V3 Conveyor_Alarm enum 코드 매핑 (Conveyor_Alarm.cs)
 * None=0, R_Axis_Power_Off=1..12, Axis_Not_Op=14,
 * Init_Step_Time_Over=16, Init_Abnormal=17, Master_Error=18,
 * CST_Empty=32..CST_Not_InPos=39,
 * T_Axis_Power_Off=64..T_Axis_Hardware_NOT=97,
 * Z_Axis_Power_Off=128..Light_Curtain=176,
 * Reading_CheckSum=192..Shuttle_No_CST_ID=212,
 * Abnormal_CST_Pos=216, Destination_Not_OutPort=224, FOUP_Ack_Timeout=225
 */
const ALARM_DB: AlarmReference[] = [
  // ── R축 (롤러 컨베이어 구동) ─────────────────────────────────────────
  {
    code: 'R-001', v3Code: 1,
    name: 'R축 전원 오프', nameEn: 'R Axis Power Off Error',
    level: 'Error', category: 'R축',
    cause: 'R축(롤러 구동) 인버터/드라이버 전원이 차단됨',
    remedy: [
      '해당 컨베이어 인버터 전원 및 MCCB 상태를 확인합니다.',
      '인버터 LED 및 표시창에서 이상 코드를 확인합니다.',
      '전원 재투입 후 Auto 조건을 확인합니다.',
    ],
  },
  {
    code: 'R-002', v3Code: 2,
    name: 'R축 과부하', nameEn: 'R Axis Overload',
    level: 'Error', category: 'R축',
    cause: '롤러 구동 모터 과전류·과부하 (기계적 걸림, 과적재)',
    remedy: [
      '컨베이어 위 CST·이물질 걸림 여부를 확인합니다.',
      '벨트/롤러 장력이 과도한지 점검합니다.',
      '인버터 알람 코드를 확인하고 리셋합니다.',
      '원인 해소 후 수동 운전으로 동작을 확인합니다.',
    ],
  },
  {
    code: 'R-003', v3Code: 3,
    name: 'R축 과전류', nameEn: 'R Axis Over Current',
    level: 'Error', category: 'R축',
    cause: 'R축 모터 과전류 (단락, 절연 불량)',
    remedy: [
      '모터 및 케이블 절연 저항을 측정합니다.',
      '인버터 에러 코드를 확인하고 원인을 제거합니다.',
      '전원 OFF → 30초 대기 → 재투입 후 재시도합니다.',
    ],
  },
  {
    code: 'R-004', v3Code: 4,
    name: 'R축 과전압', nameEn: 'R Axis Over Voltage',
    level: 'Error', category: 'R축',
    cause: '회생 전압 과다 또는 입력 전압 이상',
    remedy: [
      '입력 전압이 정격 범위인지 확인합니다.',
      '회생 저항 연결 상태를 점검합니다.',
      '감속 시간 파라미터를 늘려 회생 에너지를 줄입니다.',
    ],
  },
  {
    code: 'R-005', v3Code: 5,
    name: 'R축 온도 이상', nameEn: 'R Axis Open Temperature',
    level: 'Error', category: 'R축',
    cause: '모터 또는 인버터 과열 (온도 센서 단선 포함)',
    remedy: [
      '모터 방열판 및 팬 동작 상태를 확인합니다.',
      '부하율이 정격 대비 과도한지 점검합니다.',
      '인버터 내부 냉각팬 동작을 확인합니다.',
      '냉각 후 재기동합니다.',
    ],
  },
  {
    code: 'R-006', v3Code: 6,
    name: 'R축 모터 단선', nameEn: 'R Axis Open Motor Winding',
    level: 'Error', category: 'R축',
    cause: '모터 권선 단선 또는 인버터-모터 간 케이블 단선',
    remedy: [
      '모터 케이블 U/V/W 배선 및 커넥터 상태를 점검합니다.',
      '테스터로 모터 권선 저항을 측정합니다.',
      '케이블 또는 모터 교체 후 재기동합니다.',
    ],
  },
  {
    code: 'R-007', v3Code: 7,
    name: 'R축 내부 전압 불량', nameEn: 'R Axis Internal Voltage Bad',
    level: 'Error', category: 'R축',
    cause: '인버터 내부 제어 전원 이상',
    remedy: [
      '인버터 제어 전원(24V DC 등) 공급 상태를 확인합니다.',
      '인버터를 전원 재투입 후 재시도합니다.',
      '반복 시 인버터 교체를 검토합니다.',
    ],
  },
  {
    code: 'R-008', v3Code: 8,
    name: 'R축 위치 리밋', nameEn: 'R Axis Position Limit',
    level: 'Error', category: 'R축',
    cause: '소프트웨어 위치 한계 초과 감지',
    remedy: [
      '수동 모드로 안전 위치로 복귀합니다.',
      '파라미터의 위치 한계 설정값을 확인합니다.',
    ],
  },
  {
    code: 'R-009', v3Code: 9,
    name: 'R축 전압 저하', nameEn: 'R Axis Voltage Low',
    level: 'Error', category: 'R축',
    cause: '인버터 입력 전압이 정격 하한 이하',
    remedy: [
      '입력 전원의 전압을 측정합니다.',
      '전원 공급 라인의 접촉 저항·단락을 점검합니다.',
    ],
  },
  {
    code: 'R-010', v3Code: 10,
    name: 'R축 전류 리밋', nameEn: 'R Axis Current Limit',
    level: 'Error', category: 'R축',
    cause: '모터 전류가 인버터 전류 한계 초과',
    remedy: [
      '기계적 부하(걸림·과적재)를 제거합니다.',
      '인버터 전류 한계 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'R-011', v3Code: 11,
    name: 'R축 스텝 드라이브 오류', nameEn: 'R Axis Step Drive Error',
    level: 'Error', category: 'R축',
    cause: '스텝 모터 드라이버 통신 또는 드라이버 내부 이상',
    remedy: [
      '드라이버 전원 및 통신 케이블을 점검합니다.',
      '드라이버 알람 출력 LED를 확인합니다.',
      '드라이버 전원 재투입 후 재시도합니다.',
    ],
  },
  {
    code: 'R-012', v3Code: 12,
    name: '이전 유닛 오류', nameEn: 'Prev Unit Error',
    level: 'Error', category: 'R축',
    cause: '앞 단 컨베이어(Prev Unit)에서 오류 발생으로 연동 정지',
    remedy: [
      '이전 유닛의 알람 코드를 확인하고 해당 알람을 먼저 해제합니다.',
      '이전 유닛 정상화 후 이 알람은 자동 해제됩니다.',
    ],
  },
  {
    code: 'R-013', v3Code: 14,
    name: '축 OP 상태 미진입', nameEn: 'Axis Not Op State Error',
    level: 'Error', category: 'R축',
    cause: 'EtherCAT 슬레이브 축이 OP(Operational) 상태 미진입',
    remedy: [
      'EtherCAT 통신 상태를 확인합니다.',
      '해당 드라이버 전원 및 케이블을 점검합니다.',
      'V3 프로그램을 재시작합니다.',
    ],
  },

  // ── 초기화 오류 ────────────────────────────────────────────────────────
  {
    code: 'I-001', v3Code: 16,
    name: '초기화 스텝 타임오버', nameEn: 'Init Step Time Over Error',
    level: 'Error', category: '초기화',
    cause: '컨베이어 초기화(Home) 중 지정 시간 내 스텝 완료 실패',
    remedy: [
      '초기화 경로에 기계적 장애물이 있는지 확인합니다.',
      '속도 파라미터 및 타임아웃 설정값을 점검합니다.',
      '수동으로 원점 센서 감지 여부를 확인합니다.',
    ],
  },
  {
    code: 'I-002', v3Code: 17,
    name: '초기화 이상', nameEn: 'Init Abnormal Error',
    level: 'Error', category: '초기화',
    cause: '초기화 시퀀스 중 예상치 못한 상태 발생',
    remedy: [
      '이상이 발생한 스텝 로그를 확인합니다.',
      '수동 모드로 전환 후 원점을 수동 복귀합니다.',
      '파라미터 설정값을 검토합니다.',
    ],
  },
  {
    code: 'I-003', v3Code: 18,
    name: '마스터 오류', nameEn: 'Master Error',
    level: 'Error', category: '초기화',
    cause: 'Master 시스템이 Error 상태 (EMO, EMS, Main Power Off 등)',
    remedy: [
      'Master 알람(Safety 조건)을 먼저 확인하고 해제합니다.',
      'Safety Reset 후 재시도합니다.',
    ],
  },

  // ── CST / 자재 ─────────────────────────────────────────────────────────
  {
    code: 'T-001', v3Code: 32,
    name: 'CST Empty (자재 없음)', nameEn: 'CST Empty',
    level: 'Warning', category: 'CST/자재',
    cause: '투입 위치에 CST가 없거나 자재 감지 센서가 빈 상태 인식',
    remedy: [
      '해당 컨베이어에 CST가 올바르게 적재되어 있는지 확인합니다.',
      '자재 감지 센서(포토센서, RFID) 오염·위치 이탈 여부를 점검합니다.',
      'CST를 수동 투입하거나 이전 공정 CST 공급 상태를 확인합니다.',
      '센서 오인식 시 감도 조정 또는 센서 교체를 진행합니다.',
      '알람 해제 후 CST 트래킹 정보를 초기화합니다.',
    ],
  },
  {
    code: 'T-002', v3Code: 33,
    name: '알 수 없는 CST 감지', nameEn: 'Unknown CST Detected',
    level: 'Error', category: 'CST/자재',
    cause: 'RFID 또는 ID 시스템에서 미등록 CST ID 감지',
    remedy: [
      'RFID 리더기 및 CST의 태그를 점검합니다.',
      'CST ID가 시스템에 등록되어 있는지 확인합니다.',
      '잘못된 CST가 투입된 경우 제거합니다.',
    ],
  },
  {
    code: 'T-003', v3Code: 34,
    name: 'IN 스텝 타임오버', nameEn: 'IN Step Time Over Error',
    level: 'Error', category: 'CST/자재',
    cause: '투입(IN) 시퀀스가 지정 시간 내 완료되지 않음',
    remedy: [
      '투입 경로에 장애물이 있는지 확인합니다.',
      '투입 센서 감지 상태를 점검합니다.',
      'IN 타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'T-004', v3Code: 35,
    name: 'OUT 스텝 타임오버', nameEn: 'OUT Step Time Over Error',
    level: 'Error', category: 'CST/자재',
    cause: '출고(OUT) 시퀀스가 지정 시간 내 완료되지 않음',
    remedy: [
      '출고 경로에 장애물이 있는지 확인합니다.',
      '다음 유닛의 수신 Ready 상태를 확인합니다.',
      'OUT 타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'T-005', v3Code: 36,
    name: 'CST 오버런', nameEn: 'CST Over Run',
    level: 'Error', category: 'CST/자재',
    cause: 'CST가 목표 위치를 초과하여 이동 (센서 미감지 또는 속도 과다)',
    remedy: [
      '해당 컨베이어의 CST 위치를 현장에서 확인합니다.',
      '정지 센서 감도 및 위치를 점검합니다.',
      '속도 파라미터를 낮추는 것을 검토합니다.',
    ],
  },
  {
    code: 'T-006', v3Code: 37,
    name: 'CST ZAM (이중 점유)', nameEn: 'CST ZAM',
    level: 'Error', category: 'CST/자재',
    cause: 'CST 이중 점유(ZAM) 감지',
    remedy: [
      '해당 구간에 CST가 2개 이상 있는지 확인합니다.',
      '수동으로 여분의 CST를 안전한 위치로 이동합니다.',
      'CST 트래킹 정보를 초기화합니다.',
    ],
  },
  {
    code: 'T-007', v3Code: 39,
    name: 'CST 미위치 오류', nameEn: 'CST Not InPosition Error',
    level: 'Error', category: 'CST/자재',
    cause: 'CST가 InPosition 센서 감지 위치에 정확히 안착되지 않음',
    remedy: [
      'CST가 컨베이어 위에 올바르게 안착되어 있는지 확인합니다.',
      'InPosition 센서 오염 및 위치를 점검합니다.',
      'CST를 수동으로 정위치에 재안착합니다.',
    ],
  },
  {
    code: 'T-008', v3Code: 216,
    name: 'CST 비정상 위치', nameEn: 'Abnormal CST Position Error',
    level: 'Error', category: 'CST/자재',
    cause: 'CST가 예상 위치 외 구간에서 감지됨',
    remedy: [
      '현장에서 CST 위치를 확인하고 정위치로 이동합니다.',
      'CST 트래킹을 초기화합니다.',
      '이전 단 오작동 원인을 조사합니다.',
    ],
  },
  {
    code: 'T-009', v3Code: 224,
    name: '목적지 OUT포트 아님', nameEn: 'Destination Not OutPort Error',
    level: 'Error', category: 'CST/자재',
    cause: '목적지 컨베이어가 OUT 포트로 설정되지 않았거나 경로 오설정',
    remedy: [
      'V3 파라미터에서 라인 간 경로(Routing) 설정을 검토합니다.',
      '목적지 컨베이어의 역할(PortType) 설정을 확인합니다.',
      '경로 재설정 후 수동으로 CST를 목적지까지 이동하여 검증합니다.',
    ],
  },
  {
    code: 'T-010', v3Code: 225,
    name: 'FOUP 도착 ACK 타임아웃', nameEn: 'FOUP Arrived Ack Timeout Error',
    level: 'Error', category: 'CST/자재',
    cause: 'OHT/AGV로 FOUP 도착 통보 후 ACK 수신 타임아웃',
    remedy: [
      'OHT/AGV 시스템과의 통신 상태를 확인합니다.',
      'PIO 인터페이스 케이블 연결을 점검합니다.',
      '상위 시스템 ACK 처리 로직을 확인합니다.',
    ],
  },

  // ── T축 (Turn 컨베이어) ────────────────────────────────────────────────
  {
    code: 'TA-001', v3Code: 64,
    name: 'T축 전원 오프', nameEn: 'T Axis Power Off Error',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'Turn 축 서보 드라이버 전원 차단',
    remedy: [
      'T축 서보 드라이버 전원 공급 상태를 확인합니다.',
      '드라이버 MCCB/퓨즈 상태를 점검합니다.',
      '전원 재투입 후 재시도합니다.',
    ],
  },
  {
    code: 'TA-002', v3Code: 65,
    name: 'T축 과부하', nameEn: 'T Axis Overload',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'Turn 축 모터 과부하 (기계적 저항 과다)',
    remedy: [
      'Turn 기구부 이물질·걸림을 제거합니다.',
      '베어링 마모 및 윤활 상태를 점검합니다.',
      '드라이버 리셋 후 수동 회전 테스트를 진행합니다.',
    ],
  },
  {
    code: 'TA-003', v3Code: 66,
    name: 'T축 과전류', nameEn: 'T Axis Over Current',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'T축 모터 과전류',
    remedy: [
      '모터 케이블 및 권선 상태를 확인합니다.',
      '드라이버 에러 코드를 확인합니다.',
    ],
  },
  {
    code: 'TA-004', v3Code: 67,
    name: 'T축 과전압', nameEn: 'T Axis Over Voltage',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'T축 회생 전압 과다 또는 입력 전압 이상',
    remedy: [
      '회생 저항 연결 상태를 확인합니다.',
      '감속 시간을 늘리는 것을 검토합니다.',
    ],
  },
  {
    code: 'TA-005', v3Code: 68,
    name: 'T축 온도 이상', nameEn: 'T Axis Open Temperature',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'T축 모터 또는 드라이버 과열',
    remedy: [
      '냉각 후 재기동합니다.',
      '부하율이 정격 대비 과도한지 점검합니다.',
    ],
  },
  {
    code: 'TA-006', v3Code: 69,
    name: 'T축 모터 단선', nameEn: 'T Axis Open Motor Winding',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'T축 모터 권선 단선',
    remedy: [
      'T축 모터 케이블 및 커넥터 상태를 점검합니다.',
      '모터 권선 저항을 측정합니다.',
    ],
  },
  {
    code: 'TA-007', v3Code: 80,
    name: 'T축 원점 복귀 실패', nameEn: 'T Axis Origin Search Fail',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'Turn 축 원점 센서 미감지 또는 원점 복귀 타임아웃',
    remedy: [
      '원점 센서(홈 센서) 위치 및 감도를 점검합니다.',
      '기계적 장애물이 없는지 확인합니다.',
      '수동으로 원점 방향으로 이동하며 센서 동작을 확인합니다.',
    ],
  },
  {
    code: 'TA-008', v3Code: 81,
    name: 'T축 홈센서 항상 ON', nameEn: 'T Axis Home Sensor Always On',
    level: 'Error', category: 'T축 (Turn)',
    cause: '원점 센서가 항상 ON 상태로 고착 (센서 불량 또는 오염)',
    remedy: [
      '홈 센서 렌즈·반사판 오염 여부를 점검합니다.',
      '센서 케이블 단락 여부를 확인합니다.',
      '센서를 교체합니다.',
    ],
  },
  {
    code: 'TA-009', v3Code: 82,
    name: 'T축 홈 이동 타임아웃', nameEn: 'T Axis Move To Home Timeout',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'Turn 축이 지정 시간 내 홈 위치에 도달하지 못함',
    remedy: [
      'Turn 기구부에 걸림이 없는지 확인합니다.',
      '속도·타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'TA-010', v3Code: 83,
    name: 'T축 이동 타임아웃', nameEn: 'T Axis Move Timeout',
    level: 'Error', category: 'T축 (Turn)',
    cause: '지정 각도로 이동 중 타임아웃 발생',
    remedy: [
      '기계적 걸림 여부를 확인합니다.',
      '이동 속도와 타임아웃 설정값이 적정한지 검토합니다.',
    ],
  },
  {
    code: 'TA-011', v3Code: 87,
    name: 'T축 소프트 POT 감지', nameEn: 'T Axis Software POT Detection',
    level: 'Error', category: 'T축 (Turn)',
    cause: '소프트웨어 정방향(POT) 한계 초과',
    remedy: [
      '수동으로 반대 방향으로 이동합니다.',
      '소프트 리밋 파라미터를 확인합니다.',
    ],
  },
  {
    code: 'TA-012', v3Code: 88,
    name: 'T축 소프트 NOT 감지', nameEn: 'T Axis Software NOT Detection',
    level: 'Error', category: 'T축 (Turn)',
    cause: '소프트웨어 역방향(NOT) 한계 초과',
    remedy: [
      '수동으로 정방향으로 이동합니다.',
      '소프트 리밋 파라미터를 확인합니다.',
    ],
  },
  {
    code: 'TA-013', v3Code: 89,
    name: 'T축 지령 소프트 POT 초과', nameEn: 'T Axis Command Exceeded Soft POT',
    level: 'Error', category: 'T축 (Turn)',
    cause: '이동 지령이 소프트 POT 리밋을 초과',
    remedy: [
      '이동 지령값과 소프트 리밋 설정값을 비교합니다.',
      '티칭값 또는 파라미터를 수정합니다.',
    ],
  },
  {
    code: 'TA-014', v3Code: 90,
    name: 'T축 지령 소프트 NOT 초과', nameEn: 'T Axis Command Exceeded Soft NOT',
    level: 'Error', category: 'T축 (Turn)',
    cause: '이동 지령이 소프트 NOT 리밋을 초과',
    remedy: [
      '이동 지령값과 소프트 리밋 설정값을 비교합니다.',
      '티칭값 또는 파라미터를 수정합니다.',
    ],
  },
  {
    code: 'TA-015', v3Code: 91,
    name: 'T축 티칭값 오류', nameEn: 'T Axis Teaching Value Error',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'Turn 축 티칭 위치값이 유효 범위 밖',
    remedy: [
      'V3 파라미터에서 T축 티칭값을 재확인합니다.',
      '현장에서 실측 후 파라미터를 업데이트합니다.',
    ],
  },
  {
    code: 'TA-016', v3Code: 92,
    name: 'T축 티칭 센서 미감지', nameEn: 'T Axis Teaching Sensor Not Detected',
    level: 'Error', category: 'T축 (Turn)',
    cause: '티칭 위치에서 센서 미감지',
    remedy: [
      '티칭 위치 센서 오염 및 위치를 점검합니다.',
      '센서 감도를 재조정합니다.',
    ],
  },
  {
    code: 'TA-017', v3Code: 93,
    name: 'T축 Load 센서 미감지', nameEn: 'T Axis Load Sensor Not Detected',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'CST 로딩 후 Load 센서가 감지하지 못함',
    remedy: [
      'Load 센서 오염 및 위치를 점검합니다.',
      'CST가 올바르게 적재되었는지 확인합니다.',
    ],
  },
  {
    code: 'TA-018', v3Code: 94,
    name: 'T축 Unload 센서 미감지', nameEn: 'T Axis Unload Sensor Not Detected',
    level: 'Error', category: 'T축 (Turn)',
    cause: 'CST 언로딩 후 Unload 센서가 감지하지 못함',
    remedy: [
      'Unload 센서 오염 및 위치를 점검합니다.',
      'CST가 올바르게 배출되었는지 확인합니다.',
    ],
  },

  // ── Z축 (Up-Down / LFT) ────────────────────────────────────────────────
  {
    code: 'ZA-001', v3Code: 128,
    name: 'Z축 전원 오프', nameEn: 'Z Axis Power Off Error',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축(Up-Down) 서보 드라이버 전원 차단',
    remedy: [
      'Z축 드라이버 전원 공급 상태를 확인합니다.',
      '드라이버 MCCB/퓨즈 상태를 점검합니다.',
      '전원 재투입 후 재시도합니다.',
    ],
  },
  {
    code: 'ZA-002', v3Code: 129,
    name: 'Z축 과부하', nameEn: 'Z Axis Overload',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축 모터 과부하 (기계적 저항, 과적재)',
    remedy: [
      'Z축 기구부 이물질·걸림을 제거합니다.',
      '적재 CST 무게가 정격 이내인지 확인합니다.',
      '드라이버 리셋 후 수동 테스트를 진행합니다.',
    ],
  },
  {
    code: 'ZA-003', v3Code: 130,
    name: 'Z축 과전류', nameEn: 'Z Axis Over Current',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축 모터 과전류',
    remedy: [
      '모터 케이블 및 권선 상태를 확인합니다.',
      '드라이버 에러 코드를 확인합니다.',
    ],
  },
  {
    code: 'ZA-004', v3Code: 131,
    name: 'Z축 과전압', nameEn: 'Z Axis Over Voltage',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축 회생 전압 과다 또는 입력 전압 이상',
    remedy: [
      '회생 저항 연결 상태를 확인합니다.',
      '감속 시간을 늘리는 것을 검토합니다.',
    ],
  },
  {
    code: 'ZA-005', v3Code: 160,
    name: 'Z축 원점 복귀 실패', nameEn: 'Z Axis Origin Search Fail',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축 원점 센서 미감지 또는 원점 복귀 타임아웃',
    remedy: [
      '원점 센서 위치 및 감도를 점검합니다.',
      '기계적 장애물 여부를 확인합니다.',
      '수동으로 원점 방향으로 이동하며 센서 동작을 확인합니다.',
    ],
  },
  {
    code: 'ZA-006', v3Code: 161,
    name: 'Z축 홈센서 항상 ON', nameEn: 'Z Axis Home Sensor Always On',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '원점 센서 고착 (불량·오염)',
    remedy: [
      '센서 오염 여부를 점검하고 청소합니다.',
      '센서 케이블 단락을 확인합니다.',
      '센서를 교체합니다.',
    ],
  },
  {
    code: 'ZA-007', v3Code: 162,
    name: 'Z축 홈 이동 타임아웃', nameEn: 'Z Axis Move To Home Timeout',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축이 지정 시간 내 홈 위치에 도달하지 못함',
    remedy: [
      'Z축 기구부 걸림 여부를 확인합니다.',
      '타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'ZA-008', v3Code: 163,
    name: 'Z축 상승 타임아웃', nameEn: 'Z Axis Move To Up Timeout',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '지정 시간 내 Z축 상승 위치 도달 실패',
    remedy: [
      'Z축 기구부 걸림 여부를 확인합니다.',
      'Up 위치 센서 동작을 확인합니다.',
      '타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'ZA-009', v3Code: 164,
    name: 'Z축 하강 타임아웃', nameEn: 'Z Axis Move To Down Timeout',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '지정 시간 내 Z축 하강 위치 도달 실패',
    remedy: [
      'Z축 기구부 걸림 여부를 확인합니다.',
      'Down 위치 센서 동작을 확인합니다.',
      '타임아웃 파라미터를 검토합니다.',
    ],
  },
  {
    code: 'ZA-010', v3Code: 165,
    name: 'Z축 소프트 POT 감지', nameEn: 'Z Axis Software POT Detection',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '소프트웨어 상한 리밋 초과',
    remedy: [
      '수동으로 하강 방향으로 이동합니다.',
      '소프트 리밋 파라미터를 확인합니다.',
    ],
  },
  {
    code: 'ZA-011', v3Code: 166,
    name: 'Z축 소프트 NOT 감지', nameEn: 'Z Axis Software NOT Detection',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '소프트웨어 하한 리밋 초과',
    remedy: [
      '수동으로 상승 방향으로 이동합니다.',
      '소프트 리밋 파라미터를 확인합니다.',
    ],
  },
  {
    code: 'ZA-012', v3Code: 171,
    name: 'Z축 상승 위치 센서 미감지', nameEn: 'Z Axis Up Pos Sensor Not Detected',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축이 상승 완료 위치에 도달했으나 센서가 감지하지 못함',
    remedy: [
      '상승 위치 센서 오염 및 위치를 점검합니다.',
      '센서 감도를 재조정합니다.',
    ],
  },
  {
    code: 'ZA-013', v3Code: 172,
    name: 'Z축 하강 위치 센서 미감지', nameEn: 'Z Axis Down Pos Sensor Not Detected',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: 'Z축이 하강 완료 위치에 도달했으나 센서가 감지하지 못함',
    remedy: [
      '하강 위치 센서 오염 및 위치를 점검합니다.',
      '센서 감도를 재조정합니다.',
    ],
  },
  {
    code: 'ZA-014', v3Code: 174,
    name: 'Z축 하드 POT 감지', nameEn: 'Z Axis Hardware POT Detection',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '하드웨어 상한 리밋 스위치 동작',
    remedy: [
      '즉시 하강 방향으로 수동 이동합니다.',
      '하드 리밋 스위치 동작 원인을 조사합니다.',
      '소프트 리밋 파라미터가 올바르게 설정되어 있는지 확인합니다.',
    ],
  },
  {
    code: 'ZA-015', v3Code: 175,
    name: 'Z축 하드 NOT 감지', nameEn: 'Z Axis Hardware NOT Detection',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '하드웨어 하한 리밋 스위치 동작',
    remedy: [
      '즉시 상승 방향으로 수동 이동합니다.',
      '하드 리밋 스위치 동작 원인을 조사합니다.',
    ],
  },
  {
    code: 'ZA-016', v3Code: 176,
    name: '라이트 커튼 감지', nameEn: 'Light Curtain Detect Error',
    level: 'Error', category: 'Z축 (UpDown)',
    cause: '라이트 커튼(안전 광막) 차단 감지',
    remedy: [
      '라이트 커튼 구역 내 이물질·작업자 여부를 확인합니다.',
      '구역 확보 후 Safety Reset을 실행합니다.',
      '라이트 커튼 수광부·투광부 정렬을 확인합니다.',
    ],
  },

  // ── RFID / 포트 인터페이스 ─────────────────────────────────────────────
  {
    code: 'RF-001', v3Code: 192,
    name: 'RFID 체크섬 오류', nameEn: 'Reading CheckSum Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'RFID 태그 읽기 데이터 체크섬 불일치',
    remedy: [
      'RFID 안테나와 태그 간 거리·정렬을 확인합니다.',
      '태그 오염 또는 손상 여부를 점검합니다.',
      'RFID 리더기 파라미터(감도, 반복 횟수)를 조정합니다.',
    ],
  },
  {
    code: 'RF-002', v3Code: 193,
    name: 'RFID 읽기 실패', nameEn: 'Reading Fail Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'RFID 태그 읽기 반복 실패',
    remedy: [
      '안테나 위치와 태그 정렬을 점검합니다.',
      '태그 불량 여부를 확인합니다.',
      '리더기 전원 및 통신 케이블을 점검합니다.',
    ],
  },
  {
    code: 'RF-003', v3Code: 194,
    name: '태그 미인식', nameEn: 'Reading Tag Not Recognized',
    level: 'Error', category: 'RFID/포트',
    cause: '태그가 인식 범위 내에 없거나 태그 형식 불일치',
    remedy: [
      '올바른 규격의 태그가 CST에 부착되어 있는지 확인합니다.',
      '안테나 감지 범위 내에 태그가 들어오는지 점검합니다.',
    ],
  },
  {
    code: 'RF-004', v3Code: 195,
    name: '태그 타입 오류', nameEn: 'Reading Tag Type Error',
    level: 'Error', category: 'RFID/포트',
    cause: '태그 타입이 시스템 설정과 다름',
    remedy: [
      'RFID 리더기와 태그의 주파수·규격이 일치하는지 확인합니다.',
      '올바른 규격의 태그로 교체합니다.',
    ],
  },
  {
    code: 'RF-005', v3Code: 196,
    name: 'RFID 태그 데이터 체크섬 오류', nameEn: 'Reading Tag Data CheckSum Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'RFID 태그 내 데이터 체크섬 불일치',
    remedy: [
      '태그 데이터 포맷이 시스템과 일치하는지 확인합니다.',
      '태그를 교체합니다.',
    ],
  },
  {
    code: 'RF-006', v3Code: 197,
    name: 'RFID 통신 오류', nameEn: 'RFID Communication Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'RFID 리더기와 V3 간 통신 두절',
    remedy: [
      'RFID 리더기 전원 및 통신 케이블을 점검합니다.',
      '통신 파라미터(Baud Rate, IP 등)를 확인합니다.',
      '리더기를 재기동합니다.',
    ],
  },
  {
    code: 'RF-007', v3Code: 200,
    name: 'PIO1 Valid 대기 타임아웃', nameEn: 'PIO1 Valid Wait Timeout Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'OHT/AGV 인터페이스 Valid 신호 수신 타임아웃',
    remedy: [
      'OHT/AGV 제어 시스템과의 인터페이스 상태를 확인합니다.',
      'PIO 케이블 연결 및 신호 레벨을 점검합니다.',
    ],
  },
  {
    code: 'RF-008', v3Code: 201,
    name: 'PIO1 TR_REQ 대기 타임아웃', nameEn: 'PIO1 TR_REQ Wait Timeout Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'OHT TR_REQ 신호 수신 타임아웃',
    remedy: [
      'OHT PIO 인터페이스 상태를 확인합니다.',
      'TR_REQ 신호선 연결을 점검합니다.',
    ],
  },
  {
    code: 'RF-009', v3Code: 202,
    name: 'PIO1 Busy 대기 타임아웃', nameEn: 'PIO1 Busy Wait Timeout Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'OHT Busy 신호 수신 타임아웃',
    remedy: [
      'OHT PIO Busy 신호선 연결을 점검합니다.',
      '상위 시스템 PIO 로직을 확인합니다.',
    ],
  },
  {
    code: 'RF-010', v3Code: 210,
    name: 'CST 역방향 감지', nameEn: 'CST Reverse Detect',
    level: 'Error', category: 'RFID/포트',
    cause: 'CST가 역방향으로 진입 감지',
    remedy: [
      'CST 방향을 확인하고 올바른 방향으로 재투입합니다.',
      '투입 방향 인터락 로직을 확인합니다.',
    ],
  },
  {
    code: 'RF-011', v3Code: 211,
    name: 'Shuttle CST 배치 센서 이상', nameEn: 'Shuttle CST Placement Sensor Abnormal',
    level: 'Error', category: 'RFID/포트',
    cause: 'Shuttle 상의 CST 배치 감지 센서 이상',
    remedy: [
      'Shuttle 위 CST 배치 상태를 확인합니다.',
      '배치 감지 센서 오염 및 위치를 점검합니다.',
    ],
  },
  {
    code: 'RF-012', v3Code: 212,
    name: 'Shuttle CST ID 없음', nameEn: 'Shuttle No CST ID Error',
    level: 'Error', category: 'RFID/포트',
    cause: 'Shuttle에 CST가 있지만 ID를 읽지 못함',
    remedy: [
      'RFID 태그가 CST에 올바르게 부착되어 있는지 확인합니다.',
      'RFID 리더기 상태를 점검합니다.',
    ],
  },

  // ── Safety (Master 알람 / 안전 회로) ─────────────────────────────────
  {
    code: 'S-001',
    name: 'EMO (비상정지)', nameEn: 'Emergency Stop',
    level: 'Error', category: 'Safety',
    cause: '비상정지 버튼(EMO) 동작 또는 안전 회로 차단',
    remedy: [
      '현장에서 EMO 버튼 동작 원인을 확인·제거합니다.',
      '작업자 및 장비 안전을 확인한 후 EMO 버튼을 복귀(당김/회전)합니다.',
      'V3 제어판에서 Safety Reset을 실행합니다.',
      'Safety OK 상태를 확인한 후 Auto 운전을 재개합니다.',
    ],
  },
  {
    code: 'S-002',
    name: 'EMS (안전 회로)', nameEn: 'Emergency Safety Circuit',
    level: 'Error', category: 'Safety',
    cause: 'EMS-1 또는 EMS-2 안전 회로 차단 (도어 오픈, 안전 柵 진입 등)',
    remedy: [
      '안전 회로 차단 원인을 제거합니다.',
      '도어/게이트를 완전히 닫아 안전 락을 복귀시킵니다.',
      'Safety Reset 신호를 인가합니다.',
    ],
  },
  {
    code: 'S-003',
    name: 'Main Power OFF', nameEn: 'Main Power Off',
    level: 'Error', category: 'Safety',
    cause: '주전원 차단기 동작 또는 입력 전원 이상',
    remedy: [
      '전기 패널 내 주차단기(MCCB) 상태를 확인합니다.',
      '과전류·지락 원인을 제거한 후 차단기를 재투입합니다.',
      'EtherCAT 및 V3 재연결 후 Auto 조건을 확인합니다.',
    ],
  },

  // ── 통신 ─────────────────────────────────────────────────────────────
  {
    code: 'C-001',
    name: 'EtherCAT 통신 두절', nameEn: 'EtherCAT Communication Error',
    level: 'Error', category: '통신',
    cause: 'EtherCAT 링 단선 또는 슬레이브 장치 전원 불량',
    remedy: [
      'EtherCAT 케이블 연결 상태 및 커넥터를 점검합니다.',
      '슬레이브(인버터, I/O 모듈 등) 전원·LED 상태를 확인합니다.',
      'EtherCAT 마스터(V3 PC) 재시작 후 전체 슬레이브 인식 여부를 확인합니다.',
    ],
  },
  {
    code: 'C-002',
    name: 'V3 서버 연결 끊김', nameEn: 'V3 Server Disconnected',
    level: 'Warning', category: '통신',
    cause: 'V3 WebSocket 서버와의 TCP 연결이 비정상 종료됨',
    remedy: [
      '네트워크 스위치 및 LAN 케이블 연결을 확인합니다.',
      'V3 PC 상의 서버 프로그램이 실행 중인지 확인합니다.',
      'Web 대시보드 → V3 URL 설정에서 접속 주소를 재확인합니다.',
    ],
  },
  {
    code: 'C-003',
    name: 'WebSocket Heartbeat 타임아웃', nameEn: 'WebSocket Heartbeat Timeout',
    level: 'Warning', category: '통신',
    cause: '네트워크 지연으로 Heartbeat 수신 중단',
    remedy: [
      '네트워크 부하 및 방화벽 설정을 점검합니다.',
      'V3 PC 시스템 리소스(CPU/메모리)가 과부하 상태인지 확인합니다.',
      '재접속 시도: 웹 페이지 새로고침 또는 재연결 버튼 클릭.',
    ],
  },
]

const LEVEL_STYLE: Record<AlarmLevel, { badge: string; dot: string }> = {
  Error:   { badge: 'bg-red-900/50 text-red-300 border border-red-700/60',       dot: 'bg-red-500' },
  Warning: { badge: 'bg-amber-900/40 text-amber-300 border border-amber-700/60', dot: 'bg-amber-400' },
  Info:    { badge: 'bg-slate-700/60 text-slate-300 border border-slate-600',     dot: 'bg-slate-400' },
}

const CATEGORIES = ['전체', 'Safety', '통신', '초기화', 'R축', 'CST/자재', 'T축 (Turn)', 'Z축 (UpDown)', 'RFID/포트']

function findAlarmRefByV3Code(code: string): AlarmReference | undefined {
  return ALARM_DB.find((alarm) => alarm.v3Code !== undefined && String(alarm.v3Code) === code)
}

interface V3AlarmReferencePanelProps {
  /** true: 발생 알람만 고정 표시 (검색·카테고리·토글 숨김) */
  activeOnlyMode?: boolean
  /** page: 전용 화면용 높이·레이아웃 */
  variant?: 'default' | 'page'
  className?: string
}

export function V3AlarmReferencePanel({
  activeOnlyMode = false,
  variant = 'default',
  className = '',
}: V3AlarmReferencePanelProps) {
  const liveAlarms  = useSemiCnvStore((s) => s.liveAlarms)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const unitAlarms  = useSemiCnvStore((s) => s.unitAlarms)
  const lines       = useConveyorStore((s) => s.lines)

  const [search, setSearch]             = useState('')
  const [category, setCategory]         = useState('전체')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [activeOnly, setActiveOnly]     = useState(false)

  const showActiveOnly = activeOnlyMode || activeOnly
  /** 알람 리스트 전용 화면: 라인·유닛별 건별 표시 / CV 현황 등: 코드 기준 중복 제거 */
  const listByOccurrence = activeOnlyMode && variant === 'page'

  const activeOccurrences = useMemo(
    () => buildActiveV3AlarmOccurrences(lines, unitRuntime, unitAlarms, liveAlarms),
    [lines, unitRuntime, unitAlarms, liveAlarms],
  )

  const occurrencesByCode = useMemo(
    () => groupOccurrencesByAlarmCode(activeOccurrences),
    [activeOccurrences],
  )

  const activeV3Codes = useMemo(() => {
    return new Set(activeOccurrences.map((occurrence) => occurrence.alarmCode))
  }, [activeOccurrences])

  const unmappedOccurrences = useMemo(
    () => activeOccurrences.filter((occurrence) => !findAlarmRefByV3Code(occurrence.alarmCode)),
    [activeOccurrences],
  )

  const unmappedCodes = useMemo(
    () => [...new Set(unmappedOccurrences.map((occurrence) => occurrence.alarmCode))],
    [unmappedOccurrences],
  )

  const activeCount = useMemo(
    () => ALARM_DB.filter((a) => a.v3Code !== undefined && activeV3Codes.has(String(a.v3Code))).length,
    [activeV3Codes],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ALARM_DB.filter((alarm) => {
      if (!activeOnlyMode && category !== '전체' && alarm.category !== category) return false
      if (showActiveOnly) {
        if (alarm.v3Code === undefined) return false
        if (!activeV3Codes.has(String(alarm.v3Code))) return false
      }
      if (!activeOnlyMode && q) {
        return (
          alarm.code.toLowerCase().includes(q) ||
          alarm.name.toLowerCase().includes(q) ||
          alarm.nameEn.toLowerCase().includes(q) ||
          alarm.cause.toLowerCase().includes(q) ||
          (alarm.v3Code !== undefined && String(alarm.v3Code).includes(q))
        )
      }
      return true
    })
  }, [search, category, showActiveOnly, activeOnlyMode, activeV3Codes])

  return (
    <div
      className={`flex flex-col rounded-lg border border-slate-700 bg-slate-900/80 ${
        variant === 'page' ? 'h-full min-h-0' : ''
      } ${
        activeOnlyMode && variant === 'default' ? 'max-h-[420px]' : ''
      } ${
        activeOnlyMode && variant === 'page' ? 'max-h-[min(420px,calc(100vh-11rem))] lg:max-h-[calc(100vh-11rem)]' : ''
      } ${className}`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-slate-300">
            {activeOnlyMode ? 'V3 발생 알람' : '알람 리스트'}
          </h3>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {activeOnlyMode
              ? listByOccurrence
                ? '라인·유닛별 현재 발생 알람을 표시합니다.'
                : '현재 발생 중인 알람만 표시합니다. (동일 코드는 1건)'
              : '알람 코드·이름(한/영)·원인 검색 가능'}
          </p>
        </div>
        {!activeOnlyMode ? (
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              activeOnly
                ? 'border-red-600 bg-red-900/40 text-red-300'
                : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${activeOnly ? 'bg-red-400' : 'bg-slate-600'}`} />
            발생 알람만
            {activeCount > 0 && (
              <span className={`rounded-full px-1 text-[9px] font-bold ${activeOnly ? 'bg-red-700 text-red-200' : 'bg-slate-700 text-slate-400'}`}>
                {activeCount}
              </span>
            )}
          </button>
        ) : (activeCount > 0 || unmappedCodes.length > 0) ? (
          <span className="rounded-full border border-red-600 bg-red-900/40 px-3 py-1 text-[11px] font-semibold text-red-300">
            {listByOccurrence ? activeOccurrences.length : activeV3Codes.size}건
          </span>
        ) : null}
      </div>

      {/* 검색 */}
      {!activeOnlyMode ? (
        <div className="border-b border-slate-700/60 px-4 py-2.5">
          <input
            type="text"
            placeholder="V3 코드(예: 32)·이름·영문명·원인 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
          />
        </div>
      ) : null}

      {/* 카테고리 필터 */}
      {!activeOnlyMode ? (
        <div className="flex flex-wrap gap-1 border-b border-slate-700/60 px-4 py-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                category === cat
                  ? 'bg-slate-600 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      {/* 알람 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showActiveOnly && !listByOccurrence && unmappedCodes.length > 0 && (
          <div className="border-b border-slate-800/60 bg-red-950/20 px-4 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold text-red-400">리스트 미등록 발생 알람</p>
            <div className="flex flex-wrap gap-1.5">
              {unmappedCodes.map((code) => (
                <span key={code} className="rounded bg-red-900/50 px-2 py-0.5 font-mono text-[11px] text-red-300">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

        {showActiveOnly && listByOccurrence && unmappedOccurrences.length > 0 && (
          <div className="border-b border-slate-800/60 bg-red-950/20 px-4 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold text-red-400">리스트 미등록 발생 알람</p>
            <ul className="space-y-1.5">
              {unmappedOccurrences.map((occurrence) => (
                <li
                  key={occurrence.id}
                  className="rounded border border-red-900/40 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-200"
                >
                  <span className="font-medium text-cyan-300">{occurrence.lineName}</span>
                  <span className="text-slate-500"> · </span>
                  <span>{occurrence.unitName}</span>
                  <span className="ml-1.5 font-mono text-red-300">V3:{occurrence.alarmCode}</span>
                  {occurrence.alarmText ? (
                    <p className="mt-0.5 truncate text-[10px] text-red-300/80">{occurrence.alarmText}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {listByOccurrence ? (
          activeOccurrences.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">현재 발생 중인 알람이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {activeOccurrences.map((occurrence) => {
                const ref = findAlarmRefByV3Code(occurrence.alarmCode)
                const style = ref ? LEVEL_STYLE[ref.level] : LEVEL_STYLE.Error
                const isOpen = expandedCode === occurrence.id

                return (
                  <li key={occurrence.id} className="bg-red-950/10">
                    <button
                      type="button"
                      onClick={() => setExpandedCode(isOpen ? null : occurrence.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
                    >
                      <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${style.dot} animate-pulse`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                            {occurrence.lineName}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {occurrence.unitName}
                          </span>
                          <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400">
                            V3:{occurrence.alarmCode}
                          </span>
                          {ref ? (
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}>
                              {ref.level}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-200">
                          {ref?.name ?? occurrence.alarmText ?? `알람 ${occurrence.alarmCode}`}
                        </p>
                        {ref?.nameEn ? (
                          <p className="mt-0.5 text-[10px] italic text-slate-600">{ref.nameEn}</p>
                        ) : null}
                        {occurrence.alarmText && ref?.name ? (
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{occurrence.alarmText}</p>
                        ) : null}
                      </div>
                      <span className="mt-0.5 flex-shrink-0 text-xs text-slate-600">
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>

                    {isOpen && ref ? (
                      <div className="border-t border-slate-800/60 bg-slate-800/20 px-4 py-3">
                        <p className="mb-1.5 text-[10px] font-semibold text-slate-400">원인</p>
                        <p className="mb-3 text-xs text-slate-300">{ref.cause}</p>
                        <p className="mb-1.5 text-[10px] font-semibold text-slate-400">조치 방법</p>
                        <ol className="space-y-1.5">
                          {ref.remedy.map((step, i) => (
                            <li key={i} className="flex gap-2 text-xs">
                              <span className="flex-shrink-0 font-bold text-slate-500">{i + 1}.</span>
                              <span className="text-slate-300">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            {showActiveOnly ? '현재 발생 중인 알람이 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {filtered.map((alarm) => {
              const style    = LEVEL_STYLE[alarm.level]
              const isOpen   = expandedCode === alarm.code
              const isActive = alarm.v3Code !== undefined && activeV3Codes.has(String(alarm.v3Code))
              const activeLocations =
                alarm.v3Code !== undefined
                  ? occurrencesByCode.get(String(alarm.v3Code)) ?? []
                  : []

              return (
                <li key={alarm.code} className={isActive ? 'bg-red-950/10' : undefined}>
                  <button
                    type="button"
                    onClick={() => setExpandedCode(isOpen ? null : alarm.code)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
                  >
                    <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${style.dot} ${isActive ? 'animate-pulse' : ''}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-500">{alarm.code}</span>
                        {alarm.v3Code !== undefined && (
                          <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400">
                            V3:{alarm.v3Code}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-200">{alarm.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}>
                          {alarm.level}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                          {alarm.category}
                        </span>
                        {isActive && (
                          <span className="rounded bg-red-800/60 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                            발생 중
                          </span>
                        )}
                      </div>
                      {isActive && activeLocations.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {activeLocations.map((occurrence) => (
                            <span
                              key={occurrence.id}
                              className="rounded bg-cyan-950/50 px-1.5 py-0.5 text-[10px] text-cyan-300"
                            >
                              {formatOccurrenceLocation(occurrence)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-0.5 text-[10px] italic text-slate-600">{alarm.nameEn}</p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                        원인: {alarm.cause}
                      </p>
                    </div>

                    <span className="mt-0.5 flex-shrink-0 text-xs text-slate-600">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-800/60 bg-slate-800/20 px-4 py-3">
                      <p className="mb-1.5 text-[10px] font-semibold text-slate-400">원인</p>
                      <p className="mb-3 text-xs text-slate-300">{alarm.cause}</p>
                      <p className="mb-1.5 text-[10px] font-semibold text-slate-400">조치 방법</p>
                      <ol className="space-y-1.5">
                        {alarm.remedy.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs">
                            <span className="flex-shrink-0 font-bold text-slate-500">{i + 1}.</span>
                            <span className="text-slate-300">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 푸터 */}
      <div className="flex items-center justify-between border-t border-slate-700/60 px-4 py-2">
        {activeOccurrences.length > 0 ? (
          <span className="text-[10px] text-red-400">
            V3 발생 알람 {listByOccurrence ? activeOccurrences.length : activeV3Codes.size}건
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">발생 알람 없음</span>
        )}
        <span className="text-[10px] text-slate-600">
          {activeOnlyMode ? `${filtered.length}건` : `${filtered.length} / ${ALARM_DB.length}건`}
        </span>
      </div>
    </div>
  )
}
