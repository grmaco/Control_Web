import { useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useLineCommStatus, useLineCommStatuses } from '../../hooks/useLineCommStatus'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import {
  filterIoStatusForLine,
  filterUnitRuntimeForLine,
  getLineRuntimeForLine,
  hasActiveAlarmsForLine,
} from '../../utils/lineV3Scope'
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
  const unitRuntimeAll = useSemiCnvStore((s) => s.unitRuntime)
  const unitAlarmsAll = useSemiCnvStore((s) => s.unitAlarms)
  const lineRuntimeAll = useSemiCnvStore((s) => s.lineRuntime)
  const ioStatusAll = useSemiCnvStore((s) => s.ioStatus)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const lineComm = useLineCommStatus(line)
  const commByLineId = useLineCommStatuses(lines)
  const unitRuntime = useMemo(
    () => filterUnitRuntimeForLine(line, unitRuntimeAll, lineComm),
    [line, unitRuntimeAll, lineComm],
  )
  const lrt = useMemo(
    () => getLineRuntimeForLine(line, lineRuntimeAll, lineComm),
    [line, lineRuntimeAll, lineComm],
  )
  const ioStatus = useMemo(
    () => filterIoStatusForLine(ioStatusAll, lineComm),
    [ioStatusAll, lineComm],
  )

  const [autoCondPopupOpen, setAutoCondPopupOpen] = useState(false)
  const [powerSelectPopupOpen, setPowerSelectPopupOpen] = useState(false)

  const control = getLineControl(line.id)
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
        lines.map((item) => {
          const comm = commByLineId[item.id] ?? null
          const scopedRt = filterUnitRuntimeForLine(item, unitRuntimeAll, comm)
          const scopedLrt = getLineRuntimeForLine(item, lineRuntimeAll, comm)
          return [item.id, computeLineStats(item, scopedRt, scopedLrt)]
        }),
      ),
    [commByLineId, lineRuntimeAll, lines, unitRuntimeAll],
  )

  const autoRunByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => {
          const comm = commByLineId[item.id] ?? null
          const lrt2 = getLineRuntimeForLine(item, lineRuntimeAll, comm)
          return [item.id, lrt2 ? lrt2.operationStatus === 'Auto' : (lineControls[item.id]?.autoRun ?? false)]
        }),
      ),
    [commByLineId, lineControls, lineRuntimeAll, lines],
  )

  const powerOnByLineId = useMemo(
    () =>
      Object.fromEntries(
        lines.map((item) => {
          const comm = commByLineId[item.id] ?? null
          const lrt2 = getLineRuntimeForLine(item, lineRuntimeAll, comm)
          const scopedRt = filterUnitRuntimeForLine(item, unitRuntimeAll, comm)
          if (!lrt2) return [item.id, lineControls[item.id]?.powerOn ?? false]
          const rts = item.units
            .map((u) => scopedRt[u.id])
            .filter((rt): rt is NonNullable<typeof rt> => rt != null)
          if (rts.length === 0) return [item.id, lrt2.operationStatus === 'Auto' || lrt2.runningConveyors > 0]
          return [item.id, rts.every((rt) => rt.power === 'On')]
        }),
      ),
    [commByLineId, lineControls, lineRuntimeAll, lines, unitRuntimeAll],
  )

  // 전체 유닛이 모두 Power On일 때 파란불
  const allPowerOn = useMemo(() => {
    if (!lrt) return control.powerOn
    const rts = line.units
      .map((u) => unitRuntime[u.id])
      .filter((rt): rt is NonNullable<typeof rt> => rt != null)
    if (rts.length === 0) return false
    return rts.every((rt) => rt.power === 'On')
  }, [lrt, control.powerOn, line.units, unitRuntime])

  const allCvsAreAuto = useMemo(() => {
    const rts = line.units
      .map((u) => unitRuntime[u.id])
      .filter((rt): rt is NonNullable<typeof rt> => rt != null)
    if (rts.length === 0) return false
    return rts.every((rt) => rt.operationStatus === 'Auto')
  }, [line.units, unitRuntime])

  const allAutoRun = lrt
    ? lrt.keyStatus === 'Auto' && lrt.operationStatus === 'Auto' && allCvsAreAuto
    : control.autoRun

  const hasActiveAlarm = useMemo(
    () => hasActiveAlarmsForLine(line, unitRuntime, unitAlarmsAll, lineComm),
    [line, unitRuntime, unitAlarmsAll, lineComm],
  )

  return (
    <div className="space-y-4">
      {!showIOPanels && (
        <MonitorControlBar
          etherCatConnected={etherCatConnected}
          allPowerOn={allPowerOn}
          allAutoRun={allAutoRun}
          hasActiveAlarm={hasActiveAlarm}
          onToggleEtherCat={() => {
            toggleEtherCat()
            void logApplication({
              title: 'Button Click',
              comment: `HOME: EtherCAT ${etherCatConnected ? 'OFF' : 'ON'}`,
              lineId: line.id,
            })
          }}
          onToggleAllPower={() => setPowerSelectPopupOpen(true)}
          onAllAutoRun={() => {
            const isLive = useSemiCnvStore.getState().isLive
            if (!allAutoRun && isLive) {
              // Auto Condition 미충족 항목 확인
              const conditions = ioStatus?.autoConditions ?? []
              const failed = conditions.filter((c) => !c.status)
              if (failed.length > 0) {
                setAutoCondPopupOpen(true)
                return
              }
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

      {!showIOPanels && (
        <LineStatusTable
          lines={lines}
          selectedLineId={selectedLineId}
          statsByLineId={statsByLineId}
          autoRunByLineId={autoRunByLineId}
          powerOnByLineId={powerOnByLineId}
        />
      )}

      {/* Auto Condition 미충족 경고 팝업 — ioStatus 실시간 반영 */}
      {autoCondPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setAutoCondPopupOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-amber-500/60 bg-slate-800 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-amber-400">Auto Run 조건 미충족</p>
            <p className="mb-4 text-xs text-slate-400">
              아래 항목을 확인하고 조건을 충족한 후 실행하세요.
            </p>
            <ul className="mb-5 max-h-52 space-y-1.5 overflow-y-auto">
              {(ioStatus?.autoConditions ?? []).map((c) => (
                <li key={c.no} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${c.status ? 'bg-emerald-400' : 'bg-red-500'}`} />
                  <span className={c.status ? 'text-slate-400' : 'font-medium text-red-300'}>{c.name}</span>
                  <span className={`ml-auto text-xs font-semibold ${c.status ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.status ? 'ON' : 'OFF'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAutoCondPopupOpen(false)}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 전체 Unit 전원 ON/OFF 선택 팝업 */}
      {powerSelectPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPowerSelectPopupOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-lg border border-slate-600 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-slate-100">전체 Unit 전원 제어</p>
            <p className="mb-6 text-xs text-slate-400">
              현재&nbsp;
              <span className={allPowerOn ? 'font-semibold text-blue-400' : 'font-semibold text-slate-400'}>
                {allPowerOn ? '전체 Power ON' : 'Power OFF 유닛 있음'}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPowerSelectPopupOpen(false)
                  useSemiCnvStore.getState().sendCommand('all_power_on')
                  void logApplication({ title: 'Button Click', comment: 'HOME: All Power ON', lineId: line.id })
                }}
                className="flex-1 rounded border border-blue-600 bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Power ON
              </button>
              <button
                type="button"
                onClick={() => {
                  setPowerSelectPopupOpen(false)
                  useSemiCnvStore.getState().sendCommand('all_power_off')
                  void logApplication({ title: 'Button Click', comment: 'HOME: All Power OFF', lineId: line.id })
                }}
                className="flex-1 rounded border border-slate-500 bg-slate-700 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-600"
              >
                Power OFF
              </button>
            </div>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setPowerSelectPopupOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
