import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { fitCellSize, getLineViewport } from '../../utils/lineViewport'
import { LineStatusGrid } from './LineStatusGrid'

export function LineMinimapPanel({ line }: { line: ConveyorLine }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [ohtOnly, setOhtOnly] = useState(false)

  const viewport = useMemo(() => getLineViewport(line), [line])
  const hasOht = (line.ohtRails?.length ?? 0) > 0 || (line.ohtUnits?.length ?? 0) > 0

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => {
      setContainerSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const cellSize =
    viewport && containerSize.width > 0
      ? fitCellSize(viewport, containerSize.width, containerSize.height)
      : 0

  return (
    <div className="flex min-h-[280px] flex-col rounded border border-slate-700 bg-slate-900/80 px-2 pt-2 pb-1">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold tracking-wide text-slate-400">
          {ohtOnly ? 'OHT MINIMAP' : 'LINE MINIMAP'}
        </h3>
        {hasOht ? (
          <button
            type="button"
            onClick={() => setOhtOnly((v) => !v)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              ohtOnly
                ? 'bg-cyan-600 text-white'
                : 'border border-slate-600 text-slate-400 hover:bg-slate-800'
            }`}
            title="클릭하여 OHT 전용 보기 전환"
          >
            OHT
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="mt-1 flex flex-1 cursor-pointer items-center justify-center overflow-hidden"
        onClick={hasOht ? () => setOhtOnly((v) => !v) : undefined}
      >
        {viewport && cellSize > 0 ? (
          <LineStatusGrid
            line={line}
            viewport={viewport}
            cellSize={cellSize}
            showLabels={false}
            showFlowArrows={!ohtOnly && line.units.length > 0}
            showOhtRails={ohtOnly}
          />
        ) : null}
      </div>
    </div>
  )
}
