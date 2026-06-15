"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Tempo real: os dados ficam "stale" depressa e voltam a buscar
            // ao focar o separador, ao reconectar a net e por polling.
            staleTime: 10 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 2,
          },
        },
      }),
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA opcional: ignorar falha de registo */
      });
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
