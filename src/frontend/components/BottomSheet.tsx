import type { ComponentChildren } from 'preact';

// A shared bottom-sheet shell (v1.1 mobile polish): Edit week, Add/Edit
// race and the check-in all open this way now, instead of an inline form
// pushing the rest of the screen around. Tapping the scrim or the close
// button dismisses it, same as Cancel.
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div
      class="sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="sheet">
        <div class="sheet-header">
          <div class="sheet-title">{title}</div>
          <button type="button" class="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
