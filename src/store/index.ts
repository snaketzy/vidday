import { configureStore } from '@reduxjs/toolkit'

import { loadState, saveState, clearState } from '@/lib/storage'
import { userSyncMiddleware } from '@/lib/user-sync'
import type { Account } from '@/types'

import authSlice, { type AuthState } from './slices/auth-slice'
import catalogSlice from './slices/catalog-slice'
import myListSlice from './slices/my-list-slice'
import playerSlice, { type PlayerState } from './slices/player-slice'
import uiSlice from './slices/ui-slice'
import watchSlice from './slices/watch-slice'

const PERSIST_KEY = 'state'
/** 本地存储结构版本：升级时清空旧缓存（含历史 mock 种子数据） */
const STORAGE_VERSION = 2
const VERSION_KEY = 'storage-version'

type PersistedPlayer = Pick<
  PlayerState,
  'volume' | 'muted' | 'subtitle' | 'audio' | 'rate' | 'autoplayNext'
>

interface PersistedState {
  auth?: { account: Account | null; activeProfileId: string | null }
  myList?: { ids: string[] }
  watch?: { progress: NonNullable<ReturnType<typeof watchSlice.getInitialState>>['progress'] }
  player?: PersistedPlayer
}

/** 存储版本落后时清空一次旧缓存，确保历史 mock 记录不会随持久化残留 */
function purgeLegacyState() {
  const version = loadState<number>(VERSION_KEY, 0)
  if (version < STORAGE_VERSION) {
    clearState(PERSIST_KEY)
    saveState(VERSION_KEY, STORAGE_VERSION)
  }
}

function buildPreloadedState() {
  purgeLegacyState()
  const persisted = loadState<PersistedState>(PERSIST_KEY, {})

  const authBase = authSlice.getInitialState()
  const auth: AuthState = {
    ...authBase,
    account: persisted.auth?.account ?? null,
    activeProfileId:
      persisted.auth?.activeProfileId && persisted.auth.account
        ? persisted.auth.activeProfileId
        : null,
    status: persisted.auth?.account ? 'authenticated' : 'idle',
  }

  const playerBase = playerSlice.getInitialState()
  const player: PlayerState = {
    ...playerBase,
    ...(persisted.player ?? {}),
    titleId: null,
    episodeId: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    ended: false,
    fullscreen: false,
    controlsVisible: true,
  }

  return {
    auth,
    catalog: catalogSlice.getInitialState(),
    myList: { ...myListSlice.getInitialState(), ...(persisted.myList ?? {}) },
    watch: { ...watchSlice.getInitialState(), ...(persisted.watch ?? {}) },
    player,
    ui: uiSlice.getInitialState(),
  }
}

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    catalog: catalogSlice.reducer,
    myList: myListSlice.reducer,
    watch: watchSlice.reducer,
    player: playerSlice.reducer,
    ui: uiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(userSyncMiddleware),
  preloadedState: buildPreloadedState(),
})

let saveTimer: ReturnType<typeof setTimeout> | undefined

store.subscribe(() => {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    const state = store.getState()
    const payload: PersistedState = {
      auth: { account: state.auth.account, activeProfileId: state.auth.activeProfileId },
      myList: state.myList,
      watch: state.watch,
      player: {
        volume: state.player.volume,
        muted: state.player.muted,
        subtitle: state.player.subtitle,
        audio: state.player.audio,
        rate: state.player.rate,
        autoplayNext: state.player.autoplayNext,
      },
    }
    saveState(PERSIST_KEY, payload)
  }, 300)
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
