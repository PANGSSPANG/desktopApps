import { create } from 'zustand'
import type { Book, ImportSummary, LibraryData } from '@shared/types'
import { api } from '@renderer/services/api'
import { useSettingsStore } from './settings-store'
import { toast } from './toast-store'

interface LibraryState {
  books: Book[]
  loading: boolean
  importing: boolean
  initialized: boolean
  error: string | null
  setData: (data: LibraryData) => void
  load: () => Promise<void>
  importFromDialog: () => Promise<ImportSummary | null>
  importPaths: (paths: string[]) => Promise<ImportSummary | null>
  deleteBook: (bookId: string) => Promise<boolean>
  setStatus: (bookId: string, status: Book['status']) => Promise<boolean>
  relocate: (bookId: string) => Promise<boolean>
  updateBook: (book: Book) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  loading: false,
  importing: false,
  initialized: false,
  error: null,

  setData: (data) => {
    useSettingsStore.getState().setSettings(data.settings)
    set({ books: data.books, initialized: true, error: null })
  },

  load: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const data = await api.getLibrary()
      get().setData(data)
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  importFromDialog: async () => {
    if (get().importing) return null
    set({ importing: true })
    try {
      const summary = await api.importFromDialog()
      if (summary.imported.length || summary.duplicates.length || summary.errors.length) {
        await get().load()
      }
      return summary
    } catch (error) {
      toast.error('导入失败', errorMessage(error))
      return null
    } finally {
      set({ importing: false })
    }
  },

  importPaths: async (paths) => {
    if (get().importing) return null
    set({ importing: true })
    try {
      const summary = await api.importPaths(paths)
      if (summary.imported.length) await get().load()
      return summary
    } catch (error) {
      toast.error('导入失败', errorMessage(error))
      return null
    } finally {
      set({ importing: false })
    }
  },

  deleteBook: async (bookId) => {
    try {
      const data = await api.deleteBook(bookId)
      get().setData(data)
      toast.success('已从书库移除')
      return true
    } catch (error) {
      toast.error('删除失败', errorMessage(error))
      return false
    }
  },

  setStatus: async (bookId, status) => {
    try {
      const data = await api.setBookStatus(bookId, status)
      get().setData(data)
      return true
    } catch (error) {
      toast.error('更新阅读状态失败', errorMessage(error))
      return false
    }
  },

  relocate: async (bookId) => {
    try {
      const book = await api.relocateBook(bookId)
      await get().load()
      toast.success('已重新定位', book.title)
      return true
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'CANCELLED') return false
      toast.error('重新定位失败', errorMessage(error))
      return false
    }
  },

  updateBook: (book) => {
    const books = get()
      .books.map((item) => (item.id === book.id ? { ...item, ...book } : item))
      .sort((a, b) => Date.parse(b.lastReadAt ?? b.addedAt) - Date.parse(a.lastReadAt ?? a.addedAt))
    set({ books })
  },
}))
