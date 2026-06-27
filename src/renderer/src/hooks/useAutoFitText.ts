import { RefObject, useEffect, useRef } from 'react'

/**
 * Binary-search the largest font-size (px) that makes the container's content
 * fit within its bounds (no overflow in either axis). Applies the size directly
 * to el.style.fontSize so the value is available on the same frame.
 * Re-runs whenever `text` changes or the container is resized.
 */
export function useAutoFitText(
  ref: RefObject<HTMLElement | null>,
  text: string,
  { minPx = 18, maxPx = 52 }: { minPx?: number; maxPx?: number } = {}
): void {
  // Track whether a fit pass is already in-flight (guards against
  // ResizeObserver feedback loops when fontSize changes cause reflow).
  const busy = useRef(false)
  // Last applied size — skip DOM write when unchanged to avoid triggering RO.
  const lastSize = useRef<number>(maxPx)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = (): void => {
      if (busy.current) return
      busy.current = true

      // Binary search: find largest font size where el does NOT overflow.
      let lo = minPx
      let hi = maxPx

      // Guard: if even minPx overflows (container too small), bail early.
      el.style.fontSize = `${minPx}px`
      const minOverflows =
        el.scrollHeight > el.clientHeight + 1 ||
        el.scrollWidth > el.clientWidth + 1
      if (minOverflows) {
        // Can't fit — leave at minPx and give up.
        lastSize.current = minPx
        busy.current = false
        return
      }

      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2
        el.style.fontSize = `${mid}px`
        const overflows =
          el.scrollHeight > el.clientHeight + 1 ||
          el.scrollWidth > el.clientWidth + 1
        if (overflows) {
          hi = mid
        } else {
          lo = mid
        }
      }

      // lo is now the largest non-overflowing size.
      // Round down to nearest 0.5 for stable values.
      const fitted = Math.floor(lo * 2) / 2

      if (fitted !== lastSize.current) {
        el.style.fontSize = `${fitted}px`
        lastSize.current = fitted
      } else {
        // Ensure the value is actually written (may have been overridden by React).
        el.style.fontSize = `${fitted}px`
      }

      busy.current = false
    }

    // Run after layout settles (16ms covers one frame at 60fps).
    const timer = setTimeout(fit, 16)

    const ro = new ResizeObserver(() => {
      // Use rAF to batch multiple ResizeObserver calls per frame.
      requestAnimationFrame(fit)
    })
    ro.observe(el)

    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [text, minPx, maxPx, ref])
}
