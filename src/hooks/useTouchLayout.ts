import { useEffect, useState } from 'react'

const TOUCH_POINTER_QUERY = '(pointer: coarse), (hover: none)'

/** 터치·좁은 화면 — 모바일 레이아웃 (뷰포트 너비 또는 터치 포인터) */
function readTouchLayout(): boolean {
  if (typeof window === 'undefined') return false
  if (window.innerWidth <= 1023) return true
  return window.matchMedia(TOUCH_POINTER_QUERY).matches
}

export function useTouchLayout(): boolean {
  const [touchLayout, setTouchLayout] = useState(readTouchLayout)

  useEffect(() => {
    const update = () => setTouchLayout(readTouchLayout())
    update()

    window.addEventListener('resize', update)
    const mq = window.matchMedia(TOUCH_POINTER_QUERY)
    mq.addEventListener('change', update)

    return () => {
      window.removeEventListener('resize', update)
      mq.removeEventListener('change', update)
    }
  }, [])

  return touchLayout
}
