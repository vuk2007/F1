'use client';

/**
 * The live mode status bar: source toggle, connection state, and how stale the
 * data is.
 *
 * The age of the last message is the number that matters. A bridge can be
 * connected and a feed can be "up" while nothing has arrived for five minutes, and
 * without a visible clock there is no way to tell that from a session where the
 * cars are simply in the garage. So it ticks in the UI rather than only updating
 * when a message lands.
 *
 * Two connection states are shown separately because only one of them is the
 * user's to fix: the socket to the bridge on this machine, and the bridge's own
 * connection to F1.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { strings } from '@/lib/i18n/strings';
import type { BridgeSourceState } from '@/lib/live/bridgeSource';

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full"
      /* Green and amber rather than green and red: a feed that is down between
         sessions is normal, and red would read as a fault. */
      style={{ backgroundColor: on ? '#199e70' : '#c98500' }}
    />
  );
}

export function LiveStatus({
  state,
  following,
  onJumpToLive,
  onOpenRecording,
  recordingNote,
  recordingActive,
  onBackToLive,
}: {
  state: BridgeSourceState;
  following: boolean;
  onJumpToLive: () => void;
  onOpenRecording: (file: File) => void;
  /** Result of the last recording load, if any. */
  recordingNote: string | null;
  /**
   * A recording is on screen. The live connection is paused, so its state is
   * hidden rather than shown as "offline", which would read as a fault.
   */
  recordingActive: boolean;
  onBackToLive: () => void;
}) {
  /*
   * The age has to keep counting up between messages, so it ticks on a timer — the
   * only thing on this page that re-renders without new data.
   *
   * The clock is read inside the interval and never during render: rendering must
   * be pure, and a time read during render would also differ between the server
   * pass and the client one. The timer restarts whenever a message arrives, so the
   * age is measured against the latest one.
   */
  const lastMessageMs = state.lastMessageMs;
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (lastMessageMs === null) return;
    const timer = setInterval(
      () => setAgeSeconds(Math.max(0, (Date.now() - lastMessageMs) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, [lastMessageMs]);

  /*
   * Between a message landing and the first tick, the age is known to be about
   * zero — that is what "a message just arrived" means — so it reads as just now
   * rather than falsely as nothing received.
   */
  const displayAge = lastMessageMs === null ? null : (ageSeconds ?? 0);

  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="text-foreground bg-surface-2 rounded px-1.5 py-0.5 font-medium">
          {strings.live.modeLive}
        </span>
        <Link href="/" className="text-muted hover:text-foreground rounded px-1.5 py-0.5">
          {strings.live.modeReplay}
        </Link>
      </div>

      {recordingActive ? (
        <span className="flex items-center gap-2">
          <span className="text-muted">{strings.live.replayingRecording}</span>
          <button type="button" onClick={onBackToLive} className="text-accent hover:underline">
            {strings.live.backToLive}
          </button>
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <Dot on={state.connected} />
            <span className="text-muted">
              {state.connected ? strings.live.connected : strings.live.disconnected}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            <Dot on={state.feedConnected} />
            <span className="text-muted">
              {state.feedConnected ? strings.live.feedUp : strings.live.feedDown}
            </span>
          </span>

          <span className="text-muted tnum">
            {displayAge === null ? strings.live.noMessages : strings.live.lastMessage(displayAge)}
          </span>

          {!following && (
            <button
              type="button"
              onClick={onJumpToLive}
              className="text-accent hover:underline"
              title={strings.live.holding}
            >
              {strings.live.jumpToLive}
            </button>
          )}
        </>
      )}

      {/* Pushed right, since it is a different job from watching the session. */}
      <label className="text-muted hover:text-foreground ml-auto cursor-pointer">
        <span className="underline decoration-dotted">{strings.live.openRecording}</span>
        <input
          type="file"
          accept=".jsonl,application/jsonl,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            /*
             * Cleared so picking the same file twice fires a change both times,
             * which is what happens when reloading a recording the bridge is still
             * appending to.
             */
            event.target.value = '';
            if (file) onOpenRecording(file);
          }}
        />
      </label>

      {recordingNote !== null && <span className="text-muted">{recordingNote}</span>}
    </div>
  );
}
