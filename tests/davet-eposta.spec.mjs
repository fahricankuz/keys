// Kiracı davet e-postası: şablon (kod, hazır doldurulmuş kayıt bağlantısı, kaçış, dil) ve sunucu hakkı (invite_mail_claim).
import { test, expect } from '@playwright/test';
import { renderInvite, signupUrl } from '../supabase/functions/invite-mail/template.ts';
import { newDb, ID } from './db-helpers.mjs';

const app = 'https://anahtar.io';

test('şablon: kod, mülk ve davet eden; düğme kod, ad ve e-postası dolu kayıt sayfasına gider', () => {
  const m = renderInvite({ code: 'AB12CD34', name: 'Mehmet Kiracı', email: 'mehmet@ornek.com', owner: 'Ayşe Mülk', property: 'Moda Dairesi', appUrl: app, expires: '2026-12-01T09:00:00Z' });
  expect(m.subject).toBe('Ayşe Mülk seni Moda Dairesi için anahtar’a davet etti');
  expect(m.html).toContain('Merhaba Mehmet,');
  expect(m.html).toContain('AB12CD34');
  expect(m.html).toContain('<b>Moda Dairesi</b>');
  expect(m.html).toContain('href="https://anahtar.io/kayit/kiraci?kod=AB12CD34&amp;ad=Mehmet+Kirac%C4%B1&amp;e=mehmet%40ornek.com"');
  expect(m.html).toContain('Kod 1 Aralık 2026 tarihine kadar geçerli.');
  expect(m.text).toContain('Davet kodun: AB12CD34');
  expect(m.text).toContain('Hesabımı oluştur: https://anahtar.io/kayit/kiraci?kod=AB12CD34');
  expect(signupUrl({ appUrl: app + '/', code: 'X1' })).toBe('https://anahtar.io/kayit/kiraci?kod=X1');
});

test('şablon: HTML kaçışı ve İngilizce sürüm', () => {
  const m = renderInvite({ code: 'AB12CD34', name: '<b>x</b>', owner: '<script>alert(1)</script>', property: 'A & B', lang: 'en', appUrl: app });
  expect(m.html).not.toContain('<script>');
  expect(m.html).not.toContain('<b>x</b>');
  expect(m.html).toContain('A &amp; B');
  expect(m.subject).toContain('invited you to anahtar');
  expect(m.html).toContain('lang="en"');
  expect(m.html).toContain('Create my account');
});

test.describe('sunucu hakkı', () => {
  let db, as, q;
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    ({ db, as, q } = await newDb());
    await as(ID.L);
    await q(`insert into public.invites (code, property_id, name, email, created_by) values ('MAIL0001', 'p1', 'Mehmet', 'mehmet@ornek.com', $1)`, [ID.L]);
    await q(`insert into public.invites (code, property_id, name, email, created_by) values ('MAIL0002', 'p1', 'Eposta yok', '', $1)`, [ID.L]);
  });
  const claim = async (uid, code) => { await as(null); return (await q(`select public.invite_mail_claim($1, $2) r`, [uid, code]))[0].r; };

  test('davet edenin daveti için bilgi döner; ikinci istek 2 dakika içinde kısıtlanır', async () => {
    const r = await claim(ID.L, 'mail0001');
    expect(r).toMatchObject({ code: 'MAIL0001', email: 'mehmet@ornek.com', name: 'Mehmet', property: expect.any(String) });
    expect(await claim(ID.L, 'MAIL0001')).toEqual({ throttled: true });
  });
  test('başkasının, e-postasız ya da olmayan davet için bir şey dönmez', async () => {
    expect(await claim(ID.T, 'MAIL0001')).toBeNull();
    expect(await claim(ID.L, 'MAIL0002')).toBeNull();
    expect(await claim(ID.L, 'YOKYOK')).toBeNull();
  });
  test('kullanılmış davet e-postalanmaz; fonksiyon istemciye kapalı', async () => {
    await as(null);
    await q(`update public.invites set accepted_by = $1, mailed_at = null where code = 'MAIL0001'`, [ID.T]);
    expect(await claim(ID.L, 'MAIL0001')).toBeNull();
    await as(ID.L);
    await expect(db.query(`select public.invite_mail_claim('${ID.L}', 'MAIL0001')`)).rejects.toThrow(/permission denied/);
  });
});
