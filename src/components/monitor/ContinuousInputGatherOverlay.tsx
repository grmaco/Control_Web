import { useEffect, useRef, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { PATH_SIMULATION_STEP_MS } from '../../types/unitProperties'
import type { GatherProbeState } from '../../utils/continuousInputGather'
import { cloneGatherProbes, gatherProbeVisualsSmooth } from '../../utils/continuousInputGather'

interface ContinuousInputGatherOverlayProps {
  active: boolean
  animating?: boolean
  probes: GatherProbeState[]
  line: ConveyorLine
  cellSize: number
  minX: number
  minY: number
  gridWidth: number
  gridHeight: number
  inputIntervalSec: number
}

export function ContinuousInputGatherOverlay({
  active,
  animating = false,
  probes,
  line,
  cellSize,
  minX,
  minY,
  gridWidth,
  gridHeight,
  inputIntervalSec,
}: ContinuousInputGatherOverlayProps) {
  const tickKey = probes
    .map(
      (p) =>
        `${p.entryUnitId}:${p.probeSlot}:${p.phase}:${p.phaseElapsedMs}:${p.carrying}:${p.awaitingEntryClear}`,
    )
    .join('|')
  const tickKeyRef = useRef(tickKey)
  const lastSyncAtRef = useRef(performance.now())
  /** 틱 시작 시점 프로브 — RAF는 여기서 tickProgress만큼만 전진 */
  const animBaseProbesRef = useRef<GatherProbeState[]>(probes)
  const lastProbesRef = useRef<GatherProbeState[]>(probes)
  const [, setFrame] = useState(0)

  if (tickKey !== tickKeyRef.current) {
    tickKeyRef.current = tickKey
    animBaseProbesRef.current = cloneGatherProbes(lastProbesRef.current)
    lastSyncAtRef.current = performance.now()
  }
  lastProbesRef.current = cloneGatherProbes(probes)

  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      setFrame((value) => value + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])

  if (!active || probes.length === 0) return null

  const tickProgressMs = animating
    ? Math.min(
        PATH_SIMULATION_STEP_MS,
        Math.max(0, performance.now() - lastSyncAtRef.current),
      )
    : 0

  const visuals = gatherProbeVisualsSmooth(
    animating ? animBaseProbesRef.current : probes,
    probes,
    line,
    cellSize,
    minX,
    minY,
    inputIntervalSec,
    tickProgressMs,
  )

  const visualsByEntry = new Map<string, typeof visuals>()
  for (const visual of visuals) {
    const group = visualsByEntry.get(visual.entryUnitId) ?? []
    group.push(visual)
    visualsByEntry.set(visual.entryUnitId, group)
  }

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-[20] overflow-visible"
      width={gridWidth}
      height={gridHeight}
      aria-hidden
    >
      <defs>
        <radialGradient id="gather-mineral-field" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.5" />
          <stop offset="45%" stopColor="#0ea5e9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id="gather-crystal-face" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="40%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="gather-crystal-face-alt" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>
        <filter id="gather-mineral-glow-filter" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gather-mining-flash-filter" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="gather-carried-mineral" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </radialGradient>
        <radialGradient id="gather-probe-body" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="32%" stopColor="#2dd4bf" />
          <stop offset="68%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#115e59" />
        </radialGradient>
        <radialGradient id="gather-probe-dome" cx="45%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="40%" stopColor="#5eead4" />
          <stop offset="75%" stopColor="#0891b2" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id="gather-probe-thruster" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </radialGradient>
        <filter id="gather-probe-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
          <feFlood floodColor="#34d399" floodOpacity="0.42" result="glowGreen" />
          <feComposite in="glowGreen" in2="blur" operator="in" result="softGreenGlow" />
          <feFlood floodColor="#38bdf8" floodOpacity="0.28" result="glowBlue" />
          <feComposite in="glowBlue" in2="blur" operator="in" result="softBlueGlow" />
          <feMerge>
            <feMergeNode in="softGreenGlow" />
            <feMergeNode in="softBlueGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from(visualsByEntry.entries()).map(([entryUnitId, entryVisuals]) => {
        const anchor = entryVisuals[0]!
        const mining = entryVisuals.some((visual) => visual.phase === 'mining')
        return (
          <g key={entryUnitId}>
            <MineralField x={anchor.mineralX} y={anchor.mineralY} mining={mining} />
            {entryVisuals.map((visual) => (
              <g key={`${visual.entryUnitId}:${visual.probeSlot}`}>
                {visual.carriedMineralX != null && visual.carriedMineralY != null ? (
                  <CarriedMineral x={visual.carriedMineralX} y={visual.carriedMineralY} />
                ) : null}
                <ProbeUnit
                  x={visual.probeX}
                  y={visual.probeY}
                  returning={visual.phase === 'toMineral'}
                  depositing={visual.phase === 'depositing'}
                />
              </g>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

function MiningEffect() {
  const sparks: Array<{ x: number; y: number; len: number; angle: number; delay: number }> = [
    { x: -2, y: -4, len: 7, angle: -72, delay: 0 },
    { x: -2, y: -4, len: 6.5, angle: -28, delay: 0.08 },
    { x: -2, y: -4, len: 8, angle: 18, delay: 0.16 },
    { x: -2, y: -4, len: 6, angle: 58, delay: 0.24 },
    { x: -2, y: -4, len: 7.5, angle: 112, delay: 0.12 },
    { x: -2, y: -4, len: 6.8, angle: 152, delay: 0.2 },
    { x: -2, y: -4, len: 5.5, angle: -135, delay: 0.28 },
    { x: -2, y: -4, len: 5.8, angle: -98, delay: 0.04 },
  ]

  return (
    <g filter="url(#gather-mining-flash-filter)">
      {[0, 1, 2].map((ring) => (
        <circle
          key={ring}
          cx="-2"
          cy="-4"
          r="3"
          fill="none"
          stroke="#fde68a"
          strokeWidth="1.4"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="2;16"
            dur="0.65s"
            begin={`${ring * 0.22}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.95;0"
            dur="0.65s"
            begin={`${ring * 0.22}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-width"
            values="2;0.4"
            dur="0.65s"
            begin={`${ring * 0.22}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {sparks.map((spark, index) => (
        <line
          key={index}
          x1={spark.x}
          y1={spark.y}
          x2={spark.x + Math.cos((spark.angle * Math.PI) / 180) * spark.len}
          y2={spark.y + Math.sin((spark.angle * Math.PI) / 180) * spark.len}
          stroke={index % 2 === 0 ? '#fef08a' : '#7dd3fc'}
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="0.42s"
            begin={`${spark.delay}s`}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -2.5"
            dur="0.42s"
            begin={`${spark.delay}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}

      {[
        { cx: -8, cy: 0, dx: -2, dy: -5, delay: 0 },
        { cx: 3, cy: -7, dx: 0, dy: -6, delay: 0.14 },
        { cx: 8, cy: -1, dx: 2, dy: -4.5, delay: 0.26 },
      ].map((chip, index) => (
        <circle key={index} cx={chip.cx} cy={chip.cy} r="0.9" fill="#fef08a" opacity="0">
          <animate
            attributeName="opacity"
            values="0;0.95;0"
            dur="0.5s"
            begin={`${chip.delay}s`}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`0 0;${chip.dx} ${chip.dy}`}
            dur="0.5s"
            begin={`${chip.delay}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </g>
  )
}

function MineralField({
  x,
  y,
  mining,
}: {
  x: number
  y: number
  mining: boolean
}) {
  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#gather-mineral-glow-filter)">
      <ellipse cx="0" cy="5" rx="18" ry="7" fill="url(#gather-mineral-field)" />
      <ellipse cx="0" cy="6" rx="14" ry="4.5" fill="#0c4a6e" opacity="0.45" />

      <MineralCrystal x={-9} y={2} scale={1.05} flip />
      <MineralCrystal x={-2} y={-4} scale={1.28} />
      <MineralCrystal x={7} y={0} scale={1.15} flip />
      <MineralCrystal x={-5} y={5} scale={0.88} />
      <MineralCrystal x={4} y={4} scale={0.95} flip />
      <MineralCrystal x={11} y={3} scale={0.78} />

      <circle cx="-7" cy="-2" r="1.2" fill="#e0f2fe" opacity="0.7">
        <animate attributeName="opacity" values="0.35;0.9;0.35" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="5" cy="-5" r="1" fill="#bae6fd" opacity="0.65">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.9s" repeatCount="indefinite" />
      </circle>
      <circle cx="9" cy="1" r="0.9" fill="#7dd3fc" opacity="0.6">
        <animate attributeName="opacity" values="0.25;0.85;0.25" dur="2.1s" repeatCount="indefinite" />
      </circle>

      {mining ? <MiningEffect /> : null}
    </g>
  )
}

function MineralCrystal({
  x,
  y,
  scale,
  flip = false,
}: {
  x: number
  y: number
  scale: number
  flip?: boolean
}) {
  const sx = flip ? -scale : scale
  return (
    <g transform={`translate(${x}, ${y}) scale(${sx}, ${scale})`}>
      <polygon
        points="0,-8 5.5,0 3.5,7 -3.5,7 -5.5,0"
        fill="url(#gather-crystal-face)"
        stroke="#bae6fd"
        strokeWidth="0.65"
      />
      <polygon points="0,-5.5 2.5,-0.5 0.5,3.5 -2,2.5" fill="url(#gather-crystal-face-alt)" opacity="0.75" />
      <line x1="0" y1="-8" x2="0" y2="7" stroke="#e0f2fe" strokeWidth="0.35" opacity="0.5" />
    </g>
  )
}

function CarriedMineral({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <ellipse cx="0" cy="2.5" rx="4.2" ry="1.6" fill="#020617" opacity="0.28" />
      <polygon
        points="0,-5.5 5.5,-0.5 3.5,4.5 -3.5,4.5 -5.5,-0.5"
        fill="url(#gather-carried-mineral)"
        stroke="#bae6fd"
        strokeWidth="0.7"
      />
      <polygon points="0,-3.5 2.2,-1.2 0.2,1.5 -2,0.8" fill="#ecfeff" opacity="0.65" />
    </g>
  )
}

function ProbeEyes({ returning }: { returning: boolean }) {
  const eyes: Array<[number, number]> = [
    [0, -1.78],
    [-1.05, -1.22],
    [1.05, -1.22],
  ]
  const iris = returning ? '#6ee7b7' : '#38bdf8'

  return (
    <g>
      <ellipse cx="0" cy="-1.42" rx="3.1" ry="1.35" fill="#134e4a" opacity="0.38" />
      {eyes.map(([ex, ey]) => (
        <g key={`${ex}-${ey}`}>
          <circle cx={ex} cy={ey} r="0.34" fill="#1e3a5f" opacity="0.6" />
          <circle cx={ex} cy={ey} r="0.24" fill={iris} opacity="0.98">
            {returning ? (
              <animate attributeName="opacity" values="0.55;1;0.55" dur="0.9s" repeatCount="indefinite" />
            ) : null}
          </circle>
          <circle cx={ex - 0.06} cy={ey - 0.06} r="0.08" fill="#e0f2fe" opacity="0.85" />
        </g>
      ))}
    </g>
  )
}

function ProbeStrut({ side }: { side: 'left' | 'right' }) {
  const mirror = side === 'left' ? 1 : -1
  return (
    <g transform={`scale(${-mirror}, 1)`}>
      <path
        d="M 5.6 1.4 L 8.4 3.8 L 7.6 4.35 L 6.2 2.6 L 5.2 3.5"
        fill="none"
        stroke="#5eead4"
        strokeWidth="1.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 5.6 1.4 L 6.5 3.9"
        fill="none"
        stroke="#0d9488"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      <circle cx="8.4" cy="3.8" r="0.45" fill="#67e8f9" stroke="#0e7490" strokeWidth="0.35" />
    </g>
  )
}

function ProbeUnit({
  x,
  y,
  returning,
  depositing,
}: {
  x: number
  y: number
  returning: boolean
  depositing: boolean
}) {
  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#gather-probe-glow)">
      <ellipse cx="0" cy="4.3" rx="6.2" ry="2" fill="#020617" opacity="0.3" />
      <ellipse cx="0" cy="2.75" rx="5.2" ry="1.75" fill="url(#gather-probe-thruster)" opacity={depositing ? 0.92 : 0.68}>
        {depositing ? (
          <animate attributeName="opacity" values="0.55;1;0.55" dur="0.55s" repeatCount="indefinite" />
        ) : null}
      </ellipse>

      <ProbeStrut side="left" />
      <ProbeStrut side="right" />

      <ellipse cx="-5.9" cy="0.35" rx="1.55" ry="2.15" fill="url(#gather-probe-body)" stroke="#0f766e" strokeWidth="0.55" />
      <ellipse cx="5.9" cy="0.35" rx="1.55" ry="2.15" fill="url(#gather-probe-body)" stroke="#0f766e" strokeWidth="0.55" />

      <ellipse cx="0" cy="-0.15" rx="6.5" ry="3.55" fill="url(#gather-probe-body)" stroke="#0f766e" strokeWidth="0.85" />
      <ellipse cx="0" cy="-1.35" rx="4.35" ry="2.05" fill="url(#gather-probe-dome)" stroke="#0891b2" strokeWidth="0.45" />

      <line x1="0" y1="-3.15" x2="0" y2="-4.55" stroke="#2dd4bf" strokeWidth="0.85" strokeLinecap="round" />
      <circle cx="0" cy="-4.65" r="0.5" fill="#38bdf8" opacity="0.95" />

      <ProbeEyes returning={returning} />

      <ellipse cx="1.1" cy="0.35" rx="2.4" ry="1.35" fill="#ecfdf5" opacity="0.18" />
    </g>
  )
}
