# 01 - BLUEPRINT: Portal Pengajuan Anggaran 2027

Dokumen ini menjelaskan **bagaimana** sistem dibangun. Apa yang dibangun ada di `03_PRD.md`. Struktur data di `04_ERD.md`. Keamanan di `05_SECURITY_MODEL.md`.

## 1. Ringkasan
- Aplikasi web statis, tanpa login akun, akses dengan PIN per divisi + master PIN Finance.
- Data di PostgreSQL (Supabase free). Frontend di GitHub Pages.
- Browser tidak pernah menyentuh tabel; hanya memanggil fungsi RPC yang memeriksa token sesi.
- 12 divisi (7 grup), tiap divisi hanya melihat datanya sendiri; Finance melihat semuanya.
- Unit data: **program** (1 program = 1 bulan = 1 anggaran) berisi banyak **baris kebutuhan**.

## 2. Arsitektur

```
 Browser (HP/PC user)
   |  HTML/CSS/JS statis  <-- GitHub Pages (deploy dari folder web/ via GitHub Actions)
   |
   |  HTTPS: supabase-js -> rpc('nama_fungsi', {...})   (memakai anon key publik)
   v
 Supabase (PostgREST) --> Fungsi SECURITY DEFINER (cek token sesi, validasi, hitung total, tulis log)
   v
 PostgreSQL: tabel (RLS aktif, anon tidak punya akses langsung)

 GitHub Actions (jadwal): panggil rpc_ping tiap ~3 hari agar project tidak tidur
 Komputer Finance: Postgres lokal + psql/pg_dump untuk uji SQL dan backup berkala
```

Alasan desain:
- Postgres lokal tidak dipakai sebagai server produksi karena PC harus menyala 24 jam dan dibuka ke internet (rapuh dan berisiko). Supabase = Postgres asli, jadi SQL yang diuji di lokal berjalan sama.
- Tanpa framework dan tanpa build step supaya mudah dirawat oleh non-programmer dan bisa dideploy langsung.

## 3. Struktur repo

```
/
  project-docs/            # dokumen proyek ini (TIDAK dipublikasikan)
    00_PROMPT_FINAL.md ... 11_UI_UX_HANDOFF.md, PROGRESS.md
  db/                      # skrip SQL berurutan
    01_schema.sql
    02_seed_master.sql
    03_functions.sql
    04_security.sql
    05_overview.sql
    06_bootstrap.sql       # set master PIN + PIN awal (JANGAN berisi PIN asli di repo)
    99_test_seed.sql       # data palsu untuk uji
  web/                     # satu-satunya folder yang dipublikasikan
    index.html
    config.js              # SUPABASE_URL dan SUPABASE_ANON_KEY saja
    css/
      tokens.css           # CSS variables (warna, font, spacing) -> diganti saat template UI datang
      base.css
      components.css
    js/
      app.js               # bootstrap + router
      api.js               # pembungkus pemanggilan rpc + pemetaan error
      session.js           # token di sessionStorage, expiry, logout
      store.js             # cache master data
      utils.js             # format Rupiah, tanggal, escapeHTML, debounce
      views/
        home.js
        pin-gate.js
        division-summary.js
        program-form.js
        program-detail.js
        overview-division.js
        finance-login.js
        finance-overview.js
        finance-divisions.js
        finance-master.js
        finance-log.js
        finance-export.js
      components/
        toast.js, dialog.js, table-items.js, money-input.js, badge.js
  .github/workflows/
    deploy-pages.yml       # publish web/ ke GitHub Pages
    keepalive.yml          # ping database terjadwal
  tests/
    sql/                   # tes keamanan & rekonsiliasi (dijalankan manual dengan psql)
  .gitignore
  README.md
```

`.gitignore` minimal: `.env*`, `*.dump`, `*.bak`, `backup*/`, `node_modules/`, `.DS_Store`.

## 4. Halaman dan rute (hash routing)

| Rute | Halaman | Akses |
|---|---|---|
| `#/` | Home: pilih divisi (dikelompokkan per grup) | publik |
| `#/d/:code` | Ringkasan Program divisi (tabel + kartu) | PIN divisi |
| `#/d/:code/overview` | Overview divisi | PIN divisi |
| `#/d/:code/new` | Form program baru | PIN divisi |
| `#/d/:code/p/:id` | Detail program | PIN divisi |
| `#/d/:code/p/:id/edit` | Edit program | PIN divisi |
| `#/finance` | Login master PIN Finance | publik (form PIN) |
| `#/finance/overview` | Overview semua divisi | master PIN |
| `#/finance/programs` | Semua program (filter, hapus dengan alasan) | master PIN |
| `#/finance/divisions` | Kelola PIN & status divisi | master PIN |
| `#/finance/master` | Kelola kategori (tambah/ nonaktif) | master PIN |
| `#/finance/log` | Log riwayat | master PIN |
| `#/finance/export` | Export Excel/CSV | master PIN |

Jika membuka rute yang butuh PIN tanpa sesi valid, tampilkan PIN gate lalu kembali ke rute tujuan.

## 5. Alur data utama

1. Home memanggil `rpc_list_divisions()` (hanya nama/ kode/ grup; **tanpa angka**).
2. User memilih divisi, memasukkan PIN -> `rpc_login(code, pin, actor_name)` -> server mengembalikan `token` (acak 32 byte, berlaku 8 jam; di DB hanya hash SHA-256 yang disimpan). Token disimpan di `sessionStorage`.
3. Setiap panggilan berikutnya menyertakan `p_token`. Fungsi memverifikasi token, role, dan kepemilikan divisi pada **setiap** panggilan.
4. Simpan program: browser mengirim satu payload JSON (header + semua baris) ke `rpc_save_program`. Server memvalidasi, mengganti baris item secara atomik (satu transaksi), menghitung total, mengisi tanggal pengajuan bila submit, dan menulis log.
5. Overview: fungsi agregat mengembalikan JSON (kartu + tabel). Browser hanya menampilkan.

## 6. Daftar RPC (kontrak)

Semua fungsi `SECURITY DEFINER`, `set search_path = public, extensions`, `EXECUTE` hanya untuk `anon` pada fungsi di bawah.

Publik (tanpa token):
- `rpc_ping()` -> `{ok:true, time}`
- `rpc_list_divisions()` -> grup + divisi aktif
- `rpc_get_master()` -> kategori program aktif, kategori item aktif, tahun anggaran, kontak Finance
- `rpc_login(p_division_code, p_pin, p_actor_name)` -> `{token, role, division, expires_at}`
- `rpc_login_finance(p_pin, p_actor_name)` -> `{token, role, expires_at}`

Butuh token divisi (atau finance dengan parameter divisi):
- `rpc_logout(p_token)`
- `rpc_list_programs(p_token, p_filters jsonb)` -> daftar + total per program
- `rpc_get_program(p_token, p_id)` -> header + items
- `rpc_check_similar(p_token, p_nama, p_bulan, p_exclude_id)` -> program mirip (trigram + bulan sama)
- `rpc_save_program(p_token, p_payload jsonb)` -> program tersimpan
  - payload: `{id|null, nama_program, program_category_id, periode_bulan, pic_nama, items:[{uraian,item_category_id,qty,satuan,harga_satuan,catatan}], submit:boolean, expected_updated_at}`
- `rpc_delete_program(p_token, p_id, p_reason)` (alasan wajib bila role finance)
- `rpc_overview_division(p_token)`

Khusus finance:
- `rpc_f_overview(p_token)`
- `rpc_f_list_programs(p_token, p_filters)`
- `rpc_f_list_divisions(p_token)` (status PIN, jumlah program, terkunci/ tidak)
- `rpc_f_set_division_pin(p_token, p_division_id, p_new_pin)`
- `rpc_f_set_master_pin(p_token, p_old_pin, p_new_pin)`
- `rpc_f_unlock_division(p_token, p_division_id)`
- `rpc_f_upsert_category(p_token, p_kind, p_id, p_name, p_is_active)` (kind: `program` | `item`; hanya tambah/ nonaktifkan, tidak hapus)
- `rpc_f_audit_log(p_token, p_filters)`
- `rpc_f_export(p_token, p_filters)` -> baris datar program+item
- P2: `rpc_f_comment(...)`, `rpc_f_restore_from_log(...)`

Kode error standar (dilempar sebagai pesan exception, di-map di `api.js`):
`AUTH_REQUIRED`, `AUTH_EXPIRED`, `FORBIDDEN`, `LOCKED`, `PIN_WRONG`, `VALIDATION:<field>:<pesan>`, `CONFLICT`, `NOT_FOUND`, `RATE_LIMITED`.

## 7. Strategi fitur penting
- **Autosave**: tiap perubahan form disalin ke `localStorage` (kunci: divisi + id/ "new"), debounce 800 ms. Dibersihkan saat submit berhasil, logout, atau user membuang draft. Draft lokal bukan pengganti "Simpan Draft" ke database.
- **Draft di DB**: dapat disimpan bila header lengkap; baris boleh belum lengkap. Submit memvalidasi penuh.
- **Konflik edit** (dua orang satu PIN): optimistic locking dengan `updated_at`; bila beda -> `CONFLICT`, tampilkan dialog "Data sudah diubah orang lain, muat ulang".
- **Alert duplikat**: `rpc_check_similar` dipanggil saat nama program di-blur dan saat Duplikat. Hanya peringatan, user boleh melanjutkan.
- **Alert kategori tidak ada**: teks di bawah dropdown + tautan WhatsApp dan email Finance.
- **Format Rupiah**: input tampil `1.250.000`, nilai kirim integer. Qty maksimal 2 desimal.
- **Export**: dibuat di browser (SheetJS) dari `rpc_f_export`; sel diawali `'` bila diawali `= + - @` (anti formula injection).
- **Zona waktu**: semua tanggal bisnis memakai Asia/Jakarta di server.

## 8. Penanganan error di frontend
- Satu fungsi `callRpc(name, args)` di `api.js`: menambahkan token, menangkap error jaringan/ server, memetakan kode ke pesan Indonesia, dan otomatis mengarahkan ke PIN gate bila `AUTH_EXPIRED`.
- Pesan harus ramah dan memberi langkah ("Koneksi bermasalah, coba lagi", "Sesi berakhir, masukkan PIN lagi").
- Jangan pernah menampilkan pesan SQL mentah ke user.

## 9. Deployment
- `deploy-pages.yml`: pada push ke `main`, unggah folder `web/` sebagai artifact Pages.
- `keepalive.yml`: cron tiap 3 hari + `workflow_dispatch`; memanggil `rpc_ping` lewat curl. Catatan: workflow terjadwal di repo publik bisa dinonaktifkan GitHub bila repo tidak ada aktivitas lama; periksa berkala.
- Dua project Supabase: **DEV** (uji) dan **PROD** (data asli). `config.js` untuk PROD hanya diubah saat go-live.

## 10. Konvensi
- Penamaan SQL: `snake_case`; fungsi RPC berawalan `rpc_`; fungsi finance `rpc_f_`.
- Satu migrasi = satu file bernomor; jangan edit file lama yang sudah dijalankan di PROD, buat file baru.
- Pesan commit: `fase-N: ringkasan` (contoh `fase-2: skema dan fungsi database`).
- Komentar kode ringkas; dokumentasikan alasan, bukan yang jelas.

## 11. Milestone indikatif (bukan janji waktu)
Fase 0-3 (fondasi + keamanan) -> Fase 4-7 (alur isi program) -> Fase 8 (overview + admin) -> Fase 9-11 (poles, uji, go-live) -> Fase 12 (UI template). Prioritaskan agar **alur isi program** bisa dipakai pilot sedini mungkin.
