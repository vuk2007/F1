'use client';

/**
 * Drives the replay clock with requestAnimationFrame.
 *
 * Wall-clock delta between frames is multiplied by the speed setting, so replay
 * stays accurate regardless of frame rate. Mount this once, high in the session
 * page; the store is the single source of time for everything below it.
 */
import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/lib/store/session-store';

export function useReplayClock(): void {
  const playing = useSessionStore((s) => s.playing);
  const speed = useSessionStore((s) => s.speed);
  const advance = useSessionStore((s) => s.advance);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null;
      return;
    }

    let frame = 0;
    const tick = (now: number) => {
      const last = lastFrameRef.current;
      lastFrameRef.current = now;
      if (last != null) {
        // Clamp the delta so a backgrounded tab does not jump the replay forward
        // by however long it was hidden.
        const delta = Math.min(now - last, 250);
        advance(delta * speed);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      lastFrameRef.current = null;
    };
  }, [playing, speed, advance]);
}
