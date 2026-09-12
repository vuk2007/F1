'use client';

/**
 * Play/pause, speed and scrubber for the replay clock.
 * All state lives in the session store; this component only dispatches.
 */
import { formatElapsed } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { TrackStatus } from '@/lib/replay/selectors';
import { REPLAY_SPEEDS, useSessionStore, type ReplaySpeed } from '@/lib/store/session-store';

const STATUS_CLASS: Record<TrackStatus, string> = {
  green: 'bg-sector-green/20 text-sector-green',
  yellow: 'bg-sector-yellow/20 text-sector-yellow',
  sc: 'bg-sector-yellow/25 text-sector-yellow',
  vsc: 'bg-sector-yellow/25 text-sector-yellow',
  red: 'bg-danger/25 text-danger',
  chequered: 'bg-surface-2 text-foreground',
  unknown: 'bg-surface-2 text-muted',
};

export function ReplayControls({
  startMs,
  endMs,
  lap,
  trackStatus,
}: {
  startMs: number;
  endMs: number;
  lap: number | null;
  trackStatus: TrackStatus;
}) {
  const timeMs = useSessionStore((s) => s.timeMs);
  const playing = useSessionStore((s) => s.playing);
  const speed = useSessionStore((s) => s.speed);
  const togglePlay = useSessionStore((s) => s.togglePlay);
  const setSpeed = useSessionStore((s) => s.setSpeed);
  const seek = useSessionStore((s) => s.seek);

  const elapsed = Math.max(0, timeMs - startMs);
  const duration = Math.max(1, endMs - startMs);

  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-4 border-b px-4 py-3">
      <button
        type="button"
        onClick={togglePlay}
        className="bg-accent w-20 rounded-md px-3 py-1.5 text-sm font-medium text-black transition hover:opacity-90"
      >
        {playing ? strings.replay.pause : strings.replay.play}
      </button>

      <div className="flex items-center gap-1">
        <span className="text-muted mr-1 text-xs">{strings.replay.speed}</span>
        {REPLAY_SPEEDS.map((option: ReplaySpeed) => (
          <button
            key={option}
            type="button"
            onClick={() => setSpeed(option)}
            className={`rounded px-2 py-1 text-xs transition ${
              speed === option ? 'bg-accent/25 text-foreground' : 'text-muted hover:bg-surface-2'
            }`}
          >
            {option}x
          </button>
        ))}
      </div>

      <div className="flex min-w-[240px] flex-1 items-center gap-3">
        <label htmlFor="scrubber" className="sr-only">
          {strings.replay.scrubber}
        </label>
        <input
          id="scrubber"
          type="range"
          min={startMs}
          max={endMs}
          step={1000}
          value={timeMs}
          onChange={(event) => seek(Number(event.target.value))}
          className="bg-surface-2 h-1 w-full cursor-pointer appearance-none rounded accent-[var(--accent)]"
        />
        <span className="tnum text-muted w-20 text-right text-xs">
          {formatElapsed(elapsed)} / {formatElapsed(duration)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="tnum text-sm">
          <span className="text-muted">{strings.replay.lap} </span>
          {lap ?? '—'}
        </span>
        <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_CLASS[trackStatus]}`}>
          {strings.trackStatus[trackStatus]}
        </span>
      </div>
    </div>
  );
}
