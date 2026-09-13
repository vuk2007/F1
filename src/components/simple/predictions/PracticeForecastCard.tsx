'use client';

/** Card 8: what practice or qualifying says about race wear, the Q3 cut-off and lost time. */
import { formatLapTime } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import { weakest } from '@/lib/models/predict/confidence';
import type { PracticePredictions } from '@/lib/models/predict/assemble';
import { ConfidenceChip, NotEnough, PredictionCard } from './PredictionCard';
import { compoundName, TyreBadge } from './TyreBadge';

const THEORY_ROWS = 5;

export function PracticeForecastCard({
  practice,
  labelFor,
}: {
  practice: PracticePredictions;
  labelFor: (driverNumber: number) => string;
}) {
  const text = strings.simple.predictions.practice;
  const wear = practice.degradation.filter((d) => d.enough);
  const q3 = practice.q3;
  const levels = [...wear.map((d) => d.confidence), ...(q3?.enough ? [q3.confidence] : [])];

  return (
    <PredictionCard
      title={text.title}
      method="practiceForecast"
      confidence={levels.length > 0 ? weakest(...levels) : null}
      enough={wear.length > 0 || !!q3?.enough || practice.theoretical.length > 0}
      className="md:col-span-2"
    >
      <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <section>
          <h4 className="text-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
            {text.wear}
          </h4>
          {wear.length === 0 ? (
            <NotEnough />
          ) : (
            <ul className="space-y-1">
              {wear.map((d) => (
                <li key={d.compound} className="flex flex-wrap items-center gap-2">
                  <TyreBadge compound={d.compound} />
                  <span className="text-foreground">{compoundName(d.compound)}</span>
                  <span className="text-muted">
                    {text.wearValue(d.degPerLap!.toFixed(2))} · {text.runs(d.runs)}
                  </span>
                  <ConfidenceChip level={d.confidence} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {q3 && (
          <section>
            <h4 className="text-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
              {text.q3}
            </h4>
            {q3.enough && q3.predicted != null && q3.fp3Tenth != null ? (
              <>
                <p className="tnum text-foreground text-sm font-semibold">
                  {text.q3Value(formatLapTime(q3.predicted))}
                </p>
                <p className="tnum text-muted">{text.q3From(formatLapTime(q3.fp3Tenth))}</p>
                <div className="mt-1">
                  <ConfidenceChip level={q3.confidence} />
                </div>
              </>
            ) : (
              <NotEnough />
            )}
          </section>
        )}

        <section>
          <h4 className="text-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
            {text.theory}
          </h4>
          {practice.theoretical.length === 0 ? (
            <NotEnough />
          ) : (
            <ul className="space-y-0.5">
              {practice.theoretical.slice(0, THEORY_ROWS).map((row) => (
                <li key={row.driverNumber} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-foreground w-9 font-semibold">
                    {labelFor(row.driverNumber)}
                  </span>
                  <span className="tnum text-muted">
                    {text.theoryRow(formatLapTime(row.actual), formatLapTime(row.theoretical))}
                  </span>
                  {row.timeLeft > 0.0005 && (
                    <span className="tnum text-foreground">
                      {text.left(row.timeLeft.toFixed(3))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PredictionCard>
  );
}
