const MIN_MEASURABLE_SIZE = 4
const ROUNDING_TOLERANCE = 0.5
const HEIGHT_SAFETY_GAP = 2

function pixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function availableContentSize(el: HTMLElement): { width: number; height: number } {
  const style = window.getComputedStyle(el)
  return {
    width: el.clientWidth - pixelValue(style.paddingLeft) - pixelValue(style.paddingRight),
    height: el.clientHeight - pixelValue(style.paddingTop) - pixelValue(style.paddingBottom)
  }
}

function contentFits(el: HTMLElement, inner: HTMLElement): boolean {
  const available = availableContentSize(el)
  const widthLimit = inner.clientWidth > 0
    ? Math.min(inner.clientWidth, available.width)
    : available.width
  const fitsWidth = inner.scrollWidth <= widthLimit + ROUNDING_TOLERANCE
  const fitsHeight = inner.scrollHeight <= available.height - HEIGHT_SAFETY_GAP
  return fitsWidth && fitsHeight
}

/**
 * Binary-searches the largest font-size that keeps the measured child inside
 * the container's real content box. Both axes are checked: wrapping handles
 * normal sentences while scrollWidth still catches long, unbroken content.
 */
export function fitText(el: HTMLElement, minPx: number, maxPx: number): void {
  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return

  const available = availableContentSize(el)
  if (available.width < MIN_MEASURABLE_SIZE || available.height < MIN_MEASURABLE_SIZE) {
    return
  }

  const minimum = Math.min(minPx, maxPx)
  const maximum = Math.max(minPx, maxPx)

  el.style.fontSize = `${minimum}px`
  if (!contentFits(el, inner)) return

  el.style.fontSize = `${maximum}px`
  if (contentFits(el, inner)) return

  let low = minimum
  let high = maximum
  while (high - low > ROUNDING_TOLERANCE) {
    const candidate = (low + high) / 2
    el.style.fontSize = `${candidate}px`
    if (contentFits(el, inner)) low = candidate
    else high = candidate
  }

  el.style.fontSize = `${Math.floor(low * 2) / 2}px`
}
