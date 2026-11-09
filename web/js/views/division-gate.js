// PIN gate divisi: tampil saat membuka halaman divisi tanpa sesi yang berlaku.
// Setelah PIN benar, halaman tujuan dirender ulang (kembali ke rute yang diminta).

import { h, icon } from '../utils.js';
import { rpc, errorMessage, MESSAGES } from '../api.js';
import { setSession, getRememberedName, rememberName, getSession, clearSession } from '../session.js';
import { createPinPad } from '../ui/pin-pad.js';
import { contactLinks } from '../ui/components.js';
import { refresh } from '../router.js';

export async function divisionGateView(main, ctx) {
  const { division, contacts } = ctx;
  const nameInput = h('input', {
    class: 'wm-input', id: 'actor-name', type: 'text', maxlength: 100, autocomplete: 'name',
    placeholder: 'Contoh: Rina', value: getRememberedName(),
  });

  const existing = getSession();
  const otherNote = existing && existing.role === 'division' && existing.division?.code !== division.code
    ? h('p', { class: 'xsmall muted' }, `Anda sedang masuk sebagai ${existing.division.name}. Memasukkan PIN di sini akan mengganti sesi tersebut.`)
    : null;

  const pad = createPinPad({
    length: 6,
    label: `PIN ${division.name}`,
    onSubmit: async (pin) => {
      try {
        const res = await rpc('rpc_login', { p_division_code: division.code, p_pin: pin, p_actor_name: nameInput.value.trim() || null }, { auth: false });
        if (!res || !res.ok) {
          return { ok: false, message: MESSAGES[res?.error] || MESSAGES.PIN_WRONG };
        }
        if (existing) clearSession();
        rememberName(nameInput.value.trim());
        setSession(res);
        refresh();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: errorMessage(e) };
      }
    },
  });

  main.append(
    h('div', { class: 'brand-head' },
      h('img', { src: 'assets/logo-navy.png', alt: 'WM Center', width: 962, height: 646, class: 'logo-auto' })),
    h('div', { class: 'wm-login-card pin-card' },
      h('h1', { class: 'pin-title' }, `Masukkan PIN ${division.name}`),
      h('p', { class: 'pin-sub' }, 'PIN 6 digit dari Finance. Jangan bagikan PIN ke divisi lain.'),
      h('div', { class: 'wm-field' },
        h('label', { class: 'wm-label', for: 'actor-name' }, 'Nama Anda (opsional)'),
        nameInput,
        h('p', { class: 'wm-hint' }, 'Dicatat di riwayat perubahan agar Finance tahu siapa yang mengisi.')),
      otherNote,
      pad.el,
      h('div', { class: 'pin-help' },
        h('b', null, 'Lupa PIN? '), 'Hubungi Finance: ', contactLinks(contacts), '.')),
    h('p', { class: 'home-finance-link' }, h('a', { href: '#/' }, icon('arrow-left', 'ic-sm'), ' Pilih divisi lain')),
  );
  pad.focus();
}
