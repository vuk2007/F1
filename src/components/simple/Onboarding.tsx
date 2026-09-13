'use client';

/**
 * A four-step guide shown on the first visit, and on demand from the header.
 *
 * Open whenever it has been asked for, or has never been seen. That is derived
 * rather than set in an effect, so there is no flash of the page before the guide
 * appears and no render spent correcting state.
 */
import { useEffect, useState } from 'react';
import { strings } from '@/lib/i18n/strings';
import { useViewPrefs } from '@/lib/store/view-prefs';

export function Onboarding() {
  const requested = useViewPrefs((s) => s.onboardingOpen);
  const seen = useViewPrefs((s) => s.onboardingSeen);
  const closeOnboarding = useViewPrefs((s) => s.closeOnboarding);
  const [step, setStep] = useState(0);

  const open = requested || !seen;
  const text = strings.simple.onboarding;
  const steps = text.steps;
  const current = steps[step]!;
  const last = step === steps.length - 1;

  const close = () => {
    closeOnboarding();
    setStep(0);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOnboarding();
        setStep(0);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeOnboarding]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-heading"
        className="border-border bg-surface w-full max-w-sm rounded-xl border p-5 shadow-2xl"
      >
        <p className="text-muted text-[10px] font-medium tracking-wide uppercase">
          {text.title} · {text.stepOf(step + 1, steps.length)}
        </p>
        <h2 id="onboarding-heading" className="mt-2 text-lg font-semibold">
          {current.heading}
        </h2>
        <p className="text-muted mt-2 text-sm leading-relaxed">{current.body}</p>

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded ${index <= step ? 'bg-accent' : 'bg-surface-2'}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={close} className="text-muted text-xs hover:underline">
            {text.skip}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                className="bg-surface-2 rounded-md px-3 py-1.5 text-xs"
              >
                {text.back}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setStep((value) => value + 1))}
              className="bg-accent rounded-md px-3 py-1.5 text-xs font-medium text-black"
            >
              {last ? text.done : text.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
