import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MONITOR_CELL_SIZE } from '../../constants/grid'
import { usePathSimulation } from '../../hooks/usePathSimulation'
import { useTouchLayout } from '../../hooks/useTouchLayout'
import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore, type MonitorViewTransform } from '../../store/useMonitorStore'
import type { ConveyorLine } from '../../types/conveyor'
import { lineLayoutSignature } from '../../utils/lineLayoutSignature'
import { getBuilderViewport, getLineViewport } from '../../utils/lineViewport'
import { fitFullMapInView, focusLineInView } from '../../utils/monitorView'
import {
  areAllCvUnitsRunning,
  areAllPortsRunning,
  lineWithAllCvUnitsRunning,
  lineWithAllPortsRunning,
  listNonRunningPorts,
} from '../../utils/pathSimulation'
import { unitTitle } from '../../constants/conveyorTypes'
import { isCvUnit } from '../../utils/unitMaterial'
import type { PathSimulationStartOptions } from '../../hooks/usePathSimulation'
import { LineStatusGrid } from './LineStatusGrid'
import { MonitorMapControls } from './MonitorMapControls'
import { PathSimulationBar, PathSimulationPlaybackControls } from './PathSimulationBar'
import { FLOW_CALLOUT_PANEL_CLASS, FLOW_UNIT_PEEK_HIT_CLASS } from './FlowCalloutLayer'
import { OhtSimulationBar } from './OhtSimulationBar'
import { useOhtSimulation } from '../../hooks/useOhtSimulation'

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
  const touchLayout = useTouchLayout()
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

  const completedLoadIdsRef = useRef<Set<string>>(new Set())
  const prevSimStatusRef = useRef(simulation.status)

  useEffect(() => {
    const prev = prevSimStatusRef.current
    prevSimStatusRef.current = simulation.status

    if (simulation.status === 'idle') {
      completedLoadIdsRef.current.clear()
      return
    }
    if (simulation.status === 'complete' && prev !== 'complete') {
      const total = simulation.loads.filter((l) => l.complete).length
      void logApplication({
        title: 'Path Simulation: Complete',
        comment: `시뮬레이션 완료 · 자재 ${total}개 이송 완료`,
        lineId: line.id,
      })
      return
    }
    const unitMap = new Map(line.units.map((u) => [u.id, u]))
    for (const load of simulation.loads) {
      if (!load.complete || completedLoadIdsRef.current.has(load.id)) continue
      completedLoadIdsRef.current.add(load.id)
      const fromId = load.pathUnitIds[0]
      const toId = load.pathUnitIds[load.pathUnitIds.length - 1]
      const fromName = fromId ? (unitMap.get(fromId)?.name ?? fromId) : '-'
      const toName = toId ? (unitMap.get(toId)?.name ?? toId) : '-'
      const dir = load.direction === 'inbound' ? '투입' : '출고'
      void logApplication({
        title: 'Path Simulation: Transfer',
        comment: `[${load.label}] ${fromName} → ${toName} · ${dir} ${load.pathUnitIds.length}구간`,
        lineId: line.id,
      })
    }
  }, [simulation.loads, simulation.status, line, logApplication])

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

  const lineComm = useLineCommStatus(line)
  const isLineV3Connected = lineComm?.state === 'online'
  const allCvRunning = useMemo(() => areAllCvUnitsRunning(line), [line])
  const allPortsRunning = useMemo(() => areAllPortsRunning(line), [line])
  const nonRunningPortLabels = useMemo(
    () => listNonRunningPorts(line).map((unit) => unitTitle(unit)),
    [line],
  )
  const nonRunningCvLabels = useMemo(
    () =>
      line.units
        .filter((unit) => isCvUnit(unit) && unit.status !== 'running')
        .map((unit) => unitTitle(unit)),
    [line],
  )
  const [scale, setScale] = useState(initialTransform.scale)
  const [is25DView, setIs25DView] = useState(false)
  const [simMode, setSimMode] = useState<'conveyor' | 'oht'>('conveyor')
  const oht = useOhtSimulation(line)
  const ohtMode = simMode === 'oht'
  const [ohtPoodleMode, setOhtPoodleMode] = useState(false)
  const [calloutPanLock, setCalloutPanLock] = useState(false)
  const [calloutDeselectToken, setCalloutDeselectToken] = useState(0)
  const [simBlockPopupOpen, setSimBlockPopupOpen] = useState(false)
  const [runConfirmPopupOpen, setRunConfirmPopupOpen] = useState(false)
  const [portConfirmPopupOpen, setPortConfirmPopupOpen] = useState(false)
  const pendingStartModeRef = useRef<'normal' | 'continuous' | null>(null)
  const preserveStatusOnStartRef = useRef(false)
  const portConfirmRequestedRef = useRef(false)
  const viewStateRef = useRef(initialTransform)

  const logButton = (comment: string) => {
    void logApplication({
      title: 'Button Click',
      comment: `Monitor: ${comment}`,
      lineId: line.id,
    })
  }

  const startPendingSimulation = useCallback(
    (
      startMode: 'normal' | 'continuous',
      options?: PathSimulationStartOptions,
    ) => {
      if (startMode === 'continuous') {
        simulation.startContinuous(options)
        logButton(
          options?.preserveUnitStatus
            ? 'Path Simulation Continuous Input Start (As-Is Status)'
            : 'Path Simulation Continuous Input Start',
        )
      } else {
        simulation.start(options)
        logButton(
          options?.preserveUnitStatus
            ? 'Path Simulation Start (As-Is Status)'
            : 'Path Simulation Start',
        )
      }
    },
    [logButton, simulation],
  )

  useEffect(() => {
    const pendingMode = pendingStartModeRef.current
    if (!pendingMode || !allCvRunning) return

    if (!allPortsRunning) {
      if (!portConfirmRequestedRef.current) {
        portConfirmRequestedRef.current = true
        setPortConfirmPopupOpen(true)
      }
      return
    }

    const preserveStatus = preserveStatusOnStartRef.current
    portConfirmRequestedRef.current = false
    pendingStartModeRef.current = null
    preserveStatusOnStartRef.current = false
    startPendingSimulation(pendingMode, { preserveUnitStatus: preserveStatus })
  }, [allCvRunning, allPortsRunning, startPendingSimulation])

  const requestSimulationStart = useCallback(
    (startMode: 'normal' | 'continuous') => {
      if (isLineV3Connected) {
        setSimBlockPopupOpen(true)
        return
      }

      pendingStartModeRef.current = startMode
      portConfirmRequestedRef.current = false

      if (!allCvRunning) {
        setRunConfirmPopupOpen(true)
        return
      }
      if (!allPortsRunning) {
        portConfirmRequestedRef.current = true
        setPortConfirmPopupOpen(true)
        return
      }

      pendingStartModeRef.current = null
      startPendingSimulation(startMode)
    },
    [
      allCvRunning,
      allPortsRunning,
      isLineV3Connected,
      startPendingSimulation,
    ],
  )

  const handleSimulationStart = useCallback(() => {
    requestSimulationStart('normal')
  }, [requestSimulationStart])

  const handleSimulationStartContinuous = useCallback(() => {
    requestSimulationStart('continuous')
  }, [requestSimulationStart])

  const dismissRunConfirmPopup = useCallback(() => {
    setRunConfirmPopupOpen(false)
    pendingStartModeRef.current = null
    portConfirmRequestedRef.current = false
    preserveStatusOnStartRef.current = false
  }, [])

  const handleConfirmRunAllAndStart = useCallback(async () => {
    setRunConfirmPopupOpen(false)
    preserveStatusOnStartRef.current = false
    if (!pendingStartModeRef.current) {
      pendingStartModeRef.current = 'normal'
    }
    await saveLine(lineWithAllCvUnitsRunning(line))
  }, [line, saveLine])

  const handleProceedAsIsAndStart = useCallback(() => {
    setRunConfirmPopupOpen(false)
    preserveStatusOnStartRef.current = true
    const startMode = pendingStartModeRef.current ?? 'normal'

    if (!allPortsRunning) {
      pendingStartModeRef.current = startMode
      portConfirmRequestedRef.current = true
      setPortConfirmPopupOpen(true)
      return
    }

    pendingStartModeRef.current = null
    preserveStatusOnStartRef.current = false
    startPendingSimulation(startMode, { preserveUnitStatus: true })
  }, [allPortsRunning, startPendingSimulation])

  const dismissPortConfirmPopup = useCallback(() => {
    setPortConfirmPopupOpen(false)
    pendingStartModeRef.current = null
    portConfirmRequestedRef.current = false
    preserveStatusOnStartRef.current = false
  }, [])

  const handleConfirmPortRunAllAndStart = useCallback(async () => {
    setPortConfirmPopupOpen(false)
    preserveStatusOnStartRef.current = false
    if (!pendingStartModeRef.current) {
      pendingStartModeRef.current = 'normal'
    }
    await saveLine(lineWithAllPortsRunning(line))
  }, [line, saveLine])

  const handleProceedPortAsIsAndStart = useCallback(() => {
    setPortConfirmPopupOpen(false)
    const startMode = pendingStartModeRef.current ?? 'normal'
    pendingStartModeRef.current = null
    portConfirmRequestedRef.current = false
    preserveStatusOnStartRef.current = false
    startPendingSimulation(startMode, { preserveUnitStatus: true })
  }, [startPendingSimulation])

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
        excluded: [FLOW_CALLOUT_PANEL_CLASS, FLOW_UNIT_PEEK_HIT_CLASS],
      },
    }),
    [calloutPanLock],
  )

  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900 ${
        touchLayout ? 'overflow-visible' : 'overflow-hidden'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 sm:px-4">
        <p className="text-sm text-slate-400">
          {line.name} · {viewport.cols}×{viewport.rows}
        </p>
        <div className="flex gap-1 rounded-md border border-slate-700 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => {
              setSimMode('conveyor')
              logButton('Sim Mode: Conveyor')
            }}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              !ohtMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            컨베이어 모드
          </button>
          <button
            type="button"
            onClick={() => {
              setSimMode('oht')
              logButton('Sim Mode: OHT')
            }}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              ohtMode ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            OHT 모드
          </button>
        </div>
      </div>

      {ohtMode ? (
        <OhtSimulationBar
          status={oht.status}
          railCount={oht.graph.nodes.size}
          vehicleCount={line.ohtUnits?.length ?? 0}
          targetCount={oht.targets.length}
          canSimulate={oht.canSimulate}
          onStart={() => {
            oht.start()
            logButton('OHT Simulation Start')
          }}
          onPause={() => {
            oht.pause()
            logButton('OHT Simulation Pause')
          }}
          onResume={() => {
            oht.resume()
            logButton('OHT Simulation Resume')
          }}
          onReset={() => {
            oht.reset()
            logButton('OHT Simulation Reset')
          }}
          poodleMode={ohtPoodleMode}
          onPoodleModeToggle={() => setOhtPoodleMode((v) => !v)}
        />
      ) : null}

      {touchLayout ? (
        <>
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
              wrapperClass={`!h-[min(520px,55vh)] !w-full overflow-visible ${
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
                simulationLoads={simulation.simulationFlowOverlayLoads}
                simulationCalloutLoads={
                  simulation.status !== 'idle' && simulation.status !== 'complete'
                    ? simulation.loads
                    : undefined
                }
                simulationInputIntervalSec={simulation.inputIntervalSec}
                simulationTransitIntervalSec={simulation.transitIntervalSec}
                simulationDischargeIntervalSec={simulation.dischargeIntervalSec}
                simulationPathUnitIds={simulation.pathUnitIds}
                continuousInputActive={simulation.continuousInputActive}
                continuousGatherProbes={simulation.continuousGatherProbes}
                continuousGatherAnimating={simulation.continuousGatherAnimating}
                continuousGatherOverlayActive={simulation.continuousGatherOverlayActive}
                continuousInputIntervalSec={simulation.continuousInputIntervalSec}
                warehouseFillCounts={simulation.warehouseFillCounts}
                onCalloutPanLockChange={setCalloutPanLock}
                calloutDeselectToken={calloutDeselectToken}
                simDestinationByUnitId={simulation.simDestinationByUnitId}
                is25DView={is25DView}
                showOhtRails={ohtMode}
                ohtVehicles={ohtMode ? oht.vehicles : []}
                ohtGraph={oht.graph}
                ohtSimActive={ohtMode && oht.status === 'playing'}
                ohtStepMs={oht.stepMs}
                ohtPoodleMode={ohtPoodleMode}
                className="select-none"
              />
            </TransformComponent>
          </TransformWrapper>

          {!ohtMode && (
          <>
          <PathSimulationBar
            unitCount={line.units.length}
            mode={simulation.mode}
            onModeChange={simulation.changeMode}
            conveyorOnlyLine={simulation.conveyorOnlyLine}
            sources={simulation.sources}
            selectedSourceUnitIds={simulation.selectedSourceUnitIds}
            onToggleSource={simulation.toggleSourceUnitId}
            inboundDestinationsByEntryId={simulation.inboundDestinationsByEntryId}
            inboundDestinationByEntryId={simulation.inboundDestinationByEntryId}
            onSetInboundDestination={simulation.setInboundDestinationForEntry}
            plan={simulation.plan}
            status={simulation.status}
            progressLabel={simulation.progressLabel}
            progressDetail={simulation.progressDetail}
            canSimulate={simulation.canSimulate}
            testMaterialCount={simulation.testMaterialUnits.length}
            inputIntervalSec={simulation.inputIntervalSec}
            dischargeIntervalSec={simulation.dischargeIntervalSec}
            transitIntervalSec={simulation.transitIntervalSec}
            onInputIntervalSecChange={simulation.setInputIntervalSec}
            onDischargeIntervalSecChange={simulation.setDischargeIntervalSec}
            onTransitIntervalSecChange={simulation.setTransitIntervalSec}
            turn90Sec={simulation.turn90Sec}
            turn180Sec={simulation.turn180Sec}
            turn270Sec={simulation.turn270Sec}
            onTurn90SecChange={simulation.setTurn90Sec}
            onTurn180SecChange={simulation.setTurn180Sec}
            onTurn270SecChange={simulation.setTurn270Sec}
            tackTimeSummaries={simulation.tackTimeSummaries}
            continuousInputActive={simulation.continuousInputActive}
            mapControlSummary={`${is25DView ? '3D' : '2D'} · ${hideModuleNames ? '이름 숨김' : '이름 표시'}`}
            mapControls={
              <MonitorMapControls
                is25DView={is25DView}
                hideModuleNames={hideModuleNames}
                onToggle25DView={() => {
                  setIs25DView((current) => !current)
                  logButton(is25DView ? 'Switch 2D View' : 'Switch 3D View')
                }}
                onToggleHideModuleNames={() => {
                  toggleHideModuleNames()
                  logButton(hideModuleNames ? 'Show Module Names' : 'Hide Module Names')
                }}
                onZoomOut={() => {
                  transformRef.current?.zoomOut(0.35, 280, 'easeOut')
                  logButton('Zoom Out')
                }}
                onZoomIn={() => {
                  transformRef.current?.zoomIn(0.35, 280, 'easeOut')
                  logButton('Zoom In')
                }}
                onLineFit={() => {
                  applyLineFocus(320)
                  logButton('Line Fit')
                }}
                onFullMap={() => {
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
              />
            }
          />

          <PathSimulationPlaybackControls
            plan={simulation.plan}
            status={simulation.status}
            mode={simulation.mode}
            canSimulate={simulation.canSimulate}
            continuousInputActive={simulation.continuousInputActive}
            onStart={handleSimulationStart}
            onStartContinuous={handleSimulationStartContinuous}
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
              if (isLineV3Connected) {
                setSimBlockPopupOpen(true)
                return
              }
              simulation.stepForward()
              logButton('Path Simulation Step')
            }}
          />
          </>
          )}
        </>
      ) : (
        <>
      {!ohtMode && (
      <>
      <PathSimulationBar
        unitCount={line.units.length}
        mode={simulation.mode}
        onModeChange={simulation.changeMode}
        conveyorOnlyLine={simulation.conveyorOnlyLine}
        sources={simulation.sources}
        selectedSourceUnitIds={simulation.selectedSourceUnitIds}
        onToggleSource={simulation.toggleSourceUnitId}
        inboundDestinationsByEntryId={simulation.inboundDestinationsByEntryId}
        inboundDestinationByEntryId={simulation.inboundDestinationByEntryId}
        onSetInboundDestination={simulation.setInboundDestinationForEntry}
        plan={simulation.plan}
        status={simulation.status}
        progressLabel={simulation.progressLabel}
        progressDetail={simulation.progressDetail}
        canSimulate={simulation.canSimulate}
        testMaterialCount={simulation.testMaterialUnits.length}
        inputIntervalSec={simulation.inputIntervalSec}
        dischargeIntervalSec={simulation.dischargeIntervalSec}
        transitIntervalSec={simulation.transitIntervalSec}
        onInputIntervalSecChange={simulation.setInputIntervalSec}
        onDischargeIntervalSecChange={simulation.setDischargeIntervalSec}
        onTransitIntervalSecChange={simulation.setTransitIntervalSec}
        turn90Sec={simulation.turn90Sec}
        turn180Sec={simulation.turn180Sec}
        turn270Sec={simulation.turn270Sec}
        onTurn90SecChange={simulation.setTurn90Sec}
        onTurn180SecChange={simulation.setTurn180Sec}
        onTurn270SecChange={simulation.setTurn270Sec}
        tackTimeSummaries={simulation.tackTimeSummaries}
        continuousInputActive={simulation.continuousInputActive}
        mapControlSummary={`${is25DView ? '3D' : '2D'} · ${hideModuleNames ? '이름 숨김' : '이름 표시'}`}
        mapControls={
          <MonitorMapControls
            is25DView={is25DView}
            hideModuleNames={hideModuleNames}
            onToggle25DView={() => {
              setIs25DView((current) => !current)
              logButton(is25DView ? 'Switch 2D View' : 'Switch 3D View')
            }}
            onToggleHideModuleNames={() => {
              toggleHideModuleNames()
              logButton(hideModuleNames ? 'Show Module Names' : 'Hide Module Names')
            }}
            onZoomOut={() => {
              transformRef.current?.zoomOut(0.35, 280, 'easeOut')
              logButton('Zoom Out')
            }}
            onZoomIn={() => {
              transformRef.current?.zoomIn(0.35, 280, 'easeOut')
              logButton('Zoom In')
            }}
            onLineFit={() => {
              applyLineFocus(320)
              logButton('Line Fit')
            }}
            onFullMap={() => {
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
          />
        }
      />

      <PathSimulationPlaybackControls
        plan={simulation.plan}
        status={simulation.status}
        mode={simulation.mode}
        canSimulate={simulation.canSimulate}
        continuousInputActive={simulation.continuousInputActive}
        onStart={handleSimulationStart}
        onStartContinuous={handleSimulationStartContinuous}
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
          if (isLineV3Connected) {
            setSimBlockPopupOpen(true)
            return
          }
          simulation.stepForward()
          logButton('Path Simulation Step')
        }}
      />
      </>
      )}

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
            simulationLoads={simulation.simulationFlowOverlayLoads}
            simulationCalloutLoads={
              simulation.status !== 'idle' && simulation.status !== 'complete'
                ? simulation.loads
                : undefined
            }
            simulationInputIntervalSec={simulation.inputIntervalSec}
            simulationTransitIntervalSec={simulation.transitIntervalSec}
            simulationDischargeIntervalSec={simulation.dischargeIntervalSec}
            simulationPathUnitIds={simulation.pathUnitIds}
            continuousInputActive={simulation.continuousInputActive}
            continuousGatherProbes={simulation.continuousGatherProbes}
            continuousGatherAnimating={simulation.continuousGatherAnimating}
            continuousGatherOverlayActive={simulation.continuousGatherOverlayActive}
            continuousInputIntervalSec={simulation.continuousInputIntervalSec}
            warehouseFillCounts={simulation.warehouseFillCounts}
            onCalloutPanLockChange={setCalloutPanLock}
            calloutDeselectToken={calloutDeselectToken}
            simDestinationByUnitId={simulation.simDestinationByUnitId}
            is25DView={is25DView}
            showOhtRails={ohtMode}
            ohtVehicles={ohtMode ? oht.vehicles : []}
            ohtGraph={oht.graph}
            ohtSimActive={ohtMode && oht.status === 'playing'}
            ohtStepMs={oht.stepMs}
            ohtPoodleMode={ohtPoodleMode}
            className="select-none"
          />
        </TransformComponent>
      </TransformWrapper>
        </>
      )}

      <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        마우스 휠: 줌 · 드래그: 맵 이동 · 정보 표: 클릭 선택 후 드래그로 위치 고정 · 경로 시뮬레이션: 투입(IN) 또는 출고(OUT) 다중 동시 출발
      </p>

      {runConfirmPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={dismissRunConfirmPopup}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-cyan-500/50 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-cyan-300">가동 상태 전환</p>
            <p className="mb-3 text-sm leading-relaxed text-slate-300">
              경로 시뮬레이션은 모든 컨베이어 모듈이 가동 상태일 때 바로 시작할 수 있습니다.
              <br />
              전체 모듈을 가동으로 전환하거나, 현재 상태 그대로 오류·비가동 우회 경로를
              관찰할 수 있습니다.
            </p>
            {nonRunningCvLabels.length > 0 ? (
              <p className="mb-5 text-xs leading-relaxed text-slate-400">
                비가동·오류·점검: {nonRunningCvLabels.join(', ')}
              </p>
            ) : (
              <p className="mb-5 text-sm text-slate-400">비가동 컨베이어가 있습니다.</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={dismissRunConfirmPopup}
                className="app-btn app-btn-secondary app-btn-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleProceedAsIsAndStart}
                className="app-btn app-btn-secondary app-btn-sm border-amber-500/50 text-amber-200 hover:bg-amber-500/10"
              >
                그대로 진행하기
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRunAllAndStart()}
                className="app-btn app-btn-primary app-btn-sm"
              >
                전환 후 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {portConfirmPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={dismissPortConfirmPopup}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-violet-500/50 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-violet-300">포트 가동 상태 전환</p>
            <p className="mb-3 text-sm leading-relaxed text-slate-300">
              포트는 가동 상태일 때만 STK 투입·출고가 가능합니다.
              <br />
              가동하지 않은 포트가 있어 시뮬레이션을 시작할 수 없습니다.
            </p>
            {nonRunningPortLabels.length > 0 ? (
              <p className="mb-5 text-xs leading-relaxed text-slate-400">
                비가동: {nonRunningPortLabels.join(', ')}
              </p>
            ) : (
              <p className="mb-5 text-sm text-slate-400">비가동 포트가 있습니다.</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={dismissPortConfirmPopup}
                className="app-btn app-btn-secondary app-btn-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleProceedPortAsIsAndStart}
                className="app-btn app-btn-secondary app-btn-sm border-amber-500/50 text-amber-200 hover:bg-amber-500/10"
              >
                그대로 진행하기
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPortRunAllAndStart()}
                className="app-btn app-btn-primary app-btn-sm"
              >
                전환 후 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {simulation.inboundLineFullNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => simulation.dismissInboundLineFullNotice()}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-cyan-500/60 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-cyan-300">라인 만재</p>
            <p className="mb-5 text-sm leading-relaxed text-slate-300">
              STK 적재가 만료된 상태에서 포트·컨베이어 경로에 자재가 모두 올라갔습니다.
              <br />
              추가 연속 투입이 중지되었습니다. 라인에 쌓인 자재는 시뮬레이션에서 계속
              표시됩니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => simulation.dismissInboundLineFullNotice()}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {simulation.warehouseFullNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => simulation.dismissWarehouseFullNotice()}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-amber-500/60 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-amber-400">적재창고 만재</p>
            <p className="mb-5 text-sm leading-relaxed text-slate-300">
              STK가 48칸 만재 상태입니다. 자재는 STK에 입고되지 않고, 포트·컨베이어
              경로에 쌓입니다.
              <br />
              경로가 가득 차면「라인 만재」로 연속 투입이 중지됩니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => simulation.dismissWarehouseFullNotice()}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

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
