'use client';

/**
 * The frame every prediction sits in: its title, an "Estimate" label, how sure the
 * estimate is, and an (i) that explains how it was worked out. When the model has
 * too little to go on, the card says so instead of showing a number.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { METHODS, type MethodKey } from '@/lib/explain/methods';
import { strings } from '@/lib/i18n/strings';
import type { Confidence } from '@/lib/models/predict/confidence';

/** Width of the bubble, and the least space it keeps from either edge of the screen. */
const TIP_WIDTH_PX = 320;
const TIP_GUTTER_PX = 16;
const LEVEL: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function ConfidenceChip({ level }: { level: Confidence }) {
  return (
    <span className="border-border text-muted inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
      {/* Bars as well as words, so the level reads at a glance without colour. */}
      <span aria-hidden className="inline-flex items-end gap-px">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`w-0.5 rounded-sm ${bar <= LEVEL[level] ? 'bg-foreground/80' : 'bg-border'}`}
            style={{ height: `${3 + bar * 2}px` }}
          />
        ))}
      </span>
      {strings.simple.predictions.confidence[level]}
    </span>
  );
}

export function EstimateChip() {
  return (
    <span className="border-accent/40 text-accent inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium">
      {strings.simple.predictions.estimate}
    </span>
  );
}

export function NotEnough() {
  return <p className="text-muted text-xs italic">{strings.simple.predictions.notEnough}</p>;
}

function MethodTip({ method }: { method: MethodKey }) {
  const [open, setOpen] = useState(false);
  /*
   * Where the bubble sits relative to the (i), in pixels. Measured on open and
   * clamped to the screen with a gutter either side: anchoring to the button's left
   * or right edge was not enough on a phone, where a title's (i) sits mid-screen and
   * a right-anchored bubble ran 150 px off the left edge.
   */
  const [placement, setPlacement] = useState({ left: 0, width: TIP_WIDTH_PX });
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const entry = METHODS[method];
  const text = strings.simple.predictions;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={text.methodButton(entry.title)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const viewport = document.documentElement.clientWidth;
          const width = Math.min(TIP_WIDTH_PX, viewport - 2 * TIP_GUTTER_PX);
          // Prefer opening rightwards from the (i); shift left only as far as the screen needs.
          const overflowRight = rect.left + width - (viewport - TIP_GUTTER_PX);
          const left = Math.max(TIP_GUTTER_PX - rect.left, Math.min(0, -overflowRight));
          setPlacement({ left, width });
          setOpen((value) => !value);
        }}
        className="border-muted/60 text-muted hover:border-accent hover:text-accent inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] leading-none font-semibold transition"
      >
        i
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          style={{ left: placement.left, width: placement.width }}
          className="border-border bg-surface-2 absolute top-6 z-50 block rounded-lg border p-3 text-left shadow-xl"
        >
          <span className="text-foreground block text-sm font-semibold">{entry.title}</span>
          {(
            [
              [text.method.estimates, entry.estimates],
              [text.method.computed, entry.computed],
              [text.method.trust, entry.trust],
            ] as const
          ).map(([heading, body]) => (
            <span key={heading} className="mt-2 block text-xs leading-relaxed">
              <span className="text-foreground/90 block text-[10px] font-semibold tracking-wide uppercase">
                {heading}
              </span>
              <span className="text-muted">{body}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function PredictionCard({
  title,
  method,
  confidence,
  enough = true,
  className = '',
  children,
}: {
  title: string;
  method: MethodKey;
  /** Omitted when the card has several estimates, each with its own chip. */
  confidence?: Confidence | null;
  enough?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`border-border bg-surface min-w-0 rounded-lg border px-3 py-2.5 ${className}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <MethodTip method={method} />
        </h3>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <EstimateChip />
          {enough && confidence && <ConfidenceChip level={confidence} />}
        </span>
      </header>
      {enough ? children : <NotEnough />}
    </article>
  );
}
