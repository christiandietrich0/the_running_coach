import { FLAG_COLOUR_LABEL as LABEL } from '../labels';
import type { FlagColour } from '../types';

// A small dot + one line, not a big banner (v1.1 UI pass): the status
// colour lives on the dot only, text stays in --fg/--muted so it's always
// legible regardless of hue. A plain "on track, no flags at all" week's
// reason is just "On track." -- the same as the label -- so it's skipped
// rather than repeated (same fix as v1.1 A-round 2 item 6, updated now
// that the "km left" headline lives in its own big-number card instead of
// being appended to this reason).
export function VerdictBadge({ colour, reason }: { colour: FlagColour; reason: string }) {
  const showReason = !(colour === 'GREEN' && reason.trim() === 'On track.');

  return (
    <div class="verdict-row">
      <span class={`dot dot-${colour.toLowerCase()}`} />
      <span class="verdict-row-label">{LABEL[colour]}.</span>
      {showReason && <span class="verdict-row-reason">{reason}</span>}
    </div>
  );
}
