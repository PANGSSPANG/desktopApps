/** 壳无关能力锚点：渲染层只认这里描述的平台事实，不直接判断 Electron。 */
export interface PlatformInfo {
  name: 'electron'
  os: 'win32' | 'darwin' | 'linux' | 'other'
  isDesktop: true
}

export const platform: PlatformInfo = {
  name: 'electron',
  os: (() => {
    const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
    if (agent.includes('Windows')) return 'win32'
    if (agent.includes('Macintosh')) return 'darwin'
    if (agent.includes('Linux')) return 'linux'
    return 'other'
  })(),
  isDesktop: true,
}
