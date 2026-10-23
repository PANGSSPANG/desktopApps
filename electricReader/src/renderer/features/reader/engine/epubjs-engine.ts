import ePub, { type Book, type NavItem, type Rendition } from 'epubjs'
import type { Locator, ReaderSettings, TocItem } from '@shared/types'
import { clamp01 } from '@shared/defaults'
import type { ReaderEngine, ReaderEngineCallbacks } from './types'
import { buildEpubCss } from './theme-css'

interface RenderedViewLike {
  section?: SectionLike
  document?: Document
  contents?: { document?: Document }
}

interface SectionLike {
  href: string
  index: number
  cfiFromRange: (range: Range) => string
  cfiFromElement?: (element: Element) => string
}

interface MeasuredLocation {
  locator: Locator
  atStart: boolean
  atEnd: boolean
}

const DEFAULT_LOCATOR: Locator = {
  href: '',
  type: 'application/xhtml+xml',
  locations: { progression: 0, totalProgression: 0 },
}

function baseName(value: string): string {
  const path = value.split('#')[0]?.split('?')[0] ?? ''
  try {
    return decodeURIComponent(path).split('/').pop() ?? path
  } catch {
    return path.split('/').pop() ?? path
  }
}

function waitForFrames(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    let remaining = frames
    const tick = (): void => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * epub.js 适配器。上层只认 ReaderEngine，未来换 Readium 不需要改阅读页。
 * 书内容由 epub.js 放进 sandbox="allow-same-origin" 的 iframe，且不注入 allow-scripts。
 */
export class EpubJsReaderEngine implements ReaderEngine {
  private book: Book | null = null
  private rendition: Rendition | null = null
  private host: HTMLElement | null = null
  private callbacks: ReaderEngineCallbacks | null = null
  private settings: ReaderSettings | null = null
  private lastLocator: Locator | null = null
  private atStart = true
  private atEnd = false
  private emitTimer: number | null = null
  private toc: TocItem[] = []
  private spineLength = 1
  private contentCleanup: (() => void) | null = null
  private resizeObserver: ResizeObserver | null = null
  private resizeTimer: number | null = null
  private inputEnabled = true
  private wheelLocked = false
  private destroyed = false

  async open(
    host: HTMLElement,
    data: Uint8Array,
    settings: ReaderSettings,
    initialLocator: Locator | null,
    callbacks: ReaderEngineCallbacks,
  ): Promise<void> {
    this.host = host
    this.settings = settings
    this.callbacks = callbacks

    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer
    const book = ePub(arrayBuffer)
    this.book = book
    await book.ready
    await book.loaded.navigation

    this.spineLength = this.countSpine()
    this.toc = this.mapToc(book.navigation?.toc ?? [])

    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
      allowScriptedContent: false,
    })
    this.rendition = rendition
    rendition.themes.registerCss('electricreader', buildEpubCss(settings, settings.theme))
    rendition.themes.select('electricreader')

    rendition.on('relocated', this.handleRelocated)
    rendition.on('rendered', this.handleRendered)
    window.addEventListener('keydown', this.handleParentKey)

    this.resizeObserver = new ResizeObserver(() => this.scheduleResize())
    this.resizeObserver.observe(host)

    callbacks.onBusyChange?.(true)
    try {
      await this.restore(initialLocator, true)
    } finally {
      callbacks.onBusyChange?.(false)
    }
  }

  private countSpine(): number {
    if (!this.book) return 1
    let count = 0
    this.book.spine.each((_section: unknown) => {
      count += 1
    })
    return Math.max(1, count)
  }

  private findSection(href: string): SectionLike | null {
    if (!this.book) return null
    const path = href.split('#')[0] ?? href
    const direct = this.book.spine.get(path) as SectionLike | null
    if (direct) return direct
    try {
      const canonical = this.book.spine.get(this.book.canonical(path)) as SectionLike | null
      if (canonical) return canonical
    } catch {
      // canonical 解析失败后继续按文件名兜底。
    }
    const target = baseName(path)
    let found: SectionLike | null = null
    this.book.spine.each((section: SectionLike) => {
      if (!found && baseName(section.href) === target) found = section
    })
    return found
  }

  private resolveNavHref(href: string): string {
    if (!href) return ''
    const fragmentIndex = href.indexOf('#')
    const path = fragmentIndex >= 0 ? href.slice(0, fragmentIndex) : href
    const fragment = fragmentIndex >= 0 ? href.slice(fragmentIndex) : ''
    const section = this.findSection(path)
    return section ? `${section.href}${fragment}` : href
  }

  private mapToc(items: NavItem[]): TocItem[] {
    return items.map((item, index) => {
      const href = this.resolveNavHref(item.href)
      return {
        id: item.id || `${href || 'toc'}-${index}`,
        href,
        label: item.label?.trim() || '未命名章节',
        children: this.mapToc(item.subitems ?? []),
      }
    })
  }

  private tocLabelFor(href: string): string | undefined {
    const target = baseName(href)
    let found: string | undefined
    const visit = (items: TocItem[]): void => {
      for (const item of items) {
        if (item.href === href || (item.href && baseName(item.href) === target)) {
          found = item.label
        }
        // 卷标题与首章可能指向同一文件，继续向下取更具体的章节名。
        visit(item.children)
      }
    }
    visit(this.toc)
    return found
  }

  private handleRelocated = (): void => {
    if (this.emitTimer !== null) window.clearTimeout(this.emitTimer)
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = null
      this.emitCurrentLocation()
    }, 50)
  }

  private activeView(): { section: SectionLike; document: Document } | null {
    if (!this.rendition) return null
    const collection = this.rendition.views() as unknown as {
      first?: () => RenderedViewLike
      all?: () => RenderedViewLike[]
    }
    const views =
      typeof collection.all === 'function'
        ? collection.all()
        : typeof collection.first === 'function'
          ? [collection.first()]
          : []
    for (const view of views) {
      const document = view.document ?? view.contents?.document
      if (view.section && document) return { section: view.section, document }
    }
    return null
  }

  /**
   * epub.js 0.3.93 的 paginatedLocation 不把容器 scrollLeft 计入页起点，
   * 同章节内翻页时永远回报第一页的位置。这里按容器滚动量反算页索引，
   * 并用当前页首元素生成 CFI，保证节内翻页也有段落级锚点。
   */
  private measureLocation(): MeasuredLocation | null {
    if (!this.rendition || !this.host) return null
    const active = this.activeView()
    const container = this.host.querySelector<HTMLElement>('.epub-container')
    if (!active || !container) return null

    const width = Math.max(1, container.clientWidth)
    const totalPages = Math.max(1, Math.round(container.scrollWidth / width))
    const rawPage = Math.round(container.scrollLeft / width)
    const pageIndex = Math.min(totalPages - 1, Math.max(0, rawPage))
    const section = active.section
    const atStart = section.index <= 0 && pageIndex === 0
    const atEnd = section.index >= this.spineLength - 1 && pageIndex >= totalPages - 1
    const chapterProgress = totalPages > 1 ? pageIndex / (totalPages - 1) : 0
    const totalProgression = atEnd
      ? 1
      : clamp01((section.index + chapterProgress) / this.spineLength)

    const cfi = this.cfiAtPageStart(active.document, section, container)
    const text = cfi ? this.snippetFrom(cfi) : undefined
    const title = this.tocLabelFor(section.href)

    return {
      atStart,
      atEnd,
      locator: {
        href: section.href,
        type: 'application/xhtml+xml',
        ...(title ? { title } : {}),
        ...(cfi ? { cfi } : {}),
        locations: {
          progression: chapterProgress,
          totalProgression,
        },
        ...(text ? { text } : {}),
      },
    }
  }

  private cfiAtPageStart(
    document: Document,
    section: SectionLike,
    container: HTMLElement,
  ): string | undefined {
    const x = Math.round(container.scrollLeft + Math.min(90, container.clientWidth * 0.15))
    const y = Math.round(Math.min(70, container.clientHeight * 0.12))
    try {
      const element = document.elementFromPoint(x, Math.max(32, y))
      const block = element?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption')
      if (block && section.cfiFromElement) {
        const cfi = section.cfiFromElement(block)
        if (cfi) return cfi
      }
      const range = document.caretRangeFromPoint(x, Math.max(32, y))
      if (range) {
        range.collapse(true)
        return section.cfiFromRange(range)
      }
    } catch {
      // 页首落在图片或分栏空白时退回本章已有 CFI。
    }
    return this.lastLocator?.cfi
  }

  private emitCurrentLocation(): void {
    const measured = this.measureLocation()
    if (!measured) return
    this.lastLocator = measured.locator
    this.atStart = measured.atStart
    this.atEnd = measured.atEnd
    const percent = Math.round((measured.locator.locations.totalProgression ?? 0) * 1000) / 10
    this.callbacks?.onRelocated(measured.locator, percent)
  }

  private snippetFrom(cfi: string): Locator['text'] | undefined {
    try {
      if (!this.rendition) return undefined
      const range = this.rendition.getRange(cfi)
      const node = range.startContainer
      const full = node.textContent ?? ''
      if (!full) return undefined
      const offset = Math.max(0, Math.min(range.startOffset, full.length))
      const highlight = full.slice(offset, offset + 90).trim()
      if (!highlight) return undefined
      return {
        before: full.slice(Math.max(0, offset - 60), offset).trim(),
        highlight,
        after: full.slice(offset + highlight.length, offset + highlight.length + 60).trim(),
      }
    } catch {
      return undefined
    }
  }

  private handleRendered = (_section: unknown, view: RenderedViewLike): void => {
    const doc = view.document ?? view.contents?.document
    if (!doc) return
    this.attachContent(doc)
  }

  private attachContent(doc: Document): void {
    this.contentCleanup?.()
    const onClick = (event: MouseEvent): void => {
      if (!this.inputEnabled || this.settings?.pageTurn === 'keys') return
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) return
      const target = event.target
      if (target instanceof Element && target.closest('a, button, input, textarea, select')) return
      const container = this.host?.querySelector<HTMLElement>('.epub-container')
      const width = container?.clientWidth ?? doc.documentElement?.clientWidth ?? 0
      const visibleX = event.clientX - (container?.scrollLeft ?? 0)
      if (width <= 0) return
      if (visibleX < width * 0.24) void this.prev()
      else if (visibleX > width * 0.76) void this.next()
    }

    const onKey = (event: KeyboardEvent): void => {
      this.handleKey(event)
    }

    const onWheel = (event: WheelEvent): void => {
      if (!this.inputEnabled || event.ctrlKey) return
      if (Math.abs(event.deltaX) < 12 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return
      event.preventDefault()
      if (this.wheelLocked) return
      this.wheelLocked = true
      window.setTimeout(() => {
        this.wheelLocked = false
      }, 420)
      if (event.deltaX > 0) void this.next()
      else void this.prev()
    }

    doc.addEventListener('click', onClick)
    doc.addEventListener('keydown', onKey)
    doc.addEventListener('wheel', onWheel, { passive: false })
    this.contentCleanup = () => {
      doc.removeEventListener('click', onClick)
      doc.removeEventListener('keydown', onKey)
      doc.removeEventListener('wheel', onWheel)
    }
  }

  private handleParentKey = (event: KeyboardEvent): void => {
    const target = event.target
    if (target instanceof HTMLElement) {
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
        return
      }
    }
    this.handleKey(event)
  }

  private handleKey(event: KeyboardEvent): void {
    if (!this.inputEnabled || this.settings?.pageTurn === 'click') return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      void this.prev()
    } else if (
      event.key === 'ArrowRight' ||
      event.key === 'PageDown' ||
      event.key === ' ' ||
      event.code === 'Space'
    ) {
      event.preventDefault()
      void this.next()
    }
  }

  private scheduleResize(): void {
    if (!this.rendition || !this.host || this.destroyed) return
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => {
      void this.resizeToHost()
    }, 140)
  }

  private async resizeToHost(): Promise<void> {
    if (!this.rendition || !this.host || this.destroyed) return
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (width <= 0 || height <= 0) return
    const anchor = this.lastLocator
    try {
      this.rendition.resize(width, height)
      await waitForFrames(2)
      await delay(30)
      if (anchor && this.rendition) await this.restore(anchor, false)
    } catch (error) {
      console.error('重排失败', error)
    }
  }

  private async restore(locator: Locator | null, allowTextFallback: boolean): Promise<void> {
    if (!this.rendition) return
    let displayed = false

    if (locator?.cfi) {
      try {
        await this.rendition.display(locator.cfi)
        displayed = true
      } catch {
        // CFI 失效时继续尝试 href。
      }
    }
    if (!displayed && locator?.href) {
      try {
        await this.rendition.display(locator.href)
        displayed = true
        if (allowTextFallback && locator.text?.highlight) {
          await this.textFallback(locator)
        }
      } catch {
        // href 失效时退到章节开头。
      }
    }
    if (!displayed) {
      try {
        await this.rendition.display(DEFAULT_LOCATOR.href || undefined)
        displayed = true
      } catch (error) {
        console.error('打开首个章节失败', error)
      }
    }
    if (displayed) {
      await waitForFrames(1)
      this.emitCurrentLocation()
    }
  }

  private async textFallback(locator: Locator): Promise<void> {
    const highlight = locator.text?.highlight?.trim()
    if (!highlight || !this.rendition || !this.book) return
    const contents = this.rendition.getContents() as unknown as Array<{ document?: Document }>
    const doc = contents[0]?.document
    if (!doc?.body) return
    const section = this.findSection(locator.href)
    if (!section) return

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    let consumed = 0
    let node = walker.nextNode()
    while (node) {
      const value = node.nodeValue ?? ''
      const index = value.indexOf(highlight)
      if (index >= 0 && consumed + index <= 2000) {
        try {
          const range = doc.createRange()
          range.setStart(node, index)
          range.setEnd(node, Math.min(value.length, index + highlight.length))
          const cfi = section.cfiFromRange(range)
          if (cfi) {
            await this.rendition.display(cfi)
            return
          }
        } catch {
          return
        }
      }
      consumed += value.length
      if (consumed > 2000) return
      node = walker.nextNode()
    }
  }

  async next(): Promise<void> {
    if (!this.rendition) return
    await this.rendition.next()
    await waitForFrames(1)
    this.emitCurrentLocation()
    if (this.atEnd) this.callbacks?.onBoundary?.('end')
  }

  async prev(): Promise<void> {
    if (!this.rendition) return
    await this.rendition.prev()
    await waitForFrames(1)
    this.emitCurrentLocation()
    if (this.atStart) this.callbacks?.onBoundary?.('start')
  }

  async goTo(locator: Locator): Promise<void> {
    this.callbacks?.onBusyChange?.(true)
    try {
      await this.restore(locator, false)
    } finally {
      this.callbacks?.onBusyChange?.(false)
    }
  }

  async goToHref(href: string): Promise<void> {
    if (!this.rendition) return
    this.callbacks?.onBusyChange?.(true)
    try {
      await this.rendition.display(href)
      await waitForFrames(1)
      this.emitCurrentLocation()
    } finally {
      this.callbacks?.onBusyChange?.(false)
    }
  }

  async applySettings(settings: ReaderSettings, anchor: Locator | null): Promise<void> {
    if (!this.rendition) return
    this.settings = settings
    const target = anchor ?? this.lastLocator
    this.callbacks?.onBusyChange?.(true)
    try {
      this.rendition.themes.registerCss('electricreader', buildEpubCss(settings, settings.theme))
      this.rendition.themes.select('electricreader')
      if (this.host) {
        const width = this.host.clientWidth
        const height = this.host.clientHeight
        if (width > 0 && height > 0) this.rendition.resize(width, height)
      }
      await waitForFrames(2)
      await delay(60)
      if (target) await this.restore(target, false)
    } finally {
      this.callbacks?.onBusyChange?.(false)
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
  }

  currentLocator(): Locator | null {
    return this.lastLocator ? structuredClone(this.lastLocator) : null
  }

  getToc(): TocItem[] {
    return structuredClone(this.toc)
  }

  destroy(): void {
    this.destroyed = true
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer)
    if (this.emitTimer !== null) window.clearTimeout(this.emitTimer)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener('keydown', this.handleParentKey)
    this.contentCleanup?.()
    this.contentCleanup = null
    try {
      this.rendition?.destroy()
    } catch {
      // 已销毁的渲染器重复 destroy 无副作用。
    }
    try {
      this.book?.destroy()
    } catch {
      // 同上。
    }
    this.rendition = null
    this.book = null
    if (this.host) this.host.innerHTML = ''
    this.host = null
    this.callbacks = null
    this.lastLocator = null
  }
}
