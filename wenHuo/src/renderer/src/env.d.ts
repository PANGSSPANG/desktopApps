import type { WenhuoApi } from '@shared/ipc';

declare global {
  interface Window {
    api: WenhuoApi;
  }
}

export {};
