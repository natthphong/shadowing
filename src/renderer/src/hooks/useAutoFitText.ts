import { RefObject, useLayoutEffect, useEffect } from 'react'

/**
 * Fit the largest font-size (px) that keeps the sentence content inside its container.
 *
 * Structure expected:
 *   el (outer, hook target) → firstElementChild (inner flex-wrap word container)
 *
 * Measurement: inner.scrollHeight vs el.clientHeight avoids the Chromium quirk where
 * align-content:center causes scrollHeight === clientHeight regardless of content size.
 *
 * useLayoutEffect handles segment changes — fires AFTER React updates the DOM but
 * BEFORE the browser paints, so the user never sees the wrong font size even for a frame.
 *
 * useEffect ResizeObserver handles window / container resize.
 */

function fitText(el: HTMLElement, minPx: number, maxPx: number): void {
  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return

  const availH = el.clientHeight
  const availW = el.clientWidth
  if (availH < 4 || availW < 4) return  // layout not ready yet

  const margin = 4  // safety gap so text doesn't clip at edges

  // Fast-path: minimum size already overflows → leave at min
  el.style.fontSize = `${minPx}px`
  if (inner.scrollHeight > availH - margin || inner.scrollWidth > availW - margin) return

  // Fast-path: maximum size fits → use max, no search needed
  el.style.fontSize = `${maxPx}px`
  if (inner.scrollHeight <= availH - margin && inner.scrollWidth <= availW - margin) return

  // Binary search for the largest fitting size
  let lo = minPx, hi = maxPx
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2
    el.style.fontSize = `${mid}px`
    if (inner.scrollHeight > availH - margin || inner.scrollWidth > availW - margin) hi = mid
    else lo = mid
  }

  el.style.fontSize = `${Math.floor(lo * 2) / 2}px`
}

export function useAutoFitText(
  ref: RefObject<HTMLElement | null>,
  text: string,
  { minPx = 18, maxPx = 52 }: { minPx?: number; maxPx?: number } = {}
): void {
  // Segment change: useLayoutEffect fires synchronously before paint → no flash
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    fitText(el, minPx, maxPx)
  }, [text, minPx, maxPx, ref])

  // Container resize: ResizeObserver re-fits when window or layout changes
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Run once immediately in case the container just got its final dimensions
    fitText(el, minPx, maxPx)
    const ro = new ResizeObserver(() => fitText(el, minPx, maxPx))
    ro.observe(el)
    return () => ro.disconnect()
  }, [minPx, maxPx, ref])
  // Note: `text` is intentionally omitted from this effect's deps —
  // text changes are handled by the useLayoutEffect above.
}
