// Uploads a card's local image blob (IndexedDB, lib/image-store.ts) to Supabase
// Storage and returns a durable public URL. That URL is stored as the item's
// `imageUrl` in the cloud copy, so every other device renders it through the
// existing useItemImage() imageUrl path — no blob sync needed.

import { getImage } from "@/lib/image-store";
import { getSupabase } from "@/lib/supabase-client";

export const IMAGE_BUCKET = "card-images";

/**
 * Upload the blob behind `imageId` to `{uid}/{imageId}` and return its public
 * URL, or null when sync is off, the blob is missing, or the upload fails.
 */
export const uploadItemImage = async (
  uid: string,
  imageId: string
): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const blob = await getImage(imageId);
  if (!blob) {
    return null;
  }

  const path = `${uid}/${imageId}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || "image/jpeg"
  });
  if (error) {
    return null;
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
};
