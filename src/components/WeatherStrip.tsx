'use client';

import type { Weather } from '@/lib/openf1/types';
import { InfoTip } from './InfoTip';
import type { MetricKey } from '@/lib/explain/metrics';

function Item({ label, value, metric }: { label: string; value: string; metric: MetricKey }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
        {label}
        <InfoTip metric={metric} />
      </span>
      <span className="tnum text-sm">{value}</span>
    </div>
  );
}

const dash = '—';
const num = (value: number | null | undefined, suffix: string, digits = 1) =>
  value == null ? dash : `${value.toFixed(digits)}${suffix}`;

export function WeatherStrip({ weather }: { weather: Weather | undefined }) {
  return (
    <div className="border-border bg-surface flex flex-wrap gap-6 border-b px-4 py-2.5">
      <Item label="Track" value={num(weather?.track_temperature, '°C')} metric="trackTemp" />
      <Item label="Air" value={num(weather?.air_temperature, '°C')} metric="airTemp" />
      <Item
        label="Rain"
        value={weather?.rainfall == null ? dash : weather.rainfall > 0 ? 'Yes' : 'No'}
        metric="rainfall"
      />
      <Item
        label="Wind"
        value={
          weather?.wind_speed == null
            ? dash
            : `${weather.wind_speed.toFixed(1)} m/s${
                weather.wind_direction == null ? '' : ` @ ${weather.wind_direction}°`
              }`
        }
        metric="windSpeed"
      />
    </div>
  );
}
