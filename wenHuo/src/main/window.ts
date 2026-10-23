import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import type { Logger } from './logger';

/**
 * 主窗口：contextIsolation + sandbox + 无 nodeIntegration。
 * 渲染层只能通过 preload 暴露的白名单 API 访问数据。
 */
export function createMainWindow(logger?: Logger): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '文火',
    backgroundColor: '#f6f1e7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.on('ready-to-show', () => window.show());

  // 焦点进出记录：出现"点不动输入框"时，先看日志判断是窗口丢了焦点还是事件没落到元素
  window.on('focus', () => logger?.info('window focus'));
  window.on('blur', () => logger?.info('window blur'));

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
