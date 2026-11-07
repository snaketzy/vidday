import { contextBridge, ipcRenderer } from 'electron'

import type { NodeDelay, ProxyGroupView, ProxyStatus } from './shared'

/**
 * 暴露给渲染层的最小桌面能力面，业务代码通过 `window.vidday` 访问。
 * 保持收窄：只开放必要的只读能力，不做任意 IPC 透传。
 */
const bridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  proxy: {
    status: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:status'),
    restart: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:restart'),
    refreshSubscription: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:refresh-subscription'),
    getSubscription: (): Promise<string> => ipcRenderer.invoke('proxy:get-subscription'),
    setSubscription: (url: string): Promise<ProxyStatus> =>
      ipcRenderer.invoke('proxy:set-subscription', url),
    groups: (): Promise<ProxyGroupView[]> => ipcRenderer.invoke('proxy:groups'),
    select: (group: string, node: string, activateRoute?: string): Promise<void> =>
      ipcRenderer.invoke('proxy:select', group, node, activateRoute),
    delay: (node: string, slot?: number): Promise<NodeDelay> =>
      ipcRenderer.invoke('proxy:delay', node, slot),
  },
}

contextBridge.exposeInMainWorld('vidday', bridge)

export type ViddayBridge = typeof bridge
