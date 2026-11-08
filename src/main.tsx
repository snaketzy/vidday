import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router'

import { App } from '@/App'
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
