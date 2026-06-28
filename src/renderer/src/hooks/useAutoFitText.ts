import { RefObject, useEffect, useLayoutEffect } from 'react'
import { fitText } from '../utils/fitText'

/**
 * Applies the largest font-size that keeps the sentence inside its container.
 *
 * Target DOM shape:
 *   el (outer ref) — font-size is mutated here
 *     └─ el.firstElementChild (inner) — MUST have w-full so scrollHeight
 *        reflects proper multi-line wrapping, not max-content stacking.
 *
 * The synchronous pass prevents a previous sentence's large font from being
 * painted against new content. The animation-frame pass catches flex/grid
 * layout changes that settle after the DOM update.
 */
export function useAutoFitText(
  ref: RefObject<HTMLElement | null>,
  text: string,
  {
    minPx = 18,
    maxPx = 52,
    contentKey = ''
  }: { minPx?: number; maxPx?: number; contentKey?: string } = {}
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Never carry a stale, oversized font into the next paint.
    el.style.fontSize = `${Math.min(minPx, maxPx)}px`
    fitText(el, minPx, maxPx)

    let settledFrame: number | null = null
    const layoutFrame = window.requestAnimationFrame(() => {
      settledFrame = window.requestAnimationFrame(() => fitText(el, minPx, maxPx))
    })
    return () => {
      window.cancelAnimationFrame(layoutFrame)
      if (settledFrame !== null) window.cancelAnimationFrame(settledFrame)
    }
  }, [contentKey, maxPx, minPx, ref, text])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame: number | null = null
    let active = true
    const scheduleFit = (): void => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        if (active) fitText(el, minPx, maxPx)
      })
    }

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(el)
    window.addEventListener('resize', scheduleFit)
    scheduleFit()

    void document.fonts?.ready.then(() => {
      if (active) scheduleFit()
    })

    return () => {
      active = false
      observer.disconnect()
      window.removeEventListener('resize', scheduleFit)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [minPx, maxPx, ref])
}
