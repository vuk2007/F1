'use client';

/**
 * One sentence about the most important thing happening. Announced politely to
 * screen readers, since it changes as the replay runs.
 */
import { strings } from '@/lib/i18n/strings';
import type { RightNowKind } from '@/lib/explain/right-now';

const ACCENT: Record<RightNowKind, string> = {
  red: 'border-danger',
  sc: 'border-sector-yellow',
  vsc: 'border-sector-yellow',
  rain: 'border-accent',
  chequered: 'border-foreground',
  finalLaps: 'border-sector-purple',
  pits: 'border-accent',
  battle: 'border-sector-green',
  leader: 'border-accent',
  waiting: 'border-border',
};

export function RightNowBanner({ kind, sentence }: { kind: RightNowKind; sentence: string }) {
  return (
    <section className="border-border bg-surface border-b px-4 py-3" aria-live="polite">
      <div className={`border-l-4 pl-3 ${ACCENT[kind]}`}>
        <p className="text-muted text-[10px] font-medium tracking-wide uppercase">
          {strings.simple.rightNow}
        </p>
        <p className="text-foreground mt-0.5 text-base leading-snug font-medium">{sentence}</p>
      </div>
    </section>
  );
}
