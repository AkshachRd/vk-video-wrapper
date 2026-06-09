import { useCallback, useEffect, useRef, useState } from "react";

type UseControlsAutoHideOptions = {
  /** When true, controls auto-hide after `hideDelayMs` of no `reveal()`. When false, controls stay visible. */
  active: boolean;
  hideDelayMs?: number;
};

const DEFAULT_HIDE_DELAY_MS = 2500;

/**
 * Drives player-chrome visibility: keeps controls shown, and while `active`
 * (e.g. playing) hides them after a period of inactivity. Call `reveal()` on
 * user activity (pointer move) to show them and restart the countdown.
 */
export function useControlsAutoHide({
  active,
  hideDelayMs = DEFAULT_HIDE_DELAY_MS,
}: UseControlsAutoHideOptions): { visible: boolean; reveal: () => void } {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const reveal = useCallback(() => {
    setVisible(true);
    clearTimer();
    if (active) {
      timerRef.current = setTimeout(() => setVisible(false), hideDelayMs);
    }
  }, [active, hideDelayMs, clearTimer]);

  useEffect(() => {
    clearTimer();
    setVisible(true);
    if (active) {
      timerRef.current = setTimeout(() => setVisible(false), hideDelayMs);
    }
    return clearTimer;
  }, [active, hideDelayMs, clearTimer]);

  return { visible, reveal };
}
