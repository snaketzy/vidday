import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { DEMO_CREDENTIALS, account as demoAccount, profiles as defaultProfiles } from '@/data/profiles'
import type { Account, Profile } from '@/types'

export type AuthStatus = 'idle' | 'pending' | 'authenticated'

export interface AuthState {
  account: Account | null
  activeProfileId: string | null
  status: AuthStatus
  error: string | null
}

const initialState: AuthState = {
  account: null,
  activeProfileId: null,
  status: 'idle',
  error: null,
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const login = createAsyncThunk<Account, { email: string; password: string }, { rejectValue: string }>(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    await wait(700)
    const normalized = email.trim().toLowerCase()
    if (!normalized || !password) {
      return rejectWithValue('请输入邮箱与密码')
    }
    if (normalized !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
      return rejectWithValue('邮箱或密码不正确。可使用演示账号：demo@vidday.tv / vidday')
    }
    return { ...demoAccount, profiles: defaultProfiles }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.account = null
      state.activeProfileId = null
      state.status = 'idle'
      state.error = null
    },
    clearError(state) {
      state.error = null
    },
    selectProfile(state, action: PayloadAction<string>) {
      const exists = state.account?.profiles.some((profile) => profile.id === action.payload)
      if (exists) state.activeProfileId = action.payload
    },
    addProfile: {
      reducer(state, action: PayloadAction<Profile>) {
        state.account?.profiles.push(action.payload)
      },
      prepare(name: string, isKids = false) {
        return {
          payload: {
            id: `p-${Date.now().toString(36)}`,
            name: name.trim() || '新观众',
            color: isKids ? '#f5c518' : '#2f80ed',
            isKids,
            avatarArt: '扁平插画风格的人物头像，正面微笑，纯色背景',
          } satisfies Profile,
        }
      },
    },
    renameProfile(state, action: PayloadAction<{ id: string; name: string }>) {
      const profile = state.account?.profiles.find((item) => item.id === action.payload.id)
      if (profile) profile.name = action.payload.name.trim() || profile.name
    },
    removeProfile(state, action: PayloadAction<string>) {
      if (!state.account) return
      if (state.account.profiles.length <= 1) return
      state.account.profiles = state.account.profiles.filter((profile) => profile.id !== action.payload)
      if (state.activeProfileId === action.payload) state.activeProfileId = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'pending'
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'authenticated'
        state.account = action.payload
        state.activeProfileId = null
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'idle'
        state.error = action.payload ?? '登录失败，请稍后重试'
      })
  },
})

export const { logout, clearError, selectProfile, addProfile, renameProfile, removeProfile } = authSlice.actions

export const selectAccount = (state: { auth: AuthState }) => state.auth.account
export const selectAuthStatus = (state: { auth: AuthState }) => state.auth.status
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error
export const selectProfiles = (state: { auth: AuthState }) => state.auth.account?.profiles ?? []
export const selectIsAuthenticated = (state: { auth: AuthState }) => Boolean(state.auth.account)
export const selectActiveProfile = (state: { auth: AuthState }) => {
  const { account, activeProfileId } = state.auth
  if (!account || !activeProfileId) return undefined
  return account.profiles.find((profile) => profile.id === activeProfileId)
}
export const selectKidsMode = (state: { auth: AuthState }) => Boolean(selectActiveProfile(state)?.isKids)

export default authSlice
