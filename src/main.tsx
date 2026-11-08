import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router'

import { App } from '@/App'
import { registerProxyConfigSource } from '@/lib/proxy-config'
import { hydrateUserData } from '@/lib/user-sync'
import { store } from '@/store'

import '@/styles/globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载节点')

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)

/** 启动水合：拉取服务端观看进度 / 我的片单，与本地合并并回推增量 */
void hydrateUserData(store.dispatch, store.getState)

/** 启动注册内置代理远端配置来源：主进程据此同步订阅地址并在节点全失效时自动重拉 */
void registerProxyConfigSource()

