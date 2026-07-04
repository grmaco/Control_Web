import type { ConveyorStatus } from '../../types/conveyor'

/**
 * 적재 창고(STK) 셀 배경 SVG — 3×3 셀 전체를 덮습니다.
 * 창고 내부 랙(rack) 레이아웃 + SF 산업용 디자인
 */

const COLORS = {
  idle: {
    base: '#07100c', floor: '#0a1a13', rack: '#0d2418', rackBorder: '#1a3d28',
    shelf: '#234d34', shelfHi: '#2e6444', pillar: '#1a3428', pillarHi: '#2a4a38',
    aisle: '#0f1f18', aisleMarking: '#1a3428', status: '#2e6444', statusOp: 0.5,
    glow: 'none', glowOp: 0,
  },
  running: {
    base: '#011a0c', floor: '#021f0f', rack: '#032e18', rackBorder: '#065f35',
    shelf: '#065f35', shelfHi: '#10b981', pillar: '#042918', pillarHi: '#0a4d28',
    aisle: '#021a0d', aisleMarking: '#065f35', status: '#10b981', statusOp: 0.9,
    glow: '#10b981', glowOp: 0.55,
  },
  error: {
    base: '#1a0505', floor: '#200808', rack: '#2d0d0d', rackBorder: '#7f1d1d',
    shelf: '#7f1d1d', shelfHi: '#ef4444', pillar: '#280a0a', pillarHi: '#4d1414',
    aisle: '#1a0606', aisleMarking: '#7f1d1d', status: '#ef4444', statusOp: 0.9,
    glow: '#ef4444', glowOp: 0.65,
  },
  maintenance: {
    base: '#140d00', floor: '#1a1000', rack: '#2a1a00', rackBorder: '#78350f',
    shelf: '#78350f', shelfHi: '#fbbf24', pillar: '#221500', pillarHi: '#4d2d08',
    aisle: '#140e00', aisleMarking: '#6b3a0c', status: '#fbbf24', statusOp: 0.8,
    glow: '#f59e0b', glowOp: 0.5,
  },
}

interface StorageConveyorCellProps {
  width: number
  height: number
  status: ConveyorStatus
  uid: string
  /** 연속 투입 적재 슬롯 (0–48) */
  filledSlotCount?: number
}

export function StorageConveyorCell({
  width,
  height,
  status,
  uid,
  filledSlotCount = 0,
}: StorageConveyorCellProps) {
  const cfg = COLORS[status]
  const W = 300
  const H = 300

  // ── 레이아웃 치수 ──────────────────────────────────────────
  const PILLAR = 16      // 기둥 두께
  const INNER_L = PILLAR
  const INNER_R = W - PILLAR
  const INNER_T = PILLAR
  const INNER_B = H - PILLAR

  const INNER_W = INNER_R - INNER_L
  const INNER_H = INNER_B - INNER_T

  // 중앙 통로 (가로)
  const AISLE_H = 38
  const AISLE_T = INNER_T + (INNER_H - AISLE_H) / 2
  const AISLE_B = AISLE_T + AISLE_H

  // 상단 랙 영역
  const RACK_TOP_T = INNER_T + 4
  const RACK_TOP_B = AISLE_T - 4
  // 하단 랙 영역
  const RACK_BOT_T = AISLE_B + 4
  const RACK_BOT_B = INNER_B - 4

  // 랙 개수 (가로 4개씩)
  const N_RACKS = 4
  const RACK_GAP = 6
  const RACK_W = (INNER_W - RACK_GAP * (N_RACKS + 1)) / N_RACKS
  const N_SHELVES = 3   // 각 랙 내 선반 줄

  const filterId = `stf-${uid}`
  const slotFill = Math.max(0, Math.min(48, filledSlotCount))
  const SLOT_COLS = 8
  const SLOT_ROWS = 6
  const slotPadX = INNER_L + 10
  const slotPadY = INNER_T + 8
  const slotAreaW = INNER_W - 20
  const slotAreaH = INNER_H - 16
  const slotW = (slotAreaW - (SLOT_COLS - 1) * 3) / SLOT_COLS
  const slotH = (slotAreaH - (SLOT_ROWS - 1) * 3) / SLOT_ROWS

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      aria-hidden
    >
      <defs>
        {cfg.glowOp > 0 && (
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feFlood floodColor={cfg.glow} floodOpacity={cfg.glowOp} result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* ── 기본 바닥 ── */}
      <rect width={W} height={H} fill={cfg.base} />
      <rect x={INNER_L} y={INNER_T} width={INNER_W} height={INNER_H} fill={cfg.floor} />

      {/* ── 중앙 통로 ── */}
      <rect x={INNER_L} y={AISLE_T} width={INNER_W} height={AISLE_H} fill={cfg.aisle} />
      {/* 통로 중앙선 (점선) */}
      <line
        x1={INNER_L + 8} y1={(AISLE_T + AISLE_B) / 2}
        x2={INNER_R - 8} y2={(AISLE_T + AISLE_B) / 2}
        stroke={cfg.aisleMarking} strokeWidth="1.5"
        strokeDasharray="8 6" strokeOpacity="0.7"
      />
      {/* 통로 화살표 (입출고 방향) */}
      {[0.3, 0.7].map((t, i) => {
        const ax = INNER_L + INNER_W * t
        const ay = (AISLE_T + AISLE_B) / 2
        const dir = i === 0 ? -1 : 1
        return (
          <polygon
            key={i}
            points={`${ax},${ay - 7} ${ax + dir * 10},${ay} ${ax},${ay + 7}`}
            fill={cfg.aisleMarking} opacity="0.8"
          />
        )
      })}

      {/* ── 랙(Rack) 렌더링 ── */}
      {(['top', 'bot'] as const).map((pos) => {
        const rackT = pos === 'top' ? RACK_TOP_T : RACK_BOT_T
        const rackB = pos === 'top' ? RACK_TOP_B : RACK_BOT_B
        const rackH = rackB - rackT

        return Array.from({ length: N_RACKS }, (_, ri) => {
          const rx = INNER_L + RACK_GAP + ri * (RACK_W + RACK_GAP)
          return (
            <g key={`${pos}-${ri}`}>
              {/* 랙 본체 */}
              <rect
                x={rx} y={rackT} width={RACK_W} height={rackH}
                fill={cfg.rack} stroke={cfg.rackBorder} strokeWidth="1"
                rx="1"
              />
              {/* 선반 구분선 */}
              {Array.from({ length: N_SHELVES - 1 }, (_, si) => {
                const sy = rackT + rackH * ((si + 1) / N_SHELVES)
                return (
                  <line key={si}
                    x1={rx + 2} y1={sy} x2={rx + RACK_W - 2} y2={sy}
                    stroke={cfg.shelf} strokeWidth="1.2"
                  />
                )
              })}
              {/* 선반 내 적재 슬롯 표시 */}
              {Array.from({ length: N_SHELVES }, (_, si) => {
                const slotT = rackT + rackH * (si / N_SHELVES) + 4
                const slotH = rackH / N_SHELVES - 8
                const N_SLOTS = 2
                const slotW = (RACK_W - 6 - (N_SLOTS - 1) * 3) / N_SLOTS
                return Array.from({ length: N_SLOTS }, (__, sli) => (
                  <rect
                    key={`${si}-${sli}`}
                    x={rx + 3 + sli * (slotW + 3)}
                    y={slotT}
                    width={slotW}
                    height={slotH}
                    fill={cfg.shelfHi}
                    opacity="0.25"
                    rx="1"
                  />
                ))
              })}
              {/* 랙 상단 강조선 */}
              <line
                x1={rx + 2} y1={rackT + 1}
                x2={rx + RACK_W - 2} y2={rackT + 1}
                stroke={cfg.shelfHi} strokeWidth="1" strokeOpacity="0.7"
              />
            </g>
          )
        })
      })}

      {/* ── 4 모서리 기둥 ── */}
      {[
        [0, 0], [W - PILLAR, 0],
        [0, H - PILLAR], [W - PILLAR, H - PILLAR],
      ].map(([px, py], i) => (
        <g key={i}>
          <rect x={px} y={py} width={PILLAR} height={PILLAR} fill={cfg.pillar} />
          {/* 기둥 안쪽 하이라이트 */}
          <rect
            x={px + (px === 0 ? PILLAR - 3 : 0)}
            y={py + (py === 0 ? PILLAR - 3 : 0)}
            width={3} height={3}
            fill={cfg.pillarHi} opacity="0.6"
          />
        </g>
      ))}

      {/* ── 48 슬롯 적재 표시 (연속 투입) ── */}
      {filledSlotCount != null
        ? Array.from({ length: SLOT_ROWS }, (_, row) =>
            Array.from({ length: SLOT_COLS }, (_, col) => {
              const index = row * SLOT_COLS + col
              const filled = index < slotFill
              return (
                <rect
                  key={`slot-${index}`}
                  x={slotPadX + col * (slotW + 3)}
                  y={slotPadY + row * (slotH + 3)}
                  width={slotW}
                  height={slotH}
                  rx={1}
                  fill={filled ? '#38bdf8' : '#2e6444'}
                  opacity={filled ? 0.95 : 0.35}
                />
              )
            }),
          )
        : null}

      {/* ── 외곽 프레임 ── */}
      <rect
        x="1" y="1" width={W - 2} height={H - 2}
        fill="none" stroke={cfg.rackBorder} strokeWidth="2"
        filter={cfg.glowOp > 0 ? `url(#${filterId})` : undefined}
      />

      {/* ── 상단 상태 표시 바 ── */}
      <rect
        x={PILLAR} y="3"
        width={W - PILLAR * 2} height="6"
        fill={cfg.status} opacity={cfg.statusOp} rx="1"
      />

      {/* ── 좌우 경고 스트라이프 (유지보수 / 오류) ── */}
      {(status === 'error' || status === 'maintenance') && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i % 2 === 0 ? 2 : 4}
              y={PILLAR + i * ((H - PILLAR * 2) / 4)}
              width="6"
              height={(H - PILLAR * 2) / 4}
              fill={cfg.status}
              opacity={i % 2 === 0 ? 0.35 : 0.15}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={W - 8 + (i % 2 === 0 ? 2 : 0)}
              y={PILLAR + i * ((H - PILLAR * 2) / 4)}
              width="6"
              height={(H - PILLAR * 2) / 4}
              fill={cfg.status}
              opacity={i % 2 === 0 ? 0.35 : 0.15}
            />
          ))}
        </>
      )}

      {/* ── error 깜박임 오버레이 ── */}
      {status === 'error' && (
        <rect width={W} height={H} fill={cfg.glow} opacity="0">
          <animate attributeName="opacity" values="0;0.08;0" dur="1.4s" repeatCount="indefinite" />
        </rect>
      )}

      {/* ── running 상태: 통로 스캔라인 ── */}
      {status === 'running' && (
        <rect
          x={INNER_L} y={AISLE_T}
          width={INNER_W} height="4"
          fill={cfg.glow} opacity="0.3"
        >
          <animate
            attributeName="y"
            from={AISLE_T}
            to={AISLE_B - 4}
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      )}
    </svg>
  )
}
