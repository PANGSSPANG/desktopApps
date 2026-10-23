import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type ElectricReaderApi } from '@shared/ipc-contract'
import type { ProgressUpdate, ReaderSettings } from '@shared/types'

const api: ElectricReaderApi = {
  getLibrary: () => ipcRenderer.invoke(IPC.libraryGet),
  importFromDialog: () => ipcRenderer.invoke(IPC.libraryImportDialog),
  importPaths: (paths: string[]) => ipcRenderer.invoke(IPC.libraryImportPaths, paths),
  deleteBook: (bookId: string) => ipcRenderer.invoke(IPC.libraryDelete, bookId),
  relocateBook: (bookId: string) => ipcRenderer.invoke(IPC.libraryRelocate, bookId),
  setBookStatus: (bookId, status) => ipcRenderer.invoke(IPC.librarySetStatus, bookId, status),
  readBook: (bookId: string) => ipcRenderer.invoke(IPC.bookRead, bookId),
  saveProgress: (update: ProgressUpdate) => ipcRenderer.invoke(IPC.progressSave, update),
  flushProgress: (update: ProgressUpdate) => ipcRenderer.send(IPC.progressFlush, update),
  updateSettings: (patch: Partial<ReaderSettings>) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
