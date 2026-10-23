/*
  Isi dua nilai ini dari Supabase: Project Settings > API.
  Anon key memang boleh ada di sisi browser; keamanan data dijaga oleh Row Level Security (supabase/schema.sql).
  Jika dibiarkan kosong, aplikasi berjalan dalam mode demo lokal tanpa login sungguhan.
*/
window.ECOFINANCE_CONFIG = {
  SUPABASE_URL: 'https://occtmnbchlijdhcnyxik.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'sb_publishable_lP-x0AcA8AQRMtFUmnlQiQ_JqOk6iok'
};
