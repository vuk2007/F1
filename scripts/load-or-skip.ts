/**
 * Shared session loader for the network smoke suites.
 *
 * OpenF1 restricts ALL access — including historical data — to paid key holders
 * while a live session is running. When that happens these suites cannot run at
 * all, which is an outage in someone else's service rather than a regression
 * here. The error says so explicitly, so a red smoke run is never mistaken for
 * broken code.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { LiveSessionLockoutError } from '@/lib/openf1/client';
import { loadSession } from '@/lib/openf1/loader';

export class SmokeUnavailableError extends Error {
  constructor(sessionKey: number) {
    super(
      `OpenF1 is locked while a live F1 session is running, so session ${sessionKey} ` +
        `cannot be fetched. This is an upstream restriction, NOT a code failure — ` +
        `the offline suite (pnpm test) covers the same models. Re-run once the ` +
        `session has finished.`,
    );
    this.name = 'SmokeUnavailableError';
  }
}

export async function loadSessionForSmoke(sessionKey: number): Promise<SessionDataset> {
  try {
    return await loadSession(sessionKey);
  } catch (error) {
    if (error instanceof LiveSessionLockoutError) throw new SmokeUnavailableError(sessionKey);
    throw error;
  }
}
