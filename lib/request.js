// mb-backend/request.js — signed fetch + host-pool fallback.
// PENTING: fetch LANGSUNG ke MovieBox (tanpa relay). Alasan relay di spun
// adalah IP egress Cloudflare yang di-block MovieBox — egress Vercel (AWS)
// tidak di-block, jadi relay tidak dibutuhkan.

import { HOST_POOL, USER_AGENT, makeClientInfo } from "./hosts.js";
import { generateClientToken, generateSignature } from "./sign.js";

let _clientInfo = null;
function clientInfo() {
  if (!_clientInfo) _clientInfo = makeClientInfo();
  return _clientInfo;
}

export async function buildHeaders(method, url, body, authToken) {
  const accept = "application/json";
  const contentType = body != null ? "application/json; charset=utf-8" : "application/json";
  const ts = Date.now();
  const [token, signature] = await Promise.all([
    Promise.resolve(generateClientToken(ts)),
    Promise.resolve(generateSignature(method, accept, contentType, url, body, ts)),
  ]);
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: accept,
    "Content-Type": contentType,
    Connection: "keep-alive",
    "X-Client-Token": token,
    "x-tr-signature": signature,
    "X-Client-Info": clientInfo(),
    "X-Client-Status": "0",
    "X-Play-Mode": "2",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

export function extractXUser(headers) {
  const raw = headers.get("x-user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

/**
 * Coba tiap host berurutan, return { data, freshToken, authFailure }.
 * - data: payload (code===0) atau null
 * - freshToken: token rotasi dari header x-user (kalau ada)
 * - authFailure: true kalau SEMUA respons yang masuk adalah penolakan auth
 */
export async function attemptHostPool(path, method, params, bodyStr, authToken, timeoutMs = 12000) {
  let freshToken = null;
  let sawAuthFailure = false;
  let sawAnyResponse = false;

  for (const base of HOST_POOL) {
    const url = new URL(`${base}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    }
    const urlStr = url.toString();
    const headers = await buildHeaders(method, urlStr, bodyStr, authToken);

    try {
      const r = await fetch(urlStr, {
        method,
        headers,
        ...(bodyStr ? { body: bodyStr } : {}),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      sawAnyResponse = true;

      const xUser = extractXUser(r.headers);
      if (xUser) freshToken = xUser;

      if (r.status === 401 || r.status === 403) {
        sawAuthFailure = true;
        continue;
      }
      if (r.status < 200 || r.status >= 300) continue;

      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }
      if (json?.code === 0) {
        return { data: json.data ?? null, freshToken, authFailure: false };
      }
      if (json?.message && /token|auth/i.test(json.message)) sawAuthFailure = true;
    } catch {
      // timeout / transport error -> host berikutnya
    }
  }

  return { data: null, freshToken, authFailure: sawAnyResponse && sawAuthFailure };
}
