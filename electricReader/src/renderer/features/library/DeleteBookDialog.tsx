import { useState, type ReactNode } from 'react'
import type { Book } from '@shared/types'
import { Modal } from '../../components/Modal'
import { TrashIcon } from '../../components/icons'
import { formatFileSize } from '../../services/format'
import { useLibraryStore } from '../../stores/library-store'
import { Spinner } from '../../components/Spinner'

interface DeleteBookDialogProps {
  book: Book | null
  onClose: () => void
}

export function DeleteBookDialog({ book, onClose }: DeleteBookDialogProps): ReactNode {
  const deleteBook = useLibraryStore((state) => state.deleteBook)
  const [deleting, setDeleting] = useState(false)

  const confirm = async (): Promise<void> => {
    if (!book || deleting) return
    setDeleting(true)
    const ok = await deleteBook(book.id)
    setDeleting(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open={book !== null}
      title="从书库移除"
      {...(book ? { description: `《${book.title}》` } : {})}
      onClose={() => {
        if (!deleting) onClose()
      }}
      tone="danger"
      footer={
        <>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-full border border-line px-4 py-2 text-[12.5px] text-muted transition hover:bg-surface disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void confirm()}
            className="inline-flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {deleting ? <Spinner className="h-3.5 w-3.5" /> : <TrashIcon size={14} />}
            {deleting ? '正在移除…' : '确认移除'}
          </button>
        </>
      }
    >
      {book ? (
        <div className="space-y-3 text-[13px] leading-6 text-muted">
          <p>
            将删除 electricReader 管理的副本（{formatFileSize(book.fileSize)}
            ）与封面缓存。你最初导入的原始文件不受影响。
          </p>
          <div className="rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-[12px] text-danger">
            这个操作不可撤销，阅读进度也会一并清除。
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
