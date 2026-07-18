"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  hydrateLiveQueryCache,
  subscribeLiveQueryPersistence,
} from "@/lib/live-query-persist";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    hydrateLiveQueryCache(queryClient);
    return subscribeLiveQueryPersistence(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA opcional: ignorar falha de registo */
      });
    }
  }, []);

  // Script props estáveis (evitar branch server/client no ThemeProvider).
  const scriptProps = { type: "application/json" } as const;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      scriptProps={scriptProps}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
