import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MONITOR_CELL_SIZE } from '../../constants/grid'
import { usePathSimulation } from '../../hooks/usePathSimulation'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore, type MonitorViewTransform } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { ConveyorLine } from '../../types/conveyor'
import { PATH_SIMULATION_STEP_MS } from '../../types/unitProperties'
import { lineLayoutSignature } from '../../utils/lineLayoutSignature'
import { getBuilderViewport, getLineViewport } from '../../utils/lineViewport'
import { fitFullMapInView, focusLineInView } from '../../utils/monitorView'
import { LineStatusGrid } from './LineStatusGrid'
import { PathSimulationBar } from './PathSimulationBar'
import { FLOW_CALLOUT_PANEL_CLASS } from './FlowCalloutLayer'

const CELL_SIZE = MONITOR_CELL_SIZE
const LABELS_MIN_EFFECTIVE_CELL = 32
const MONITOR_VIEWPORT_PADDING = 6

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
  panning: { velocityDisabled: true, disabled: false },
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
  const viewport = useMemo(
    () =>
      getLineViewport(line, MONITOR_VIEWPORT_PADDING) ??
      getBuilderViewport(line, MONITOR_VIEWPORT_PADDING),
    [layoutSignature, line],
  )
  const savedView = useMonitorStore((s) => s.lineViews[line.id] ?? null)
  const saveLineView = useMonitorStore((s) => s.saveLineView)
  const hideModuleNames = useMonitorStore((s) => s.hideModuleNames)
  const toggleHideModuleNames = useMonitorStore((s) => s.toggleHideModuleNames)
  const logApplication = useConveyorStore((s) => s.logApplication)
  const saveLine = useConveyorStore((s) => s.saveLine)
  const simulation = usePathSimulation(line, {
    onClearTestMaterial: useCallback(
      (unitIds: string[]) => {
        const clearSet = new Set(unitIds)
        const hasMaterial = line.units.some(
          (unit) => clearSet.has(unit.id) && unit.testMaterial === 1,
        )
        if (!hasMaterial) return

        const now = new Date().toISOString()
        void saveLine({
          ...line,
          units: line.units.map((unit) =>
            clearSet.has(unit.id) ? { ...unit, testMaterial: 0, updatedAt: now } : unit,
          ),
          updatedAt: now,
        })
      },
      [line, saveLine],
    ),
  })

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

  const isLive = useSemiCnvStore((s) => s.isLive)
  const [scale, setScale] = useState(initialTransform.scale)
  const [is25DView, setIs25DView] = useState(false)
  const [calloutPanLock, setCalloutPanLock] = useState(false)
  const [calloutDeselectToken, setCalloutDeselectToken] = useState(0)
  const [simBlockPopupOpen, setSimBlockPopupOpen] = useState(false)
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
  const zoomConfig = useMemo(
    () => ({
      ...ZOOM_CONFIG,
      panning: {
        ...ZOOM_CONFIG.panning,
        disabled: calloutPanLock,
        excluded: [FLOW_CALLOUT_PANEL_CLASS],
      },
    }),
    [calloutPanLock],
  )

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-1.5 border-b border-slate-800 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-sm text-slate-400">
          {line.name} · {viewport.cols}×{viewport.rows} · 유닛 {line.units.length}개
        </p>
        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
          <ZoomButton
            label={is25DView ? '2D 보기' : '3D 보기'}
            active={is25DView}
            onClick={() => {
              setIs25DView((current) => !current)
              logButton(is25DView ? 'Switch 2D View' : 'Switch 3D View')
            }}
            wide
          />
          <ZoomButton
            label={hideModuleNames ? '이름 보기' : '이름 숨기기'}
            active={hideModuleNames}
            onClick={() => {
              toggleHideModuleNames()
              logButton(hideModuleNames ? 'Show Module Names' : 'Hide Module Names')
            }}
            wide
          />
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

      <PathSimulationBar
        mode={simulation.mode}
        onModeChange={simulation.changeMode}
        conveyorOnlyLine={simulation.conveyorOnlyLine}
        sources={simulation.sources}
        selectedSourceUnitIds={simulation.selectedSourceUnitIds}
        onToggleSource={simulation.toggleSourceUnitId}
        plan={simulation.plan}
        status={simulation.status}
        progressLabel={simulation.progressLabel}
        canSimulate={simulation.canSimulate}
        testMaterialCount={simulation.testMaterialUnits.length}
        activeUnitLabel={simulation.activeUnitLabel}
        waitingLabels={simulation.waitingLabels}
        inputIntervalSec={simulation.inputIntervalSec}
        dischargeIntervalSec={simulation.dischargeIntervalSec}
        transitIntervalSec={simulation.transitIntervalSec}
        onInputIntervalSecChange={simulation.setInputIntervalSec}
        onDischargeIntervalSecChange={simulation.setDischargeIntervalSec}
        onTransitIntervalSecChange={simulation.setTransitIntervalSec}
        incompleteLoadCount={simulation.incompleteLoadCount}
        onStart={() => {
          if (isLive) {
            setSimBlockPopupOpen(true)
            return
          }
          simulation.start()
          logButton('Path Simulation Start')
        }}
        onPause={() => {
          simulation.pause()
          logButton('Path Simulation Pause')
        }}
        onResume={() => {
          simulation.resume()
          logButton('Path Simulation Resume')
        }}
        onReset={() => {
          simulation.reset()
          setCalloutDeselectToken((token) => token + 1)
          logButton('Path Simulation Reset')
        }}
        onStepForward={() => {
          if (isLive) {
            setSimBlockPopupOpen(true)
            return
          }
          simulation.stepForward()
          logButton('Path Simulation Step')
        }}
      />

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
        {...zoomConfig}
      >
        <TransformComponent
          wrapperClass={`!h-[520px] !w-full overflow-visible ${
            calloutPanLock ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          }`}
          contentClass="!overflow-visible"
        >
          <LineStatusGrid
            line={line}
            viewport={viewport}
            cellSize={CELL_SIZE}
            scale={scale}
            showLabels={showLabels}
            hideModuleNames={hideModuleNames}
            showFlowArrows={line.units.length > 0}
            showFlowCallouts={line.units.length > 0}
            simulationNeonUnitIds={simulation.neonUnitIds}
            simulationActiveUnitIds={simulation.cstUnitIds}
            simulationStaticTestMaterialUnitIds={[
              ...simulation.staticTestMaterialUnitIds,
            ]}
            simulationInProgress={
              simulation.status !== 'idle' && simulation.status !== 'complete'
            }
            simulationLoads={
              simulation.status === 'revealing' ||
              simulation.status === 'playing' ||
              simulation.status === 'paused' ||
              simulation.status === 'endHold'
                ? simulation.loads
                    .filter(
                      (load) =>
                        !load.complete || simulation.status === 'endHold',
                    )
                    .map((load) => ({
                      pathUnitIds: load.pathUnitIds,
                      stepIndex: load.stepIndex,
                    }))
                : []
            }
            simulationPathUnitIds={simulation.pathUnitIds}
            onCalloutPanLockChange={setCalloutPanLock}
            calloutDeselectToken={calloutDeselectToken}
            is25DView={is25DView}
            className="pointer-events-none select-none"
          />
        </TransformComponent>
      </TransformWrapper>

      <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        마우스 휠: 줌 · 드래그: 맵 이동 · 정보 표: 클릭 선택 후 드래그로 위치 고정 · 경로 시뮬레이션: 투입(IN) 또는 출고(OUT) 다중 동시 출발 (틱{' '}
        {PATH_SIMULATION_STEP_MS / 1000}초)
      </p>

      {simBlockPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSimBlockPopupOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-xs rounded-lg border border-amber-500/60 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-amber-400">시뮬레이션 불가</p>
            <p className="mb-5 text-sm text-slate-300">
              V3가 연결된 실제 운영 환경입니다.
              <br />
              시뮬레이션은 V3 연결이 끊긴 상태에서만 실행할 수 있습니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSimBlockPopupOpen(false)}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  wide,
  active = false,
}: {
  label: string
  onClick: () => void
  wide?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border bg-slate-800 text-sm hover:bg-slate-700 ${
        active
          ? 'border-cyan-500/70 text-cyan-200'
          : 'border-slate-700 text-slate-200'
      } ${wide ? 'px-2 py-3 sm:px-2.5 sm:py-1' : 'h-11 w-11 sm:h-7 sm:w-7'}`}
    >
      {label}
    </button>
  )
}
