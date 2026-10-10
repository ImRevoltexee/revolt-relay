// mb-backend/hosts.js — konstanta MovieBox: host pool, path API, identitas client.

export const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com",
];

export const PATHS = {
  search: "/wefeed-mobile-bff/subject-api/search",
  get: "/wefeed-mobile-bff/subject-api/get",
  seasonInfo: "/wefeed-mobile-bff/subject-api/season-info",
  resource: "/wefeed-mobile-bff/subject-api/resource",
  captions: "/wefeed-mobile-bff/subject-api/get-ext-captions",
  // target bootstrap ringan — signed GET apapun bisa, yang ini paling murah
  tabOperating: "/wefeed-mobile-bff/tab-operating",
};

// H5 (tanpa signing) — sudah terverifikasi live
export const H5_HOSTS = [
  "https://netnaija.film",
  "https://h5.aoneroom.com",
  "https://moviebox.pk",
];
export const H5_HOME_PATH = "/wefeed-h5-bff/web/home";

// subjectType: 1=movie, 2=tv, 7=shorts
export const ALLOWED_SUBJECT_TYPES = new Set([1, 2, 7]);

export function resolveSubjectType(st) {
  if (st === 2) return "tv";
  if (st === 7) return "shorts";
  return "movie";
}

// identitas client Android (dari spun; versi 4.0.02 terverifikasi)
const VERSION_CODE = 50020125;
const VERSION_NAME = "4.0.02.0828.03";

export const USER_AGENT =
  `com.community.oneroom/${VERSION_CODE} ` +
  `(Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)`;

import { randomBytes, randomUUID } from "node:crypto";

export function makeClientInfo() {
  const deviceId = [...randomBytes(16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const gaid = randomUUID();
  return JSON.stringify({
    package_name: "com.community.oneroom",
    version_name: VERSION_NAME,
    version_code: VERSION_CODE,
    os: "android",
    os_version: "13",
    install_ch: "ps",
    device_id: deviceId,
    install_store: "ps",
    gaid,
    brand: "Redmi",
    model: "23078RKD5C",
    system_language: "en",
    net: "NETWORK_WIFI",
    region: "US",
    timezone: "America/New_York",
    sp_code: "40401",
    "X-Play-Mode": "2",
  });
}

// kode bahasa subtitle — 'id'/'in_id' = Indonesian (first-class di API)
export const LANGUAGE_NAMES = {
  en: "English", fr: "Français", ar: "Arabic", zh: "Chinese",
  ru: "Russian", pt: "Português", es: "Spanish", de: "German",
  ja: "Japanese", ko: "Korean", it: "Italian", sw: "Kiswahili",
  ha: "Hausa", ms: "Malay", bn: "Bengali", ur: "Urdu",
  pa: "Punjabi", fil: "Filipino", id: "Indonesian", in_id: "Indonesian",
};
