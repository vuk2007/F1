/** The round tyre marker used across the Simple view, in the sport's own colours. */
import { compoundColour, compoundLetter } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';

export function compoundName(compound: string | null | undefined): string {
  if (!compound) return strings.common.noValue;
  return strings.compounds[compound.toUpperCase()] ?? compound;
}

export function TyreBadge({
  compound,
  size = 'sm',
}: {
  compound: string | null;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-black ${
        size === 'md' ? 'h-5 w-5 text-[10px]' : 'h-4 w-4 text-[9px]'
      }`}
      style={{ backgroundColor: compoundColour(compound) }}
      title={compoundName(compound)}
    >
      {compoundLetter(compound)}
    </span>
  );
}
