import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface UiState {
  /** 顶部导航栏是否已滚过首屏 */
  headerScrolled: boolean
  /** 顶部搜索框是否展开 */
  searchOpen: boolean
  /** 移动端导航抽屉 */
  navOpen: boolean
  /** 正在预览的作品（详情弹窗） */
  previewTitleId: string | null
}

const initialState: UiState = {
  headerScrolled: false,
  searchOpen: false,
  navOpen: false,
  previewTitleId: null,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setHeaderScrolled(state, action: PayloadAction<boolean>) {
      state.headerScrolled = action.payload
    },
    setSearchOpen(state, action: PayloadAction<boolean>) {
      state.searchOpen = action.payload
      if (action.payload) state.navOpen = false
    },
    setNavOpen(state, action: PayloadAction<boolean>) {
      state.navOpen = action.payload
      if (action.payload) state.searchOpen = false
    },
    openPreview(state, action: PayloadAction<string>) {
      state.previewTitleId = action.payload
    },
    closePreview(state) {
      state.previewTitleId = null
    },
  },
})

export const { setHeaderScrolled, setSearchOpen, setNavOpen, openPreview, closePreview } = uiSlice.actions

interface StateWithUi {
  ui: UiState
}

export const selectHeaderScrolled = (state: StateWithUi) => state.ui.headerScrolled
export const selectSearchOpen = (state: StateWithUi) => state.ui.searchOpen
export const selectNavOpen = (state: StateWithUi) => state.ui.navOpen
export const selectPreviewTitleId = (state: StateWithUi) => state.ui.previewTitleId

export default uiSlice
