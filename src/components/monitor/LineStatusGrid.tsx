import { unitTitle } from '../../constants/conveyorTypes'
import type { ConveyorLine } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import type { LineViewport } from '../../utils/lineViewport'
import { findUnitAt } from '../../utils/lineViewport'
import { buildUnitLabelLines, LABEL_LINE_HEIGHT } from '../../utils/monitorLabel'

interface LineStatusGridProps {
  line: ConveyorLine
  cellSize: number
  viewport?: LineViewport
  showLabels?: boolean
  /** 줌 배율 — 라벨 크기 계산에 사용 */
  scale?: number
  className?: string
}

export function LineStatusGrid({
  line,
  cellSize,
  viewport,
  showLabels = true,
  scale = 1,
  className,
}: LineStatusGridProps) {
  const minX = viewport?.minX ?? 0
  const minY = viewport?.minY ?? 0
  const cols = viewport?.cols ?? line.gridSize.cols
  const rows = viewport?.rows ?? line.gridSize.rows

  return (
    <div
      className={`inline-grid gap-0 border border-slate-700 bg-slate-950/50 ${className ?? ''}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
      }}
    >
      {Array.from({ length: cols * rows }).map((_, index) => {
        const localX = index % cols
        const localY = Math.floor(index / cols)
        const gridX = minX + localX
        const gridY = minY + localY
        const unit = findUnitAt(line.units, gridX, gridY)
        const colors = unit ? STATUS_COLORS[unit.status] : null
        const label =
          unit && showLabels
            ? buildUnitLabelLines(unit, cellSize, scale)
            : null

        return (
          <div
            key={`${gridX}-${gridY}`}
            style={{ width: cellSize, height: cellSize }}
            className={`flex h-full w-full min-w-0 flex-col items-center justify-center overflow-hidden border p-0.5 ${
              unit
                ? `${colors!.bg} ${colors!.border} text-white`
                : 'border-slate-800 bg-slate-900/60 text-slate-600'
            }`}
            title={unit ? unitTitle(unit) : undefined}
          >
            {label && label.lines.length > 0 ? (
              <div
                className="flex w-full min-h-0 min-w-0 max-w-full flex-col items-center justify-center overflow-hidden"
                style={{
                  fontSize: label.fontSize,
                  lineHeight: LABEL_LINE_HEIGHT,
                }}
              >
                {label.lines.map((text, lineIndex) => (
                  <span
                    key={lineIndex}
                    className={`block w-full max-w-full overflow-hidden text-center whitespace-nowrap ${
                      lineIndex === 0
                        ? 'font-semibold'
                        : lineIndex === 1
                          ? 'text-white/70'
                          : 'text-white/60'
                    }`}
                  >
                    {text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
