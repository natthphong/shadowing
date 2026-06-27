import { create } from 'zustand'
import { Session, Segment } from '../types'

interface AppState {
  // Current session being practiced
  activeSession: Session | null
  activeSegments: Segment[]
  currentSegmentIndex: number
  showTranslation: boolean
  showIPA: boolean
  autoScroll: boolean
  playbackSpeed: number

  setActiveSession: (session: Session | null) => void
  setActiveSegments: (segments: Segment[]) => void
  setCurrentSegmentIndex: (idx: number) => void
  nextSegment: () => void
  prevSegment: () => void
  toggleTranslation: () => void
  toggleIPA: () => void
  toggleAutoScroll: () => void
  setPlaybackSpeed: (speed: number) => void
  resetPractice: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSession: null,
  activeSegments: [],
  currentSegmentIndex: 0,
  showTranslation: true,
  showIPA: false,
  autoScroll: true,
  playbackSpeed: 1.0,

  setActiveSession: (session) => set({ activeSession: session }),
  setActiveSegments: (segments) => set({ activeSegments: segments }),
  setCurrentSegmentIndex: (idx) => set({ currentSegmentIndex: idx }),
  nextSegment: () => {
    const { currentSegmentIndex, activeSegments } = get()
    if (currentSegmentIndex < activeSegments.length - 1) {
      set({ currentSegmentIndex: currentSegmentIndex + 1 })
    }
  },
  prevSegment: () => {
    const { currentSegmentIndex } = get()
    if (currentSegmentIndex > 0) {
      set({ currentSegmentIndex: currentSegmentIndex - 1 })
    }
  },
  toggleTranslation: () => set((s) => ({ showTranslation: !s.showTranslation })),
  toggleIPA: () => set((s) => ({ showIPA: !s.showIPA })),
  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  resetPractice: () =>
    set({
      activeSession: null,
      activeSegments: [],
      currentSegmentIndex: 0,
      playbackSpeed: 1.0
    })
}))
