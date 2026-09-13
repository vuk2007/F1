'use client';

/** Lap counter with progress, the flag as a coloured word, and the weather in words. */
import type { FlagChip, FlagTone, LapProgress } from '@/lib/explain/race-story';
import { strings } from '@/lib/i18n/strings';
import { InfoTip } from '../InfoTip';

const TONE_CLASS: Record<FlagTone, string> = {
  green: 'bg-sector-green/20 text-sector-green',
  yellow: 'bg-sector-yellow/20 text-sector-yellow',
  caution: 'bg-sector-yellow/25 text-sector-yellow',
  red: 'bg-danger/25 text-danger',
  chequered: 'bg-foreground/15 text-foreground',
  neutral: 'bg-surface-2 text-muted',
};

export function RaceStoryStrip({
  progress,
  flag,
  weather,
}: {
  progress: LapProgress;
  flag: FlagChip;
  weather: string | null;
}) {
  const percent = progress.fraction == null ? null : Math.round(progress.fraction * 100);

  return (
    <div
      aria-label={strings.simple.story}
      className="border-border bg-surface flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2.5"
    >
      <div className="flex min-w-[200px] flex-1 items-center gap-3">
        <span className="tnum text-sm font-medium whitespace-nowrap">{progress.label}</span>
        {percent != null && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={progress.label}
            className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded"
          >
            <div
              className="bg-accent h-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <span className="inline-flex items-center">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[flag.tone]}`}>
          {flag.label}
        </span>
        <InfoTip term={flag.term} />
      </span>

      {weather && (
        <span className="text-muted inline-flex items-center text-xs">
          {weather}
          <InfoTip term="trackTemp" />
        </span>
      )}
    </div>
  );
}
