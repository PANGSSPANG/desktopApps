import type { BrowserWindow } from 'electron'
import { writeCoverThumbnail } from '../epub/cover'
import { ImportService } from '../epub/import-service'
import type { LibraryRepository } from '../storage/library-repo'
import type { AppPaths } from '../storage/paths'
import { registerBookIpc } from './books'

export interface IpcRegistration {
  repo: LibraryRepository
  paths: AppPaths
  getWindow: () => BrowserWindow | null
}

export function registerIpc(registration: IpcRegistration): void {
  const imports = new ImportService(registration.repo, registration.paths, writeCoverThumbnail)
  registerBookIpc({
    repo: registration.repo,
    paths: registration.paths,
    imports,
    getWindow: registration.getWindow,
  })
}
