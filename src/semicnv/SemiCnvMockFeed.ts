import type { SemiCnvLineStatusItem, SemiCnvMessage } from '../types/semicnv'

const SITE_ID = 'SITE_DEV_FAB1'

function nowIso(): string {
  return new Date().toISOString()
}

function buildSiteConnect(): SemiCnvMessage {
  return {
    type: 'SITE_CONNECT',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: {
      siteName: '개발 Mock 현장',
      programVersion: 'Semi_Conv_V3.2.1-mock',
      lineCount: 2,
      conveyorCount: 4,
    },
  }
}

function buildLineStatus(running: number, tick: number): SemiCnvMessage {
  const lineItems: SemiCnvLineStatusItem[] = [
    {
      lineId: 1,
      lineName: '1라인',
      safetyStatus: 'OK',
      keyStatus: 'Auto',
      autoCondition: 'Possible',
      operationStatus: 'Auto',
      controlMode: 'MasterMode',
      totalConveyors: 4,
      runningConveyors: running,
      alarmConveyors: 0,
    },
  ]

  if (tick % 2 === 0) {
    lineItems.push({
      lineId: 2,
      lineName: '2라인',
      safetyStatus: 'OK',
      keyStatus: 'Auto',
      autoCondition: 'Possible',
      operationStatus: 'Auto',
      controlMode: 'MasterMode',
      totalConveyors: 2,
      runningConveyors: 1,
      alarmConveyors: 0,
    })
  }

  return {
    type: 'LINE_STATUS',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: lineItems,
  }
}

function buildConveyorStatus(tick: number): SemiCnvMessage {
  const busy = tick % 4
  return {
    type: 'CONVEYOR_STATUS',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: [
      {
        id: 1,
        lineId: 1,
        name: 'CV-01',
        conveyorType: 'Normal',
        controlMode: 'MasterMode',
        runStatus: busy === 0 ? 'Run' : 'Stop',
        operationStatus: 'Auto',
        autoStatus: busy === 0 ? 'Busy' : 'Idle',
        autoStep: 110 + (tick % 90),
        power: 'On',
        alarm: false,
        cstId: busy === 0 ? 'FOUP00231' : null,
        destination: busy === 0 ? 45 : 0,
        sensors: [
          { name: 'IN Photo', status: busy === 0 },
          { name: 'OUT Photo', status: busy === 1 },
          { name: 'Stopper Up', status: busy !== 0 },
        ],
      },
      {
        id: 2,
        lineId: 1,
        name: 'CV-02',
        conveyorType: 'Turn',
        controlMode: 'MasterMode',
        runStatus: busy === 1 ? 'Run' : 'Stop',
        operationStatus: 'Auto',
        autoStatus: busy === 1 ? 'Load' : 'Idle',
        autoStep: 320,
        power: 'On',
        alarm: false,
        cstId: null,
        destination: 0,
        currentDegree: 'Degree90_Pos',
        sensors: [
          { name: 'IN Photo', status: busy === 1 },
          { name: 'OUT Photo', status: false },
          { name: 'Rotate Home', status: true },
          { name: 'POT', status: false },
          { name: 'NOT', status: false },
        ],
      },
      {
        id: 3,
        lineId: 1,
        name: 'CV-03',
        conveyorType: 'Normal',
        controlMode: 'MasterMode',
        runStatus: 'Stop',
        operationStatus: 'Manual',
        autoStatus: 'Idle',
        autoStep: 0,
        power: 'On',
        alarm: false,
        cstId: null,
        destination: 0,
        sensors: [
          { name: 'IN Photo', status: false },
          { name: 'OUT Photo', status: false },
          { name: 'Stopper Up', status: true },
        ],
      },
      {
        id: 4,
        lineId: 1,
        name: 'CV-04',
        conveyorType: 'Up_Down',
        controlMode: 'MasterMode',
        runStatus: 'Stop',
        operationStatus: 'Auto',
        autoStatus: 'Idle',
        autoStep: 0,
        power: 'On',
        alarm: busy === 3,
        cstId: null,
        destination: 0,
        sensors: [
          { name: 'IN Photo', status: false },
          { name: 'OUT Photo', status: false },
          { name: 'Lift Up', status: busy === 2 },
          { name: 'Lift Down', status: busy !== 2 },
        ],
      },
    ],
  }
}

function buildHeartbeat(): SemiCnvMessage {
  return {
    type: 'HEARTBEAT',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: { status: 'ALIVE' },
  }
}

export class SemiCnvMockFeed {
  private timer: ReturnType<typeof setInterval> | null = null
  private tick = 0
  private onMessage: (message: SemiCnvMessage) => void

  constructor(onMessage: (message: SemiCnvMessage) => void) {
    this.onMessage = onMessage
  }

  start(): void {
    this.stop()
    this.tick = 0
    this.onMessage(buildSiteConnect())
    this.onMessage(buildLineStatus(1, 0))
    this.onMessage(buildConveyorStatus(this.tick))

    this.timer = setInterval(() => {
      this.tick += 1
      this.onMessage(buildConveyorStatus(this.tick))
      if (this.tick % 3 === 0) {
        this.onMessage(buildLineStatus((this.tick % 4) + 1, this.tick))
      }
      if (this.tick % 5 === 0) {
        this.onMessage(buildHeartbeat())
      }
    }, 2000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
