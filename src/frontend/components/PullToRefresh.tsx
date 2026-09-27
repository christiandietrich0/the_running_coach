import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const THRESHOLD_PX = 70;

// A pull-down-to-refresh gesture, scoped to whatever screen renders this
// wrapper (v1.1 mobile polish) -- only listens while mounted, so it's
// only live on This Week, not the other tabs. Only engages when the pull
// starts at the very top of the page (window.scrollY === 0), so it never
// fights normal scrolling.
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ComponentChildren }) {
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || window.scrollY > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current == null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (progressRef.current !== 0) {
          progressRef.current = 0;
          setProgress(0);
        }
        return;
      }
      e.preventDefault();
      progressRef.current = Math.min(1, dy / THRESHOLD_PX);
      setProgress(progressRef.current);
    }

    async function onTouchEnd() {
      if (startYRef.current == null) return;
      startYRef.current = null;
      if (progressRef.current >= 1) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          progressRef.current = 0;
          setProgress(0);
        }
      } else {
        progressRef.current = 0;
        setProgress(0);
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh]);

  const show = refreshing || progress > 0;

  return (
    <div>
      <div class="pull-indicator" style={{ height: show ? `${Math.max(progress, refreshing ? 1 : 0) * 44}px` : '0px' }}>
        {show && <span class={`pull-spinner${refreshing || progress >= 1 ? ' pull-spinner-ready' : ''}`} />}
      </div>
      {children}
    </div>
  );
}
