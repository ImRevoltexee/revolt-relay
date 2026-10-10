# revolt-relay

Backend MovieBox untuk **REVOLT-STREAM** — jalan di [Replit](https://replit.com) (gratis, tanpa kartu kredit).

Kenapa ada relay ini: API Android MovieBox memblokir IP egress Cloudflare & Vercel. Relay ini jalan di IP lain dan meneruskan request yang sudah di-sign.

## Deploy ke Replit (dari browser HP, ~5 menit)

1. Buka https://replit.com → **Sign up** (pakai GitHub — tanpa kartu kredit)
2. **Create Repl → Import from GitHub** → paste:
   `https://github.com/ImRevoltexee/revolt-relay`
3. Klik tab **Secrets** (ikon gembok) → tambah:
   - Key: `RELAY_SECRET` — Value: string acak panjang bikinanmu
4. Klik **Run** (tombol hijau). Tunggu sampai console muncul
   `[relay] listening on :...`
5. Test: buka URL Repl-mu (`https://<nama-repl>.<username>.replit.dev/health`)
   → harusnya `{"ok":true,"service":"revolt-relay",...}`

Catatan: Replit free tidur saat idle — request pertama membangunkan
(agak lambat), request berikutnya normal. Player sudah handle loading state.

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
- Jangan commit secret ke repo.
