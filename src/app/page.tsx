'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LiveSessionLockoutError, getMeetings, getSessions } from '@/lib/openf1/client';
import type { Meeting, Session } from '@/lib/openf1/types';
import { strings } from '@/lib/i18n/strings';

/** OpenF1's historical coverage starts in 2023. */
const FIRST_YEAR = 2023;

function availableYears(): number[] {
  const current = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let year = current; year >= FIRST_YEAR; year -= 1) years.push(year);
  return years;
}

/** Practice sessions first, then qualifying, then the race — the weekend's order. */
function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
}

export default function PickerPage() {
  const years = availableYears();
  const [year, setYear] = useState<number>(years[0]!);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [meetingKey, setMeetingKey] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);

  const handleError = (caught: unknown) => {
    if (caught instanceof LiveSessionLockoutError) {
      setLockedOut(true);
      setError(null);
      return;
    }
    setLockedOut(false);
    setError(caught instanceof Error ? caught.message : strings.errors.generic);
  };

  /* Resets live in the event handlers, not in the effects, so a state change
   * never cascades an extra render pass. The effects only fetch. */
  const chooseYear = (next: number) => {
    setYear(next);
    setMeetings(null);
    setSessions(null);
    setMeetingKey(null);
    setError(null);
    setLockedOut(false);
  };

  const chooseMeeting = (next: number) => {
    setMeetingKey(next);
    setSessions(null);
  };

  useEffect(() => {
    let cancelled = false;

    getMeetings(year)
      .then((rows) => {
        if (cancelled) return;
        setMeetings([...rows].sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start)));
      })
      .catch((caught: unknown) => {
        if (!cancelled) handleError(caught);
      });

    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    if (meetingKey == null) return;
    let cancelled = false;

    getSessions(year, meetingKey)
      .then((rows) => {
        if (!cancelled) setSessions(sortSessions(rows));
      })
      .catch((caught: unknown) => {
        if (!cancelled) handleError(caught);
      });

    return () => {
      cancelled = true;
    };
  }, [year, meetingKey]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">{strings.app.name}</h1>
        <p className="text-muted mt-2 max-w-xl text-sm">{strings.app.tagline}</p>
      </header>

      {lockedOut && (
        <div className="border-danger/40 bg-danger/10 mb-8 rounded-lg border p-4">
          <h2 className="font-medium">{strings.errors.lockedOutTitle}</h2>
          <p className="text-muted mt-1 text-sm">{strings.errors.lockedOutBody}</p>
        </div>
      )}

      {error && (
        <div className="border-danger/40 bg-danger/10 mb-8 rounded-lg border p-4 text-sm">
          {error}
        </div>
      )}

      <h2 className="mb-4 text-lg font-medium">{strings.picker.heading}</h2>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="year" className="text-muted mb-2 block text-xs tracking-wide uppercase">
            {strings.picker.year}
          </label>
          <select
            id="year"
            value={year}
            onChange={(event) => chooseYear(Number(event.target.value))}
            className="border-border bg-surface w-full rounded-md border px-3 py-2 text-sm"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="mt-6">
            <span className="text-muted mb-2 block text-xs tracking-wide uppercase">
              {strings.picker.meeting}
            </span>
            {meetings === null && !lockedOut && !error && (
              <p className="text-muted text-sm">{strings.picker.loadingMeetings}</p>
            )}
            {meetings?.length === 0 && (
              <p className="text-muted text-sm">{strings.picker.noMeetings}</p>
            )}
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
              {meetings?.map((meeting) => (
                <li key={meeting.meeting_key}>
                  <button
                    type="button"
                    onClick={() => chooseMeeting(meeting.meeting_key)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                      meetingKey === meeting.meeting_key
                        ? 'bg-accent/20 text-foreground'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    <span className="block">{meeting.meeting_name}</span>
                    <span className="text-muted block text-xs">{meeting.circuit_short_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <span className="text-muted mb-2 block text-xs tracking-wide uppercase">
            {strings.picker.session}
          </span>
          {meetingKey == null && (
            <p className="text-muted text-sm">{strings.picker.selectMeetingFirst}</p>
          )}
          {meetingKey != null && sessions === null && (
            <p className="text-muted text-sm">{strings.picker.loadingSessions}</p>
          )}
          {sessions?.length === 0 && (
            <p className="text-muted text-sm">{strings.picker.noSessions}</p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {sessions?.map((session) => (
              <li key={session.session_key}>
                <Link
                  href={`/session/${session.session_key}`}
                  className="border-border bg-surface hover:border-accent/60 hover:bg-surface-2 block rounded-lg border p-4 transition"
                >
                  <span className="block font-medium">{session.session_name}</span>
                  <span className="text-muted mt-1 block text-xs">
                    {new Date(session.date_start).toLocaleString()}
                  </span>
                  <span className="text-muted mt-1 block text-xs">{session.location}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
