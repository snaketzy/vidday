import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router'

import { App } from '@/App'
import { store } from '@/store'

import '@/styles/globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载节点')

// 临时摘掉 StrictMode：dev 下 effect 会执行两遍（setup → cleanup → setup），
// 用于验证播放器黑屏是否由它造成。排查结束后按需恢复。
createRoot(container).render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>,
)
