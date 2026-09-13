/**
 * Pit loss per circuit, measured from real races by `pnpm pit-loss-table`.
 * Generated 2026-09-13 — do not edit by hand; re-run the script.
 *
 * Keyed by OpenF1's `circuit_short_name`. Each figure is the median, over that
 * circuit's dry races in the era, of the median green-flag stop loss in each race
 * (in-lap + out-lap - 2 x the driver's normal lap). See scripts/pit-loss-table.ts.
 */

export interface MeasuredPitLoss {
  seconds: number;
  races: number;
  stops: number;
}

export const MEASURED_PIT_LOSS: Record<'2024-2025' | '2026', Record<string, MeasuredPitLoss>> = {
  '2026': {
    Catalunya: {
      seconds: 23.6,
      races: 1,
      stops: 39,
    },
    Hungaroring: {
      seconds: 21.8,
      races: 1,
      stops: 35,
    },
    Melbourne: {
      seconds: 20.1,
      races: 1,
      stops: 5,
    },
    'Monte Carlo': {
      seconds: 23,
      races: 1,
      stops: 19,
    },
    Montreal: {
      seconds: 28,
      races: 1,
      stops: 15,
    },
    Shanghai: {
      seconds: 34.2,
      races: 1,
      stops: 7,
    },
    Silverstone: {
      seconds: 20.8,
      races: 1,
      stops: 22,
    },
    'Spa-Francorchamps': {
      seconds: 22.3,
      races: 1,
      stops: 7,
    },
    Spielberg: {
      seconds: 21.1,
      races: 1,
      stops: 32,
    },
    Suzuka: {
      seconds: 24,
      races: 1,
      stops: 11,
    },
  },
  '2024-2025': {
    Austin: {
      seconds: 21,
      races: 2,
      stops: 42,
    },
    Baku: {
      seconds: 21.7,
      races: 2,
      stops: 36,
    },
    Catalunya: {
      seconds: 22.1,
      races: 2,
      stops: 81,
    },
    Hungaroring: {
      seconds: 20.1,
      races: 2,
      stops: 66,
    },
    Imola: {
      seconds: 28.1,
      races: 2,
      stops: 37,
    },
    Interlagos: {
      seconds: 22.2,
      races: 1,
      stops: 31,
    },
    Jeddah: {
      seconds: 20.5,
      races: 2,
      stops: 21,
    },
    'Las Vegas': {
      seconds: 22.3,
      races: 2,
      stops: 51,
    },
    Lusail: {
      seconds: 27.2,
      races: 2,
      stops: 30,
    },
    Melbourne: {
      seconds: 20.2,
      races: 1,
      stops: 30,
    },
    'Mexico City': {
      seconds: 22,
      races: 2,
      stops: 46,
    },
    Miami: {
      seconds: 20.9,
      races: 1,
      stops: 10,
    },
    'Monte Carlo': {
      seconds: 21.5,
      races: 2,
      stops: 42,
    },
    Montreal: {
      seconds: 19.5,
      races: 1,
      stops: 29,
    },
    Monza: {
      seconds: 25.3,
      races: 1,
      stops: 28,
    },
    Sakhir: {
      seconds: 23.5,
      races: 1,
      stops: 41,
    },
    Shanghai: {
      seconds: 22.9,
      races: 2,
      stops: 44,
    },
    Singapore: {
      seconds: 29.1,
      races: 1,
      stops: 21,
    },
    'Spa-Francorchamps': {
      seconds: 18.2,
      races: 1,
      stops: 30,
    },
    Spielberg: {
      seconds: 20.8,
      races: 2,
      stops: 74,
    },
    Suzuka: {
      seconds: 21.8,
      races: 2,
      stops: 52,
    },
    'Yas Marina Circuit': {
      seconds: 23.1,
      races: 2,
      stops: 54,
    },
    Zandvoort: {
      seconds: 22.5,
      races: 1,
      stops: 26,
    },
  },
};
