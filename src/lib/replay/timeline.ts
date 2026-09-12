/**
 * Time-indexing helpers for replay.
 *
 * The replay clock moves continuously while the dataset is fixed, so every
 * lookup is "the most recent record at or before time t". Scanning arrays per
 * frame would be O(n) per driver per tick; instead we sort once into a
 * memoized index and binary search, making each lookup O(log n).
 */

/** A record stamped with an epoch-ms time, sorted ascending by `t`. */
export interface Timed<T> {
  t: number;
  value: T;
}

export function toTimed<T>(items: T[], getDate: (item: T) => string | null): Timed<T>[] {
  const timed: Timed<T>[] = [];
  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    const t = Date.parse(date);
    if (Number.isNaN(t)) continue;
    timed.push({ t, value: item });
  }
  timed.sort((a, b) => a.t - b.t);
  return timed;
}

/**
 * Index of the last element with `t <= time`, or -1 if none.
 * Standard upper-bound binary search.
 */
export function lastIndexAtOrBefore<T>(items: Timed<T>[], time: number): number {
  let low = 0;
  let high = items.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (items[mid]!.t <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** The most recent value at or before `time`, or undefined. */
export function valueAt<T>(items: Timed<T>[], time: number): T | undefined {
  const index = lastIndexAtOrBefore(items, time);
  return index === -1 ? undefined : items[index]!.value;
}

/** Every value with `t <= time`, oldest first. */
export function valuesUntil<T>(items: Timed<T>[], time: number): T[] {
  const index = lastIndexAtOrBefore(items, time);
  return index === -1 ? [] : items.slice(0, index + 1).map((entry) => entry.value);
}

/** Group items by a key, preserving input order within each group. */
export function groupBy<T, K extends string | number>(
  items: T[],
  getKey: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
