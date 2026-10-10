// mb-backend/endpoints.js — API MovieBox yang di-port ke dalam Next.js.
// Memanggil MovieBox LANGSUNG dari Vercel (egress AWS, tidak di-block).
// Tanpa Cloudflare Worker, tanpa Render relay, tanpa env tambahan.

import {
  HOST_POOL, PATHS, H5_HOSTS, H5_HOME_PATH,
  ALLOWED_SUBJECT_TYPES, resolveSubjectType, LANGUAGE_NAMES,
} from "./hosts.js";
import { attemptHostPool } from "./request.js";
import { getCachedToken, bootstrapToken, invalidateToken, absorbToken } from "./token.js";

// ─── fetch dengan lifecycle auth ─────────────────────────────────────────────
// pakai token cache -> bootstrap kalau kosong -> coba host pool ->
// serap token rotasi -> retry sekali kalau auth failure.

async function fetchWithHostPool(path, method = "GET", params, body, timeoutMs = 12000) {
  const bodyStr = body ? JSON.stringify(body) : null;

  let authToken = getCachedToken();
  if (!authToken) {
    try {
      authToken = await bootstrapToken();
    } catch (e) {
      console.error(`[mb] bootstrap gagal: ${e?.message || e}`);
      return null;
    }
  }

  let result = await attemptHostPool(path, method, params, bodyStr, authToken, timeoutMs);

  if (result.freshToken && result.freshToken !== authToken) {
    absorbToken(result.freshToken);
  }
  if (result.data !== null && result.data !== undefined) return result.data;

  if (result.authFailure) {
    console.warn(`[mb] auth failure di ${path} — invalidate & retry sekali`);
    invalidateToken();
    try {
      authToken = await bootstrapToken();
    } catch {
      return null;
    }
    result = await attemptHostPool(path, method, params, bodyStr, authToken, timeoutMs);
    if (result.freshToken) absorbToken(result.freshToken);
    return result.data;
  }

  return null;
}

// ─── normalisasi ─────────────────────────────────────────────────────────────

function normSearchItem(item) {
  return {
    subjectId: String(item.subjectId),
    subjectType: item.subjectType,
    title: item.title,
    description: item.description ?? "",
    releaseDate: item.releaseDate ?? null,
    duration: item.duration ?? null,
    genre: item.genre ?? null,
    poster: item.cover?.url ?? null,
    thumbnail: item.cover?.thumbnail ?? null,
    country: item.countryName ?? null,
    rating: item.imdbRatingValue && item.imdbRatingValue !== "0"
      ? parseFloat(item.imdbRatingValue) : null,
    language: item.language ?? null,
    type: resolveSubjectType(item.subjectType),
  };
}

function mapCaptions(extCaptions) {
  return (extCaptions || []).map((cap) => ({
    language: cap.lanName || LANGUAGE_NAMES[cap.lan] || cap.lan,
    language_code: cap.lan,
    url: cap.url,
  }));
}

function mapResourceItem(item) {
  const sizeMb = item.size ? `${Math.round(parseInt(item.size) / (1024 * 1024))} MB` : null;
  return {
    quality: `${item.resolution}p`,
    resolution: item.resolution,
    url: item.resourceLink, // CDN langsung — tanpa proxy media
    format: "mp4",
    size: sizeMb,
    codecName: item.codecName ?? null,
    duration: item.duration ?? null,
    captions: mapCaptions(item.extCaptions),
    se: item.se,
    ep: item.ep,
    resourceId: item.resourceId, // internal: untuk fetch captions
  };
}

// Captions inline (extCaptions) sering kosong — fallback ke endpoint
// get-ext-captions pakai resourceId. Satu call per episode, hasilnya
// ditempel ke semua kualitas (captions bersifat per-episode).
async function fetchCaptions(resourceId) {
  if (!resourceId) return [];
  const data = await fetchWithHostPool(
    PATHS.captions, "GET", { resourceId }, undefined, 10000
  );
  return mapCaptions(data?.extCaptions);
}

// ─── endpoint publik ─────────────────────────────────────────────────────────

export async function mbSearch(keyword, page = 1, perPage = 10) {
  const data = await fetchWithHostPool(PATHS.search, "POST", undefined,
    { keyword, page, perPage, subjectType: 0 });
  if (!data) return { items: [], pager: null };
  const items = (data.items || [])
    .filter((it) => ALLOWED_SUBJECT_TYPES.has(it.subjectType))
    .map(normSearchItem);
  return { items, pager: data.pager || null };
}

export async function mbInfo(subjectId) {
  const data = await fetchWithHostPool(PATHS.get, "GET", { subjectId });
  if (!data?.subjectId) return null;
  const staffList = data.staffList || [];
  let runtimeMinutes = null;
  const raw = data.duration;
  if (typeof raw === "number") runtimeMinutes = Math.round(raw / 60);
  else if (typeof raw === "string") {
    const h = raw.match(/(\d+)h/); const m = raw.match(/(\d+)m/);
    runtimeMinutes = (h ? +h[1] : 0) * 60 + (m ? +m[1] : 0) || null;
  }
  return {
    subjectId: String(data.subjectId),
    subjectType: data.subjectType,
    type: resolveSubjectType(data.subjectType),
    title: data.title,
    description: data.description ?? "",
    releaseDate: data.releaseDate ?? null,
    runtime: runtimeMinutes,
    genre: data.genre ?? null,
    poster: data.cover?.url ?? null,
    country: data.countryName ?? null,
    rating: data.imdbRatingValue && data.imdbRatingValue !== "0"
      ? parseFloat(data.imdbRatingValue) : null,
    hasResource: data.hasResource ?? false,
    language: data.language ?? null,
    staff: staffList.map((s) => ({ name: s.name, role: s.role, avatar: s.avatar?.url ?? null })),
  };
}

export async function mbSeason(subjectId) {
  const data = await fetchWithHostPool(PATHS.seasonInfo, "GET", { subjectId });
  if (!data?.seasons?.length) return { seasons: [] };
  return {
    seasons: data.seasons.map((s) => {
      const best = s.resolutions?.length
        ? Math.max(...s.resolutions.map((r) => r.epNum)) : s.maxEp;
      return {
        season: s.se,
        totalEpisode: s.maxEp,
        episodesAvailable: best,
        resolutions: s.resolutions || [],
        episodes: Array.from({ length: s.maxEp }, (_, i) => ({
          episode: i + 1, title: null, releaseDate: null,
        })),
      };
    }),
  };
}

// ─── stream: multi-resolusi PARALEL ──────────────────────────────────────────
// Lawan timeout Vercel: 4 resolusi di-fetch BARENG (Promise.all), bukan
// sekuensial seperti worker asli. se/ep aktual dikirim ke API (server filter);
// hasil tetap di-filter ulang di JS untuk keamanan. Kalau episode spesifik
// kosong, fallback SEKALI ke bulk se=0&ep=0 (2 halaman pertama per resolusi).

const RESOLUTIONS = [360, 480, 720, 1080];

async function fetchResolutionPack(subjectId, se, ep, resolution, page, perPage = 10) {
  const data = await fetchWithHostPool(
    PATHS.resource, "GET",
    { subjectId, se, ep, resolution, page, perPage },
    undefined, 10000
  );
  return data?.list || [];
}

export async function mbStream(subjectId, { season = 0, episode = 0 } = {}) {
  const se = season, ep = episode;
  const isMovie = se === 0 && ep === 0;

  // 1) fetch paralel per resolusi, halaman 1
  let settled = await Promise.all(
    RESOLUTIONS.map((r) => fetchResolutionPack(subjectId, se, ep, r, 1))
  );
  let items = settled.flat();

  // 2) fallback bulk kalau episode spesifik tidak ketemu (maks 2 halaman)
  if (!isMovie && items.length === 0) {
    const bulk = await Promise.all(
      RESOLUTIONS.flatMap((r) => [1, 2].map((p) => fetchResolutionPack(subjectId, 0, 0, r, p)))
    );
    items = bulk.flat().filter((it) => Number(it.se) === se && Number(it.ep) === ep);
  }

  if (!items.length) return { streams: [], total: 0 };

  // 3) dedup by resourceId, filter se/ep, dedup per kualitas
  const seen = new Set();
  const seenQ = new Set();
  const streams = [];
  for (const item of items.sort((a, b) => b.resolution - a.resolution)) {
    if (!item.resourceId || seen.has(item.resourceId)) continue;
    if (!isMovie && (Number(item.se) !== se || Number(item.ep) !== ep)) continue;
    const q = `${item.resolution}p`;
    if (seenQ.has(q)) continue;
    seen.add(item.resourceId);
    seenQ.add(q);
    streams.push(mapResourceItem(item));
  }

  if (!streams.length) return { streams: [], total: 0 };

  // 4) captions: inline sering kosong -> fetch via get-ext-captions (sekali per episode)
  if (!streams[0].captions.length && streams[0].resourceId) {
    try {
      const caps = await fetchCaptions(streams[0].resourceId);
      if (caps.length) {
        for (const s of streams) s.captions = caps;
      }
    } catch {
      // captions opsional — stream tetap jalan tanpa subtitle
    }
  }

  return { streams, total: streams.length };
}

// ─── H5 homepage (tanpa signing) — terverifikasi live ────────────────────────

export async function mbHome() {
  for (const base of H5_HOSTS) {
    try {
      const r = await fetch(`${base}${H5_HOME_PATH}`, {
        headers: {
          "X-Client-Info": '{"timezone":"Africa/Lagos"}',
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
          Referer: `${base}/`,
          "X-Forwarded-For": "197.210.65.1",
        },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.code === 0 && data?.data?.operatingList) {
        return {
          rows: data.data.operatingList.map((row) => ({
            title: row.title,
            opId: row.opId,
            type: row.type,
            total: (row.subjects || []).length,
            subjects: (row.subjects || [])
              .filter((s) => ALLOWED_SUBJECT_TYPES.has(s.subjectType))
              .map((s) => ({
                subjectId: String(s.subjectId),
                subjectType: s.subjectType,
                type: resolveSubjectType(s.subjectType),
                title: s.title,
                description: s.description ?? "",
                releaseDate: s.releaseDate ?? null,
                genre: s.genre ?? null,
                poster: s.cover?.url ?? null,
                rating: s.imdbRatingValue && s.imdbRatingValue !== "0"
                  ? parseFloat(s.imdbRatingValue) : null,
              })),
          })),
        };
      }
    } catch {
      // host berikutnya
    }
  }
  return null;
}
