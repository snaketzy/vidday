import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** 画质档位：`auto` 为 HLS 自适应，其余取值来自实际轨道信息（如 `720p`） */
export type Quality = string
export type SubtitleTrack = 'off' | '简体中文' | 'English'
export type AudioTrack = '国语配音' | '原声'

/** 默认画质档位 */
export const DEFAULT_QUALITY: Quality = '720p'

export interface PlayerState {
  titleId: string | null
  episodeId: string | null
  isPlaying: boolean
  /** 当前播放位置（秒） */
  position: number
  /** 总时长（秒） */
  duration: number
  volume: number
  muted: boolean
  quality: Quality
  subtitle: SubtitleTrack
  audio: AudioTrack
  rate: number
  controlsVisible: boolean
  fullscreen: boolean
  autoplayNext: boolean
  ended: boolean
  /** 缓冲中（等待数据） */
  buffering: boolean
}

export const initialState: PlayerState = {
  titleId: null,
  episodeId: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  quality: DEFAULT_QUALITY,
  subtitle: 'off',
  audio: '国语配音',
  rate: 1,
  controlsVisible: true,
  fullscreen: false,
  autoplayNext: true,
  ended: false,
  buffering: false,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    loadSession(
      state,
      action: PayloadAction<{ titleId: string; episodeId: string | null; position: number; duration: number }>,
    ) {
      state.titleId = action.payload.titleId
      state.episodeId = action.payload.episodeId
      state.position = clamp(action.payload.position, 0, action.payload.duration)
      state.duration = action.payload.duration
      state.ended = false
      state.isPlaying = true
      state.buffering = true
      state.controlsVisible = true
    },
    endSession(state) {
      state.isPlaying = false
      state.titleId = null
      state.episodeId = null
      state.position = 0
      state.duration = 0
      state.ended = false
      state.buffering = false
      state.fullscreen = false
      state.controlsVisible = true
    },
    /** 由播放内核回写：当前播放位置（秒） */
    setPosition(state, action: PayloadAction<number>) {
      state.position = clamp(action.payload, 0, state.duration || action.payload)
    },
    /** 由播放内核回写：真实媒体时长（秒） */
    setDuration(state, action: PayloadAction<number>) {
      if (!Number.isFinite(action.payload) || action.payload <= 0) return
      state.duration = action.payload
      state.position = clamp(state.position, 0, action.payload)
    },
    /** 由播放内核回写：播放/暂停状态 */
    setPlaying(state, action: PayloadAction<boolean>) {
      state.isPlaying = action.payload
      if (action.payload) {
        if (state.position >= state.duration) state.position = 0
        state.ended = false
      }
    },
    setBuffering(state, action: PayloadAction<boolean>) {
      state.buffering = action.payload
    },
    markEnded(state) {
      state.isPlaying = false
      state.ended = true
      state.buffering = false
    },
    seek(state, action: PayloadAction<number>) {
      state.position = clamp(action.payload, 0, state.duration)
      state.ended = false
      state.buffering = false
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = clamp(action.payload, 0, 1)
      state.muted = state.volume === 0
    },
    setMuted(state, action: PayloadAction<boolean>) {
      state.muted = action.payload
    },
    toggleMute(state) {
      state.muted = !state.muted
    },
    setQuality(state, action: PayloadAction<Quality>) {
      state.quality = action.payload
    },
    setSubtitle(state, action: PayloadAction<SubtitleTrack>) {
      state.subtitle = action.payload
    },
    setAudio(state, action: PayloadAction<AudioTrack>) {
      state.audio = action.payload
    },
    setRate(state, action: PayloadAction<number>) {
      state.rate = action.payload
    },
    setControlsVisible(state, action: PayloadAction<boolean>) {
      state.controlsVisible = action.payload
    },
    setFullscreen(state, action: PayloadAction<boolean>) {
      state.fullscreen = action.payload
    },
    setAutoplayNext(state, action: PayloadAction<boolean>) {
      state.autoplayNext = action.payload
    },
    dismissEnded(state) {
      state.ended = false
    },
  },
})

export const {
  loadSession,
  endSession,
  setPosition,
  setDuration,
  setPlaying,
  setBuffering,
  markEnded,
  seek,
  setVolume,
  setMuted,
  toggleMute,
  setQuality,
  setSubtitle,
  setAudio,
  setRate,
  setControlsVisible,
  setFullscreen,
  setAutoplayNext,
  dismissEnded,
} = playerSlice.actions

interface StateWithPlayer {
  player: PlayerState
}

export const selectPlayer = (state: StateWithPlayer) => state.player
export const selectIsPlaying = (state: StateWithPlayer) => state.player.isPlaying
export const selectPlayerProgress = (state: StateWithPlayer) =>
  state.player.duration > 0 ? (state.player.position / state.player.duration) * 100 : 0

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default playerSlice
