import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn, THEME_SWATCHES } from '../services/format'
import { useSettingsStore } from '../stores/settings-store'
import { useSystemDark, resolvedTheme } from '../hooks/use-resolved-theme'
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from './icons'

export function ThemeMenu(): ReactNode {
  const settings = useSettingsStore((state) => state.settings)
  const save = useSettingsStore((state) => state.save)
  const systemDark = useSystemDark()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const theme = resolvedTheme(settings, systemDark)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const triggerIcon = settings.followSystem ? (
    <MonitorIcon size={17} />
  ) : theme === 'dark' ? (
    <MoonIcon size={17} />
  ) : (
    <SunIcon size={17} />
  )

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="外观设置"
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface/70 px-3 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-ink"
      >
        {triggerIcon}
        <span className="hidden sm:inline">
          {settings.followSystem
            ? '跟随系统'
            : THEME_SWATCHES.find((s) => s.theme === theme)?.label}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[268px] overflow-hidden rounded-xl border border-line bg-elevated p-3 shadow-xl er-rise-in"
        >
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
            外观
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={settings.followSystem}
            onClick={() => {
              void save({ followSystem: !settings.followSystem })
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-canvas"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-muted">
              <MonitorIcon size={16} />
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-medium text-ink">跟随系统</span>
              <span className="block text-[11px] text-muted">随 Windows 深浅色自动切换</span>
            </span>
            <span
              className={cn(
                'relative h-5 w-9 rounded-full transition',
                settings.followSystem ? 'bg-accent' : 'bg-line',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-elevated shadow transition',
                  settings.followSystem ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
          </button>

          <div className="my-2 h-px bg-line/70" />
          <div className="grid grid-cols-3 gap-2">
            {THEME_SWATCHES.map((option) => {
              const selected = !settings.followSystem && settings.theme === option.theme
              return (
                <button
                  key={option.theme}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    void save({ theme: option.theme, followSystem: false })
                    setOpen(false)
                  }}
                  className={cn(
                    'group rounded-lg border p-1.5 text-left transition',
                    selected
                      ? 'border-accent/70 bg-accent-soft'
                      : 'border-transparent hover:border-line hover:bg-canvas',
                  )}
                >
                  <span
                    className="relative flex h-10 items-center justify-center overflow-hidden rounded-md border border-black/5"
                    style={{ background: option.colors[0] }}
                  >
                    <span
                      className="h-1 w-7 rounded-full opacity-70"
                      style={{ background: option.colors[1] }}
                    />
                    {selected ? (
                      <span className="absolute right-1 top-1 text-accent">
                        <CheckIcon size={12} />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block text-center text-[11px] text-muted group-hover:text-ink">
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
