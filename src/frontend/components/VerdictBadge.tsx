import type { FlagColour } from '../types';

const LABEL: Record<FlagColour, string> = {
  GREEN: 'On track',
  BLUE: 'Low volume',
  YELLOW: 'Caution',
  RED: 'Overloaded',
  RACE: 'Race day',
};

export function VerdictBadge({ colour, reason }: { colour: FlagColour; reason: string }) {
  return (
    <div class={`verdict verdict-${colour.toLowerCase()}`}>
      <span class="verdict-dot" />
      <div>
        {/* On green, `reason` is already a full "On track. ..." sentence
            (v1.1 review A-round 2 item 6): a separate title would just
            repeat it as "On track / On track. ...". Non-green reasons are
            each their own specific flag text, so the title still adds
            useful at-a-glance context there. */}
        {colour !== 'GREEN' && <div class="verdict-label">{LABEL[colour]}</div>}
        <div class="verdict-reason">{reason}</div>
      </div>
    </div>
  );
}
