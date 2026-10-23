import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book, BookStatus, ImportSummary } from '@shared/types'
import { BookOpenIcon, GridIcon, ListIcon, PlusIcon, UploadIcon } from '../../components/icons'
import { BrandMark } from '../../components/icons'
import { ThemeMenu } from '../../components/ThemeMenu'
import { Spinner } from '../../components/Spinner'
import { api } from '../../services/api'
import { cn } from '../../services/format'
import { useLibraryStore } from '../../stores/library-store'
import { toast } from '../../stores/toast-store'
import { BookCard } from './BookCard'
import { BookListRow } from './BookListRow'
import { ContinueShelf } from './ContinueShelf'
import { DeleteBookDialog } from './DeleteBookDialog'
import { EmptyLibrary } from './EmptyLibrary'
import { ImportReportDialog } from './ImportReportDialog'

type Filter = 'all' | BookStatus
type ViewMode = 'grid' | 'list'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'reading', label: '在读' },
  { key: 'unread', label: '未读' },
  { key: 'finished', label: '已读' },
]

function readViewMode(): ViewMode {
  const stored = window.localStorage.getItem('electricreader.view')
  return stored === 'list' ? 'list' : 'grid'
}

export function LibraryPage(): ReactNode {
  const navigate = useNavigate()
  const books = useLibraryStore((state) => state.books)
  const importing = useLibraryStore((state) => state.importing)
  const importFromDialog = useLibraryStore((state) => state.importFromDialog)
  const importPaths = useLibraryStore((state) => state.importPaths)
  const relocate = useLibraryStore((state) => state.relocate)
  const load = useLibraryStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<ViewMode>(readViewMode)
  const [dropActive, setDropActive] = useState(false)
  const [report, setReport] = useState<ImportSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)
  const dragDepth = useRef(0)

  const counts = useMemo(() => {
    return {
      all: books.length,
      reading: books.filter((book) => book.status === 'reading').length,
      unread: books.filter((book) => book.status === 'unread').length,
      finished: books.filter((book) => book.status === 'finished').length,
    }
  }, [books])

  const filtered = useMemo(
    () => (filter === 'all' ? books : books.filter((book) => book.status === filter)),
    [books, filter],
  )

  const continueBook = useMemo(() => {
    const withHistory = books
      .filter((book) => book.lastReadAt && !book.fileMissing)
      .sort((a, b) => Date.parse(b.lastReadAt ?? '') - Date.parse(a.lastReadAt ?? ''))
    return withHistory[0] ?? null
  }, [books])

  const showSummary = (summary: ImportSummary | null): void => {
    if (!summary) return
    if (summary.imported.length > 0) {
      toast.success(
        `已导入 ${summary.imported.length} 本`,
        summary.imported.length === 1 ? summary.imported[0]?.title : '书架已刷新',
      )
    }
    if (summary.duplicates.length > 0 || summary.errors.length > 0) setReport(summary)
  }

  const handleImport = async (): Promise<void> => {
    showSummary(await importFromDialog())
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    const paths = files.map((file) => api.getPathForFile(file)).filter(Boolean)
    if (paths.length === 0) {
      toast.error('无法读取拖入文件的路径', '请改用「导入书籍」按钮选择文件')
      return
    }
    showSummary(await importPaths(paths))
  }

  const changeView = (mode: ViewMode): void => {
    setView(mode)
    window.localStorage.setItem('electricreader.view', mode)
  }

  const openBook = (book: Book): void => {
    if (book.fileMissing) {
      void relocate(book.id)
      return
    }
    navigate(`/read/${book.id}`)
  }

  return (
    <div
      className="h-full overflow-y-auto bg-canvas"
      onDragEnter={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        dragDepth.current += 1
        setDropActive(true)
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDropActive(false)
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1520px] items-center gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size={38} />
            <div className="min-w-0">
              <div className="font-reading text-[19px] font-semibold leading-6 tracking-tight text-ink">
                electricReader
              </div>
              <div className="hidden text-[10.5px] uppercase tracking-[0.18em] text-faint sm:block">
                本地阅读书架
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="mr-1 hidden text-[11px] text-faint md:inline">
              {books.length > 0 ? `${books.length} 本书 · 完全离线` : '完全离线'}
            </span>
            <ThemeMenu />
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-medium text-white shadow-sm shadow-accent/20 transition hover:bg-accent-hover disabled:opacity-60"
            >
              {importing ? <Spinner className="h-3.5 w-3.5" /> : <PlusIcon size={15} />}
              {importing ? '导入中…' : '导入书籍'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1520px] px-5 pb-20 pt-7 sm:px-8">
        {books.length === 0 ? (
          <EmptyLibrary importing={importing} onImport={() => void handleImport()} />
        ) : (
          <div className="space-y-8">
            {continueBook && filter === 'all' ? (
              <ContinueShelf book={continueBook} onOpen={openBook} />
            ) : null}

            <section>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-2.5">
                    <h1 className="font-reading text-[30px] font-semibold tracking-tight text-ink">
                      我的书架
                    </h1>
                    <span className="text-[11px] tabular-nums text-faint">{books.length} 本</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    按最近阅读排序 · 进度与排版全局保存
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center rounded-full border border-line bg-surface/70 p-1"
                    role="tablist"
                    aria-label="筛选书籍"
                  >
                    {FILTERS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === item.key}
                        onClick={() => setFilter(item.key)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-[11.5px] font-medium transition',
                          filter === item.key
                            ? 'bg-ink text-canvas shadow-sm'
                            : 'text-muted hover:text-ink',
                        )}
                      >
                        {item.label}
                        <span
                          className={cn(
                            'ml-1.5 tabular-nums',
                            filter === item.key ? 'text-canvas/60' : 'text-faint',
                          )}
                        >
                          {counts[item.key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center rounded-full border border-line bg-surface/70 p-1">
                    <button
                      type="button"
                      aria-label="网格视图"
                      aria-pressed={view === 'grid'}
                      onClick={() => changeView('grid')}
                      className={cn(
                        'rounded-full p-1.5 transition',
                        view === 'grid' ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
                      )}
                    >
                      <GridIcon size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="列表视图"
                      aria-pressed={view === 'list'}
                      onClick={() => changeView('list')}
                      className={cn(
                        'rounded-full p-1.5 transition',
                        view === 'list' ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
                      )}
                    >
                      <ListIcon size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/40 py-16 text-center">
                  <BookOpenIcon size={26} className="text-faint" />
                  <div className="mt-3 font-reading text-lg text-ink">这个筛选下还没有书</div>
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="mt-3 text-[12px] text-accent underline-offset-4 hover:underline"
                  >
                    查看全部书籍
                  </button>
                </div>
              ) : view === 'grid' ? (
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                  {filtered.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      onOpen={openBook}
                      onDelete={setDeleteTarget}
                      onRelocate={(item) => void relocate(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-line/80 bg-surface/40 p-2">
                  {filtered.map((book) => (
                    <BookListRow
                      key={book.id}
                      book={book}
                      onOpen={openBook}
                      onDelete={setDeleteTarget}
                      onRelocate={(item) => void relocate(item.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {dropActive ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-8 backdrop-blur-sm er-fade-in">
          <div className="flex w-full max-w-xl flex-col items-center rounded-3xl border-2 border-dashed border-accent/70 bg-elevated/95 px-8 py-16 text-center shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <UploadIcon size={28} />
            </div>
            <div className="mt-5 font-reading text-2xl font-semibold text-ink">松手，放进书架</div>
            <p className="mt-2 text-[13px] text-muted">
              支持一次拖入多本 EPUB / TXT，重复的书会按内容自动跳过。
            </p>
          </div>
        </div>
      ) : null}

      <ImportReportDialog summary={report} onClose={() => setReport(null)} />
      <DeleteBookDialog book={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  )
}
