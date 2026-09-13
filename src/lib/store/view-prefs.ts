/**
 * The viewer's display preferences, remembered between visits.
 *
 * Kept apart from the session store on purpose: that store holds the session and
 * the replay clock and is reset on every load, while these belong to the person
 * and survive across sessions. Persisted to localStorage, which only exists in the
 * browser; zustand's JSON storage treats its absence during server rendering as
 * "nothing stored", so the server always renders the default.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ViewMode = 'simple' | 'engineer';

interface ViewPrefs {
  /** Simple is the default: the app is meant to be understood without help. */
  mode: ViewMode;
  /** The first-visit guide has been finished or dismissed. */
  onboardingSeen: boolean;
  /** Open right now, whether automatically on a first visit or from the header. */
  onboardingOpen: boolean;

  setMode: (mode: ViewMode) => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

export const useViewPrefs = create<ViewPrefs>()(
  persist(
    (set) => ({
      mode: 'simple',
      onboardingSeen: false,
      onboardingOpen: false,

      setMode: (mode) => set({ mode }),
      openOnboarding: () => set({ onboardingOpen: true }),
      closeOnboarding: () => set({ onboardingOpen: false, onboardingSeen: true }),
    }),
    {
      name: 'pit-wall.view',
      storage: createJSONStorage(() => localStorage),
      // Whether the guide is open is a moment, not a preference.
      partialize: (state) => ({ mode: state.mode, onboardingSeen: state.onboardingSeen }),
    },
  ),
);
