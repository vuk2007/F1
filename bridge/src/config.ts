import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * Paths are resolved against the repository root rather than the working
 * directory, so `pnpm bridge` and `pnpm --filter @pit-wall/bridge start` write
 * to the same place.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function dir(value: string | undefined, fallback: string): string {
  if (!value) return path.join(repoRoot, fallback);
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

export const config = {
  /** Port the local WebSocket server listens on. */
  port: Number(process.env.BRIDGE_PORT ?? 8765),
  /** Where `<session>.jsonl` recordings are written. */
  recordingsDir: dir(process.env.RECORDINGS_DIR, 'recordings'),
  /** Where `pnpm bridge:capture` drops raw feed frames for tests to read. */
  fixturesDir: dir(process.env.FIXTURES_DIR, path.join('bridge', 'fixtures')),
} as const;
