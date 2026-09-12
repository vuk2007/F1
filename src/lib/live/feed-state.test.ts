import { describe, expect, it } from 'vitest';
import { FeedState, mergeState } from './feed-state';

describe('mergeState', () => {
  it('keeps fields the patch does not mention', () => {
    const merged = mergeState(
      { Status: 'Started', Started: true },
      { Status: 'Finished' },
    ) as Record<string, unknown>;

    expect(merged).toEqual({ Status: 'Finished', Started: true });
  });

  it('reaches as deep as the patch does', () => {
    const base = {
      Lines: {
        '44': { Position: '2', LastLapTime: { Value: '1:32.100' }, NumberOfLaps: 17 },
        '1': { Position: '1' },
      },
    };
    const merged = mergeState(base, {
      Lines: { '44': { LastLapTime: { Value: '1:31.824' } } },
    }) as typeof base;

    expect(merged.Lines['44']).toEqual({
      Position: '2',
      LastLapTime: { Value: '1:31.824' },
      NumberOfLaps: 17,
    });
    // The other driver is untouched, which is the whole point of merging.
    expect(merged.Lines['1']).toEqual({ Position: '1' });
  });

  it('patches an array through numeric string keys', () => {
    /*
     * This is the rule that is impossible to guess. RaceControlMessages.Messages
     * is an array, but an edit to an existing message arrives as an object keyed
     * by index. Treating it as a replacement loses every other message.
     */
    const base = { Messages: [{ Message: 'GREEN LIGHT' }, { Message: 'YELLOW' }] };
    const merged = mergeState(base, { Messages: { '1': { Message: 'CLEAR' } } }) as typeof base;

    expect(merged.Messages).toHaveLength(2);
    expect(merged.Messages[0]).toEqual({ Message: 'GREEN LIGHT' });
    expect(merged.Messages[1]).toEqual({ Message: 'CLEAR' });
  });

  it('appends when the index is past the end', () => {
    // How a new race control message or team radio clip actually arrives.
    const base = { Messages: [{ Message: 'GREEN LIGHT' }] };
    const merged = mergeState(base, {
      Messages: { '7': { Message: 'SAFETY CAR DEPLOYED' } },
    }) as typeof base;

    expect(merged.Messages).toHaveLength(2);
    expect(merged.Messages[1]).toEqual({ Message: 'SAFETY CAR DEPLOYED' });
  });

  it('drops non-numeric keys aimed at an array', () => {
    /*
     * Storing it would produce an array with a stray property, which
     * JSON.stringify silently discards — so it would look right in a debugger
     * here and vanish on the way to the browser.
     */
    const merged = mergeState({ Messages: [] }, { Messages: { latest: { Message: 'x' } } }) as {
      Messages: unknown[];
    };

    expect(merged.Messages).toEqual([]);
  });

  it('replaces scalars, and arrays sent whole', () => {
    expect(mergeState({ Value: 1 }, { Value: 2 })).toEqual({ Value: 2 });
    expect(mergeState({ List: [1, 2, 3] }, { List: [9] })).toEqual({ List: [9] });
    expect(mergeState('old', 'new')).toBe('new');
  });

  it('adds keys that were not in the base at all', () => {
    expect(mergeState({ A: 1 }, { B: 2 })).toEqual({ A: 1, B: 2 });
  });

  it('does not mutate its inputs', () => {
    const base = { Lines: { '44': { Position: '2' } } };
    mergeState(base, { Lines: { '44': { Position: '1' } } });

    // A caller holding the previous snapshot must still see the old value.
    expect(base.Lines['44'].Position).toBe('2');
  });
});

describe('FeedState', () => {
  it('merges deltas into the topic and reports the merged value', () => {
    const state = new FeedState();
    state.reset({ TrackStatus: { Status: '1', Message: 'AllClear' } });

    const merged = state.apply('TrackStatus', { Status: '2' }) as Record<string, unknown>;

    expect(merged).toEqual({ Status: '2', Message: 'AllClear' });
    expect(state.get('TrackStatus')).toEqual({ Status: '2', Message: 'AllClear' });
  });

  it('accepts a topic that was not in the snapshot', () => {
    // Happens constantly: CarData.z and LapCount only appear once cars run.
    const state = new FeedState();
    state.reset({});
    state.apply('LapCount', { CurrentLap: 1, TotalLaps: 66 });

    expect(state.get('LapCount')).toEqual({ CurrentLap: 1, TotalLaps: 66 });
    expect(state.topics()).toEqual(['LapCount']);
  });

  it('replaces everything on reset, so a reconnect cannot leave stale topics', () => {
    const state = new FeedState();
    state.reset({ LapCount: { CurrentLap: 40 } });
    state.reset({ SessionStatus: { Status: 'Inactive' } });

    expect(state.topics()).toEqual(['SessionStatus']);
  });

  it('hands out a copy, not the live object', () => {
    const state = new FeedState();
    state.reset({ TrackStatus: { Status: '1' } });

    const first = state.all();
    state.apply('TrackStatus', { Status: '4' });

    expect((first.TrackStatus as { Status: string }).Status).toBe('1');
  });
});
