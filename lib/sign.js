// mb-backend/sign.js — MovieBox Mobile API v3 request signing (Node runtime).
// Port bersih dari spun-moviebox-api (signing.ts): logika HMAC-MD5 identik,
// tapi pakai node:crypto sinkron (jauh lebih simpel dari SubtleCrypto).
//
// Canonical string:  METHOD\naccept\ncontentType\nbodyLength\nts\nbodyHash\npath?sortedQuery
// Signature header:  `{ts}|2|{base64(hmac-md5)}`
// Client token:      `{ts},{md5(ts dibalik)}`
//
// SECRET_KEY_B64 adalah kunci publik dari reverse-engineering (ada di repo spun,
// bukan rahasia user) — aman di-hardcode.

import { createHash, createHmac } from "node:crypto";

export const SECRET_KEY_B64 = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";
const BODY_MAX_BYTES = 102_400;

export function md5Hex(data) {
  return createHash("md5").update(data).digest("hex");
}

/** `{ts},{md5(ts dibalik)}` */
export function generateClientToken(ts) {
  const s = String(ts);
  return `${s},${md5Hex(s.split("").reverse().join(""))}`;
}

function sortedQueryString(url) {
  const u = new URL(url);
  const entries = [...u.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

function buildCanonicalString(method, accept, contentType, url, body, ts) {
  const u = new URL(url);
  const query = sortedQueryString(url);
  const canonicalUrl = query ? `${u.pathname}?${query}` : u.pathname;

  let bodyHash = "";
  let bodyLength = "";
  if (body !== null && body !== undefined) {
    const buf = Buffer.from(body, "utf8");
    bodyHash = md5Hex(buf.subarray(0, BODY_MAX_BYTES));
    bodyLength = String(buf.length);
  }

  return [method.toUpperCase(), accept, contentType, bodyLength, String(ts), bodyHash, canonicalUrl].join("\n");
}

/** `{ts}|2|{base64(hmac-md5)}` */
export function generateSignature(method, accept, contentType, url, body, ts) {
  const canonical = buildCanonicalString(method, accept, contentType, url, body, ts);
  const key = Buffer.from(SECRET_KEY_B64, "base64");
  const mac = createHmac("md5", key).update(canonical, "utf8").digest("base64");
  return `${ts}|2|${mac}`;
}
