import { describe, expect, it } from 'vitest';
import type { Weather } from '@/lib/openf1/types';
import { flagChip, lapProgress, weatherInWords } from './race-story';

const weather = (rainfall: number, track: number | null): Weather => ({
  air_temperature: 24,
  date: '2025-09-07T13:00:00Z',
  humidity: 40,
  meeting_key: 1,
  pressure: 1000,
  rainfall,
  session_key: 1,
  track_temperature: track,
  wind_direction: 0,
  wind_speed: 1,
});

describe('flagChip', () => {
  it('names each state in a word a newcomer understands', () => {
    expect(flagChip('green')).toEqual({ label: 'Green', tone: 'green', term: 'flags' });
    expect(flagChip('sc')).toEqual({ label: 'Safety Car', tone: 'caution', term: 'safetyCar' });
    expect(flagChip('vsc')).toEqual({ label: 'Virtual SC', tone: 'caution', term: 'vsc' });
    expect(flagChip('red')).toEqual({ label: 'Red flag', tone: 'red', term: 'flags' });
    expect(flagChip('chequered')).toEqual({ label: 'Chequered', tone: 'chequered', term: 'flags' });
    expect(flagChip('unknown').label).toBe('Not started');
  });
});

describe('weatherInWords', () => {
  it('describes a dry track with its temperature', () => {
    expect(weatherInWords(weather(0, 31.4))).toBe('dry, 31 °C track');
  });

  it('says when it is raining', () => {
    expect(weatherInWords(weather(1, 22.6))).toBe('raining, 23 °C track');
  });

  it('leaves out a temperature that was not recorded', () => {
    expect(weatherInWords(weather(0, null))).toBe('dry');
  });

  it('has nothing to say before the first reading', () => {
    expect(weatherInWords(undefined)).toBeNull();
  });
});

describe('lapProgress', () => {
  it('measures a race against its distance', () => {
    expect(lapProgress(27, 53, true)).toEqual({ label: 'Lap 27 of 53', fraction: 27 / 53 });
  });

  it('never runs past the finish', () => {
    expect(lapProgress(54, 53, true)).toEqual({ label: 'Lap 53 of 53', fraction: 1 });
  });

  it('gives practice and qualifying a lap count with no bar', () => {
    expect(lapProgress(12, 20, false)).toEqual({ label: 'Lap 12', fraction: null });
  });

  it('shows a session that has not started', () => {
    expect(lapProgress(null, 53, true)).toEqual({ label: 'Not started', fraction: 0 });
  });
});
