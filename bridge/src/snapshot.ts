/**
 * The merged in-memory state of the feed.
 *
 * The feed sends one full snapshot when you subscribe and then partial deltas
 * forever. A delta only contains what changed, arbitrarily deep: a car crossing
 * the line arrives as `{TimingData: {Lines: {"44": {LastLapTime: {Value: "1:31.2"}}}}}`
 * and nothing else. So a client that wants to know the current state has to keep
 * merging, which is what this does.
 *
 * The merge rules are ported from f1-dash's `realtime/src/services/state_service.rs`
 * (its `merge` function) rather than guessed, because one of them is genuinely
 * surprising: the feed patches **arrays** using objects with numeric string keys.
 * `RaceControlMessages.Messages` is an array in the snapshot, but a new message
 * arrives as `{Messages: {"37": {...}}}`. Treating that as an object replacement
 * would throw away every earlier message.
 */

type Json = unknown;

function isPlainObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `patch` into `base` and returns the result. Inputs are not
 * mutated, so a consumer can hold on to a previous snapshot safely.
 */
export function mergeState(base: Json, patch: Json): Json {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, Json> = { ...base };
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
       * an array with stray properties that JSON.stringify silently discards —
       * so it would look fine here and vanish on the way to the browser.
       */
      if (!Number.isInteger(index) || index < 0) continue;
      if (index < out.length) out[index] = mergeState(out[index], value);
      // Out-of-range indices append. The feed numbers messages sequentially, so
      // this is how a new race control message or team radio clip arrives.
      else out.push(value);
    }
    return out;
  }

  // Anything else replaces: scalars, and arrays sent as whole arrays.
  return patch;
}

/** Accumulates the feed into one object keyed by topic. */
export class FeedState {
  #state: Record<string, Json> = {};

  /** Replaces everything. Used for the snapshot that follows a (re)subscribe. */
  reset(snapshot: Record<string, Json>): void {
    this.#state = { ...snapshot };
  }

  /** Applies one topic delta and returns the topic's new merged value. */
  apply(topic: string, data: Json): Json {
    const merged = topic in this.#state ? mergeState(this.#state[topic], data) : data;
    this.#state[topic] = merged;
    return merged;
  }

  get(topic: string): Json {
    return this.#state[topic];
  }

  /** A shallow copy, which is enough because merges never mutate in place. */
  all(): Record<string, Json> {
    return { ...this.#state };
  }

  topics(): string[] {
    return Object.keys(this.#state);
  }
}
