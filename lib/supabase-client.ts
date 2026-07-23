// Lazy singleton Supabase client for the optional cloud-sync layer.
//
// Cloud sync is OFF unless both env vars are set at build time:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// When they are absent, isCloudEnabled() is false and getSupabase() returns
// null, so every caller becomes a no-op and the app stays 100% offline/local
// (exactly the pre-sync behavior the tests and e2e suite exercise).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isCloudEnabled = (): boolean => Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** The shared client, or null when cloud sync is disabled or off the browser. */
export const getSupabase = (): SupabaseClient | null => {
  if (!isCloudEnabled() || typeof window === "undefined") {
    return null;
  }

  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // We own the URL fragment (#share=, #pair=); don't let supabase-js try
        // to parse an OAuth callback out of it.
        detectSessionInUrl: false
      }
    });
  }

  return client;
};
