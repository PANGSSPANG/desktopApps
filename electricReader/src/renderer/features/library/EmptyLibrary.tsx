import type { ReactNode } from 'react'
import { BookOpenIcon, PlusIcon, UploadIcon } from '../../components/icons'

interface EmptyLibraryProps {
  importing: boolean
  onImport: () => void
}

export function EmptyLibrary({ importing, onImport }: EmptyLibraryProps): ReactNode {
  return (
    <div className="relative flex min-h-[calc(100vh-220px)] items-center justify-center py-10">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-accent-soft blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg text-center">
        <div className="mx-auto mb-8 flex h-[132px] w-[188px] items-end justify-center gap-1.5">
          <div className="h-[100px] w-8 origin-bottom -rotate-6 rounded-t-sm border border-black/10 bg-[#6a7b6b] shadow-md" />
          <div className="h-[122px] w-10 rounded-t-sm border border-black/10 bg-accent shadow-xl" />
          <div className="flex h-[116px] w-[78px] flex-col justify-between rounded-r-md border border-black/10 bg-elevated p-2.5 shadow-xl">
            <div className="space-y-1">
              <div className="h-1 w-full rounded bg-line" />
              <div className="h-1 w-4/5 rounded bg-line" />
            </div>
            <BookOpenIcon size={22} className="text-accent/70" />
          </div>
          <div className="h-[92px] w-7 origin-bottom rotate-3 rounded-t-sm border border-black/10 bg-[#8a745c] shadow-md" />
        </div>

        <h2 className="font-reading text-[26px] font-semibold tracking-tight text-ink">
          书架还是空的
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-7 text-muted">
          把 EPUB 或 TXT
          文件拖进窗口，或从电脑里选几本。导入后书会复制到应用目录，原文件不会被改动。
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onImport}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent-hover disabled:opacity-60"
          >
            <PlusIcon size={17} />
            {importing ? '正在导入…' : '选择 EPUB / TXT 文件'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
            <UploadIcon size={14} />
            也可以直接拖拽进来
          </span>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10.5px] uppercase tracking-[0.12em] text-faint">
          <span>EPUB 2 / EPUB 3 / TXT</span>
          <span className="h-1 w-1 rounded-full bg-line" />
          <span>完全离线</span>
          <span className="h-1 w-1 rounded-full bg-line" />
          <span>本地优先</span>
        </div>
      </div>
    </div>
  )
}
