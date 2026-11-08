import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Title, WatchProgress } from '@/types'

export interface WatchState {
  progress: WatchProgress[]
}

const initialState: WatchState = {
  progress: [],
}

const watchSlice = createSlice({
  name: 'watch',
  initialState,
  reducers: {
    recordProgress(state, action: PayloadAction<WatchProgress>) {
      const incoming = action.payload
      const index = state.progress.findIndex((item) => item.titleId === incoming.titleId)
      if (index >= 0) {
        state.progress[index] = incoming
      } else {
        state.progress.unshift(incoming)
      }
      state.progress.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    },
    removeProgress(state, action: PayloadAction<string>) {
      state.progress = state.progress.filter((item) => item.titleId !== action.payload)
    },
    clearProgress(state) {
      state.progress = []
    },
  },
})

export const { recordProgress, removeProgress, clearProgress } = watchSlice.actions

interface StateWithWatch {
  watch: WatchState
}
interface StateWithCatalogTitles {
  catalog: { titles: Title[] }
}

export interface ContinueWatchingItem {
  title: Title
  progress: WatchProgress
}

export const selectContinueWatching = (
  state: StateWithWatch & StateWithCatalogTitles,
  kidsOnly = false,
): ContinueWatchingItem[] => {
  const byId = new Map(state.catalog.titles.map((title) => [title.id, title]))
  return state.watch.progress
    .map((progress) => {
      const title = byId.get(progress.titleId)
      return title ? { title, progress } : undefined
    })
    .filter((item): item is ContinueWatchingItem => Boolean(item))
    .filter((item) =>
      kidsOnly
        ? item.title.genres.some((genre) => genre === 'animation' || genre === 'family')
        : true,
    )
    .filter((item) => item.progress.percent > 0 && item.progress.percent < 98)
}

export const selectProgressForTitle = (state: StateWithWatch, titleId: string) =>
  state.watch.progress.find((item) => item.titleId === titleId)

export default watchSlice
