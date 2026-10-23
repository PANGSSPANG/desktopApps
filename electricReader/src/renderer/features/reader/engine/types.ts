import type { Locator, ReaderSettings, TocItem } from '@shared/types'

export interface ReaderEngineCallbacks {
  onRelocated: (locator: Locator, percent: number) => void
  onBusyChange?: (busy: boolean) => void
  onBoundary?: (edge: 'start' | 'end') => void
}

export interface ReaderEngine {
  open(
    host: HTMLElement,
    data: Uint8Array,
    settings: ReaderSettings,
    initialLocator: Locator | null,
    callbacks: ReaderEngineCallbacks,
  ): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  goTo(locator: Locator): Promise<void>
  goToHref(href: string): Promise<void>
  applySettings(settings: ReaderSettings, anchor: Locator | null): Promise<void>
  setInputEnabled(enabled: boolean): void
  currentLocator(): Locator | null
  getToc(): TocItem[]
  destroy(): void
}
