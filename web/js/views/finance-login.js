// Login Finance dengan master PIN 8 digit (A-14).

import { h, icon } from '../utils.js';
import { rpc, errorMessage, MESSAGES } from '../api.js';
import { setSession, getRememberedName, rememberName, clearSession, getSession } from '../session.js';
import { createPinPad } from '../ui/pin-pad.js';
import { navigate } from '../router.js';

export async function financeLoginView(main, ctx) {
  const nameInput = h('input', {
    class: 'wm-input', id: 'fin-name', type: 'text', maxlength: 100, autocomplete: 'name',
    placeholder: 'Contoh: Dewi (Finance)', value: getRememberedName(),
  });
  const pad = createPinPad({
    length: 8,
    label: 'Master PIN Finance',
    onSubmit: async (pin) => {
      try {
        const res = await rpc('rpc_login_finance', { p_pin: pin, p_actor_name: nameInput.value.trim() || null }, { auth: false });
        if (!res || !res.ok) return { ok: false, message: MESSAGES[res?.error] || MESSAGES.PIN_WRONG };
        if (getSession()) clearSession();
        rememberName(nameInput.value.trim());
        setSession(res);
        const target = ctx.returnTo && ctx.returnTo.startsWith('/finance/') ? ctx.returnTo : '/finance/overview';
        navigate(target, { replace: true });
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
      h('h1', { class: 'pin-title' }, 'Masuk Finance'),
      h('p', { class: 'pin-sub' }, 'Masukkan master PIN Finance (8 digit).'),
      h('div', { class: 'wm-field' },
        h('label', { class: 'wm-label', for: 'fin-name' }, 'Nama Anda (opsional)'),
        nameInput,
        h('p', { class: 'wm-hint' }, 'Dicatat di log untuk setiap tindakan Finance.')),
      pad.el),
    h('p', { class: 'home-finance-link' }, h('a', { href: '#/' }, icon('arrow-left', 'ic-sm'), ' Kembali ke pilih divisi')),
  );
  pad.focus();
}
