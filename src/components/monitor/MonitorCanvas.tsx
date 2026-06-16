import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { useRef } from 'react'
import { showsRotation, typeLabel, unitTitle } from '../../constants/conveyorTypes'
import type { ConveyorLine } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'

const CELL_SIZE = 48

interface MonitorCanvasProps {
  line: ConveyorLine
}

export function MonitorCanvas({ line }: MonitorCanvasProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <p className="text-sm text-slate-400">
          {line.name} · 유닛 {line.units.length}개
        </p>
        <div className="flex items-center gap-1">
          <ZoomButton label="−" onClick={() => transformRef.current?.zoomOut()} />
          <ZoomButton label="+" onClick={() => transformRef.current?.zoomIn()} />
          <ZoomButton
            label="전체보기"
            onClick={() => transformRef.current?.resetTransform()}
            wide
          />
        </div>
      </div>

      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.4}
        maxScale={3}
        centerOnInit
        wheel={{ step: 0.08 }}
        panning={{ velocityDisabled: true }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperClass="!h-[520px] !w-full cursor-grab active:cursor-grabbing"
          contentClass="!w-full !h-full flex items-center justify-center p-8"
        >
          <div
            className="grid gap-0 border border-dashed border-slate-700 bg-slate-950/50"
            style={{
              gridTemplateColumns: `repeat(${line.gridSize.cols}, ${CELL_SIZE}px)`,
            }}
          >
            {Array.from({
              length: line.gridSize.cols * line.gridSize.rows,
            }).map((_, index) => {
              const x = index % line.gridSize.cols
              const y = Math.floor(index / line.gridSize.cols)
              const unit = line.units.find((u) => u.gridX === x && u.gridY === y)
              const colors = unit ? STATUS_COLORS[unit.status] : null

              return (
                <div
                  key={`${x}-${y}`}
                  style={{ width: CELL_SIZE, height: CELL_SIZE }}
                  className={`flex h-full w-full flex-col items-center justify-center border p-0.5 text-[10px] leading-tight ${
                    unit
                      ? `${colors!.bg} ${colors!.border} text-white`
                      : 'border-slate-800 bg-slate-900/60 text-slate-600'
                  }`}
                  title={unit ? unitTitle(unit) : undefined}
                >
                  {unit ? (
                    <>
                      <span className="font-semibold">{unit.name}</span>
                      <span className="text-white/70">{typeLabel(unit.type)}</span>
                      {showsRotation(unit.type) && (
                        <span className="text-white/60">{unit.rotation}°</span>
                      )}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        마우스 휠: 줌 · 드래그: 이동 · +/- 버튼 또는 전체보기로 리셋
      </p>
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  wide,
}: {
  label: string
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border border-slate-700 bg-slate-800 text-sm text-slate-200 hover:bg-slate-700 ${
        wide ? 'px-2.5 py-1' : 'h-7 w-7'
      }`}
    >
      {label}
    </button>
  )
}
