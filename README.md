# revolt-relay

Backend MovieBox untuk **REVOLT-STREAM** — jalan di [Glitch](https://glitch.com) (gratis, tanpa kartu kredit).

Kenapa ada relay ini: API Android MovieBox memblokir IP egress Cloudflare & Vercel. Relay ini jalan di IP non-Cloudflare/non-Vercel dan meneruskan request yang sudah di-sign.

## Deploy ke Glitch (5 menit, dari browser HP)

1. https://glitch.com → Sign in (pakai GitHub)
2. **New Project → Import from GitHub** → paste `ImRevoltexee/revolt-relay`
3. Buka file `.env` di Glitch → tambah: `RELAY_SECRET=string-acak-panjang-bikinanmu`
4. Glitch auto-restart. Test: `https://<nama-project>.glitch.me/health` → `{"ok":true,...}`

## API (butuh header `x-relay-secret`)

| Endpoint | Deskripsi |
|---|---|
| `GET /health` | Cek hidup (tanpa auth) |
| `POST /api/search` `{keyword,page,perPage}` | Cari film/serial |
| `GET /api/info/:subjectId` | Detail judul |
| `GET /api/season/:subjectId` | Daftar season & episode |
| `GET /api/stream/:subjectId?se=1&ep=1` | Stream multi-kualitas + captions (Indonesia `in_id` bila ada) |
| `GET /api/home` | Feed homepage |

## Catatan

- API MovieBox unofficial (reverse-engineered) — bisa mati kapan saja kalau mereka ubah signing.
- Glitch free tier tidur setelah 5 menit idle (cold start beberapa detik) — player sudah handle loading state.
