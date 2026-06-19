import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, MONITOR_CELL_SIZE } from '../../constants/grid'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore, type MonitorViewTransform } from '../../store/useMonitorStore'
import type { ConveyorLine } from '../../types/conveyor'
import { lineLayoutSignature } from '../../utils/lineLayoutSignature'
import { fitFullMapInView, focusLineInView } from '../../utils/monitorView'
import { LineStatusGrid } from './LineStatusGrid'

const CELL_SIZE = MONITOR_CELL_SIZE
const LABELS_MIN_EFFECTIVE_CELL = 32

const ZOOM_CONFIG = {
  minScale: 0.1,
  maxScale: 10,
  smooth: true,
  wheel: { step: 0.004 },
  zoomAnimation: {
    disabled: false,
    animationTime: 320,
    animationType: 'easeOut' as const,
  },
  panning: { velocityDisabled: true },
  doubleClick: { disabled: true },
}

interface MonitorCanvasProps {
  line: ConveyorLine
}

function isSavedViewValid(
  saved: MonitorViewTransform | null,
  signature: string,
): saved is MonitorViewTransform {
  if (!saved) return false
  if (saved.layoutSignature == null) return true
  return saved.layoutSignature === signature
}

export function MonitorCanvas({ line }: MonitorCanvasProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const initializedLineRef = useRef<string | null>(null)
  const layoutSignature = useMemo(() => lineLayoutSignature(line), [line])
  const savedView = useMonitorStore((s) => s.lineViews[line.id] ?? null)
  const saveLineView = useMonitorStore((s) => s.saveLineView)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const initialTransform = useMemo(() => {
    if (isSavedViewValid(savedView, layoutSignature)) {
      return {
        scale: savedView.scale,
        positionX: savedView.positionX,
        positionY: savedView.positionY,
      }
    }
    return { scale: 1, positionX: 0, positionY: 0 }
  }, [layoutSignature, line.id, savedView])

  const [scale, setScale] = useState(initialTransform.scale)
  const viewStateRef = useRef(initialTransform)

  const logButton = (comment: string) => {
    void logApplication({
      title: 'Button Click',
      comment: `Monitor: ${comment}`,
      lineId: line.id,
    })
  }

  const persistView = useCallback(
    (nextScale: number, positionX: number, positionY: number) => {
      viewStateRef.current = { scale: nextScale, positionX, positionY }
      saveLineView(line.id, {
        scale: nextScale,
        positionX,
        positionY,
        layoutSignature,
      })
    },
    [layoutSignature, line.id, saveLineView],
  )

  const applyLineFocus = useCallback(
    (animationTime = 0) => {
      const ref = transformRef.current
      if (!ref) return
      focusLineInView(ref, line, CELL_SIZE, animationTime)
      window.setTimeout(() => {
        const { scale: nextScale, positionX, positionY } = ref.instance.state
        setScale(nextScale)
        persistView(nextScale, positionX, positionY)
      }, animationTime + 50)
    },
    [line, persistView],
  )

  const handleInit = useCallback(
    (ref: ReactZoomPanPinchRef) => {
      if (initializedLineRef.current === line.id) return
      initializedLineRef.current = line.id

      if (isSavedViewValid(savedView, layoutSignature)) {
        ref.setTransform(savedView.positionX, savedView.positionY, savedView.scale, 0)
        viewStateRef.current = {
          scale: savedView.scale,
          positionX: savedView.positionX,
          positionY: savedView.positionY,
        }
        setScale(savedView.scale)
        return
      }

      focusLineInView(ref, line, CELL_SIZE)
      const { scale: nextScale, positionX, positionY } = ref.instance.state
      setScale(nextScale)
      persistView(nextScale, positionX, positionY)
    },
    [layoutSignature, line, persistView, savedView],
  )

  useEffect(() => {
    initializedLineRef.current = null
  }, [line.id])

  const effectiveCellSize = CELL_SIZE * scale
  const showLabels = effectiveCellSize >= LABELS_MIN_EFFECTIVE_CELL

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <p className="text-sm text-slate-400">
          {line.name} · {DEFAULT_GRID_COLS}×{DEFAULT_GRID_ROWS} · 유닛 {line.units.length}개
        </p>
        <div className="flex items-center gap-1">
          <ZoomButton
            label="−"
            onClick={() => {
              transformRef.current?.zoomOut(0.35, 280, 'easeOut')
              logButton('Zoom Out')
            }}
          />
          <ZoomButton
            label="+"
            onClick={() => {
              transformRef.current?.zoomIn(0.35, 280, 'easeOut')
              logButton('Zoom In')
            }}
          />
          <ZoomButton
            label="라인 맞춤"
            onClick={() => {
              applyLineFocus(320)
              logButton('Line Fit')
            }}
            wide
          />
          <ZoomButton
            label="전체 맵"
            onClick={() => {
              if (transformRef.current) {
                fitFullMapInView(transformRef.current, line, CELL_SIZE, 320)
                window.setTimeout(() => {
                  const ref = transformRef.current
                  if (!ref) return
                  const { scale: nextScale, positionX, positionY } = ref.instance.state
                  setScale(nextScale)
                  persistView(nextScale, positionX, positionY)
                }, 370)
              }
              logButton('Full Map')
            }}
            wide
          />
        </div>
      </div>

      <TransformWrapper
        key={line.id}
        ref={transformRef}
        onInit={handleInit}
        initialScale={initialTransform.scale}
        initialPositionX={initialTransform.positionX}
        initialPositionY={initialTransform.positionY}
        onTransform={(_, state) => {
          setScale(state.scale)
          persistView(state.scale, state.positionX, state.positionY)
        }}
        {...ZOOM_CONFIG}
      >
        <TransformComponent
          wrapperClass="!h-[520px] !w-full cursor-grab active:cursor-grabbing"
        >
          <LineStatusGrid
            line={line}
            cellSize={CELL_SIZE}
            scale={scale}
            showLabels={showLabels}
            className="pointer-events-none select-none"
          />
        </TransformComponent>
      </TransformWrapper>

      <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        마우스 휠: 줌 · 드래그: 이동 · 줌인 시 모듈 정보 표시 · 라인 맞춤 / 전체 맵
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
