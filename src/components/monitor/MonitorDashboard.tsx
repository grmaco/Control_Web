import { useMemo } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import {
  computeLineStats,
  isAutoEnabled,
  isSafetyOk,
  resolveCurrentStatus,
} from '../../utils/monitorStats'
import { AlarmHistoryPanel } from './AlarmHistoryPanel'
import { BufferStoragePanel } from './BufferStoragePanel'
import { LineMinimapPanel } from './LineMinimapPanel'
import { LineStatusTable } from './LineStatusTable'
import { MonitorControlBar } from './MonitorControlBar'
import { MonitorStatusPanels } from './MonitorStatusPanels'
import { IOStatusPanels } from './IOStatusPanel'

interface MonitorDashboardProps {
  line: ConveyorLine
  lines: ConveyorLine[]
  selectedLineId: string | null
  /** true: 중간 3패널을 Safety/Auto/Program I/O 패널로 교체 */
  showIOPanels?: boolean
}

export function MonitorDashboard({
  line,
  lines,
  selectedLineId,
  showIOPanels = false,
}: MonitorDashboardProps) {
  const etherCatConnected = useMonitorStore((s) => s.etherCatConnected)
  const toggleEtherCat = useMonitorStore((s) => s.toggleEtherCat)
  const toggleAllPower = useMonitorStore((s) => s.toggleAllPower)
  const setAllAutoRun = useMonitorStore((s) => s.setAllAutoRun)
  const getLineControl = useMonitorStore((s) => s.getLineControl)
  const lineControls = useMonitorStore((s) => s.lineControls)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const lineRuntime = useSemiCnvStore((s) => s.lineRuntime)
  const ioStatus = useSemiCnvStore((s) => s.ioStatus)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const control = getLineControl(line.id)
  const lrt = lineRuntime[line.id]
  const stats = useMemo(
    () => computeLineStats(line, unitRuntime, lrt),
    [line, unitRuntime, lrt],
  )
  const safetyOk = isSafetyOk(etherCatConnected, stats)
  const autoEnabled = isAutoEnabled(safetyOk, control.powerOn, stats)
  const currentStatus = resolveCurrentStatus(stats, control.autoRun, control.powerOn)

  const statsByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => [item.id, computeLineStats(item, unitRuntime, lineRuntime[item.id])]),
      ),
    [lines, unitRuntime, lineRuntime],
  )

  const autoRunByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => {
          const lrt2 = lineRuntime[item.id]
          return [item.id, lrt2 ? lrt2.operationStatus === 'Auto' : (lineControls[item.id]?.autoRun ?? false)]
        }),
      ),
    [lines, lineRuntime, lineControls],
  )

  const powerOnByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => {
          const lrt2 = lineRuntime[item.id]
          return [item.id, lrt2 ? lrt2.operationStatus === 'Auto' || lrt2.runningConveyors > 0 : (lineControls[item.id]?.powerOn ?? false)]
        }),
      ),
    [lines, lineRuntime, lineControls],
  )

  // V3 lineRuntime 우선, 없으면 로컬 control 폴백
  const allPowerOn = lrt
    ? lrt.operationStatus === 'Auto' || lrt.runningConveyors > 0
    : control.powerOn && stats.totalUnits > 0 && stats.idleUnits === 0

  // 라인에 속한 CV가 하나라도 Manual이면 All Auto Run 꺼짐
  const allCvRuntime = useSemiCnvStore((s) => s.allCvRuntime)
  const lineUnitSemiIds = useMemo(
    () => new Set(line.units.map((u) => u.semiCnvId).filter((id): id is number => id != null)),
    [line.units],
  )
  const allCvsAreAuto = useMemo(() => {
    if (Object.keys(allCvRuntime).length === 0) return false
    const lineRuntimes = Object.entries(allCvRuntime)
      .filter(([id]) => lineUnitSemiIds.size === 0 || lineUnitSemiIds.has(Number(id)))
      .map(([, rt]) => rt)
    if (lineRuntimes.length === 0) return false
    return lineRuntimes.every((rt) => rt.operationStatus === 'Auto')
  }, [allCvRuntime, lineUnitSemiIds])

  const allAutoRun = lrt
    ? lrt.keyStatus === 'Auto' && lrt.operationStatus === 'Auto' && allCvsAreAuto
    : control.autoRun

  return (
    <div className="space-y-4">
      {!showIOPanels && (
        <MonitorControlBar
          etherCatConnected={etherCatConnected}
          allPowerOn={allPowerOn}
          allAutoRun={allAutoRun}
          onToggleEtherCat={() => {
            toggleEtherCat()
            void logApplication({
              title: 'Button Click',
              comment: `HOME: EtherCAT ${etherCatConnected ? 'OFF' : 'ON'}`,
              lineId: line.id,
            })
          }}
          onToggleAllPower={() => {
            const isLive = useSemiCnvStore.getState().isLive
            if (!allPowerOn && isLive) {
              // V3 연결 상태 + OFF → V3로 Power On 명령
              useSemiCnvStore.getState().sendCommand('all_power_on')
              void logApplication({
                title: 'Button Click',
                comment: 'HOME: All Power On → V3 command',
                lineId: line.id,
              })
            } else {
              // 로컬 토글 (V3 미연결 or 이미 ON인 경우)
              toggleAllPower(line.id)
              void logApplication({
                title: 'Button Click',
                comment: `HOME: All Power On ${allPowerOn ? 'OFF' : 'ON'} (local)`,
                lineId: line.id,
              })
            }
          }}
          onAllPowerOn={() => {
            useSemiCnvStore.getState().sendCommand('all_power_on')
            void logApplication({
              title: 'Button Click',
              comment: 'HOME: All Power On (long press)',
              lineId: line.id,
            })
          }}
          onAllAutoRun={() => {
            const isLive = useSemiCnvStore.getState().isLive
            if (!allAutoRun && isLive) {
              // V3 연결 상태 + OFF → V3로 Auto Run 명령
              useSemiCnvStore.getState().sendCommand('all_auto_run')
              void logApplication({
                title: 'Button Click',
                comment: 'HOME: All Auto Run → V3 command',
                lineId: line.id,
              })
            } else {
              // 로컬 토글 (V3 미연결)
              setAllAutoRun(line.id)
              void logApplication({
                title: 'Button Click',
                comment: 'HOME: All Auto Run (local)',
                lineId: line.id,
              })
            }
          }}
          onAllAutoStop={() => {
            useSemiCnvStore.getState().sendCommand('all_auto_stop')
            void logApplication({
              title: 'Button Click',
              comment: 'HOME: All Auto Stop (long press)',
              lineId: line.id,
            })
          }}
          onAlarmReset={() => {
            useSemiCnvStore.getState().sendCommand('alarm_reset')
            void logApplication({
              title: 'Button Click',
              comment: 'HOME: Alarm Reset',
              lineId: line.id,
            })
          }}
        />
      )}

      {!showIOPanels && (
        <MonitorStatusPanels
          ioStatus={ioStatus}
          safetyOk={safetyOk}
          autoEnabled={autoEnabled}
          currentStatus={currentStatus}
        />
      )}

      {showIOPanels ? (
        <IOStatusPanels ioStatus={ioStatus} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <BufferStoragePanel utilization={stats.bufferUtilization} />
          <LineMinimapPanel line={line} />
          <AlarmHistoryPanel line={line} />
        </div>
      )}

      <LineStatusTable
        lines={lines}
        selectedLineId={selectedLineId}
        statsByLineId={statsByLineId}
        autoRunByLineId={autoRunByLineId}
        powerOnByLineId={powerOnByLineId}
      />
    </div>
  )
}
