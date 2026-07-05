// Thin wrapper around the YouTube IFrame Player API. YouTube iframes cannot
// be driven via the HTMLMediaElement interface (currentTime / play / pause),
// so the shadowing controls talk to the iframe through this API.
//
//   const yt = useYouTubePlayer({ videoId, onTick })
//   <div ref={yt.containerRef} className="w-full h-full" />
//   yt.seekTo(seg.start_time); yt.play(); yt.setRate(1.25)
//
// `onTick` fires every ~250ms with the current playback time once the player
// is ready — pass a stable callback (useCallback) to drive auto-stop / loop /
// transcript highlighting.

import { useCallback, useEffect, useRef } from 'react'

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YtPlayer {
  playVideo?: () => void
  pauseVideo?: () => void
  seekTo?: (t: number, allowSeekAhead: boolean) => void
  setPlaybackRate?: (rate: number) => void
  getCurrentTime?: () => number
  getPlayerState?: () => number
  destroy?: () => void
}

const SCRIPT_ID = 'yt-iframe-api'

function loadYouTubeAPI(): Promise<NonNullable<Window['YT']>> {
  if (window.YT?.Player) return Promise.resolve(window.YT)

  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try { prev?.() } catch { /* ignore */ }
      resolve(window.YT!)
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.body.appendChild(script)
    }
  })
}

export function extractYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(url)
    if (match) return match[1]
  }
  return ''
}

export type YouTubePlayerHandle = {
  containerRef: (el: HTMLDivElement | null) => void
  isReady: () => boolean
  play: () => void
  pause: () => void
  seekTo: (t: number, autoPlay?: boolean) => void
  setRate: (rate: number) => void
  getCurrentTime: () => number
  isPlaying: () => boolean
}

type Options = {
  videoId: string
  onTick?: (currentTime: number, state: number) => void
  onReady?: () => void
  onStateChange?: (state: number) => void
  pollMs?: number
}

export function useYouTubePlayer({ videoId, onTick, onReady, onStateChange, pollMs = 250 }: Options): YouTubePlayerHandle {
  const playerRef = useRef<YtPlayer | null>(null)
  const readyRef = useRef(false)
  const containerElRef = useRef<HTMLDivElement | null>(null)
  const onTickRef = useRef(onTick)
  const onReadyRef = useRef(onReady)
  const onStateChangeRef = useRef(onStateChange)
  // Seek requested before the player finished loading — replayed on ready so
  // an early Play click still works.
  const pendingSeekRef = useRef<{ t: number; autoPlay: boolean } | null>(null)

  onTickRef.current = onTick
  onReadyRef.current = onReady
  onStateChangeRef.current = onStateChange

  // (Re)mount the player whenever the videoId changes.
  useEffect(() => {
    if (!videoId) return
    let cancelled = false

    const mount = async (): Promise<void> => {
      const YT = await loadYouTubeAPI()
      if (cancelled || !containerElRef.current) return
      try { playerRef.current?.destroy?.() } catch { /* ignore */ }
      readyRef.current = false
      playerRef.current = new YT.Player(containerElRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          controls: 0,
          disablekb: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true
            onReadyRef.current?.()
            const pending = pendingSeekRef.current
            if (pending) {
              pendingSeekRef.current = null
              try {
                playerRef.current?.seekTo?.(pending.t, true)
                if (pending.autoPlay) playerRef.current?.playVideo?.()
              } catch { /* ignore */ }
            }
          },
          onStateChange: (event: { data: number }) => {
            onStateChangeRef.current?.(event.data)
          }
        }
      })
    }
    void mount()

    return () => {
      cancelled = true
      try { playerRef.current?.destroy?.() } catch { /* ignore */ }
      playerRef.current = null
      readyRef.current = false
    }
  }, [videoId])

  // Polling loop for auto-stop / loop / transcript-sync features.
  useEffect(() => {
    if (!onTick) return
    const interval = setInterval(() => {
      if (!readyRef.current || !playerRef.current) return
      try {
        const t = playerRef.current.getCurrentTime?.() ?? 0
        const state = playerRef.current.getPlayerState?.() ?? -1
        onTickRef.current?.(t, state)
      } catch { /* getCurrentTime can throw mid-destroy — ignore */ }
    }, pollMs)
    return () => clearInterval(interval)
  }, [onTick, pollMs])

  const setContainer = useCallback((el: HTMLDivElement | null) => {
    containerElRef.current = el
  }, [])

  const isReady = useCallback(() => readyRef.current, [])
  const play = useCallback(() => {
    if (readyRef.current) playerRef.current?.playVideo?.()
  }, [])
  const pause = useCallback(() => {
    if (readyRef.current) playerRef.current?.pauseVideo?.()
  }, [])
  const seekTo = useCallback((t: number, autoPlay = true) => {
    if (!readyRef.current) {
      pendingSeekRef.current = { t, autoPlay }
      return
    }
    try {
      playerRef.current?.seekTo?.(t, true)
      if (autoPlay) playerRef.current?.playVideo?.()
    } catch { /* ignore */ }
  }, [])
  const setRate = useCallback((rate: number) => {
    if (readyRef.current) {
      try { playerRef.current?.setPlaybackRate?.(rate) } catch { /* ignore */ }
    }
  }, [])
  const getCurrentTime = useCallback(() => {
    try {
      return readyRef.current ? playerRef.current?.getCurrentTime?.() ?? 0 : 0
    } catch { return 0 }
  }, [])
  const isPlaying = useCallback(() => {
    try {
      const state = readyRef.current ? playerRef.current?.getPlayerState?.() ?? -1 : -1
      return state === 1 || state === 3 // playing or buffering
    } catch { return false }
  }, [])

  return { containerRef: setContainer, isReady, play, pause, seekTo, setRate, getCurrentTime, isPlaying }
}
