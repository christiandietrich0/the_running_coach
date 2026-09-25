import type { FlagColour } from '../types';

const LABEL: Record<FlagColour, string> = {
  GREEN: 'On track',
  BLUE: 'Low volume',
  YELLOW: 'Caution',
  RED: 'Overloaded',
};

export function VerdictBadge({ colour, reason }: { colour: FlagColour; reason: string }) {
  return (
    <div class={`verdict verdict-${colour.toLowerCase()}`}>
      <span class="verdict-dot" />
      <div>
        <div class="verdict-label">{LABEL[colour]}</div>
        <div class="verdict-reason">{reason}</div>
      </div>
    </div>
  );
}
