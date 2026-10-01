// Full-screen "How Legroom works" sheet (v1.1 mobile polish) -- unlike the
// bottom sheets used for edit/add forms, this covers the whole viewport
// (it's a page of text to read, not a form floating over the screen it
// came from). Content is reproduced verbatim from the methodology brief;
// don't paraphrase it when touching this file.
export function MethodologySheet({ onClose }: { onClose: () => void }) {
  return (
    <div class="method-overlay">
      <div class="method-header">
        <div class="sheet-title">How Legroom works</div>
        <button type="button" class="sheet-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div class="method-body">
        <p>
          Legroom looks at your training week by week and shows how much room you have: weekly km, how long your long run can be, and how much descent. All
          numbers are ceilings, not targets.
        </p>

        <h3>The long-run rule (strongest evidence)</h3>
        <p>
          A run more than 10% longer than your longest run in the previous 30 days raised overuse injury risk by roughly 50 to 130% in a study of 5,200
          runners (Frandsen et al., BJSM 2025). This is the main safety rule.
        </p>

        <h3>Weekly volume</h3>
        <p>
          Each week is compared with your average of the previous 4 weeks. Green is 0.8 to 1.2 times that average. Weekly swings showed little link to
          injury, so the zones guide the shape of your plan rather than predict injury.
        </p>

        <h3>Descent</h3>
        <p>
          Downhill running loads knees and quads far more than flat running. Legroom tracks descent separately and flags jumps against your recent max.
          These thresholds are convention, not proven.
        </p>

        <h3>Taper and recovery</h3>
        <p>Two weeks before an A race, volume drops by about 40 to 60% while intensity stays (Bosquet et al., 2007). After a race: a recovery week, then a down week.</p>

        <h3>Symptoms beat numbers</h3>
        <p>If something hurts, the weekly check-in overrides a green chart.</p>

        <h3>Injury risk indicator</h3>
        <p>
          This Week shows a Low, Medium or High read at the top, built from the same flags and check-in above rather than anything new: your long run,
          descent and weekly-volume flags from this week and the 3 before it (this week counts most, each week back counts a little less), a rising
          4-week average against your 10-week one, and your latest check-in. A region scored 5 or higher, or "reduced training" checked, pushes straight
          to High no matter what the rest adds up to. Tap it to see exactly what's contributing and by how much. It is a load-based signal from your
          recent training, not a medical prediction -- the same caveats above apply here too.
        </p>

        <h3>What Legroom does not know</h3>
        <p>Sleep, stress, intensity, surface, shoes. Most thresholds are expert convention and can be adjusted under Advanced. This is not medical advice.</p>
      </div>
    </div>
  );
}
