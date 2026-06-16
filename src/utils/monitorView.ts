import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { ConveyorLine } from '../types/conveyor'
import { getLineViewport } from './lineViewport'

const FOCUS_PADDING = 3
const VIEW_MARGIN = 0.92

/** 배치된 라인 영역을 화면 중앙에 맞춤 (128×128 전체 맵 유지) */
export function focusLineInView(
  ref: ReactZoomPanPinchRef,
  line: ConveyorLine,
  cellSize: number,
  animationTime = 0,
) {
  const wrapper = ref.instance.wrapperComponent
  if (!wrapper) return

  const viewport = getLineViewport(line, FOCUS_PADDING)
  if (!viewport) {
    fitFullMapInView(ref, line, cellSize, animationTime)
    return
  }

  const lineW = viewport.cols * cellSize
  const lineH = viewport.rows * cellSize
  const lineCenterX = (viewport.minX + viewport.cols / 2) * cellSize
  const lineCenterY = (viewport.minY + viewport.rows / 2) * cellSize

  const scale =
    Math.min(wrapper.clientWidth / lineW, wrapper.clientHeight / lineH) *
    VIEW_MARGIN

  const positionX = wrapper.clientWidth / 2 - lineCenterX * scale
  const positionY = wrapper.clientHeight / 2 - lineCenterY * scale

  ref.setTransform(positionX, positionY, scale, animationTime, 'easeOut')
}

/** 128×128 전체 맵을 화면에 맞춤 */
export function fitFullMapInView(
  ref: ReactZoomPanPinchRef,
  line: ConveyorLine,
  cellSize: number,
  animationTime = 0,
) {
  const wrapper = ref.instance.wrapperComponent
  if (!wrapper) return

  const mapW = line.gridSize.cols * cellSize
  const mapH = line.gridSize.rows * cellSize
  const scale =
    Math.min(wrapper.clientWidth / mapW, wrapper.clientHeight / mapH) *
    VIEW_MARGIN

  ref.centerView(scale, animationTime, 'easeOut')
}
