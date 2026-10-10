// mb-backend/token.js — bootstrap & cache token auth MovieBox.
// Setiap signed request butuh header `Authorization: Bearer {token}`.
// Token didapat dari SATU signed GET (endpoint tab-operating) — responsnya
// membawa header `x-user`: {"token": "<JWT>", ...}. JWT berumur ~90 hari.
//
// Cache in-memory per instance (tanpa KV — Vercel tidak punya KV gratis).
// Worst case: tiap cold-start bootstrap sekali (1 request ekstra). Aman.

import { HOST_POOL, PATHS } from "./hosts.js";
import { generateClientToken, generateSignature } from "./sign.js";
import { buildHeaders, extractXUser } from "./request.js";

let _cached = null; // { token, expiresAtSeconds }
let _bootstrapPromise = null;
const SAFETY_MARGIN = 300;

function decodeJwtExp(jwt) {
  try {
    const part = String(jwt).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function expiringSoon(cached) {
  return Math.floor(Date.now() / 1000) >= cached.expiresAtSeconds - SAFETY_MARGIN;
}

export function getCachedToken() {
  if (_cached && !expiringSoon(_cached)) return _cached.token;
  return null;
}

export function invalidateToken() {
  _cached = null;
}

function storeToken(token) {
  const exp = decodeJwtExp(token);
  _cached = {
    token,
    expiresAtSeconds: exp ?? Math.floor(Date.now() / 1000) + 3600,
  };
}

/**
 * Bootstrap: signed GET ke tab-operating di tiap host sampai dapat x-user.
 * Tanpa bearer (belum punya token) — signing saja cukup untuk endpoint ini.
 */
export async function bootstrapToken() {
  if (!_bootstrapPromise) {
    _bootstrapPromise = (async () => {
      for (const base of HOST_POOL) {
        try {
          const url = new URL(`${base}${PATHS.tabOperating}`);
          url.searchParams.set("page", "1");
          url.searchParams.set("tabId", "0");
          url.searchParams.set("version", "");
          const headers = await buildHeaders("GET", url.toString(), null, null);
          const r = await fetch(url.toString(), {
            headers,
            signal: AbortSignal.timeout(12000),
            cache: "no-store",
          });
          const xUser = extractXUser(r.headers);
          if (xUser) {
            storeToken(xUser);
            return xUser;
          }
        } catch {
          // host gagal -> coba host berikutnya
        }
      }
      throw new Error("bootstrap gagal — tidak ada x-user dari host manapun");
    })().finally(() => {
      _bootstrapPromise = null;
    });
  }
  return _bootstrapPromise;
}

/** Absorb token rotasi yang dikirim MovieBox via header x-user. */
export function absorbToken(token) {
  if (token && (!_cached || _cached.token !== token)) storeToken(token);
}
