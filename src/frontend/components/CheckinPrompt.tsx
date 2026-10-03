// A tappable nudge that a check-in is due; opens the CheckinSheet.
export function CheckinPrompt({ needed, onClick }: { needed: boolean; onClick: () => void }) {
  if (!needed) return null;

  return (
    <button type="button" class="card prompt checkin-prompt-button" onClick={onClick}>
      <div class="card-title">Check-in due</div>
      <p class="muted">How are your heel, Achilles, knee and hip feeling this week?</p>
    </button>
  );
}
