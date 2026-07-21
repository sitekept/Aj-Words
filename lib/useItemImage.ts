"use client";

import { useEffect, useState } from "react";

import { getImage } from "@/lib/image-store";

/**
 * Resolves the best displayable image source for an item:
 *   - a locally stored blob (via `imageId`) turned into an object URL, or
 *   - an external `imageUrl` (rendered directly).
 * Object URLs are revoked on change/unmount so blobs never leak. Returns null
 * when neither is available (or the blob is missing).
 */
export const useItemImage = (
  imageId?: string,
  imageUrl?: string
): string | null => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId) {
      setObjectUrl(null);
      return;
    }

    let active = true;
    let created: string | null = null;

    getImage(imageId).then((blob) => {
      if (!active || !blob) {
        return;
      }
      created = URL.createObjectURL(blob);
      setObjectUrl(created);
    });

    return () => {
      active = false;
      if (created) {
        URL.revokeObjectURL(created);
      }
      setObjectUrl(null);
    };
  }, [imageId]);

  if (imageId && objectUrl) {
    return objectUrl;
  }

  return imageUrl ?? null;
};
