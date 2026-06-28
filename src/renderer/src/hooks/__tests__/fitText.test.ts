import { describe, expect, it } from 'vitest'
import { fitText } from '../../utils/fitText'

type MockTextBox = {
  element: HTMLElement
  fontSize: () => number
  contentHeight: () => number
  resize: (width: number, height: number) => void
}

function makeMockTextBox({
  width = 400,
  height = 160,
  wordCount = 5,
  averageWordWidth = 60,
  unbrokenContentWidth = 0,
  baseFontSize = 16,
  lineHeight = 1.2
}: {
  width?: number
  height?: number
  wordCount?: number
  averageWordWidth?: number
  unbrokenContentWidth?: number
  baseFontSize?: number
  lineHeight?: number
} = {}): MockTextBox {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  outer.appendChild(inner)

  let containerWidth = width
  let containerHeight = height
  let currentFontSize = baseFontSize

  Object.defineProperty(outer, 'clientWidth', { get: () => containerWidth })
  Object.defineProperty(outer, 'clientHeight', { get: () => containerHeight })
  Object.defineProperty(outer, 'style', {
    get: () => ({
      get fontSize() { return `${currentFontSize}px` },
      set fontSize(value: string) { currentFontSize = Number.parseFloat(value) }
    })
  })

  Object.defineProperty(inner, 'clientWidth', { get: () => containerWidth })
  Object.defineProperty(inner, 'clientHeight', {
    get: () => Math.min(containerHeight, measuredHeight())
  })
  Object.defineProperty(inner, 'scrollWidth', {
    get: () => unbrokenContentWidth > 0
      ? unbrokenContentWidth * (currentFontSize / baseFontSize)
      : containerWidth
  })

  const measuredHeight = (): number => {
    const scaledWordWidth = averageWordWidth * (currentFontSize / baseFontSize)
    const wordsPerLine = Math.max(1, Math.floor(containerWidth / scaledWordWidth))
    const lines = Math.ceil(wordCount / wordsPerLine)
    return lines * currentFontSize * lineHeight
  }

  Object.defineProperty(inner, 'scrollHeight', { get: measuredHeight })

  return {
    element: outer,
    fontSize: () => currentFontSize,
    contentHeight: measuredHeight,
    resize: (nextWidth, nextHeight) => {
      containerWidth = nextWidth
      containerHeight = nextHeight
    }
  }
}

describe('fitText', () => {
  it('shrinks a long sentence until it fits', () => {
    const box = makeMockTextBox({
      width: 420,
      height: 110,
      wordCount: 16,
      averageWordWidth: 58
    })

    fitText(box.element, 18, 52)

    expect(box.fontSize()).toBeGreaterThanOrEqual(18)
    expect(box.fontSize()).toBeLessThan(52)
    expect(box.contentHeight()).toBeLessThanOrEqual(108)
  })

  it('grows a short sentence without exceeding maxPx', () => {
    const box = makeMockTextBox({ width: 800, height: 300, wordCount: 2 })

    fitText(box.element, 18, 52)

    expect(box.fontSize()).toBe(52)
  })

  it('keeps multiline text within the available height', () => {
    const box = makeMockTextBox({
      width: 240,
      height: 130,
      wordCount: 12,
      averageWordWidth: 64,
      lineHeight: 1.25
    })

    fitText(box.element, 16, 48)

    expect(box.contentHeight()).toBeLessThanOrEqual(128)
    expect(box.fontSize()).toBeGreaterThanOrEqual(16)
  })

  it('recalculates when the container size changes', () => {
    const box = makeMockTextBox({
      width: 620,
      height: 180,
      wordCount: 10,
      averageWordWidth: 58
    })

    fitText(box.element, 18, 52)
    const wideFontSize = box.fontSize()

    box.resize(260, 100)
    fitText(box.element, 18, 52)

    expect(box.fontSize()).toBeLessThan(wideFontSize)
    expect(box.contentHeight()).toBeLessThanOrEqual(98)
  })

  it('checks horizontal overflow for unbroken content', () => {
    const box = makeMockTextBox({
      width: 300,
      height: 200,
      wordCount: 1,
      unbrokenContentWidth: 240
    })

    fitText(box.element, 18, 52)

    expect(box.fontSize()).toBeGreaterThanOrEqual(18)
    expect(box.fontSize()).toBeLessThan(24)
  })

  it('leaves the minimum size when even the minimum overflows', () => {
    const box = makeMockTextBox({ width: 100, height: 30, wordCount: 20 })

    fitText(box.element, 18, 52)

    expect(box.fontSize()).toBe(18)
  })

  it('does not measure a zero-sized container', () => {
    const box = makeMockTextBox({ width: 0, height: 0 })

    expect(() => fitText(box.element, 18, 52)).not.toThrow()
    expect(box.fontSize()).toBe(16)
  })

  it('does not throw without a measurable child', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'clientWidth', { value: 400 })
    Object.defineProperty(element, 'clientHeight', { value: 200 })

    expect(() => fitText(element, 18, 52)).not.toThrow()
  })
})
