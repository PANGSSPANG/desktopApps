import type { ReactNode } from 'react'
import type { ImportSummary } from '@shared/types'
import { Modal } from '../../components/Modal'
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from '../../components/icons'

interface ImportReportDialogProps {
  summary: ImportSummary | null
  onClose: () => void
}

export function ImportReportDialog({ summary, onClose }: ImportReportDialogProps): ReactNode {
  return (
    <Modal
      open={summary !== null}
      title="导入结果"
      description="每一本都单独校验，失败不会影响已导入的书。"
      onClose={onClose}
      width="max-w-xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-canvas transition hover:opacity-90"
        >
          知道了
        </button>
      }
    >
      {summary ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-surface/60 px-3 py-3 text-center">
              <div className="font-reading text-2xl font-semibold text-success">
                {summary.imported.length}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">成功导入</div>
            </div>
            <div className="rounded-xl border border-line bg-surface/60 px-3 py-3 text-center">
              <div className="font-reading text-2xl font-semibold text-ink">
                {summary.duplicates.length}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">已存在</div>
            </div>
            <div className="rounded-xl border border-line bg-surface/60 px-3 py-3 text-center">
              <div className="font-reading text-2xl font-semibold text-danger">
                {summary.errors.length}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">未导入</div>
            </div>
          </div>

          {summary.imported.length > 0 ? (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <CheckCircleIcon size={14} className="text-success" />
                已加入书架
              </h3>
              <ul className="space-y-1.5">
                {summary.imported.map((book) => (
                  <li
                    key={book.id}
                    className="truncate rounded-lg bg-surface/60 px-3 py-2 text-[12px] text-ink"
                  >
                    {book.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.duplicates.length > 0 ? (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <InfoIcon size={14} className="text-accent" />
                已在书库中（按内容校验）
              </h3>
              <ul className="space-y-1.5">
                {summary.duplicates.map((item) => (
                  <li
                    key={item.id}
                    className="truncate rounded-lg bg-accent-soft px-3 py-2 text-[12px] text-accent"
                  >
                    {item.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.errors.length > 0 ? (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <AlertTriangleIcon size={14} className="text-danger" />
                未能导入
              </h3>
              <ul className="space-y-2">
                {summary.errors.map((item) => (
                  <li
                    key={`${item.fileName}-${item.code}`}
                    className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2"
                  >
                    <div className="truncate text-[12px] font-medium text-ink">{item.fileName}</div>
                    <div className="mt-0.5 text-[11px] leading-5 text-danger">{item.message}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
