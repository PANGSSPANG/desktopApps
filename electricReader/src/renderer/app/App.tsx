import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BrandMark, RefreshIcon } from '../components/icons'
import { resolvedTheme, useSystemDark } from '../hooks/use-resolved-theme'
import { PageLoading } from '../components/Spinner'
import { ToastViewport } from '../components/ToastViewport'
import { LibraryPage } from '../features/library/LibraryPage'
import { useLibraryStore } from '../stores/library-store'
import { useSettingsStore } from '../stores/settings-store'

const ReaderPage = lazy(() => import('../features/reader/ReaderPage'))

function useApplyTheme(): void {
  const settings = useSettingsStore((state) => state.settings)
  const systemDark = useSystemDark()
  const theme = resolvedTheme(settings, systemDark)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }, [theme])
}

function StartupError({ message }: { message: string }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-8 text-center">
      <BrandMark size={44} />
      <h1 className="mt-5 font-reading text-2xl font-semibold text-ink">书库没能打开</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{message}</p>
      <button
        type="button"
        onClick={() => void useLibraryStore.getState().load()}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
      >
        <RefreshIcon size={16} />
        重试
      </button>
    </div>
  )
}

function BootGate({ children }: { children: ReactNode }): ReactNode {
  const initialized = useLibraryStore((state) => state.initialized)
  const error = useLibraryStore((state) => state.error)

  useEffect(() => {
    if (!useLibraryStore.getState().initialized) void useLibraryStore.getState().load()
  }, [])

  if (!initialized) {
    if (error) return <StartupError message={error} />
    return <PageLoading label="正在打开书库…" />
  }
  return <>{children}</>
}

function ReaderFallback(): ReactNode {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-reader text-muted">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <span className="text-sm tracking-wide">正在准备阅读器…</span>
    </div>
  )
}

export function App(): ReactNode {
  useApplyTheme()

  return (
    <BootGate>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route
            path="/read/:bookId"
            element={
              <Suspense fallback={<ReaderFallback />}>
                <ReaderPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <ToastViewport />
    </BootGate>
  )
}
