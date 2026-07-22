import { useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { useAuthStore } from '../../store/useAuthStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { STATUS_COLORS } from '../../constants/statusColors'
import {
  filterLiveAlarmsForLine,
  filterUnitAlarmsForLine,
  filterUnitRuntimeForLine,
  filterV3LogsForLine,
  filterV3TrafficForLine,
} from '../../utils/lineV3Scope'
import { MonitorCanvas } from './MonitorCanvas'
import { MonitorDashboard } from './MonitorDashboard'
import { CvStatusPanel } from './CvStatusPanel'
import { CstJourneyPanel } from './CstJourneyPanel'
import { V3IoPanel } from './V3IoPanel'
import { V3LogPanel } from './V3LogPanel'
import { V3AlarmReferencePanel } from './V3AlarmReferencePanel'
import { V3TrafficPanel } from './V3TrafficPanel'

type Tab = 'canvas' | 'map' | 'cv' | 'v3io' | 'v3data' | 'v3log'

const TABS: { key: Tab; label: string; developerOnly?: boolean }[] = [
  { key: 'canvas', label: '모니터링' },
  { key: 'map',    label: '설비 상태' },
  { key: 'cv',     label: 'CV 현황' },
  { key: 'v3io',   label: 'V3 I/O' },
  { key: 'v3data', label: 'V3 데이터', developerOnly: true },
  { key: 'v3log',  label: 'V3 이력' },
]

interface MonitorTabViewProps {
  line: ConveyorLine
  lines: ConveyorLine[]
  selectedLineId: string | null
}

export function MonitorTabView({ line, lines, selectedLineId }: MonitorTabViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('canvas')
  const role = useAuthStore((s) => s.role)
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !tab.developerOnly || role === 'developer'),
    [role],
  )
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const v3Logs = useSemiCnvStore((s) => s.v3Logs)
  const v3Traffic = useSemiCnvStore((s) => s.v3Traffic)
  const clearV3Traffic = useSemiCnvStore((s) => s.clearV3Traffic)
  const unitAlarms = useSemiCnvStore((s) => s.unitAlarms)
  const liveAlarms = useSemiCnvStore((s) => s.liveAlarms)
  const lineComm = useLineCommStatus(line)
  const scopedUnitRuntime = useMemo(
    () => filterUnitRuntimeForLine(line, unitRuntime, lineComm),
    [line, unitRuntime, lineComm],
  )
  const scopedUnitAlarms = useMemo(
    () => filterUnitAlarmsForLine(line, unitAlarms, lineComm),
    [line, unitAlarms, lineComm],
  )
  const scopedLiveAlarms = useMemo(
    () => filterLiveAlarmsForLine(line, liveAlarms, lineComm),
    [line, liveAlarms, lineComm],
  )
  const scopedV3Logs = useMemo(
    () => filterV3LogsForLine(line, v3Logs, lineComm),
    [line, v3Logs, lineComm],
  )
  const scopedV3Traffic = useMemo(
    () => filterV3TrafficForLine(line, v3Traffic, lineComm),
    [line, v3Traffic, lineComm],
  )
  const newLogCount = useMemo(() => scopedV3Logs.length, [scopedV3Logs])

  return (
    <div className="space-y-0">
      {/* 탭 헤더 — 모바일에서 가로 스크롤 */}
      <div className="app-tab-bar">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`app-tab sm:px-5 sm:py-2.5 ${activeTab === key ? 'app-tab--active' : ''}`}
          >
            {label}
            {key === 'v3log' && newLogCount > 0 && (
              <span className="app-tab-badge">
                {newLogCount > 999 ? '999+' : newLogCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {/* 모니터링 큰 맵 — 탭 전환 시 상태 유지를 위해 hidden으로 처리 */}
        <div className={activeTab === 'canvas' ? undefined : 'hidden'} aria-hidden={activeTab !== 'canvas'}>
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <span key={status} className="app-chip">
                <span className={`h-3 w-3 rounded-sm ${colors.bg}`} />
                {colors.label}
              </span>
            ))}
          </div>
          <MonitorCanvas line={line} />
        </div>

        {activeTab === 'map' && (
          <MonitorDashboard
            line={line}
            lines={lines}
            selectedLineId={selectedLineId}
            showIOPanels
          />
        )}

        {activeTab === 'cv' && (
          <div className="space-y-4">
            <CvStatusPanel
              lines={lines}
              unitRuntime={scopedUnitRuntime}
              unitAlarms={scopedUnitAlarms}
              liveAlarms={scopedLiveAlarms}
              selectedLine={line}
            />
            <CstJourneyPanel line={line} />
            <V3AlarmReferencePanel activeOnlyMode scopeLine={line} lineComm={lineComm} />
          </div>
        )}

        {activeTab === 'v3io' && (
          <V3IoPanel line={line} unitRuntime={scopedUnitRuntime} />
        )}

        {activeTab === 'v3data' && role === 'developer' && (
          <V3TrafficPanel entries={scopedV3Traffic} onClear={clearV3Traffic} />
        )}

        {activeTab === 'v3log' && <V3LogPanel logs={scopedV3Logs} fullHeight lineName={line.name} />}
      </div>
    </div>
  )
}
