'use client';

/**
 * The (i) affordance next to a metric. Click to open, click outside or press
 * Escape to close. Deliberately click-driven rather than hover, so it works on
 * touch and so the text stays put while being read.
 *
 * In Engineer mode it renders exactly as it always has. In Simple mode it shows
 * the plain-language glossary entry instead, labelled What it is / Why it matters /
 * What to watch for, and a term mentioned inside it is a link that opens that
 * term's own entry in the same bubble, with a way back.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  GLOSSARY,
  SIMPLE_EQUIVALENT,
  isGlossaryKey,
  parseLinks,
  type GlossaryKey,
} from '@/lib/explain/glossary';
import { explain, type MetricKey } from '@/lib/explain/metrics';
import { strings } from '@/lib/i18n/strings';
import { useViewPrefs } from '@/lib/store/view-prefs';

/** Width of the simple bubble (w-72) plus a margin, for deciding which way it opens. */
const TIP_WIDTH_PX = 300;

type InfoTipProps =
  { metric: MetricKey; term?: undefined } | { term: GlossaryKey; metric?: undefined };

export function InfoTip(props: InfoTipProps) {
  const mode = useViewPrefs((s) => s.mode);
  const [open, setOpen] = useState(false);
  /** Glossary entries reached by following links, most recent last. */
  const [trail, setTrail] = useState<GlossaryKey[]>([]);
  /**
   * Opens leftwards when there is no room to the right. Measured on open: the
   * weather tip sits at the far right of the story strip, and a bubble anchored to
   * its left edge ran off the screen and gave the whole page a horizontal scroll.
   */
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const close = () => {
      setOpen(false);
      setTrail([]);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /* A glossary term is always plain-language, whatever the mode. */
  const simple = mode === 'simple' || props.term !== undefined;

  if (!simple && props.metric !== undefined) {
    const info = explain(props.metric);
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

  const base: GlossaryKey | undefined =
    props.term ?? (props.metric !== undefined ? SIMPLE_EQUIVALENT[props.metric] : undefined);
  const active = trail.length > 0 ? trail[trail.length - 1] : base;

  /* An engineer metric with no beginner entry keeps its text, under the simple labels. */
  const entry = active
    ? GLOSSARY[active]
    : (() => {
        const info = explain(props.metric!);
        return { title: info.title, what: info.what, why: info.why, watch: info.reading };
      })();

  const follow = (key: string) => {
    if (isGlossaryKey(key)) setTrail((current) => [...current, key]);
  };

  const renderText = (text: string) =>
    parseLinks(text).map((part, index) =>
      part.type === 'text' ? (
        <span key={index}>{part.value}</span>
      ) : (
        <button
          key={index}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            follow(part.key);
          }}
          className="text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {part.label}
        </button>
      ),
    );

  const label = strings.simple.explain;

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${entry.title}?`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setTrail([]);
          const rect = event.currentTarget.getBoundingClientRect();
          setAlignRight(rect.left + TIP_WIDTH_PX > window.innerWidth);
          setOpen((value) => !value);
        }}
        className="border-muted/60 text-muted hover:border-accent hover:text-accent ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] leading-none font-semibold normal-case transition"
      >
        i
      </button>

      {open && (
        <span
          id={panelId}
          role="tooltip"
          onClick={(event) => event.stopPropagation()}
          className={`border-border bg-surface-2 absolute top-6 z-50 block w-72 max-w-[calc(100vw-2rem)] rounded-lg border p-3 text-left tracking-normal normal-case shadow-xl ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-foreground block text-sm font-semibold">{entry.title}</span>
            {trail.length > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setTrail((current) => current.slice(0, -1));
                }}
                className="text-accent text-[11px] hover:underline"
              >
                {label.back}
              </button>
            )}
          </span>
          {(
            [
              [label.what, entry.what],
              [label.why, entry.why],
              [label.watch, entry.watch],
            ] as const
          ).map(([heading, text]) => (
            <span key={heading} className="mt-2 block text-xs leading-relaxed font-normal">
              <span className="text-foreground/90 block text-[10px] font-semibold tracking-wide uppercase">
                {heading}
              </span>
              <span className="text-muted">{renderText(text)}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
