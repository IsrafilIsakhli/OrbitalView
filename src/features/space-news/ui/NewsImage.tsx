import { Image24Regular } from "@fluentui/react-icons";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";

import { useNewsImage } from "../api/useSpaceNews";

interface NewsImageProps {
  alt: string;
  cachedPath: string | null;
  eager?: boolean;
  imageAvailable: boolean;
  newsId: string;
}

export function NewsImage({ alt, cachedPath, eager = false, imageAvailable, newsId }: NewsImageProps) {
  const [failed, setFailed] = useState(false);
  const image = useNewsImage(newsId, imageAvailable && !cachedPath && !failed);
  const source = cachedPath ? convertFileSrc(cachedPath) : image.data;

  if (!source || failed) {
    return <span aria-hidden className="news-image-placeholder"><Image24Regular /></span>;
  }
  return (
    <img
      alt={alt}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      src={source}
    />
  );
}
