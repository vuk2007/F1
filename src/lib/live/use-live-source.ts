'use client';

/**
 * Connects the bridge to the session store.
 *
 * The store is untouched by live mode, which takes a little care, because
 * `setDataset` was written for a one-shot load: it resets the clock to the start of
 * the session and pauses playback. Called once a second with a growing dataset it
 * would drag the replay back to the green light every second.
 *
 * So this restores the clock itself after each update, and the rule for where to
 * put it is:
 *
 *  - **Following the live edge** while the clock is still sitting where the last
 *    update left it. This is the default and is what live timing should do.
 *  - **Holding position** as soon as the clock is anywhere else, because the only
 *    way it got there is the user scrubbing back to look at something. Playback is
 *    restored too, so a paused scrub-back stays paused and a playing one keeps
 *    playing.
 *
 * That test needs no new store state and cannot get stuck: whatever the user does,
 * the next update either follows or holds, and jumping back to the live edge starts
 * it following again.
 */
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/lib/store/session-store';
import { BridgeSource, type BridgeSourceState } from './bridgeSource';

/** How far from the live edge still counts as following it. */
const FOLLOW_TOLERANCE_MS = 1_500;

export interface LiveSource {
  state: BridgeSourceState;
  /** True while the clock is pinned to the live edge. */
  following: boolean;
  /** Jumps to the live edge and resumes following. */
  jumpToLive: () => void;
}

export function useLiveSource(
  options: {
    url?: string;
    /**
     * False while something else owns the store — a recording on screen. Without
     * this the source keeps retrying the bridge in the background, and the moment
     * `pnpm bridge` starts its first dataset replaces the recording being studied.
     */
    enabled?: boolean;
  } = {},
): LiveSource {
  const [state, setState] = useState<BridgeSourceState>(() => ({
    connected: false,
    feedConnected: false,
    lastMessageMs: null,
    dataset: null,
    counts: {},
    error: null,
  }));
  const [following, setFollowing] = useState(true);

  const sourceRef = useRef<BridgeSource | null>(null);
  /** The live edge as of the previous update, to spot a clock the user moved. */
  const lastEdgeRef = useRef<number | null>(null);
  const followingRef = useRef(true);

  const url = options.url;
  const enabled = options.enabled ?? true;

  /*
   * Also checked inside the subscription, because disabling takes effect when the
   * effect cleans up — after a render — and a rebuild already scheduled could land
   * in that gap and overwrite whatever just took over the store.
   */
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const source = new BridgeSource({ url });
    sourceRef.current = source;

    // Puts the page into its loading state until the first dataset arrives.
    useSessionStore.getState().beginLoad();

    const unsubscribe = source.subscribe((next) => {
      setState(next);
      if (!next.dataset || !enabledRef.current) return;

      const store = useSessionStore.getState();
      const edge = next.dataset.endMs;
      const previousEdge = lastEdgeRef.current;

      /*
       * First dataset: nothing to compare against, so follow. Otherwise the clock
       * is still "at the edge" if it is where the previous update put it.
       */
      const atEdge =
        previousEdge === null || Math.abs(store.timeMs - previousEdge) <= FOLLOW_TOLERANCE_MS;
      const shouldFollow = followingRef.current && atEdge;

      const heldTime = store.timeMs;
      const wasPlaying = store.playing;

      store.setDataset(next.dataset);

      if (shouldFollow) {
        // Following IS live playback, so the clock is pinned rather than played —
        // and `play()` would rewind to the start from here anyway.
        store.seek(edge);
      } else {
        store.seek(heldTime);
        if (wasPlaying) store.play();
      }

      if (followingRef.current !== shouldFollow) {
        followingRef.current = shouldFollow;
        setFollowing(shouldFollow);
      }
      lastEdgeRef.current = shouldFollow ? edge : previousEdge;
    });

    source.start();

    return () => {
      unsubscribe();
      source.stop();
      sourceRef.current = null;
      lastEdgeRef.current = null;
    };
  }, [url, enabled]);

  /* Tell the bridge which driver is on screen, so it can stop sending the rest. */
  const selectedDriver = useSessionStore((store) => store.selectedDriver);
  useEffect(() => {
    if (selectedDriver != null) sourceRef.current?.subscribeDriver(selectedDriver);
  }, [selectedDriver]);

  return {
    state,
    following,
    jumpToLive: () => {
      const store = useSessionStore.getState();
      if (store.dataset) {
        store.pause();
        store.seek(store.dataset.endMs);
        lastEdgeRef.current = store.dataset.endMs;
      }
      followingRef.current = true;
      setFollowing(true);
    },
  };
}
