// Fonksiyon JWT düzeni: webhook/zamanlayıcıyla çağrılan fonksiyonlarda JWT doğrulaması kapalı (gizli başlıkla korunur),
// uygulamadan kullanıcı jetonuyla çağrılanlarda açık kalır.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const cfg = readFileSync(root + 'supabase/config.toml', 'utf8');
const fns = readdirSync(root + 'supabase/functions').filter((d) => existsSync(`${root}supabase/functions/${d}/index.ts`));
const noJwt = (n) => new RegExp(`\\[functions\\.${n}\\]\\s*\\nverify_jwt = false`).test(cfg);

test('webhook ve zamanlayıcı fonksiyonları JWT doğrulamasız, gizli başlıkla korunur', () => {
  for (const n of ['push', 'lead-mail', 'mail-send', 'report', 'tufe-sync', 'billing']) {
    expect(fns, n).toContain(n);
    expect(noJwt(n), `${n}: config.toml'da verify_jwt = false olmalı`).toBe(true);
    expect(readFileSync(`${root}supabase/functions/${n}/index.ts`, 'utf8'), `${n}: gizli başlık denetimi`).toMatch(/safeEqual|REVENUECAT_WEBHOOK_AUTH/);
  }
});

test('uygulamadan çağrılan fonksiyonlar (welcome, invite-mail, site-invite) jeton doğrulamalı kalır', () => {
  for (const n of ['welcome', 'invite-mail', 'site-invite']) {
    expect(fns).toContain(n);
    expect(noJwt(n), n).toBe(false);
  }
});
