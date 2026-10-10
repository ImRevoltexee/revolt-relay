# revolt-relay

Backend MovieBox untuk **REVOLT-STREAM** — jalan di [Alwaysdata](https://www.alwaysdata.com) (gratis, tanpa kartu kredit, tidak tidur).

Kenapa ada relay ini: API Android MovieBox memblokir IP egress Cloudflare & Vercel. Relay ini jalan di IP non-Cloudflare/non-Vercel dan meneruskan request yang sudah di-sign.

## Deploy ke Alwaysdata (dari browser HP, ~10 menit)

1. Daftar di https://www.alwaysdata.com/en/register/ → pilih **Free plan**.
   Catat nama akunmu — URL public: `https://<nama-akun>.alwaysdata.net`
2. Login ke https://admin.alwaysdata.com → **Web → Sites → Add a site**:
   - **Addresses**: `<nama-akun>.alwaysdata.net`
   - **Type**: Node.js
   - **Command**: `node server.js`
   - **Working directory**: `www/revolt-relay`
   - **Node.js version**: 20.x (atau default)
3. Upload file: di admin panel buka **Files** (file manager) → masuk ke
   `www/revolt-relay` → upload `server.js`, `package.json`, dan folder `lib/`
   (atau upload `revolt-relay.zip` lalu extract di sana).
4. **Environment** (di pengaturan site) → tambah:
   `RELAY_SECRET=<string-acak-panjang-bikinanmu>`
5. Test: buka `https://<nama-akun>.alwaysdata.net/health` → harusnya
   `{"ok":true,"service":"revolt-relay",...}`

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
- Jangan commit `.env` / secret ke repo.
