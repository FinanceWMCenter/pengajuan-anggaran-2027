// Konfigurasi koneksi ke Supabase.
// HANYA dua nilai ini yang boleh ada di sini. Keduanya memang publik (aman terlihat orang).
// JANGAN pernah menaruh kunci rahasia (secret key / kunci "service role"), password database, atau PIN di file ini.
// (Workflow deploy otomatis menolak publikasi bila menemukan pola kunci rahasia di folder web/.)
//
// Cara mengisi: Supabase -> Project Settings -> API (Data API)
//   SUPABASE_URL      = "Project URL", contoh: https://abcdefghijkl.supabase.co
//   SUPABASE_ANON_KEY = "anon public" key (diawali eyJ...) atau "publishable" key (diawali sb_publishable_...)

export const SUPABASE_URL = 'https://ncglmqyxyyhcekxjpueb.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_8x_w93gzTNOrmSE32M578A_dFhPX56z';
