import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { fitCellSize, getLineViewport } from '../../utils/lineViewport'
import { LineStatusGrid } from './LineStatusGrid'

export function LineMinimapPanel({ line }: { line: ConveyorLine }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const viewport = useMemo(() => getLineViewport(line), [line])

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
      <h3 className="px-1 text-xs font-semibold tracking-wide text-slate-400">
        LINE MINIMAP
      </h3>

      <div
        ref={containerRef}
        className="mt-1 flex flex-1 items-center justify-center overflow-hidden"
      >
        {viewport && cellSize > 0 ? (
          <LineStatusGrid
            line={line}
            viewport={viewport}
            cellSize={cellSize}
            showLabels={false}
            showFlowArrows={line.units.length > 0}
          />
        ) : null}
      </div>
    </div>
  )
}
