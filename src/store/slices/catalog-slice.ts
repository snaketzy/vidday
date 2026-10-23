import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { titles as allTitles } from '@/data/titles'
import {
  defaultFilters,
  filterTitles,
  isKidsTitle,
  resolveRail,
  similarTitles,
  topTen,
  type CatalogFilters,
  type SortBy,
} from '@/lib/catalog'
import type { RailConfig, Title } from '@/types'

export interface CatalogState {
  titles: Title[]
  keyword: string
  filters: CatalogFilters
}

const initialState: CatalogState = {
  titles: allTitles,
  keyword: '',
  filters: defaultFilters,
}

const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {
    setKeyword(state, action: PayloadAction<string>) {
      state.keyword = action.payload
    },
    clearKeyword(state) {
      state.keyword = ''
    },
    setType(state, action: PayloadAction<CatalogFilters['type']>) {
      state.filters.type = action.payload
    },
    toggleGenre(state, action: PayloadAction<string>) {
      state.filters.genreId = state.filters.genreId === action.payload ? null : action.payload
    },
    setGenre(state, action: PayloadAction<string | null>) {
      state.filters.genreId = action.payload
    },
    setSortBy(state, action: PayloadAction<SortBy>) {
      state.filters.sortBy = action.payload
    },
    resetFilters(state) {
      state.filters = defaultFilters
    },
  },
})

export const { setKeyword, clearKeyword, setType, toggleGenre, setGenre, setSortBy, resetFilters } =
  catalogSlice.actions

interface StateWithCatalog {
  catalog: CatalogState
}

export const selectAllTitles = (state: StateWithCatalog) => state.catalog.titles
export const selectKeyword = (state: StateWithCatalog) => state.catalog.keyword
export const selectFilters = (state: StateWithCatalog) => state.catalog.filters

export const selectTitleById = (state: StateWithCatalog, id: string | undefined) =>
  id ? state.catalog.titles.find((title) => title.id === id) : undefined

export const selectVisibleTitles = (state: StateWithCatalog, kidsOnly = false) =>
  filterTitles(state.catalog.titles, state.catalog.filters, state.catalog.keyword, kidsOnly)

export const selectSearchResults = (state: StateWithCatalog, kidsOnly = false) =>
  filterTitles(
    state.catalog.titles,
    { ...state.catalog.filters, genreId: null, type: 'all' },
    state.catalog.keyword,
    kidsOnly,
  )

export const selectTopTen = (state: StateWithCatalog, kidsOnly = false) =>
  topTen(kidsOnly ? state.catalog.titles.filter(isKidsTitle) : state.catalog.titles)

export const selectRailTitles = (state: StateWithCatalog, rail: RailConfig, kidsOnly = false) => {
  const list = kidsOnly ? state.catalog.titles.filter(isKidsTitle) : state.catalog.titles
  return resolveRail(rail, list)
}

export const selectSimilar = (state: StateWithCatalog, title: Title, limit?: number) =>
  similarTitles(title, state.catalog.titles, limit)

export const selectGenreCounts = (state: StateWithCatalog) => {
  const counts = new Map<string, number>()
  state.catalog.titles.forEach((title) => {
    title.genres.forEach((genre) => counts.set(genre, (counts.get(genre) ?? 0) + 1))
  })
  return counts
}

export default catalogSlice
