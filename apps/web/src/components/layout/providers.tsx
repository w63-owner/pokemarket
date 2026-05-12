"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { NavigationHistoryTracker } from "@/hooks/use-navigation-history";
import { useUnreadCountSubscription } from "@/hooks/use-conversations";

function RealtimeBridge() {
  useUnreadCountSubscription();
  return null;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domMax} strict>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <NavigationHistoryTracker />
          <RealtimeBridge />
          {children}
          <Toaster
            position="bottom-center"
            offset={80}
            toastOptions={{
              className: "font-sans",
            }}
          />
        </ThemeProvider>
      </LazyMotion>
    </QueryClientProvider>
  );
}
