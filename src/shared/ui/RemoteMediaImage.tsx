import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { resolveRemoteMedia, type RemoteMediaProvider } from "@/shared/platform/remoteMedia";

interface RemoteMediaImageProps {
  alt: string;
  className?: string;
  fallback: ReactNode;
  provider: RemoteMediaProvider;
  url: string | null | undefined;
}

export function RemoteMediaImage({ alt, className, fallback, provider, url }: RemoteMediaImageProps) {
  const [failed, setFailed] = useState(false);
  const media = useQuery({
    enabled: Boolean(url) && !failed,
    queryFn: () => resolveRemoteMedia(url!, provider),
    queryKey: ["remote-media", provider, url],
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!media.data || failed) return fallback;
  return <img alt={alt} className={className} decoding="async" loading="lazy" onError={() => setFailed(true)} src={media.data} />;
}
