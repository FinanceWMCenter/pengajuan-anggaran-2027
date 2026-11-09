// Cache data master (kategori, kontak, daftar divisi) supaya tidak diminta berulang.

import { rpc } from './api.js';

let masterPromise = null;
let divisionsPromise = null;

/** Kontak cadangan bila database belum bisa dihubungi (sesuai 09_MASTER_DATA.md). */
export const FALLBACK_CONTACTS = {
  email_1: 'finance.wmcenter@gmail.com',
  email_2: 'finance@wmcenter.id',
  wa: '+62 852-8454-5564',
  wa_link: 'https://wa.me/6285284545564',
};

export function getMaster({ refresh = false } = {}) {
  if (!masterPromise || refresh) {
    masterPromise = rpc('rpc_get_master', {}, { auth: false }).catch((e) => {
      masterPromise = null;
      throw e;
    });
  }
  return masterPromise;
}

export function getDivisions({ refresh = false } = {}) {
  if (!divisionsPromise || refresh) {
    divisionsPromise = rpc('rpc_list_divisions', {}, { auth: false }).catch((e) => {
      divisionsPromise = null;
      throw e;
    });
  }
  return divisionsPromise;
}

export async function getContacts() {
  try {
    const m = await getMaster();
    return { ...FALLBACK_CONTACTS, ...Object.fromEntries(Object.entries(m.contacts || {}).filter(([, v]) => v)) };
  } catch {
    return FALLBACK_CONTACTS;
  }
}

export async function getYear() {
  try {
    const m = await getMaster();
    return m.tahun_anggaran || '2027';
  } catch {
    return '2027';
  }
}

export async function findDivision(code) {
  const groups = await getDivisions();
  for (const g of groups) {
    const d = (g.divisions || []).find((x) => x.code === code);
    if (d) return { ...d, group_name: g.name };
  }
  return null;
}
