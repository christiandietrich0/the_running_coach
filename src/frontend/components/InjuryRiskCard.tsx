import { useState } from 'preact/hooks';
import { fmtWeekLabel } from '../charts';
import type { InjuryRisk, InjuryRiskContributor, InjuryRiskLevel } from '../types';
import { BottomSheet } from './BottomSheet';

// This Week's top-of-screen load-based early-warning indicator (v1.1
// review round 10 Part 2) -- a coloured dot, "Injury risk: X", and a
// one-line "Why" naming the top 2 contributors, tappable for the full
// breakdown. The score itself is computeInjuryRisk() (src/logic/
// injuryRisk.ts); this component only renders what it returns.
const LEVEL_LABEL: Record<InjuryRiskLevel, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const LEVEL_DOT: Record<InjuryRiskLevel, string> = { LOW: 'dot-green', MEDIUM: 'dot-yellow', HIGH: 'dot-red' };

function contributorPhrase(c: InjuryRiskContributor): string {
  return c.weekStart ? `${c.label.toLowerCase()} ${fmtWeekLabel(c.weekStart)}` : c.label.toLowerCase();
}

export function InjuryRiskCard({ risk }: { risk: InjuryRisk }) {
  const [showDetails, setShowDetails] = useState(false);
  const top2 = risk.contributors.slice(0, 2);

  return (
    <>
      <button type="button" class="injury-risk-card" onClick={() => setShowDetails(true)}>
        <div class="injury-risk-head">
          <span class={`dot ${LEVEL_DOT[risk.level]}`} />
          <span class="injury-risk-label">Injury risk: {LEVEL_LABEL[risk.level]}</span>
          <span class="injury-risk-caret">&rsaquo;</span>
        </div>
        {top2.length > 0 && <div class="injury-risk-why">Why: {top2.map(contributorPhrase).join(', ')}</div>}
      </button>

      {showDetails && (
        <BottomSheet title="Injury risk" onClose={() => setShowDetails(false)}>
          <div class="injury-risk-details">
            <div class="injury-risk-summary">
              <span class={`dot ${LEVEL_DOT[risk.level]}`} />
              <span class="injury-risk-summary-label">{LEVEL_LABEL[risk.level]}</span>
            </div>
            <p class="injury-risk-disclaimer">Load-based signal from your recent training, not a medical prediction.</p>
            {risk.contributors.length === 0 ? (
              <p class="muted">No recent load or symptom flags.</p>
            ) : (
              risk.contributors.map((c) => {
                const isOverride = risk.overrideHigh && c.source === 'SYMPTOMS';
                return (
                  <div class="injury-risk-row" key={`${c.source}-${c.weekStart ?? 'trend'}`}>
                    <div class="injury-risk-row-top">
                      <span>
                        {c.label}
                        {c.weekStart ? ` · ${fmtWeekLabel(c.weekStart)}` : ''}
                      </span>
                      <span class={isOverride ? 'injury-risk-override' : undefined}>{isOverride ? 'Overrides to High' : `+${c.weightedPoints.toFixed(1)}`}</span>
                    </div>
                    <div class="injury-risk-row-reason">{c.reason}</div>
                    {!isOverride && <div class="injury-risk-row-weight">weight &times;{c.weight.toFixed(1)}</div>}
                  </div>
                );
              })
            )}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
