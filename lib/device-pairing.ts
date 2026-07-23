// Device pairing without a login or a typed code.
//
// A device that is already signed in (anonymously) writes a short-lived,
// single-use pairing code into the `device_pairings` table alongside its own
// session tokens, then shows a QR / deep-link carrying only that short code
// (#pair=<code>). A new device opens the link (camera → deep link), calls the
// SECURITY DEFINER `redeem_device_pairing` RPC to exchange the code for the
// tokens, and adopts the session with setSession(). Both devices are now the
// same Supabase user, so they see the same lists.
//
// Only the SHORT code travels in the QR, so the QR stays trivially scannable
// (session JWTs would be far too dense). See docs/ARCHITECTURE.md for the
// security trade-off (the code is a bearer secret for its ~10 min TTL).

import { getSupabase } from "@/lib/supabase-client";

const PAIR_HASH_KEY = "pair";
const PAIRING_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I to keep the code unambiguous if ever read aloud.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;

const randomCode = (): string => {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
};

export interface PairingLink {
  code: string;
  url: string;
}

/** Pull the pairing code out of a location hash ("#pair=..."), or null. */
export const extractPairCode = (hash: string): string | null => {
  if (!hash) {
    return null;
  }

  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return new URLSearchParams(raw).get(PAIR_HASH_KEY);
  } catch {
    return null;
  }
};

/** Create a pairing code + deep link for the current session, or null. */
export const createPairingLink = async (): Promise<PairingLink | null> => {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    return null;
  }

  const code = randomCode();
  const { error } = await supabase.from("device_pairings").insert({
    code,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  });
  if (error) {
    return null;
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  return { code, url: `${base}#${PAIR_HASH_KEY}=${code}` };
};

/** Exchange a pairing code for its session and adopt it. True on success. */
export const redeemPairing = async (code: string): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.rpc("redeem_device_pairing", {
    pairing_code: code
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.access_token || !row?.refresh_token) {
    return false;
  }

  const { error: setError } = await supabase.auth.setSession({
    access_token: row.access_token as string,
    refresh_token: row.refresh_token as string
  });
  return !setError;
};
