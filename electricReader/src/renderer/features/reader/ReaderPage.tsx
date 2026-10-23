import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { mergeSettings, normalizeLocator } from '@shared/defaults'
import type { BookStatus, Locator, ReaderSettings } from '@shared/types'
import { ArrowLeftIcon, FileWarningIcon, RefreshIcon } from '../../components/icons'
import { Spinner } from '../../components/Spinner'
import { ApiError, api } from '../../services/api'
import { useLibraryStore } from '../../stores/library-store'
import { useReaderStore } from '../../stores/reader-store'
import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { resolvedTheme, useSystemDark } from '../../hooks/use-resolved-theme'
import type { ReaderEngine } from './engine/types'
import { ReaderFooter } from './ReaderFooter'
import { ReaderToolbar } from './ReaderToolbar'
import { SettingsPanel } from './SettingsPanel'
import { TocDrawer } from './TocDrawer'

interface OpenError {
  message: string
  code: string
}

const SAVE_DEBOUNCE_MS = 1200

export default function ReaderPage(): ReactNode {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  const book = useLibraryStore((state) => state.books.find((item) => item.id === bookId) ?? null)
  const storedSettings = useSettingsStore((state) => state.settings)
  const systemDark = useSystemDark()
  const locator = useReaderStore((state) => state.locator)
  const percent = useReaderStore((state) => state.percent)
  const toc = useReaderStore((state) => state.toc)
  const busy = useReaderStore((state) => state.busy)

  const [localSettings, setLocalSettings] = useState<ReaderSettings>(storedSettings)
  const [loading, setLoading] = useState(true)
  const [engineReady, setEngineReady] = useState(false)
  const [openError, setOpenError] = useState<OpenError | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ReaderEngine | null>(null)
  const latestRef = useRef<{ locator: Locator; percent: number } | null>(null)
  const pendingAnchorRef = useRef<Locator | null>(null)
  const appliedKeyRef = useRef('')
  const systemDarkRef = useRef(systemDark)

  const effectiveSettings = useMemo<ReaderSettings>(
    () => ({ ...localSettings, theme: resolvedTheme(localSettings, systemDark) }),
    [localSettings, systemDark],
  )
  const effectiveRef = useRef(effectiveSettings)

  useEffect(() => {
    effectiveRef.current = effectiveSettings
    systemDarkRef.current = systemDark
  }, [effectiveSettings, systemDark])

  useEffect(() => {
    document.title = book ? `${book.title} — electricReader` : 'electricReader'
    return () => {
      document.title = 'electricReader'
    }
  }, [book])

  useEffect(() => {
    const initialBook = useLibraryStore.getState().books.find((item) => item.id === bookId)
    if (!initialBook || initialBook.fileMissing) return

    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let saveTimer: number | null = null
    let saveErrorShown = false
    let engine: ReaderEngine | null = null

    const store = useReaderStore.getState()
    store.reset()
    setLoading(true)
    setOpenError(null)
    setEngineReady(false)

    const initialLocator = normalizeLocator(initialBook.progress.locator)
    if (initialLocator) {
      store.setLocator(initialLocator, initialBook.progress.percent)
    }

    const persist = async (loc: Locator, value: number): Promise<void> => {
      try {
        const updated = await api.saveProgress({ bookId, locator: loc, percent: value })
        if (!cancelled) useLibraryStore.getState().updateBook(updated)
      } catch (error) {
        if (!cancelled && !saveErrorShown) {
          saveErrorShown = true
          toast.error(
            '阅读进度未能保存',
            error instanceof Error ? error.message : '下一次翻页会自动重试',
          )
        }
      }
    }

    const flush = (): void => {
      const latest = latestRef.current
      if (!latest) return
      api.flushProgress({ bookId, locator: latest.locator, percent: latest.percent })
    }

    const scheduleSave = (loc: Locator, value: number): void => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        saveTimer = null
        void persist(loc, value)
      }, SAVE_DEBOUNCE_MS)
    }

    let committedFirstLocation = false
    const onRelocated = (nextLocator: Locator, nextPercent: number): void => {
      if (cancelled) return
      latestRef.current = { locator: nextLocator, percent: nextPercent }
      useReaderStore.getState().setLocator(nextLocator, nextPercent)
      if (!committedFirstLocation) {
        // 首次定位立刻落盘，让「在读」状态和最近阅读时间马上正确。
        committedFirstLocation = true
        void persist(nextLocator, nextPercent)
      } else {
        scheduleSave(nextLocator, nextPercent)
      }
    }

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onBeforeUnload = (): void => flush()

    const open = async (): Promise<void> => {
      try {
        const data = await api.readBook(bookId)
        const { EpubJsReaderEngine } = await import('./engine/epubjs-engine')
        if (cancelled) return
        engine = new EpubJsReaderEngine()
        engineRef.current = engine
        const initialSettings = effectiveRef.current
        const effectiveInitial: ReaderSettings = {
          ...initialSettings,
          theme: resolvedTheme(initialSettings, systemDarkRef.current),
        }
        await engine.open(host, data, effectiveInitial, initialLocator, {
          onRelocated,
          onBusyChange: (value) => {
            if (!cancelled) useReaderStore.getState().setBusy(value)
          },
          onBoundary: (edge) => {
            if (cancelled || edge !== 'end') return
            const latest = latestRef.current
            if (!latest) return
            const finishedLocator: Locator = {
              ...latest.locator,
              locations: { ...latest.locator.locations, totalProgression: 1 },
            }
            latestRef.current = { locator: finishedLocator, percent: 100 }
            useReaderStore.getState().setLocator(finishedLocator, 100)
            scheduleSave(finishedLocator, 100)
          },
        })
        if (cancelled) return
        useReaderStore.getState().setToc(engine.getToc())
        appliedKeyRef.current = JSON.stringify(effectiveRef.current)
        setEngineReady(true)
        setLoading(false)
      } catch (error) {
        if (cancelled) return
        const failure =
          error instanceof ApiError
            ? { code: error.code, message: error.message }
            : {
                code: 'OPEN_FAILED',
                message: error instanceof Error ? error.message : '打开失败，请重试或换一本书',
              }
        setOpenError(failure)
        setLoading(false)
        engine?.destroy()
        engine = null
        engineRef.current = null
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBeforeUnload)
    void open()

    return () => {
      cancelled = true
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      flush()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      engine?.destroy()
      engineRef.current = null
      useReaderStore.getState().reset()
    }
  }, [bookId, retryNonce])

  useEffect(() => {
    if (!engineReady) return
    const key = JSON.stringify(effectiveSettings)
    if (key === appliedKeyRef.current) return
    appliedKeyRef.current = key
    const anchor = pendingAnchorRef.current ?? latestRef.current?.locator ?? null
    pendingAnchorRef.current = null
    void engineRef.current?.applySettings(effectiveSettings, anchor)
  }, [effectiveSettings, engineReady])

  useEffect(() => {
    engineRef.current?.setInputEnabled(!tocOpen && !settingsOpen && !busy && !loading)
  }, [tocOpen, settingsOpen, busy, loading])

  useEffect(() => {
    if (!tocOpen && !settingsOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setTocOpen(false)
        setSettingsOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tocOpen, settingsOpen])

  const handleBack = useCallback((): void => {
    const latest = latestRef.current
    if (latest) {
      api.flushProgress({ bookId, locator: latest.locator, percent: latest.percent })
    }
    navigate('/')
  }, [bookId, navigate])

  const handlePatch = useCallback(
    (patch: Partial<ReaderSettings>): void => {
      pendingAnchorRef.current =
        latestRef.current?.locator ?? useReaderStore.getState().locator ?? null
      const next = mergeSettings(localSettings, patch)
      setLocalSettings(next)
      void useSettingsStore.getState().save(next)
    },
    [localSettings],
  )

  const handleStatus = useCallback(
    async (status: BookStatus): Promise<void> => {
      const ok = await useLibraryStore.getState().setStatus(bookId, status)
      if (ok) {
        toast.success(
          status === 'finished'
            ? '已标记为读完'
            : status === 'reading'
              ? '已标记为在读'
              : '已标记为未读',
        )
      }
    },
    [bookId],
  )

  const goToToc = useCallback((href: string): void => {
    setTocOpen(false)
    void engineRef.current?.goToHref(href)
  }, [])

  if (!book) {
    return (
      <ReaderError
        title="找不到这本书"
        message="它可能已经从书库移除。回到书架刷新后再试。"
        code="BOOK_NOT_FOUND"
        onBack={() => navigate('/')}
        onRetry={() => navigate('/')}
      />
    )
  }

  const displayedError: OpenError | null =
    openError ??
    (book.fileMissing
      ? {
          code: 'FILE_MISSING',
          message: '书籍文件缺失，请回到书架重新定位文件，或移除这本书',
        }
      : null)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-reader text-ink">
      <ReaderToolbar
        book={book}
        percent={percent}
        tocOpen={tocOpen}
        settingsOpen={settingsOpen}
        onBack={handleBack}
        onToc={() => {
          setSettingsOpen(false)
          setTocOpen((value) => !value)
        }}
        onSettings={() => {
          setTocOpen(false)
          setSettingsOpen((value) => !value)
        }}
        onStatus={(status) => void handleStatus(status)}
      />

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex justify-center px-3 sm:px-8">
          <div
            className="relative h-full w-full border-x border-line/50 bg-page shadow-[0_0_60px_-30px_rgba(0,0,0,0.45)]"
            style={{ maxWidth: `${localSettings.maxWidth}px` }}
          >
            <div ref={hostRef} className="er-reader-host h-full w-full" />

            {loading && !displayedError ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-page">
                <div className="h-1 w-24 overflow-hidden rounded-full bg-line">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
                </div>
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <Spinner className="h-4 w-4 text-accent" />
                  正在打开《{book.title}》
                </div>
              </div>
            ) : null}

            {displayedError ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-page px-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <FileWarningIcon size={25} />
                </div>
                <h1 className="mt-4 font-reading text-xl font-semibold text-ink">无法打开这本书</h1>
                <p className="mt-2 max-w-sm text-[12.5px] leading-6 text-muted">
                  {displayedError.message}
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[12px] text-muted transition hover:bg-surface hover:text-ink"
                  >
                    <ArrowLeftIcon size={14} />
                    返回书架
                  </button>
                  {displayedError.code !== 'FILE_MISSING' ? (
                    <button
                      type="button"
                      onClick={() => setRetryNonce((value) => value + 1)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-white transition hover:bg-accent-hover"
                    >
                      <RefreshIcon size={14} />
                      重试
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {busy && !loading && !displayedError ? (
              <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-line bg-elevated/95 px-3 py-1.5 text-[10.5px] text-muted shadow-lg backdrop-blur">
                正在重排并回到原段落…
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ReaderFooter
        chapter={locator?.title ?? '正文'}
        percent={percent}
        onPrev={() => void engineRef.current?.prev()}
        onNext={() => void engineRef.current?.next()}
      />

      <TocDrawer
        open={tocOpen}
        toc={toc}
        activeHref={locator?.href ?? ''}
        onClose={() => setTocOpen(false)}
        onNavigate={goToToc}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={localSettings}
        systemDark={systemDark}
        onClose={() => setSettingsOpen(false)}
        onPatch={handlePatch}
      />
    </div>
  )
}

function ReaderError({
  title,
  message,
  code,
  onBack,
  onRetry,
}: {
  title: string
  message: string
  code: string
  onBack: () => void
  onRetry: () => void
}): ReactNode {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-reader px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <FileWarningIcon size={25} />
      </div>
      <h1 className="mt-4 font-reading text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-muted">{message}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[12px] text-muted transition hover:bg-surface hover:text-ink"
        >
          <ArrowLeftIcon size={14} />
          返回书架
        </button>
        {code !== 'FILE_MISSING' ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[12px] font-medium text-white transition hover:bg-accent-hover"
          >
            <RefreshIcon size={14} />
            重试
          </button>
        ) : null}
      </div>
    </div>
  )
}
