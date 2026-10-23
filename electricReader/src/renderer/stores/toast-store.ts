import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  description?: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => void
  dismiss: (id: number) => void
}

let sequence = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = ++sequence
    set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) })
    const timeout = toast.kind === 'error' ? 8000 : 4500
    window.setTimeout(() => {
      set({ toasts: get().toasts.filter((item) => item.id !== id) })
    }, timeout)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((item) => item.id !== id) }),
}))

export const toast = {
  success(title: string, description?: string): void {
    useToastStore
      .getState()
      .push({ kind: 'success', title, ...(description ? { description } : {}) })
  },
  error(title: string, description?: string): void {
    useToastStore.getState().push({ kind: 'error', title, ...(description ? { description } : {}) })
  },
  info(title: string, description?: string): void {
    useToastStore.getState().push({ kind: 'info', title, ...(description ? { description } : {}) })
  },
}
