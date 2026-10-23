import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Title } from '@/types'

export interface MyListState {
  ids: string[]
}

const initialState: MyListState = {
  ids: ['deep-current', 'the-algorithm'],
}

const myListSlice = createSlice({
  name: 'myList',
  initialState,
  reducers: {
    toggleTitle(state, action: PayloadAction<string>) {
      const index = state.ids.indexOf(action.payload)
      if (index >= 0) {
        state.ids.splice(index, 1)
      } else {
        state.ids.unshift(action.payload)
      }
    },
    addTitle(state, action: PayloadAction<string>) {
      if (!state.ids.includes(action.payload)) state.ids.unshift(action.payload)
    },
    removeTitle(state, action: PayloadAction<string>) {
      state.ids = state.ids.filter((id) => id !== action.payload)
    },
    clearList(state) {
      state.ids = []
    },
  },
})

export const { toggleTitle, addTitle, removeTitle, clearList } = myListSlice.actions

interface StateWithMyList {
  myList: MyListState
}
interface StateWithTitles {
  catalog: { titles: Title[] }
}

export const selectMyListIds = (state: StateWithMyList) => state.myList.ids

export const selectMyListTitles = (state: StateWithMyList & StateWithTitles) => {
  const byId = new Map(state.catalog.titles.map((title) => [title.id, title]))
  return state.myList.ids
    .map((id) => byId.get(id))
    .filter((title): title is Title => Boolean(title))
}

export const selectIsInMyList = (state: StateWithMyList, id: string) => state.myList.ids.includes(id)

export default myListSlice
