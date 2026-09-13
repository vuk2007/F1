'use client';

/** Simple / Engineer switch for the session header, plus the way back into the guide. */
import { strings } from '@/lib/i18n/strings';
import { useViewPrefs, type ViewMode } from '@/lib/store/view-prefs';

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'simple', label: strings.simple.modeSimple },
  { mode: 'engineer', label: strings.simple.modeEngineer },
];

export function ViewModeToggle() {
  const mode = useViewPrefs((s) => s.mode);
  const setMode = useViewPrefs((s) => s.setMode);
  const openOnboarding = useViewPrefs((s) => s.openOnboarding);

  return (
    <div className="flex items-center gap-3">
      {mode === 'simple' && (
        <button
          type="button"
          onClick={openOnboarding}
          className="text-accent text-xs hover:underline"
        >
          {strings.simple.guide}
        </button>
      )}
      <div
        role="group"
        aria-label={strings.simple.modeLabel}
        title={strings.simple.modeHint}
        className="bg-surface-2 flex rounded-md p-0.5 text-xs"
      >
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => setMode(option.mode)}
            className={`rounded px-2.5 py-1 transition ${
              mode === option.mode
                ? 'bg-accent font-medium text-black'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
