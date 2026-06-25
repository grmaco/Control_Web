import { useEffect, useMemo } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { alarmLevelClass, buildAlarmList } from '../../utils/alarms'

const VISIBLE_ALARM_ROWS = 5
const ALARM_HISTORY_DISPLAY_LIMIT = 20
const ALARM_ROW_HEIGHT_PX = 33
const ALARM_HEADER_HEIGHT_PX = 28

export function AlarmHistoryPanel({ line }: { line: ConveyorLine }) {
  const history = useConveyorStore((s) => s.history)
  const alarmHistory = useConveyorStore((s) => s.alarmHistory)
  const fetchAlarmHistory = useConveyorStore((s) => s.fetchAlarmHistory)
  const etherCatConnected = useMonitorStore((s) => s.etherCatConnected)
  const etherCatOffSince = useMonitorStore((s) => s.etherCatOffSince)
  const isLive = useSemiCnvStore((s) => s.isLive)

  useEffect(() => {
    void fetchAlarmHistory()
  }, [fetchAlarmHistory])

  const alarms = useMemo(() => {
    const persisted = alarmHistory.filter((entry) => entry.lineId === line.id)

    if (isLive) {
      return [...persisted]
        .sort((a, b) => alarmTimestampMs(b.timestamp) - alarmTimestampMs(a.timestamp))
        .slice(0, ALARM_HISTORY_DISPLAY_LIMIT)
    }

    const offline = buildAlarmList(line, history, etherCatConnected, {
      includeUnitStatus: true,
      etherCatOffSince,
    }).map((entry) => ({ ...entry, lineId: line.id }))

    const unique = new Map<string, (typeof persisted)[number]>()
    for (const entry of [...persisted, ...offline]) {
      unique.set(entry.id, entry)
    }

    return [...unique.values()]
      .sort((a, b) => alarmTimestampMs(b.timestamp) - alarmTimestampMs(a.timestamp))
      .slice(0, ALARM_HISTORY_DISPLAY_LIMIT)
  }, [
    alarmHistory,
    etherCatConnected,
    etherCatOffSince,
    history,
    isLive,
    line,
  ])

  return (
    <div className="flex flex-col rounded border border-slate-700 bg-slate-900/80 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-400">
          ALARM HISTORY
        </h3>
        {alarms.length > 0 && (
          <span className="text-[10px] text-slate-500">최신순 최대 {ALARM_HISTORY_DISPLAY_LIMIT}건</span>
        )}
      </div>

      <div
        className="mt-3 overflow-y-auto"
        style={{
          maxHeight: ALARM_HEADER_HEIGHT_PX + ALARM_ROW_HEIGHT_PX * VISIBLE_ALARM_ROWS,
        }}
      >
        {alarms.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            표시할 알람이 없습니다.
          </p>
        ) : (
          <table className="w-full table-fixed text-center text-xs">
            <colgroup>
              <col className="w-[92px]" />
              <col className="w-12" />
              <col />
              <col className="w-12" />
            </colgroup>
            <thead className="sticky top-0 bg-slate-900 text-center text-slate-400">
              <tr>
                <th className="pb-2 pr-1 font-semibold">Date</th>
                <th className="pb-2 pr-1 font-semibold">Code</th>
                <th className="pb-2 pr-1 font-semibold">Alarm Text</th>
                <th className="pb-2 font-semibold">Level</th>
              </tr>
            </thead>
            <tbody className="text-center text-slate-300">
              {alarms.map((alarm) => (
                <tr key={alarm.id} className="border-t border-slate-800/80">
                  <td className="whitespace-nowrap py-2 pr-1 text-slate-400">
                    {formatAlarmDate(alarm.timestamp)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-1">{alarm.alarmId}</td>
                  <td
                    className="truncate py-2 pr-1"
                    title={alarm.alarmText}
                  >
                    {alarm.alarmText}
                  </td>
                  <td className={`whitespace-nowrap py-2 font-medium ${alarmLevelClass(alarm.level)}`}>
                    {alarm.level}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function formatAlarmDate(timestamp: string): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}:${ss}`
}

function alarmTimestampMs(timestamp: string): number {
  if (!timestamp) return 0
  const ms = new Date(timestamp).getTime()
  return Number.isNaN(ms) ? 0 : ms
}
