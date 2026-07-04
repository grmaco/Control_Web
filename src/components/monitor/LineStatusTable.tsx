import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ConveyorLine } from '../../types/conveyor'
import { useConveyorStore } from '../../store/useConveyorStore'
import { flowModeLabel } from '../../utils/monitorStats'
import type { LineMonitorStats } from '../../utils/monitorStats'
import { useLineCommStatuses } from '../../hooks/useLineCommStatus'
import { formatLastReceived } from '../../semicnv/lineCommStatus'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { SemiCnvLineCommStatus, SemiCnvLineRuntime } from '../../types/semicnv'
import { LineCommIndicator } from './LineCommIndicator'

interface LineStatusTableProps {
  lines: ConveyorLine[]
  selectedLineId: string | null
  statsByLineId: Record<string, LineMonitorStats>
  autoRunByLineId: Record<string, boolean>
  powerOnByLineId: Record<string, boolean>
}

const columns = [
  '',
  '현장',
  '통신',
  '최종수신',
  '물류명',
  '작동 모드',
  '연결',
  '자재',
  '가동',
  '점검',
  '오류',
] as const

export function LineStatusTable({
  lines,
  selectedLineId,
  statsByLineId,
  autoRunByLineId,
  powerOnByLineId,
}: LineStatusTableProps) {
  const commByLineId = useLineCommStatuses(lines)
  const lineRuntime = useSemiCnvStore((s) => s.lineRuntime)
  const reorderLines = useConveyorStore((s) => s.reorderLines)
  const logApplication = useConveyorStore((s) => s.logApplication)
  const [showExtraCols, setShowExtraCols] = useState(false)
  const extraCellClass = showExtraCols ? 'table-cell' : 'hidden sm:table-cell'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    void reorderLines(activeId, overId)
    const activeLine = lines.find((line) => line.id === activeId)
    const overLine = lines.find((line) => line.id === overId)
    void logApplication({
      title: 'Button Click',
      comment: `HOME: Line Reorder ${activeLine?.name ?? activeId} → ${overLine?.name ?? overId}`,
      lineId: activeId,
    })
  }

  return (
    <div>
      <div className="mb-1 flex justify-end sm:hidden">
        <button
          type="button"
          onClick={() => setShowExtraCols((v) => !v)}
          className="app-btn app-btn-secondary app-btn-sm text-xs"
        >
          {showExtraCols ? '열 접기 ▲' : '열 펼치기 ▼'}
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900/80">
        <table className="w-full text-left text-xs sm:min-w-[720px]">
          <thead className="border-b border-slate-700 bg-slate-950/80 text-slate-400">
            <tr>
              {columns.map((col, index) => {
                const isExtra = col === '최종수신' || col === '물류명' || col === '연결' || col === '작동 모드'
                return (
                  <th
                    key={col || 'drag'}
                    className={`whitespace-nowrap px-3 py-2.5 font-semibold ${
                      index === 0 ? 'w-8 px-2' : ''
                    } ${isExtra ? extraCellClass : ''}`}
                  >
                    {col}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  등록된 라인이 없습니다.
                </td>
              </tr>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={lines.map((line) => line.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {lines.map((line) => {
                    const stats = statsByLineId[line.id] ?? {
                      totalUnits: 0,
                      autoUnits: 0,
                      idleUnits: 0,
                      manualUnits: 0,
                      errorUnits: 0,
                      onCstUnits: 0,
                      linkedUnits: 0,
                      bufferUtilization: 0,
                    }
                    const rt = lineRuntime[line.id]
                    const powerOn = rt
                      ? rt.operationStatus === 'Auto' || rt.runningConveyors > 0
                      : (powerOnByLineId[line.id] ?? false)
                    const autoRun = rt
                      ? rt.keyStatus === 'Auto' && rt.operationStatus === 'Auto'
                      : (autoRunByLineId[line.id] ?? false)
                    const selected = line.id === selectedLineId
                    const comm = commByLineId[line.id]

                    return (
                      <SortableLineRow
                        key={line.id}
                        line={line}
                        selected={selected}
                        comm={comm}
                        rt={rt}
                        stats={stats}
                        autoRun={autoRun}
                        powerOn={powerOn}
                        extraCellClass={extraCellClass}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface SortableLineRowProps {
  line: ConveyorLine
  selected: boolean
  comm: SemiCnvLineCommStatus | undefined
  rt: SemiCnvLineRuntime | undefined
  stats: LineMonitorStats
  autoRun: boolean
  powerOn: boolean
  extraCellClass: string
}

function SortableLineRow({
  line,
  selected,
  comm,
  rt,
  stats,
  autoRun,
  powerOn,
  extraCellClass,
}: SortableLineRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-slate-800/80 ${
        selected ? 'bg-blue-950/30' : 'hover:bg-slate-800/40'
      } ${comm?.state === 'offline' ? 'opacity-70' : ''} ${
        isDragging ? 'relative z-10 bg-slate-800/90 shadow-lg' : ''
      }`}
    >
      <td className="px-2 py-2.5">
        <button
          type="button"
          className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
          aria-label={`${line.name} 순서 변경`}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-200">{line.name}</td>
      <td className="px-3 py-2.5">
        {comm ? <LineCommIndicator comm={comm} compact /> : '-'}
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-slate-400 ${extraCellClass}`}>
        {formatLastReceived(comm?.lastMessageAt ?? null)}
      </td>
      <td className={`px-3 py-2.5 text-slate-400 ${extraCellClass}`}>
        {rt?.lineName ?? comm?.siteName ?? comm?.siteId ?? line.semiCnvSiteId ?? '-'}
      </td>
      <td className={`px-3 py-2.5 text-slate-300 ${extraCellClass}`}>{flowModeLabel(autoRun, powerOn)}</td>
      <td className={`px-3 py-2.5 text-slate-300 ${extraCellClass}`}>{stats.linkedUnits}EA</td>
      <td
        className={`px-3 py-2.5 ${
          stats.onCstUnits > 0 ? 'font-semibold text-cyan-300' : 'text-slate-300'
        }`}
      >
        {stats.onCstUnits}EA
      </td>
      <td className="px-3 py-2.5 text-emerald-400">{stats.autoUnits}EA</td>
      <td className="px-3 py-2.5 text-amber-400">{stats.manualUnits}EA</td>
      <td className="px-3 py-2.5 text-red-400">{stats.errorUnits}EA</td>
    </tr>
  )
}

function GripIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  )
}
