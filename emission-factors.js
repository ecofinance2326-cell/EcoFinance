/*
  Faktor emisi EcoFinance.  Satuan hasil: kg CO2e per satuan aktivitas.

  Hanya CO2 untuk bahan bakar (CH4 dan N2O kecil dan tidak dihitung).
  Setiap faktor punya status:
    "official"   = angka langsung dari dokumen lembaga berwenang
    "derived"    = diturunkan dari angka lembaga + asumsi yang tertulis di `basis`
    "manual"     = diisi sendiri oleh pengguna
    "unverified" = belum cocok dengan dokumen resmi; GANTI sebelum dipakai untuk pelaporan formal

  Untuk mengganti faktor, ubah angka `f`, `status`, `basis`, dan `ref` di bawah ini.
  Catatan yang sudah tersimpan di database memakai faktor saat dicatat (kolom `factor`),
  jadi mengubah file ini tidak mengubah laporan bulan-bulan lalu.
*/
window.EF_FACTORS = [
  {
    id: 'listrik', name: 'Listrik PLN', unit: 'kWh', f: 0.87, status: 'unverified',
    basis: 'Perkiraan umum untuk jaringan Jawa-Madura-Bali. Belum diverifikasi ke dokumen resmi.',
    ref: 'Ganti dengan faktor emisi sistem ketenagalistrikan terbaru dari Ditjen Ketenagalistrikan, Kementerian ESDM.'
  },
  {
    id: 'lpg', name: 'Gas LPG', unit: 'kg', f: 3.02, status: 'official',
    basis: '65,41 tCO2/TJ (faktor nasional) × NCV 46,12 TJ/Gg = 3,02 kg CO2 per kg.',
    ref: 'Kementerian ESDM, tabel faktor emisi BBM dan batubara: https://www.esdm.go.id/assets/media/content/content-faktor-emisi-bahan-bakar-minyak-bbm-dan-batubara.pdf'
  },
  {
    id: 'bensin', name: 'Bensin', unit: 'liter', f: 2.26, status: 'derived',
    basis: '69,04 tCO2/TJ (faktor nasional, RON 92) × NCV 44,3 TJ/Gg (default IPCC 2006) × massa jenis 0,74 kg/liter (asumsi) = 2,26 kg CO2 per liter.',
    ref: 'Kementerian ESDM, tabel faktor emisi BBM dan batubara; NCV dan massa jenis memakai nilai umum.'
  },
  {
    id: 'solar', name: 'Solar', unit: 'liter', f: 2.63, status: 'derived',
    basis: '72,93 tCO2/TJ (faktor nasional, solar CN 51) × NCV 43,0 TJ/Gg (default IPCC 2006) × massa jenis 0,84 kg/liter (asumsi) = 2,63 kg CO2 per liter.',
    ref: 'Kementerian ESDM, tabel faktor emisi BBM dan batubara; NCV dan massa jenis memakai nilai umum.'
  },
  {
    id: 'sampah', name: 'Sampah ke TPA', unit: 'kg', f: 0.58, status: 'unverified',
    basis: 'Perkiraan umum untuk sampah campuran yang ditimbun. Belum diverifikasi ke dokumen resmi.',
    ref: 'Ganti dengan faktor dari inventarisasi GRK sektor sampah (KLHK / SRN PPI) atau IPCC 2006 sesuai kondisi TPA.'
  },
  {
    id: 'lain', name: 'Lainnya (hitung sendiri)', unit: 'kg CO₂e', f: 1, status: 'manual',
    basis: 'Anda memasukkan langsung jumlah emisi dalam kg CO2e.',
    ref: ''
  }
];
window.EF_STATUS = {
  official: 'Resmi ESDM',
  derived: 'Turunan ESDM + asumsi',
  unverified: 'Perlu verifikasi',
  manual: 'Input sendiri'
};
