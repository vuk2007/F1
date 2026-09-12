# Pit Wall bridge

Reads F1's live timing feed and republishes it on a local WebSocket, while writing
everything it sees to a JSONL file.

It is a plain Node process, deliberately **not** part of the Next.js app: it needs
a long-lived outbound socket, which is the one thing a serverless deployment
cannot hold. Run it on the machine that is watching the session.

```bash
pnpm bridge                  # serve ws://localhost:8765 and record the session
pnpm bridge:capture 120      # save 120s of raw frames to bridge/fixtures/
```

`BRIDGE_PORT` (default `8765`) and `RECORDINGS_DIR` (default `recordings/`)
configure it. Both are read in [src/config.ts](src/config.ts).

## Personal, non-commercial use only

This reads a feed F1 publishes for its own timing clients. It is fine for watching
a session on your own machine, which is all this is for. It is not licensed for
redistribution, resale, or running as a public service, and nothing here should be
deployed somewhere that serves the feed on to other people. Historical data comes
from OpenF1 instead, and stays that way.

## What this was based on

The handshake was **not** written from memory or from documentation. It was copied
from two working open-source clients and then verified against the live endpoint:

- **f1-dash** ([github.com/slowlydev/f1-dash](https://github.com/slowlydev/f1-dash))
  — `signalr/src/lib.rs` for the negotiate/handshake/Subscribe sequence and the
  record-separator framing, `realtime/src/services/state_service.rs` for the merge
  rules in [../src/lib/live/feed-state.ts](../src/lib/live/feed-state.ts), and
  `realtime/src/f1.rs` for the URL and the topic list in
  [src/topics.ts](src/topics.ts). Its `dashboard/src/types/state.type.ts` is where
  the raw topic shapes in [../src/lib/live/feed-types.ts](../src/lib/live/feed-types.ts)
  came from, corrected against the capture wherever the two disagreed.
- **FastF1** ([github.com/theOehrly/Fast-F1](https://github.com/theOehrly/Fast-F1))
  — `fastf1/livetiming/client.py`, which independently confirms the `/signalrcore`
  endpoint and the `AWSALBCORS` cookie step.

## Two things the usual write-ups get wrong

Both were checked against the real endpoint on 2026-09-12, and both contradict the
guides that were current when this was written.

**1. It is SignalR Core, not legacy ASP.NET SignalR.** The endpoint is
`https://livetiming.formula1.com/signalrcore`. The older `/signalr` endpoint still
exists but is now behind auth:

```
$ curl -i 'https://livetiming.formula1.com/signalr/negotiate?connectionData=[{"name":"Streaming"}]&clientProtocol=1.5'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="Authentication"
WWW-Authenticate: Bearer
```

Carrying the load balancer's cookies into that request does not help. Every guide
built around `connectionData=[{"name":"Streaming"}]` and `clientProtocol=1.5`
describes an endpoint that no longer answers.

**2. No authentication is needed — but the load balancer wants its cookie.**
`/signalrcore/negotiate` answers 200 with no credentials at all. The sequence is:

1. `OPTIONS /signalrcore/negotiate` — answers **405**, which is fine; it is sent
   for the `AWSALBCORS` cookie in the response.
2. `POST /signalrcore/negotiate?negotiateVersion=1` carrying that cookie, which
   returns a `connectionToken`.
3. `wss://livetiming.formula1.com/signalrcore?id=<connectionToken>`, with the same
   cookie and `User-Agent: BestHTTP`.
4. Send `{"protocol":"json","version":1}` + ``. Success is an **empty
   object** — easy to mistake for noise.
5. Invoke `Subscribe` with the topic list. The reply (a type-3 completion) is the
   full current state.
6. Updates then arrive as type-1 invocations of `feed`, with arguments
   `[topic, data, timestamp]`.

The cookie ties all three requests to the same backend. Frames are separated by
`` and several can share one WebSocket message, so every frame must be split
before parsing.

## Silence is normal

Outside a session the feed connects, replies to `Subscribe` with the **last
session's** final state, and then sends nothing. Measured on 2026-09-12, three
hours after qualifying: zero updates in 30 seconds, not even a `Heartbeat`. The
brief for this work predicted Heartbeat would keep ticking; it does not.

So an idle bridge logging `0 messages` is working correctly. The snapshot is the
signal that it is: it carries a real `DriverList` and `SessionInfo`.
`CarData.z` and `Position.z` are absent from an idle snapshot, and their arrival is
the clearest indication that cars are on track.

## Shape of a recording

One JSON object per line, in `recordings/<key>-<meeting>-<session>.jsonl`:

```jsonc
{ "_id": 0, "received": "...", "type": "snapshot", "data": { "TimingData": {}, ... } }
{ "_id": 1, "received": "...", "type": "delta", "topic": "TimingData", "data": {}, "timestamp": "..." }
```

`_id` is a monotonic sequence number — the feed's own timestamps are not reliably
ordered across topics, so replay uses `_id`. Deltas are stored **raw**, as the feed
sent them, not merged: a recording replayed through the same merge produces the
same state, and a merge bug found later can be fixed without re-recording.

JSONL rather than one JSON array so the file is valid after every line. If the
process is killed mid-session, everything up to that point still reads.

A reconnect appends to the same file and writes a fresh `snapshot` line, so one
session is one file however many times the socket drops.

## Wire protocol to the browser

Bridge to client:

```jsonc
{ "type": "snapshot", "data": { "<topic>": ... } }   // whole merged state, on connect
{ "type": "delta", "topic": "TimingData", "data": ... } // that topic's merged value
{ "type": "status", "connected": true }               // upstream feed up or down
```

Client to bridge:

```jsonc
{ "type": "subscribeDriver", "driverNumber": 44 }
```

`delta` carries the topic's **merged** value rather than the raw patch, because the
merge rules are unusual (the feed patches arrays with numeric-keyed objects) and
are better done once here than in every client.

`subscribeDriver` is currently recorded and not acted on. The obvious use is to
stop forwarding all twenty cars' telemetry, but `CarData.z` has not been seen from
a running session yet, and filtering on a guessed shape would drop real data
silently. It stays inert until a real capture confirms that shape.

## Where the merge lives

The merge rules are in the **app**, at
[../src/lib/live/feed-state.ts](../src/lib/live/feed-state.ts), and the bridge
imports them by relative path.

Both sides need them and they have to agree exactly: the bridge merges so it can
hand a full snapshot to a browser that connects mid-session, and the app merges
because a recording stores raw deltas rather than merged state. Two copies that
drifted apart would mean a recording replaying into a different state than the
live session produced — silent, and miserable to track down. That file imports
nothing, which is what makes it safe to load from either side.

## Status

The connection, the snapshot, the recording and the local server are all verified
against the live endpoint.

The normalizers that turn feed topics into the app's OpenF1-shaped types are
written, in `src/lib/live/`, and tested against the committed fixture — including
an end-to-end test that pushes a real captured session through merge, normalize
and accumulate and then runs the app's own selectors and models over the result.

What is **not** verified is everything that only exists while cars are on track:

- `CarData.z` and `Position.z` — their shapes come from f1-dash's types, not from a
  capture, because an idle feed carries neither topic. The channel numbers
  (0 RPM, 2 speed, 3 gear, 4 throttle, 5 brake, 45 DRS) are the least certain thing
  in the whole pipeline.
- Which of a sector's `Value` and `PreviousValue` holds the lap that just finished,
  at the instant `LastLapTime` updates.
- Whether `NumberOfLaps` counts laps started, as three cross-checks in the capture
  say it does, during a session rather than after one.
- That deltas merge correctly over hours rather than over one snapshot.

The rule that caught the most bugs in this project was "do not invent field names".
The assumptions about this feed have already been wrong twice — the endpoint and
the protocol version — so nothing above should be believed until a session has run
through it.
