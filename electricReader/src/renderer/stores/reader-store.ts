import { create } from 'zustand'
import type { Locator, TocItem } from '@shared/types'

interface ReaderState {
  locator: Locator | null
  percent: number
  toc: TocItem[]
  busy: boolean
  ready: boolean
  setLocator: (locator: Locator, percent: number) => void
  setToc: (toc: TocItem[]) => void
  setBusy: (busy: boolean) => void
  setReady: (ready: boolean) => void
  reset: () => void
}

export const useReaderStore = create<ReaderState>((set) => ({
  locator: null,
  percent: 0,
  toc: [],
  busy: false,
  ready: false,
  setLocator: (locator, percent) => set({ locator, percent }),
  setToc: (toc) => set({ toc }),
  setBusy: (busy) => set({ busy }),
  setReady: (ready) => set({ ready }),
  reset: () => set({ locator: null, percent: 0, toc: [], busy: false, ready: false }),
}))
