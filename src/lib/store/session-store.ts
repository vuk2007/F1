/**
 * The single session store: loaded dataset + replay clock + UI selection.
 *
 * The store holds state only. Every derived value (timing table, gaps, tyre age)
 * comes from the pure selectors in lib/replay, so swapping the replay source for
 * a live feed means replacing `dataset` and nothing else.
 */
import { create } from 'zustand';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { LoadProgress } from '@/lib/openf1/loader';

export const REPLAY_SPEEDS = [1, 2, 10, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SessionState {
  /* ---- data ---- */
  dataset: SessionDataset | null;
  status: LoadStatus;
  progress: LoadProgress | null;
  error: string | null;
  /** Set when OpenF1 has locked the API during a live session. */
  lockedOut: boolean;

  /* ---- replay clock ---- */
  /** Current replay position, epoch ms. */
  timeMs: number;
  playing: boolean;
  speed: ReplaySpeed;

  /* ---- selection ---- */
  selectedDriver: number | null;

  /* ---- actions ---- */
  beginLoad: () => void;
  setProgress: (progress: LoadProgress) => void;
  setDataset: (dataset: SessionDataset) => void;
  setError: (message: string, lockedOut?: boolean) => void;
  reset: () => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  /** Absolute scrub, clamped to the session window. */
  seek: (timeMs: number) => void;
  /** Advance by a delta in ms; used by the clock tick. */
  advance: (deltaMs: number) => void;

  selectDriver: (driverNumber: number | null) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  dataset: null,
  status: 'idle',
  progress: null,
  error: null,
  lockedOut: false,

  timeMs: 0,
  playing: false,
  speed: 1,

  selectedDriver: null,

  beginLoad: () =>
    set({ status: 'loading', error: null, lockedOut: false, progress: null, dataset: null }),

  setProgress: (progress) => set({ progress }),

  setDataset: (dataset) =>
    set({
      dataset,
      status: 'ready',
      error: null,
      lockedOut: false,
      // Start at the session's green light rather than at t=0.
      timeMs: dataset.startMs,
      playing: false,
    }),

  setError: (message, lockedOut = false) => set({ status: 'error', error: message, lockedOut }),

  reset: () =>
    set({
      dataset: null,
      status: 'idle',
      progress: null,
      error: null,
      lockedOut: false,
      timeMs: 0,
      playing: false,
      speed: 1,
      selectedDriver: null,
    }),

  play: () => {
    const { dataset, timeMs } = get();
    // Replaying from the very end would look frozen; rewind to the start.
    if (dataset && timeMs >= dataset.endMs) set({ timeMs: dataset.startMs });
    set({ playing: true });
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),

  setSpeed: (speed) => set({ speed }),

  seek: (timeMs) => {
    const { dataset } = get();
    if (!dataset) return;
    set({ timeMs: clamp(timeMs, dataset.startMs, dataset.endMs) });
  },

  advance: (deltaMs) => {
    const { dataset, timeMs } = get();
    if (!dataset) return;
    const next = timeMs + deltaMs;
    if (next >= dataset.endMs) {
      set({ timeMs: dataset.endMs, playing: false });
      return;
    }
    set({ timeMs: next });
  },

  selectDriver: (driverNumber) => set({ selectedDriver: driverNumber }),
}));
