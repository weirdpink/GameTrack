import React, { useState, useEffect } from "react";
import { FALLBACK_POSTER_URL } from "../constants";

interface PosterImageProps {
  src: string;
  alt?: string;
  className?: string;
}

/**
 * Poster with graceful fallbacks:
 *  1. if poster_url is empty OR the image fails to load (dead CDN link,
 *     expired IGDB cover, hotlink block), render the curated fallback;
 *  2. if the curated fallback itself fails, render a neutral placeholder.
 * `referrerPolicy="no-referrer"` is required — IGDB and Steam CDNs reject
 * requests that carry a Referer header.
 */
export const PosterImage: React.FC<PosterImageProps> = ({ src, alt = "", className }) => {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setFallbackFailed(false);
  }, [src]);

  if (fallbackFailed) {
    return <div aria-label={alt || "Poster"} className={`${className} bg-zinc-900 flex items-center justify-center`} />;
  }

  const showFallback = !src || failed;

  return (
    <img
      src={showFallback ? FALLBACK_POSTER_URL : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (showFallback) setFallbackFailed(true);
        else setFailed(true);
      }}
      className={className}
    />
  );
};
