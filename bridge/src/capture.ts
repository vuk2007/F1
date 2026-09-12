/**
 * Saves raw feed frames to `bridge/fixtures/` so tests have real message shapes
 * to work from.
 *
 * This exists because of a rule learned the hard way earlier in this project: do
 * not invent field names. Every normalizer in the bridge should be written
 * against a fixture captured here, not against what the feed is assumed to look
 * like — the assumptions about this feed have already been wrong twice (the
 * endpoint and the protocol version both).
 *
 *   node bridge/src/capture.ts [seconds] [name]
 *
 * Writes two files:
 *   <name>-snapshot.json   the Subscribe reply, pretty-printed and inflated
 *   <name>-frames.jsonl    every raw WebSocket frame, exactly as received
 */
import fs from 'node:fs';
import path from 'node:path';
import { openFeed } from './signalr.ts';
import { TOPICS } from './topics.ts';
import { config } from './config.ts';
import { recordingName } from './recorder.ts';

const seconds = Number(process.argv[2] ?? 60);
const nameArgument = process.argv[3];

if (!Number.isFinite(seconds) || seconds <= 0) {
  console.error('usage: node bridge/src/capture.ts [seconds] [name]');
  process.exit(1);
}

fs.mkdirSync(config.fixturesDir, { recursive: true });

const counts = new Map<string, number>();
let frames = 0;
let framesStream: fs.WriteStream | null = null;
/*
 * The handshake reply and the snapshot both arrive before the output file can be
 * named — the name comes from the snapshot itself. Buffering until then keeps
 * them: writing straight to the stream silently dropped the two most useful
 * frames in the capture.
 */
const pending: string[] = [];

function writeFrame(line: string): void {
  if (framesStream) framesStream.write(line);
  else pending.push(line);
}

console.log(`[capture] connecting, will listen for ${seconds}s`);

const feed = await openFeed(
  TOPICS,
  {
    onMessage: (message) => {
      counts.set(message.topic, (counts.get(message.topic) ?? 0) + 1);
    },
    onClose: (reason) => {
      console.log(`[capture] feed closed: ${reason}`);
      finish();
    },
  },
  {
    /*
     * Raw frames, before splitting or inflating. If the parsing in signalr.ts is
     * wrong, a capture that had already been parsed would hide the evidence.
     */
    onRawFrame: (raw) => {
      frames += 1;
      writeFrame(`${JSON.stringify({ received: new Date().toISOString(), raw })}\n`);
    },
  },
);

const name = nameArgument ?? recordingName(feed.snapshot.SessionInfo);
const snapshotPath = path.join(config.fixturesDir, `${name}-snapshot.json`);
const framesPath = path.join(config.fixturesDir, `${name}-frames.jsonl`);

fs.writeFileSync(snapshotPath, `${JSON.stringify(feed.snapshot, null, 2)}\n`);
framesStream = fs.createWriteStream(framesPath, { flags: 'a' });
for (const line of pending.splice(0)) framesStream.write(line);

console.log(`[capture] snapshot topics: ${Object.keys(feed.snapshot).join(', ')}`);
console.log(`[capture] snapshot -> ${snapshotPath}`);
console.log(`[capture] frames   -> ${framesPath}`);

let finished = false;

function finish(): void {
  if (finished) return;
  finished = true;

  console.log(`[capture] ${frames} raw frames`);
  if (counts.size === 0) {
    console.log('[capture] no topic updates — expected when no session is running');
  } else {
    for (const [topic, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      console.log(`[capture]   ${topic}: ${count}`);
    }
  }

  feed.close();
  framesStream?.end(() => process.exit(0));
}

setTimeout(finish, seconds * 1000);
process.on('SIGINT', finish);
