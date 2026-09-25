// The full check-in sheet (mechanics brief 8, "a sheet on first open each
// Monday") lands in Phase 8. This is just the prompt: a visible nudge that
// one is due.
export function CheckinPrompt({ needed }: { needed: boolean }) {
  if (!needed) return null;

  return (
    <div class="card prompt">
      <div class="card-title">Check-in due</div>
      <p class="muted">How are your heel, Achilles, knee and hip feeling this week?</p>
    </div>
  );
}
