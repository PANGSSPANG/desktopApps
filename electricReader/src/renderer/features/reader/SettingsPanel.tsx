import { useEffect, type ReactNode } from 'react'
import {
  DEFAULT_SETTINGS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  MAX_WIDTH_OPTIONS,
  PAGE_TURN_OPTIONS,
} from '@shared/defaults'
import type {
  FontFamily,
  FontSize,
  LineHeight,
  MaxWidth,
  PageTurn,
  ReaderSettings,
  ThemeName,
} from '@shared/types'
import { FONT_SIZE_LABELS, LINE_HEIGHT_LABELS, MAX_WIDTH_LABELS, THEME_LABELS } from '@shared/types'
import { CheckIcon, ChevronRightIcon, XIcon } from '../../components/icons'
import { cn, THEME_SWATCHES } from '../../services/format'

interface SettingsPanelProps {
  open: boolean
  settings: ReaderSettings
  systemDark: boolean
  onClose: () => void
  onPatch: (patch: Partial<ReaderSettings>) => void
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}): ReactNode {
  return (
    <section className="border-b border-line/60 px-5 py-5 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-semibold text-ink">{title}</h3>
        {hint ? <span className="text-[10px] text-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span className="flex-1">
        <span className="block text-[12.5px] text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-elevated shadow transition',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  labels,
  onChange,
}: {
  options: readonly T[]
  value: T
  labels: Record<string, string>
  onChange: (value: T) => void
}): ReactNode {
  return (
    <div className="flex rounded-lg border border-line bg-canvas/60 p-1">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'flex-1 rounded-md py-1.5 text-[11px] transition',
            value === option
              ? 'bg-elevated font-medium text-ink shadow-sm'
              : 'text-muted hover:text-ink',
          )}
        >
          {labels[String(option)] ?? String(option)}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({
  open,
  settings,
  systemDark,
  onClose,
  onPatch,
}: SettingsPanelProps): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const effectiveTheme: ThemeName = settings.followSystem
    ? systemDark
      ? 'dark'
      : 'light'
    : settings.theme

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/15 er-fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="排版设置"
        className="relative flex h-full w-[380px] max-w-[92vw] flex-col border-l border-line bg-elevated shadow-2xl er-slide-left"
      >
        <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-line/70 px-5">
          <div>
            <div className="font-reading text-[17px] font-semibold text-ink">排版</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-faint">Typography</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭排版设置"
            className="rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
          >
            <XIcon size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="主题" hint={settings.followSystem ? '跟随系统' : '手动'}>
            <div className="grid grid-cols-3 gap-2">
              {THEME_SWATCHES.map((option) => {
                const selected = !settings.followSystem && settings.theme === option.theme
                return (
                  <button
                    key={option.theme}
                    type="button"
                    data-testid={`theme-${option.theme}`}
                    aria-pressed={selected}
                    onClick={() => onPatch({ theme: option.theme, followSystem: false })}
                    className={cn(
                      'rounded-lg border p-1.5 transition',
                      selected
                        ? 'border-accent/70 bg-accent-soft'
                        : 'border-line hover:border-accent/30',
                    )}
                  >
                    <span
                      className="relative flex h-9 items-center justify-center rounded border border-black/5"
                      style={{ background: option.colors[0] }}
                    >
                      <span
                        className="h-1 w-6 rounded-full opacity-70"
                        style={{ background: option.colors[1] }}
                      />
                      {selected ? (
                        <span className="absolute right-1 top-1 text-accent">
                          <CheckIcon size={11} />
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-muted">
                      {THEME_LABELS[option.theme]}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-4">
              <Toggle
                checked={settings.followSystem}
                onChange={(checked) => onPatch({ followSystem: checked })}
                label="跟随系统"
                description={`实际使用：${THEME_LABELS[effectiveTheme]}`}
              />
            </div>
          </Section>

          <Section title="字号" hint={FONT_SIZE_LABELS[settings.fontSize]}>
            <div className="grid grid-cols-5 gap-1.5">
              {FONT_SIZE_OPTIONS.map((size: FontSize) => (
                <button
                  key={size}
                  type="button"
                  data-testid={`font-size-${size}`}
                  aria-pressed={settings.fontSize === size}
                  onClick={() => onPatch({ fontSize: size })}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border py-2 transition',
                    settings.fontSize === size
                      ? 'border-accent/60 bg-accent-soft text-accent'
                      : 'border-line text-muted hover:text-ink',
                  )}
                >
                  <span
                    className="font-reading leading-none"
                    style={{ fontSize: `${11 + (size - 100) / 12}px` }}
                  >
                    A
                  </span>
                  <span className="text-[9px]">{FONT_SIZE_LABELS[size]}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="行距">
            <Segmented<LineHeight>
              options={LINE_HEIGHT_OPTIONS}
              value={settings.lineHeight}
              labels={LINE_HEIGHT_LABELS}
              onChange={(lineHeight) => onPatch({ lineHeight })}
            />
          </Section>

          <Section title="版心宽度" hint={`${settings.maxWidth}px`}>
            <Segmented<MaxWidth>
              options={MAX_WIDTH_OPTIONS}
              value={settings.maxWidth}
              labels={MAX_WIDTH_LABELS}
              onChange={(maxWidth) => onPatch({ maxWidth })}
            />
          </Section>

          <Section title="字体">
            <div className="grid grid-cols-2 gap-2">
              {FONT_FAMILY_OPTIONS.map((family: FontFamily) => (
                <button
                  key={family}
                  type="button"
                  aria-pressed={settings.fontFamily === family}
                  onClick={() => onPatch({ fontFamily: family })}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-left transition',
                    settings.fontFamily === family
                      ? 'border-accent/60 bg-accent-soft'
                      : 'border-line hover:border-accent/30',
                  )}
                >
                  <span
                    className={cn(
                      'block text-[15px]',
                      family === 'serif' ? 'font-reading' : 'font-ui',
                    )}
                  >
                    读书
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {family === 'serif' ? '衬线 · 宋体' : '无衬线 · 黑体'}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="中文排版">
            <Toggle
              checked={settings.indentFirstLine}
              onChange={(indentFirstLine) => onPatch({ indentFirstLine })}
              label="段首缩进两字符"
              description="中文书籍通常使用首行缩进阅读更顺"
            />
          </Section>

          <Section title="翻页方式">
            <Segmented<PageTurn>
              options={PAGE_TURN_OPTIONS}
              value={settings.pageTurn}
              labels={{ keys: '键盘', click: '点击', both: '两者' }}
              onChange={(pageTurn) => onPatch({ pageTurn })}
            />
            <p className="mt-2.5 text-[10.5px] leading-5 text-faint">
              支持方向键、PageUp / PageDown、空格；触控板左右滑动始终可用。
            </p>
          </Section>
        </div>

        <div className="shrink-0 border-t border-line/70 px-5 py-4">
          <button
            type="button"
            onClick={() => onPatch(DEFAULT_SETTINGS)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[11.5px] text-muted transition hover:text-ink"
          >
            恢复默认排版
            <ChevronRightIcon size={14} />
          </button>
          <p className="mt-2 text-center text-[10px] text-faint">调整立即生效，并停留在当前段落</p>
        </div>
      </aside>
    </div>
  )
}
