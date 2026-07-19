import { useEffect, useRef, useState } from 'react'
import type { OhtRailGraph, OhtVehicleState } from '../../utils/ohtSimulation'
import { OHT_INTERFACE_MS, ohtVehicleCell, ohtVehiclePrevCell } from '../../utils/ohtSimulation'
import { OhtVehicleGlyph, PoodleGlyph } from '../builder/OhtPaletteItem'

interface OhtViewport {
  minX: number
  minY: number
  cols: number
  rows: number
}

interface OhtVehicleOverlayProps {
  vehicles: OhtVehicleState[]
  graph: OhtRailGraph
  viewport: OhtViewport
  cellSize: number
  active: boolean
  /** 애니메이션 루프 구동 여부 — 일시정지 시 false로 표시는 유지하되 RAF만 중단 */
  animating?: boolean
  stepMs: number
  poodleMode?: boolean
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function OhtVehicleOverlay({
  vehicles,
  graph,
  viewport,
  cellSize,
  active,
  animating = active,
  stepMs,
  poodleMode = false,
}: OhtVehicleOverlayProps) {
  const tickKey = vehicles
    .map((v) => `${v.id}:${v.nodeId}:${v.prevNodeId}:${v.phase}:${v.carrying}:${v.interfaceElapsedMs}`)
    .join('|')
  const tickKeyRef = useRef(tickKey)
  const syncAtRef = useRef(performance.now())
  const [, setFrame] = useState(0)

  if (tickKey !== tickKeyRef.current) {
    tickKeyRef.current = tickKey
    syncAtRef.current = performance.now()
  }

  useEffect(() => {
    if (!animating) return
    let raf = 0
    const loop = () => {
      setFrame((v) => v + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animating])

  if (!active || vehicles.length === 0) return null

  const progress = Math.min(1, Math.max(0, (performance.now() - syncAtRef.current) / stepMs))
  const eased = easeInOut(progress)

  const width = viewport.cols * cellSize
  const height = viewport.rows * cellSize
  const glyphSize = Math.max(16, cellSize * 1.15)
  // 링 크기: 모듈 셀 기준 (cellSize × 1.5)
  const ringSize = cellSize * 1.5

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[22] overflow-visible"
      style={{ width, height }}
    >
      {vehicles.map((v) => {
        const cur = ohtVehicleCell(v, graph)
        if (!cur) return null
        const railPrev = ohtVehiclePrevCell(v, graph) ?? cur
        const moving = v.phase === 'moving'
        const interfacing = v.phase === 'interfacing'
        const waiting = v.phase === 'waiting'

        // ── OHT 위치 계산 ──────────────────────────────────────────
        let gx: number
        let gy: number

        if (interfacing && v.targetUnitCenter) {
          if (v.interfaceElapsedMs === 0) {
            // 첫 틱: 레일 도착 노드 → 모듈 중심으로 부드럽게 이동
            gx = cur.gridX + (v.targetUnitCenter.gridX - cur.gridX) * easeInOut(progress)
            gy = cur.gridY + (v.targetUnitCenter.gridY - cur.gridY) * easeInOut(progress)
          } else {
            // 이후: 모듈 중심에 고정
            gx = v.targetUnitCenter.gridX
            gy = v.targetUnitCenter.gridY
          }
        } else if (moving) {
          // 인터페이스 후 첫 이동 틱: departGrid(모듈 위치)에서 첫 경로 노드로 출발
          const prevPos = v.departGrid ?? railPrev
          gx = prevPos.gridX + (cur.gridX - prevPos.gridX) * eased
          gy = prevPos.gridY + (cur.gridY - prevPos.gridY) * eased
        } else {
          gx = cur.gridX
          gy = cur.gridY
        }

        const cx = (gx - viewport.minX + 0.5) * cellSize
        const cy = (gy - viewport.minY + 0.5) * cellSize

        // ── 자재 투명도 (인터페이스 진행률 기반) ──────────────────
        const smoothElapsed = v.interfaceElapsedMs + progress * stepMs
        const interfaceRatio = Math.min(1, Math.max(0, smoothElapsed / OHT_INTERFACE_MS))

        let materialOpacity: number
        if (interfacing) {
          // 픽업: 0→1 페이드인 / 드롭오프: 1→0 페이드아웃
          materialOpacity = v.carrying ? 1 - interfaceRatio : interfaceRatio
        } else {
          materialOpacity = v.carrying ? 1 : 0
        }

        // ── 링: 모듈 중심 고정 좌표 ───────────────────────────────
        const ringCx = v.targetUnitCenter
          ? (v.targetUnitCenter.gridX - viewport.minX + 0.5) * cellSize
          : cx
        const ringCy = v.targetUnitCenter
          ? (v.targetUnitCenter.gridY - viewport.minY + 0.5) * cellSize
          : cy
        const ringOpacity = interfacing
          ? v.interfaceElapsedMs === 0
            ? eased          // 첫 틱: 페이드인
            : 1
          : waiting
            ? 1              // 자재 대기: 모듈 앞에서 대기 링 표시
            : 0

        return (
          <div key={v.id} className="contents">
            {/* 링: OHT 컨테이너와 독립, 모듈 중심 고정 */}
            {ringOpacity > 0 ? (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: ringCx,
                  top: ringCy,
                  transform: 'translate(-50%, -50%)',
                  width: ringSize,
                  height: ringSize,
                }}
              >
                <span
                  className="absolute left-0 top-0 h-full w-full rounded-full"
                  style={{
                    opacity: ringOpacity,
                    boxShadow: waiting
                      ? '0 0 0 2px rgba(248,113,113,0.7), 0 0 16px rgba(248,113,113,0.4)'
                      : v.carrying
                        ? '0 0 0 2px rgba(34,211,238,0.65), 0 0 16px rgba(34,211,238,0.45)'
                        : '0 0 0 2px rgba(251,191,36,0.7), 0 0 16px rgba(251,191,36,0.45)',
                    animation: waiting
                      ? 'oht-interface-pulse 1.6s ease-in-out infinite'
                      : 'oht-interface-pulse 0.85s ease-in-out infinite',
                  }}
                />
              </div>
            ) : null}

            {/* OHT 대차 (또는 푸들) */}
            <div
              className="absolute"
              style={{
                left: cx,
                top: cy,
                transform: 'translate(-50%, -50%)',
                width: glyphSize,
                height: glyphSize,
              }}
            >
              {poodleMode ? (
                <PoodleGlyph
                  size={glyphSize}
                  materialOpacity={materialOpacity}
                  running={moving}
                />
              ) : (
                <OhtVehicleGlyph
                  size={glyphSize}
                  carrying={v.carrying}
                  materialOpacity={materialOpacity}
                />
              )}
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes oht-interface-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.88); }
          50% { opacity: 1; transform: scale(1.14); }
        }
      `}</style>
    </div>
  )
}
