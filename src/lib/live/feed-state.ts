/**
 * The merged in-memory state of the live feed.
 *
 * The feed sends one full snapshot when you subscribe and then partial deltas
 * forever. A delta contains only what changed, arbitrarily deep: a car crossing
 * the line arrives as `{TimingData: {Lines: {"44": {LastLapTime: {Value: "1:31.2"}}}}}`
 * and nothing else. Anything that wants the current state has to keep merging.
 *
 * The merge rules are ported from f1-dash's
 * `realtime/src/services/state_service.rs` rather than guessed, because one of
 * them is genuinely surprising: the feed patches **arrays** using objects with
 * numeric string keys. `RaceControlMessages.Messages` is an array in the
 * snapshot, but a new message arrives as `{Messages: {"37": {...}}}`. Treating
 * that as an object replacement throws away every earlier message.
 *
 * **Why this lives in the app rather than in the bridge.** Both need it, and they
 * must agree exactly or a recording replays into a different state than the live
 * session produced — a silent, miserable class of bug. The bridge merges so it can
 * hand a full snapshot to a browser that connects mid-session; the app merges
 * because a recording stores raw deltas, not merged state. One implementation,
 * imported by both. The bridge reaches in here by relative path; nothing in this
 * file imports anything, which is what makes that safe.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `patch` into `base` and returns the result. Neither input is
 * mutated, so a caller can keep a previous snapshot and compare against it.
 */
export function mergeState(base: unknown, patch: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = key in out ? mergeState(out[key], value) : value;
    }
    return out;
  }

  if (Array.isArray(base) && isPlainObject(patch)) {
    const out = [...base];
    for (const [key, value] of Object.entries(patch)) {
      const index = Number(key);
      /*
       * Non-numeric keys are dropped rather than stored. An array patched with a
       * named key has no meaning in this protocol, and keeping it would produce
       * an array with stray properties that JSON.stringify silently discards — so
       * it would look right in a debugger and vanish on the way anywhere else.
       */
      if (!Number.isInteger(index) || index < 0) continue;
      if (index < out.length) out[index] = mergeState(out[index], value);
      // Out-of-range indices append: the feed numbers race control messages and
      // radio clips sequentially, and this is how a new one arrives.
      else out.push(value);
    }
    return out;
  }

  // Anything else replaces: scalars, and arrays that are sent as whole arrays.
  return patch;
}

/** Accumulates the feed into one object keyed by topic. */
export class FeedState {
  #state: Record<string, unknown> = {};

  /** Replaces everything. Used for the snapshot that follows a (re)subscribe. */
  reset(snapshot: Record<string, unknown>): void {
    this.#state = { ...snapshot };
  }

  /** Applies one topic's delta and returns that topic's new merged value. */
  apply(topic: string, data: unknown): unknown {
    const merged = topic in this.#state ? mergeState(this.#state[topic], data) : data;
    this.#state[topic] = merged;
    return merged;
  }

  get(topic: string): unknown {
    return this.#state[topic];
  }

  /** A shallow copy, which is enough because merges never mutate in place. */
  all(): Record<string, unknown> {
    return { ...this.#state };
  }

  topics(): string[] {
    return Object.keys(this.#state);
  }
}
