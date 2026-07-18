"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { refreshLiveQueries } from "@/lib/refresh-live-queries";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD_PX = 80;
const HOLD_MS = 450;
const MAX_PULL_PX = 110;
const LG_MQ = "(min-width: 1024px)";

type Phase = "idle" | "pulling" | "holding" | "refreshing";

/**
 * Pull-to-refresh mobile: no topo, puxar até ao máximo e segurar ~450 ms
 * para reler a BD (`?fresh=1`). Desktop desactivado.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pullPx, setPullPx] = useState(0);
  const [enabled, setEnabled] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const pullRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armedHoldRef = useRef(false);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    armedHoldRef.current = false;
  }, []);

  const reset = useCallback(() => {
    clearHoldTimer();
    trackingRef.current = false;
    pullRef.current = 0;
    setPullPx(0);
    setPhaseBoth("idle");
  }, [clearHoldTimer, setPhaseBoth]);

  const runRefresh = useCallback(async () => {
    clearHoldTimer();
    setPhaseBoth("refreshing");
    pullRef.current = PULL_THRESHOLD_PX;
    setPullPx(PULL_THRESHOLD_PX);
    try {
      await refreshLiveQueries(queryClient, { fresh: true });
      router.refresh();
    } finally {
      reset();
    }
  }, [clearHoldTimer, queryClient, reset, router, setPhaseBoth]);

  useEffect(() => {
    const mq = window.matchMedia(LG_MQ);
    const sync = () => setEnabled(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current === "refreshing") return;
      if (!atTop()) return;
      trackingRef.current = true;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      clearHoldTimer();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || phaseRef.current === "refreshing") return;
      if (!atTop() && pullRef.current <= 0) {
        trackingRef.current = false;
        return;
      }

      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startYRef.current;
      if (delta <= 0) {
        clearHoldTimer();
        pullRef.current = 0;
        setPullPx(0);
        setPhaseBoth("idle");
        return;
      }

      // Resistência: overscroll não 1:1
      const resisted = Math.min(MAX_PULL_PX, delta * 0.45);
      pullRef.current = resisted;
      setPullPx(resisted);

      if (resisted > 8 && e.cancelable) {
        e.preventDefault();
      }

      if (resisted >= PULL_THRESHOLD_PX) {
        if (phaseRef.current !== "holding") {
          setPhaseBoth("holding");
        }
        if (!armedHoldRef.current) {
          armedHoldRef.current = true;
          holdTimerRef.current = setTimeout(() => {
            if (
              pullRef.current >= PULL_THRESHOLD_PX &&
              trackingRef.current &&
              phaseRef.current === "holding"
            ) {
              void runRefresh();
            }
          }, HOLD_MS);
        }
      } else {
        clearHoldTimer();
        setPhaseBoth("pulling");
      }
    };

    const onTouchEnd = () => {
      if (phaseRef.current === "refreshing") return;
      trackingRef.current = false;
      clearHoldTimer();
      pullRef.current = 0;
      setPullPx(0);
      setPhaseBoth("idle");
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      clearHoldTimer();
    };
  }, [enabled, clearHoldTimer, reset, runRefresh, setPhaseBoth]);

  const showIndicator = enabled && (pullPx > 4 || phase === "refreshing");
  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX);

  return (
    <div className="relative">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center overflow-hidden transition-[height] duration-150",
          showIndicator ? "opacity-100" : "opacity-0",
        )}
        style={{ height: showIndicator ? Math.max(pullPx, phase === "refreshing" ? 48 : 0) : 0 }}
        aria-hidden={!showIndicator}
      >
        <div className="flex flex-col items-center justify-end gap-1 pb-2 pt-1 text-muted-foreground">
          <RefreshCw
            className={cn(
              "size-5 stroke-[1.5]",
              phase === "refreshing" && "animate-spin",
            )}
            style={
              phase === "refreshing"
                ? undefined
                : { transform: `rotate(${progress * 180}deg)` }
            }
          />
          <span className="text-[11px] font-medium tracking-wide">
            {phase === "refreshing"
              ? "A actualizar…"
              : phase === "holding"
                ? "Segura…"
                : progress >= 1
                  ? "Segura para actualizar"
                  : "Puxa para actualizar"}
          </span>
        </div>
      </div>
      <div
        style={{
          transform:
            enabled && pullPx > 0
              ? `translateY(${Math.min(pullPx, MAX_PULL_PX)}px)`
              : undefined,
          transition:
            phase === "idle" || phase === "refreshing"
              ? "transform 180ms ease-out"
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
