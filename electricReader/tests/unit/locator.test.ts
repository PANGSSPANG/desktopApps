import { describe, expect, it } from 'vitest'
import {
  clamp01,
  clampPercent,
  deserializeLocator,
  formatPercent,
  normalizeLocator,
  sameLocator,
  serializeLocator,
} from '@shared/defaults'
import type { Locator } from '@shared/types'

const base: Locator = {
  href: 'OEBPS/chapter1.xhtml',
  type: 'application/xhtml+xml',
  title: '第一章',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  locations: { progression: 0.42, totalProgression: 0.18 },
  text: { before: '前文', highlight: '当前段落', after: '后文' },
}

describe('Locator 序列化与恢复', () => {
  it('round-trips a locator without losing CFI or text anchors', () => {
    const restored = deserializeLocator(serializeLocator(base))
    expect(restored).toEqual(base)
  })

  it('rejects malformed JSON and missing href', () => {
    expect(deserializeLocator('{not json')).toBeNull()
    expect(normalizeLocator({ locations: { progression: 0.2 } })).toBeNull()
    expect(deserializeLocator(null)).toBeNull()
  })

  it('clamps progression and trims text anchors', () => {
    const locator = normalizeLocator({
      href: 'chapter.xhtml',
      locations: { progression: 2, totalProgression: -1 },
      text: { highlight: 'x'.repeat(900) },
    })
    expect(locator?.locations.progression).toBe(1)
    expect(locator?.locations.totalProgression).toBe(0)
    expect(locator?.text?.highlight).toHaveLength(500)
  })

  it('compares the same paragraph with a small tolerance', () => {
    expect(sameLocator(base, { ...base, locations: { progression: 0.421 } })).toBe(true)
    expect(sameLocator(base, { ...base, href: 'chapter2.xhtml' })).toBe(false)
    expect(sameLocator(base, { ...base, locations: { progression: 0.5 } })).toBe(false)
  })
})

describe('百分比与数值兜底', () => {
  it('clamps out-of-range progress values', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(Number.NaN)).toBe(0)
  })

  it('formats progress for the shelf', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.2)).toBe('1%')
    expect(formatPercent(42.4)).toBe('42%')
    expect(formatPercent(99.6)).toBe('100%')
  })
})
