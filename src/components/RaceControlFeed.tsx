'use client';

/**
 * Race control messages, newest first, synced to the replay clock.
 * Only messages that have already been issued at the current replay time appear.
 */
import type { RaceControl } from '@/lib/openf1/types';

function flagColour(message: RaceControl): string {
  if (message.category === 'SafetyCar') return 'text-sector-yellow';
  switch (message.flag) {
    case 'RED':
      return 'text-danger';
    case 'YELLOW':
    case 'DOUBLE YELLOW':
      return 'text-sector-yellow';
    case 'GREEN':
    case 'CLEAR':
      return 'text-sector-green';
    default:
      return 'text-muted';
  }
}

export function RaceControlFeed({
  messages,
  sessionStartMs,
}: {
  messages: RaceControl[];
  sessionStartMs: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="border-border text-muted border-b px-4 py-2.5 text-xs font-medium tracking-wide uppercase">
        Race control
      </h2>
      <ul className="divide-border/50 flex-1 divide-y overflow-y-auto">
        {messages.length === 0 && (
          <li className="text-muted px-4 py-3 text-xs">No messages yet.</li>
        )}
        {messages.map((message, index) => {
          const offset = Math.max(0, Date.parse(message.date) - sessionStartMs);
          const minutes = Math.floor(offset / 60000);
          const seconds = Math.floor((offset % 60000) / 1000);
          return (
            <li key={`${message.date}-${index}`} className="px-4 py-2">
              <div className="flex items-baseline gap-2">
                <span className="tnum text-muted text-[10px]">
                  {minutes}:{String(seconds).padStart(2, '0')}
                </span>
                {message.lap_number != null && (
                  <span className="text-muted text-[10px]">L{message.lap_number}</span>
                )}
              </div>
              <p className={`text-xs leading-snug ${flagColour(message)}`}>{message.message}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
