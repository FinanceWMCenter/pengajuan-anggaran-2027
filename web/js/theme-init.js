// Dipasang sebelum halaman digambar agar tidak berkedip: pilihan menu samping (sembunyi/tampil) dan tema manual.
try {
  if (localStorage.getItem('wm-sidebar') === 'collapsed') document.documentElement.dataset.sidebar = 'collapsed';
  var theme = localStorage.getItem('wm-theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch (e) { /* localStorage tidak tersedia: abaikan */ }
