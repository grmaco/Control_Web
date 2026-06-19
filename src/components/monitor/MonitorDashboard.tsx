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

interface MonitorDashboardProps {
  line: ConveyorLine
  lines: ConveyorLine[]
  selectedLineId: string | null
}

export function MonitorDashboard({
  line,
  lines,
  selectedLineId,
}: MonitorDashboardProps) {
  const etherCatConnected = useMonitorStore((s) => s.etherCatConnected)
  const toggleEtherCat = useMonitorStore((s) => s.toggleEtherCat)
  const toggleAllPower = useMonitorStore((s) => s.toggleAllPower)
  const setAllAutoRun = useMonitorStore((s) => s.setAllAutoRun)
  const getLineControl = useMonitorStore((s) => s.getLineControl)
  const lineControls = useMonitorStore((s) => s.lineControls)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const control = getLineControl(line.id)
  const stats = useMemo(() => computeLineStats(line, unitRuntime), [line, unitRuntime])
  const safetyOk = isSafetyOk(etherCatConnected, stats)
  const autoEnabled = isAutoEnabled(safetyOk, control.powerOn, stats)
  const currentStatus = resolveCurrentStatus(stats, control.autoRun, control.powerOn)

  const statsByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => [item.id, computeLineStats(item, unitRuntime)]),
      ),
    [lines, unitRuntime],
  )

  const autoRunByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => [item.id, lineControls[item.id]?.autoRun ?? false]),
      ),
    [lines, lineControls],
  )

  const powerOnByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => [item.id, lineControls[item.id]?.powerOn ?? false]),
      ),
    [lines, lineControls],
  )

  const allPowerOn =
    control.powerOn &&
    stats.totalUnits > 0 &&
    stats.idleUnits === 0

  return (
    <div className="space-y-4">
      <MonitorControlBar
        etherCatConnected={etherCatConnected}
        allPowerOn={allPowerOn}
        onToggleEtherCat={() => {
          toggleEtherCat()
          void logApplication({
            title: 'Button Click',
            comment: `HOME: EtherCAT ${etherCatConnected ? 'OFF' : 'ON'}`,
            lineId: line.id,
          })
        }}
        onToggleAllPower={() => {
          toggleAllPower(line.id)
          void logApplication({
            title: 'Button Click',
            comment: `HOME: All Power On ${allPowerOn ? 'OFF' : 'ON'}`,
            lineId: line.id,
          })
        }}
        onAllAutoRun={() => {
          setAllAutoRun(line.id)
          void logApplication({
            title: 'Button Click',
            comment: 'HOME: All Auto Run',
            lineId: line.id,
          })
        }}
      />

      <MonitorStatusPanels
        safetyOk={safetyOk}
        autoEnabled={autoEnabled}
        currentStatus={currentStatus}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <BufferStoragePanel utilization={stats.bufferUtilization} />
        <LineMinimapPanel line={line} />
        <AlarmHistoryPanel line={line} />
      </div>

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
