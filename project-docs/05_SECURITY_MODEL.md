# 05 - SECURITY MODEL (tanpa login akun)

Target: cukup aman untuk data anggaran internal, tanpa Supabase Auth. Jujur soal batas: lihat `02_THE_REALITY_AUDIT.md`.

## 1. Prinsip
1. **Default tolak.** Browser tidak boleh punya akses langsung ke tabel.
2. **Semua lewat RPC** (`SECURITY DEFINER`) yang memeriksa token di setiap panggilan.
3. **Kebenaran di server**: validasi, total, tanggal, kepemilikan divisi, dan log dilakukan di database.
4. **Tidak ada rahasia di repo/ frontend** kecuali URL dan anon key (publik by design).
5. **Log semuanya** yang mengubah data atau PIN.

## 2. Model ancaman (ringkas)
| Ancaman | Dampak | Kontrol |
|---|---|---|
| Orang membaca/ mengubah tabel lewat REST dengan anon key | Kebocoran/ kerusakan total | RLS aktif + tanpa policy + REVOKE; tes S-01..S-04 |
| Menebak PIN | Akses data satu divisi | PIN 6 digit+; lockout 5 gagal / 10 menit; log |
| PIN dibagikan/ bocor | Akses tak sah | Rotasi PIN oleh Finance; nama pengisi di log |
| Divisi A membaca divisi B | Kebocoran antar divisi | Token membawa `division_id`; setiap fungsi memeriksa kepemilikan; tes S-06 |
| Token dicuri | Penyalahgunaan sesi | Token acak 32 byte, berlaku 8 jam, hanya hash di DB, disimpan di `sessionStorage`, logout menghapus |
| SQL injection | Eksekusi tak sah | Hanya parameter bertipe; tanpa SQL dinamis dari input; tes S-09 |
| XSS lewat nama program/ uraian | Pencurian token | Selalu `textContent`/ escape; tanpa `innerHTML` untuk data user; CSP meta; tes S-10 |
| CSV/ Excel formula injection | Eksekusi formula di Excel Finance | Awali sel `= + - @` dengan `'`; tes S-11 |
| `service_role` bocor | Bypass RLS | Tidak dipakai/ tidak di repo; rotasi bila bocor |
| DoS lockout | Divisi tak bisa masuk | Kunci singkat; Finance bisa membuka kunci |
| Hapus massal oleh pemegang PIN | Data hilang | Snapshot log + backup mingguan |

## 3. PIN dan sesi

### 3.1 Kebijakan PIN
- PIN divisi: minimal 6 karakter (disarankan 6 digit acak) dibuat Finance; tidak dikirim bersama link.
- Master PIN Finance: minimal 10 karakter (kata sandi panjang).
- Disimpan hanya sebagai hash bcrypt: `crypt(pin, gen_salt('bf', 10))`. Verifikasi: `pin_hash = crypt(input, pin_hash)`.
- Finance tidak bisa "melihat" PIN lama; hanya mengganti/ mereset. PIN baru ditampilkan satu kali di layar saat dibuat.
- Master PIN juga dapat membuka area divisi mana pun (untuk dukungan), tercatat di log sebagai role finance.

### 3.2 Login dan lockout
- `rpc_login(code, pin, actor_name)`: cek lockout dulu -> bandingkan hash -> catat percobaan di `login_attempts` -> bila sukses buat token.
- Lockout: >= 5 percobaan gagal dalam 10 menit pada scope yang sama -> tolak dengan `LOCKED` selama 10 menit. Master PIN: 5 gagal / 15 menit -> terkunci 15 menit.
- Respons waktu dibuat seragam semampunya; pesan gagal generik ("PIN salah").
- Pembukaan kunci oleh Finance: `rpc_f_unlock_division` (menghapus percobaan gagal terbaru) dan tercatat.

### 3.3 Token sesi
- Dibuat: `encode(gen_random_bytes(32), 'hex')`. Dikirim sekali ke browser. DB menyimpan `encode(digest(token,'sha256'),'hex')`.
- Berlaku 8 jam (`expires_at`); `last_seen_at` diperbarui; kedaluwarsa -> `AUTH_EXPIRED`.
- Setiap RPC: ambil sesi dari hash token -> pastikan belum kedaluwarsa -> pastikan role/ divisi sesuai -> baru kerjakan.
- Logout menghapus baris sesi. Ganti PIN divisi menghapus semua sesi divisi itu.

## 4. Pedoman menulis fungsi RPC (checklist wajib)
- [ ] `security definer` dan `set search_path = public, extensions` (tanpa schema lain).
- [ ] Fungsi pertama yang dipanggil: `_require_session(p_token, role_wajib)` yang mengembalikan `division_id`/ role atau melempar error.
- [ ] Tidak ada query yang menerima `division_id` dari klien untuk role divisi; gunakan `division_id` dari sesi.
- [ ] Semua parameter bertipe; tidak ada `execute format(...)` dengan input user.
- [ ] Validasi panjang, rentang, dan tipe di server; abaikan total dari klien.
- [ ] Tulis `audit_log` untuk create/ update/ submit/ delete dalam transaksi yang sama.
- [ ] `revoke execute on function ... from public;` lalu `grant execute ... to anon;` hanya untuk fungsi RPC yang memang dipanggil browser. Fungsi pembantu internal (`_require_session`, dst.) TIDAK diberi grant ke `anon`.
- [ ] Pesan error memakai kode standar; tidak membocorkan detail internal.

## 5. Keamanan frontend
- Hanya `SUPABASE_URL` dan anon/publishable key di `web/config.js`.
- Data user ditampilkan via `textContent`; bila harus membuat HTML, lewat fungsi `escapeHTML`.
- Tambahkan `<meta http-equiv="Content-Security-Policy">` yang membatasi sumber skrip ke domain sendiri + CDN yang dipakai + domain Supabase. Patok versi library CDN (dan SRI bila memungkinkan).
- Token hanya di `sessionStorage` (hilang saat tab ditutup). Jangan simpan PIN.
- Draft autosave di `localStorage` hanya berisi data form, tanpa token/ PIN; dibersihkan saat logout.
- Export: sanitasi sel diawali `= + - @`.

## 6. Konfigurasi Supabase yang wajib
- Region terdekat (Singapore).
- Password database kuat, disimpan di password manager (bukan di repo).
- Matikan fitur yang tidak dipakai (Auth sign-up publik, Realtime untuk tabel, Storage) bila tersedia.
- Batasi "Exposed schemas" pada API ke `public` saja.
- Jangan pernah menyalin `service_role`/ secret key ke file apa pun di repo.

## 7. Respons insiden
| Kejadian | Tindakan |
|---|---|
| PIN divisi bocor/ orang keluar | Finance reset PIN di halaman admin (sesi lama otomatis dicabut) |
| Master PIN bocor | Ganti master PIN (via admin atau SQL), periksa log 7 hari, reset semua PIN divisi bila perlu |
| `service_role`/ secret key ter-commit | Rotasi key di dashboard Supabase, bersihkan riwayat git, periksa log akses |
| Data terhapus tidak sengaja | Cari snapshot di `audit_log`, pulihkan manual via SQL (atau fitur restore P2), atau pakai backup |
| Dugaan RLS tidak aktif | Jalankan tes S-01..S-04 segera; bila gagal, matikan akses (revoke) dan perbaiki |
| Project tertidur | Aktifkan kembali dari dashboard; periksa keepalive |

## 8. Log yang wajib ada
Aksi: `create`, `update`, `submit`, `delete` (program), `pin_reset`, `master_pin_change`, `category_change`, `lockout`, `unlock`, `export`. Setiap entri: waktu, role, divisi, nama pengisi (bila ada), entitas, snapshot lama/ baru, alasan (wajib untuk hapus oleh finance).
