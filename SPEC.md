# 컨베이어 이력 관리 웹 - 기획 및 스펙 문서

## 1. 개요

### 1.1 목적
자동화 장비(컨베이어) 라인의 구성 및 가동/점검 이력을 웹에서 시각적으로 관리한다.

### 1.2 단계별 전략
- **1단계 (현재)**: 서버/DB 없이 브라우저 저장소(localStorage, Cookie)로 데이터 관리
- **2단계 (추후)**: 동일한 데이터 구조를 그대로 서버 API로 이전 (Repository 패턴으로 저장소 추상화하여 마이그레이션 비용 최소화)

### 1.3 핵심 화면
| 화면 | 설명 |
|---|---|
| 메인(모니터링) 화면 | 전체 컨베이어 라인을 시각화, 확대/축소(Zoom & Pan) 지원 |
| 라인 빌더(편집) 화면 | 바둑판형 그리드에서 드래그로 컨베이어 배치 (최대 128개) |
| 이력 화면 | 컨베이어별 가동/점검/알람 이력 조회 |

---

## 2. 기술 스택 제안

- **프레임워크**: React + Vite (또는 Next.js - SSR 불필요하므로 Vite 권장) + TypeScript
- **상태관리**: Zustand 또는 React Context (전역 라인/이력 상태)
- **시각화**: 
  - 메인 화면 Zoom/Pan: `react-zoom-pan-pinch` 또는 `react-konva`(Canvas 기반, 다수 노드 렌더링 성능 유리)
  - 그리드 빌더: CSS Grid + `dnd-kit`(드래그 앤 드롭)
- **저장소 추상화**: `StorageAdapter` 인터페이스 (LocalStorageAdapter ↔ 추후 ApiAdapter로 교체)
- **스타일**: Tailwind CSS

---

## 3. 데이터 모델

### 3.1 ConveyorUnit (컨베이어 단위)
```ts
interface ConveyorUnit {
  id: string;              // uuid
  name: string;             // 사용자 지정 이름 (예: "CV-01")
  gridX: number;             // 빌더 그리드 내 x좌표 (0~15)
  gridY: number;             // 빌더 그리드 내 y좌표 (0~7, 16x8=128칸)
  type: 'straight' | 'curve' | 'junction' | 'lift'; // 컨베이어 형태
  rotation: 0 | 90 | 180 | 270;
  connections: string[];     // 연결된 인접 ConveyorUnit id 목록
  status: 'idle' | 'running' | 'error' | 'maintenance';
  createdAt: string;         // ISO date
  updatedAt: string;
}
```

### 3.2 ConveyorLine (라인 = 빌더에서 만든 하나의 배치 세트)
```ts
interface ConveyorLine {
  id: string;
  name: string;             // 라인 이름
  gridSize: { cols: number; rows: number }; // 기본 16x8 = 128
  units: ConveyorUnit[];
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 HistoryRecord (이력)
```ts
interface HistoryRecord {
  id: string;
  unitId: string;            // 어느 컨베이어의 이력인지
  lineId: string;
  eventType: 'start' | 'stop' | 'error' | 'maintenance' | 'statusChange';
  message: string;
  prevStatus?: string;
  nextStatus?: string;
  timestamp: string;         // ISO date
  operator?: string;         // 작업자 (선택)
}
```

### 3.4 저장 키 (localStorage)
- `conveyor.lines` → `ConveyorLine[]`
- `conveyor.history` → `HistoryRecord[]` (용량 고려, 최근 N건 또는 기간별 정리 정책 필요)
- `conveyor.settings` (Cookie 또는 localStorage) → 최근 본 라인 id, 줌 레벨 등 UI 환경설정

---

## 4. 저장소 추상화 (서버 이전 대비)

```ts
interface StorageAdapter {
  getLines(): Promise<ConveyorLine[]>;
  saveLine(line: ConveyorLine): Promise<void>;
  deleteLine(id: string): Promise<void>;
  getHistory(filter?: HistoryFilter): Promise<HistoryRecord[]>;
  addHistory(record: HistoryRecord): Promise<void>;
}
```
- 1단계: `LocalStorageAdapter` 구현 (localStorage + 필요시 Cookie는 경량 설정값만)
- 2단계: `ApiStorageAdapter` 구현 후 의존성만 교체 (UI/상태관리 로직 변경 없음)
- 모든 컴포넌트는 Adapter 인터페이스만 참조하고, 구체 구현(localStorage vs API)을 알지 못하도록 설계

---

## 5. 화면별 상세 스펙

### 5.1 메인(모니터링) 화면
**목적**: 전체 컨베이어 라인 현황을 한눈에 파악

- 캔버스에 `ConveyorLine`의 `units`를 좌표(gridX, gridY) 기준으로 렌더링, 컨베이어 간 `connections`를 라인으로 연결 표시
- **확대/축소(Zoom)**: 마우스 휠 / 핀치 줌, 버튼(+/-), 리셋(전체보기) 버튼
- **이동(Pan)**: 드래그로 화면 이동
- **상태 색상 표시**: running(녹색) / idle(회색) / error(빨강) / maintenance(주황)
- 유닛 클릭 → 상세 패널(사이드 패널)에서 해당 컨베이어 이력 요약 + "이력 전체보기" 링크
- 라인이 여러 개일 경우 상단에서 라인 선택(드롭다운)
- 실시간성은 1단계에서 폴링/이벤트 없음 (정적 상태) → 2단계 서버 연동 시 WebSocket/polling으로 실시간 갱신 확장 고려

### 5.2 라인 빌더(편집) 화면
**목적**: 바둑판 그리드 위에서 컨베이어를 배치해 라인을 구성

- 그리드: 기본 16열 x 8행 = 128칸 (칸 수/비율은 설정 가능하도록 상수화)
- 각 칸은 비어있거나 하나의 `ConveyorUnit`을 가짐 (1칸 = 1컨베이어, 최대 128개)
- **드래그 동작**:
  - 좌측 팔레트에서 컨베이어 타입(직선/커브/분기/리프트)을 그리드 칸으로 드래그하여 배치
  - 배치된 유닛을 다른 칸으로 드래그하여 이동
  - 회전 버튼/키(R)로 방향 회전
  - 인접 칸 자동 연결 제안 또는 클릭으로 connections 수동 연결
- 빈 칸 드래그 오버 시 하이라이트, 이미 점유된 칸은 드롭 불가 표시
- 유닛 선택 시 속성 패널: 이름, 타입, 상태 초기값 편집
- 저장 버튼 → StorageAdapter.saveLine 호출 (자동저장 옵션도 고려 가능)
- 삭제: 유닛 우클릭/삭제버튼 → 그리드에서 제거 + connections 정리

### 5.3 이력 화면
**목적**: 컨베이어별/라인별 이력 조회 및 필터링

- 필터: 라인, 컨베이어 유닛, 기간, 이벤트 타입
- 테이블 또는 타임라인 뷰
- 페이지네이션 (localStorage 데이터 많을 경우 클라이언트 페이징)
- CSV 내보내기 (선택 기능, 서버 없이도 가능)

---

## 6. 비기능 요구사항

- **데이터 용량**: localStorage 한계(브라우저별 약 5~10MB) 고려, 이력 데이터는 최대 보관 건수/기간 정책 필요 (예: 최근 1000건 또는 30일치만 유지, 초과 시 오래된 데이터 정리)
- **데이터 이전성**: 2단계 서버 전환 시 localStorage 데이터를 JSON으로 export → 서버 import 가능하도록 export/import 기능 1단계에 포함 권장
- **반응형**: 메인/빌더 화면은 데스크톱 우선 (그리드 128칸 특성상 큰 화면 최적화), 모바일은 조회 전용으로 제한 가능
- **성능**: 128개 유닛 렌더링 시 Canvas 기반(react-konva) 또는 가상화 고려, DOM 기반이라도 128개 수준은 충분히 처리 가능

---

## 7. 향후 서버 연동 시 고려사항 (현재는 구현하지 않음, 설계만 대비)

- REST API 또는 GraphQL 엔드포인트로 `StorageAdapter` 구현체 교체
- 인증/권한 (작업자별 이력 기록자 식별)
- 실시간 상태 갱신 (WebSocket, MQTT 등 - 실제 PLC/센서 연동 시)
- DB 스키마는 위 데이터 모델(ConveyorLine, ConveyorUnit, HistoryRecord)을 그대로 테이블화 가능하도록 설계됨

---

## 8. 개발 단계 제안 (Milestone)

1. 프로젝트 셋업 (Vite + React + TS + Tailwind), StorageAdapter(LocalStorage) 구현
2. 라인 빌더 화면: 그리드 + 드래그 배치 (CRUD)
3. 메인 화면: 라인 시각화 + Zoom/Pan
4. 이력 기록: 상태 변경 시 HistoryRecord 자동 생성 + 이력 화면 구현
5. Export/Import (JSON) 기능
6. (추후) 서버 Adapter 교체
