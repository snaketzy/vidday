import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Quality = 'auto' | '1080p' | '4k'
export type SubtitleTrack = 'off' | '简体中文' | 'English'
export type AudioTrack = '国语配音' | '原声'

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
}

export const initialState: PlayerState = {
  titleId: null,
  episodeId: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  quality: 'auto',
  subtitle: 'off',
  audio: '国语配音',
  rate: 1,
  controlsVisible: true,
  fullscreen: false,
  autoplayNext: true,
  ended: false,
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
      state.controlsVisible = true
    },
    endSession(state) {
      state.isPlaying = false
      state.titleId = null
      state.episodeId = null
      state.position = 0
      state.duration = 0
      state.ended = false
      state.fullscreen = false
      state.controlsVisible = true
    },
    play(state) {
      if (state.ended) state.position = 0
      state.ended = false
      state.isPlaying = true
    },
    pause(state) {
      state.isPlaying = false
    },
    togglePlay(state) {
      if (state.ended) {
        state.position = 0
        state.ended = false
        state.isPlaying = true
        return
      }
      state.isPlaying = !state.isPlaying
    },
    seek(state, action: PayloadAction<number>) {
      state.position = clamp(action.payload, 0, state.duration)
      state.ended = false
    },
    seekBy(state, action: PayloadAction<number>) {
      state.position = clamp(state.position + action.payload, 0, state.duration)
      state.ended = false
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = clamp(action.payload, 0, 1)
      state.muted = state.volume === 0
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
    /** 播放时钟：仅在播放中推进位置 */
    tick(state) {
      if (!state.isPlaying || state.duration === 0) return
      state.position = clamp(state.position + state.rate, 0, state.duration)
      if (state.position >= state.duration) {
        state.isPlaying = false
        state.ended = true
      }
    },
  },
})

export const {
  loadSession,
  endSession,
  play,
  pause,
  togglePlay,
  seek,
  seekBy,
  setVolume,
  toggleMute,
  setQuality,
  setSubtitle,
  setAudio,
  setRate,
  setControlsVisible,
  setFullscreen,
  setAutoplayNext,
  dismissEnded,
  tick,
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
