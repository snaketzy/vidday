import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 渲染层兜底：任何未捕获的渲染异常都降级为可恢复界面，
 * 避免整棵组件树被卸载后页面变成无法操作的死屏——
 * 播放页尤其致命，它渲染在 AppLayout 之外，没有顶栏与右键菜单可用来逃逸。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染异常', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleHome = () => {
    window.location.assign('/')
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[#141414] px-6 text-center text-white">
        <h1 className="text-xl font-semibold">播放器遇到问题</h1>
        <p className="max-w-md text-sm text-white/70">
          页面渲染出现异常，已拦截以避免影响其它功能。可重新加载，或返回首页重试。
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded bg-white px-5 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            重新加载
          </button>
          <button
            type="button"
            onClick={this.handleHome}
            className="rounded border border-white/30 px-5 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }
}
