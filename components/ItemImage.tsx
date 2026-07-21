"use client";

import { useItemImage } from "@/lib/useItemImage";

interface ItemImageProps {
  imageId?: string;
  imageUrl?: string;
  alt?: string;
  className?: string;
}

/**
 * Renders a card image from a local blob (imageId) or an external URL, or
 * nothing when neither resolves. Thin wrapper over useItemImage so callers stay
 * declarative.
 */
export function ItemImage({
  imageId,
  imageUrl,
  alt = "",
  className
}: ItemImageProps) {
  const src = useItemImage(imageId, imageUrl);
  if (!src) {
    return null;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
