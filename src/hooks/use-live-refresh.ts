"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { refreshLiveQueries } from "@/lib/refresh-live-queries";

/** Mesmo refresh do pull-to-refresh mobile (`?fresh=1` + RSC). */
export function useLiveRefresh() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      await refreshLiveQueries(queryClient, { fresh: true });
      router.refresh();
    } finally {
      busyRef.current = false;
      setRefreshing(false);
    }
  }, [queryClient, router]);

  return { refresh, refreshing };
}
