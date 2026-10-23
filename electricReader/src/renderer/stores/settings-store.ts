import { create } from 'zustand'
import { DEFAULT_SETTINGS, mergeSettings } from '@shared/defaults'
import type { ReaderSettings } from '@shared/types'
import { api } from '@renderer/services/api'
import { toast } from './toast-store'

interface SettingsState {
  settings: ReaderSettings
  loaded: boolean
  setSettings: (settings: ReaderSettings) => void
  save: (patch: Partial<ReaderSettings>) => Promise<ReaderSettings | null>
}

let saveSequence = 0

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  setSettings: (settings) => set({ settings, loaded: true }),
  save: async (patch) => {
    const request = ++saveSequence
    const previous = get().settings
    const optimistic = mergeSettings(previous, patch)
    set({ settings: optimistic })
    try {
      const saved = await api.updateSettings(patch)
      // 连续快速调整时只接受最后一次响应，避免旧响应把设置改回去。
      if (request === saveSequence) set({ settings: saved, loaded: true })
      return saved
    } catch (error) {
      if (request === saveSequence) set({ settings: previous })
      toast.error('设置未能保存', error instanceof Error ? error.message : '请重试')
      return null
    }
  },
}))
