# Portal Pengajuan Anggaran 2027 · WM Center

Portal web untuk mengumpulkan pengajuan anggaran 2027 dari 12 divisi WM Center. Tiap divisi masuk dengan PIN, mengisi program per bulan beserta daftar kebutuhannya, dan Finance melihat Overview, mengelola PIN dan kategori, serta mengekspor data.

- **Frontend:** HTML + CSS + JavaScript murni (tanpa build), folder `web/`, dipublikasikan ke GitHub Pages.
- **Database:** Supabase (PostgreSQL). Browser hanya memanggil fungsi `rpc_*`; semua tabel terkunci (RLS + hak akses dicabut).
- **Tampilan:** design kit WM Center (sama dengan sistem Aset WM Center), termasuk mode gelap.
- **Biaya:** Rp0 (Supabase Free + GitHub publik).

## Struktur

```
project-docs/   dokumen proyek (PRD, ERD, keamanan, keputusan, progres) - mulai dari 10_DECISIONS_LOG.md dan PROGRESS.md
db/             skrip SQL, jalankan berurutan 01 -> 06 (99 = data uji, hanya DEV; 98 = hapus data uji)
web/            aplikasi web (satu-satunya folder yang dipublikasikan)
tests/          tes otomatis: sql/run_all.sql, run_db_tests.ps1, rest_security_check.ps1, js/utils.test.mjs
tools/serve.mjs server lokal kecil untuk mencoba web: node tools/serve.mjs
.github/        workflow deploy GitHub Pages + keepalive Supabase
```

## Panduan

Langkah lengkap untuk Finance (membuat Supabase, menjalankan SQL, mengisi `web/config.js`, deploy, keepalive, backup) ada di [project-docs/08_SETUP_GUIDE.md](project-docs/08_SETUP_GUIDE.md).

## Aturan penting

- Jangan pernah menaruh secret/service key, password database, atau PIN asli di file mana pun di repo.
- `web/config.js` hanya berisi Project URL dan anon/publishable key (keduanya memang publik).
- Setiap perubahan skema/fungsi database: jalankan ulang `db/04_security.sql`, lalu tes keamanan.
