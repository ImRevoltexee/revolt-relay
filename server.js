// revolt-relay — MovieBox backend untuk REVOLT-STREAM.
// Jalan di Glitch (gratis, tanpa kartu kredit). Egress non-Cloudflare.
// Auth: header `x-relay-secret` harus cocok dengan env RELAY_SECRET.

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  mbSearch, mbInfo, mbSeason, mbStream, mbHome,
} from "./lib/endpoints.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);

function secretsMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 64 * 1024) break;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const p = url.pathname;

  if (req.method === "GET" && p === "/health") {
    return json(res, 200, { ok: true, service: "revolt-relay", ts: Date.now() });
  }

  // --- auth untuk semua /api/* ---
  const expected = process.env.RELAY_SECRET || "";
  const supplied = req.headers["x-relay-secret"] || "";
  if (!expected || !secretsMatch(String(supplied), expected)) {
    return json(res, 401, { ok: false, error: "unauthorized" });
  }

  try {
    // POST /api/search {keyword, page, perPage}
    if (p === "/api/search" && req.method === "POST") {
      const b = await readBody(req);
      const r = await mbSearch(String(b.keyword || ""), b.page || 1, b.perPage || 10);
      return json(res, 200, { ok: true, ...r });
    }
    // GET /api/info/:id
    let m = p.match(/^\/api\/info\/(\d+)$/);
    if (m && req.method === "GET") {
      const r = await mbInfo(m[1]);
      return r ? json(res, 200, { ok: true, ...r })
               : json(res, 404, { ok: false, error: "tidak ditemukan" });
    }
    // GET /api/season/:id
    m = p.match(/^\/api\/season\/(\d+)$/);
    if (m && req.method === "GET") {
      const r = await mbSeason(m[1]);
      return json(res, 200, { ok: true, ...r });
    }
    // GET /api/stream/:id?se=&ep=
    m = p.match(/^\/api\/stream\/(\d+)$/);
    if (m && req.method === "GET") {
      const r = await mbStream(m[1], {
        season: Number(url.searchParams.get("se") || 0),
        episode: Number(url.searchParams.get("ep") || 0),
      });
      return json(res, 200, { ok: true, ...r });
    }
    // GET /api/home
    if (p === "/api/home" && req.method === "GET") {
      const r = await mbHome();
      return r ? json(res, 200, { ok: true, ...r })
               : json(res, 502, { ok: false, error: "home gagal" });
    }
    return json(res, 404, { ok: false, error: "endpoint tidak dikenal" });
  } catch (e) {
    console.error("[relay]", e?.message || e);
    return json(res, 502, { ok: false, error: "backend error" });
  }
});

server.listen(PORT, () => console.log(`[relay] listening on :${PORT}`));
