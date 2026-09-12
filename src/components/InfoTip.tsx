'use client';

/**
 * The (i) affordance next to a metric. Click to open, click outside or press
 * Escape to close. Deliberately click-driven rather than hover, so it works on
 * touch and so the text stays put while being read.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { explain, type MetricKey } from '@/lib/explain/metrics';

export function InfoTip({ metric }: { metric: MetricKey }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const info = explain(metric);

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
        aria-label={`What is ${info.title}?`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="border-muted/60 text-muted hover:border-accent hover:text-accent ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] leading-none font-semibold transition"
      >
        i
      </button>

      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="border-border bg-surface-2 absolute top-6 left-0 z-50 block w-72 rounded-lg border p-3 text-left shadow-xl"
        >
          <span className="text-foreground block text-xs font-semibold">{info.title}</span>
          <span className="text-muted mt-1.5 block text-xs leading-relaxed font-normal">
            {info.what}
          </span>
          <span className="text-muted mt-1.5 block text-xs leading-relaxed font-normal">
            <span className="text-foreground/80">Why it matters: </span>
            {info.why}
          </span>
          <span className="text-muted mt-1.5 block text-xs leading-relaxed font-normal">
            <span className="text-foreground/80">Reading it: </span>
            {info.reading}
          </span>
        </span>
      )}
    </span>
  );
}
