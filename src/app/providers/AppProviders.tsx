import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { satelliteMediaQueryKey } from "@/features/satellites/api/useSatelliteObjectMedia";
import { i18n } from "@/shared/i18n/i18n";
import { setNativeBackgroundSync } from "@/features/control-center/api/controlCenter";
import { controlCenterQueryKey } from "@/features/control-center/api/useControlCenter";
import { spaceNewsQueryKey } from "@/features/space-news/api/useSpaceNews";
import { queryKeys } from "@/shared/data/queryKeys";
import { AUTOMATIC_REFRESH_INTERVAL_MS } from "@/shared/data/refreshPolicy";
import { UpdateCoordinator } from "@/features/updater/ui/UpdateCoordinator";

import { AppErrorBoundary } from "./AppErrorBoundary";

function LocaleSynchronizer() {
  const locale = usePreferencesStore((state) => state.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);

  return null;
}

function NativeDataSynchronizer({ queryClient }: { queryClient: QueryClient }) {
  const backgroundSync = usePreferencesStore((state) => state.backgroundSync);
  useEffect(() => {
    void setNativeBackgroundSync(backgroundSync).catch(() => undefined);
  }, [backgroundSync]);

  useEffect(() => {
    const refresh = () => {
      for (const queryKey of [
        queryKeys.launches,
        queryKeys.nasa,
        queryKeys.news,
        queryKeys.noaa,
        queryKeys.satellites,
        queryKeys.weather,
      ]) {
        void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
      }
    };
    const timer = window.setInterval(refresh, AUTOMATIC_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("provider-health-changed", ({ payload: provider }) => {
      void queryClient.invalidateQueries({ queryKey: controlCenterQueryKey });
      if (provider === "celestrak") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.satellites });
      } else if (provider === "launchLibrary") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.launches });
      } else if (provider === "nasa") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.nasa });
      } else if (provider === "noaaSwpc") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.noaa });
      } else if (provider === "openMeteo") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.weather });
      } else if (provider === "spaceflightNews") {
        void queryClient.invalidateQueries({ queryKey: spaceNewsQueryKey });
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ noradId: string }>("satellite-object-media-updated", ({ payload }) => {
      void queryClient.invalidateQueries({
        queryKey: [...satelliteMediaQueryKey, payload.noradId],
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    for (const eventName of ["space-news-updated", "space-news-translation-updated"]) {
      void listen(eventName, () => {
        void queryClient.invalidateQueries({ queryKey: spaceNewsQueryKey });
        void queryClient.invalidateQueries({ queryKey: controlCenterQueryKey });
      }).then((cleanup) => {
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [queryClient]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const reduceMotion = usePreferencesStore((state) => state.reduceMotion);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
          <LocaleSynchronizer />
          <NativeDataSynchronizer queryClient={queryClient} />
          {children}
          <UpdateCoordinator />
        </MotionConfig>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
