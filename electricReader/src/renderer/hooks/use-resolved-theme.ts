import { useEffect, useState } from 'react'
import type { ReaderSettings, ThemeName } from '@shared/types'

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => setDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return dark
}

export function resolvedTheme(settings: ReaderSettings, systemDark: boolean): ThemeName {
  if (settings.followSystem) return systemDark ? 'dark' : 'light'
  return settings.theme
}
