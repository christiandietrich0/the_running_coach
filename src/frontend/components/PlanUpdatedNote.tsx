// A dismissible one-time note that a sync (manual or cron) just
// re-generated the plan (v1.1 review round 5 item 3): only shown once per
// lastPlanUpdateAt value, same idea as the check-in prompt's per-week
// dismissal, but keyed by the timestamp instead of the week.
export function PlanUpdatedNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div class="card prompt">
      <div class="card-title-row">
        <div class="card-title">Plan updated from your latest runs</div>
        <button type="button" class="btn-small" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
