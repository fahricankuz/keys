// Ortak e-posta göndericisi (supabase/functions/_shared/mail.ts): SMTP (Hostinger) ve Resend yolları.
// Edge Function'daki `npm:nodemailer` Node'daki nodemailer'a eşlenerek derlenir; yerel sahte bir SMTP sunucusuna gerçekten gönderilir.
import { test, expect } from '@playwright/test';
import net from 'node:net';
import http from 'node:http';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { simpleParser } from 'mailparser';

const SRC = new URL('../supabase/functions/_shared/mail.ts', import.meta.url).pathname;
const { outputFiles } = await build({
  entryPoints: [SRC], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22', logLevel: 'error',
  plugins: [{ name: 'npm-alias', setup(b) { b.onResolve({ filter: /^npm:nodemailer/ }, () => ({ path: 'nodemailer', external: true })); } }]
});
const code = outputFiles[0].text.replace(/from "nodemailer"/, `from ${JSON.stringify(new URL('../node_modules/nodemailer/lib/nodemailer.js', import.meta.url).pathname)}`);
const tmp = `${tmpdir()}/anahtar-mail-test-${process.pid}.mjs`;
writeFileSync(tmp, code);
const mod = await import(pathToFileURL(tmp).href);

const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const setEnv = (o) => { for (const k of Object.keys(ENV)) delete ENV[k]; Object.assign(ENV, o); };

/** En küçük SMTP sunucusu: AUTH LOGIN/PLAIN kabul eder, iletileri toplar. */
function smtpServer({ rejectAuth = false } = {}) {
  const mails = []; const log = [];
  const srv = net.createServer((sock) => {
    let buf = '', data = null, auth = 0, from = '', to = [];
    const send = (s) => sock.write(s + '\r\n');
    send('220 test ESMTP');
    sock.on('data', (d) => {
      buf += d.toString('binary');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data !== null) {
          if (line === '.') { mails.push({ from, to, raw: Buffer.from(data.join('\r\n'), 'binary') }); data = null; send('250 queued'); }
          else data.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        log.push(line);
        if (auth === 1) { auth = 2; send('334 UGFzc3dvcmQ6'); continue; }
        if (auth === 2) { auth = 0; send(rejectAuth ? '535 5.7.8 kimlik doğrulama başarısız' : '235 ok'); continue; }
        const c = line.toUpperCase();
        if (c.startsWith('EHLO') || c.startsWith('HELO')) { sock.write('250-test\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n'); }
        else if (c.startsWith('AUTH LOGIN')) { auth = 1; send('334 VXNlcm5hbWU6'); }
        else if (c.startsWith('AUTH PLAIN')) { send(rejectAuth ? '535 5.7.8 kimlik doğrulama başarısız' : '235 ok'); }
        else if (c.startsWith('MAIL FROM')) { from = line.slice(10).replace(/[<>]/g, '').split(' ')[0]; send('250 ok'); }
        else if (c.startsWith('RCPT TO')) { to.push(line.slice(8).replace(/[<>]/g, '').split(' ')[0]); send('250 ok'); }
        else if (c === 'DATA') { data = []; send('354 go'); }
        else if (c === 'QUIT') { send('221 bye'); sock.end(); }
        else send('250 ok');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, mails, log, close: () => srv.close() })));
}

const BASE = { SMTP_HOST: '127.0.0.1', SMTP_USER: 'info@anahtar.io', SMTP_PASS: 'gizli-parola', SMTP_SECURE: '0', EMAIL_FROM: 'anahtar <info@anahtar.io>' };

test('SMTP: Türkçe konu ve HTML doğru gider; gönderen, alıcı ve yanıt adresi başlıkları ayarlanır; kimlik bilgisi doğrulanır', async () => {
  const s = await smtpServer();
  setEnv({ ...BASE, SMTP_PORT: String(s.port) });
  expect(mod.mailConfigured()).toBe(true);
  const r = await mod.sendMail({ to: 'musteri@ornek.com', subject: 'Kurumsal teklif talebini aldık', html: '<p>Merhaba <b>Çağrı</b>, şüphesiz teşekkürler. ₺99,99</p>', text: 'Merhaba Çağrı ₺99,99', replyTo: 'info@anahtar.io' });
  expect(r).toEqual({ ok: true });
  expect(s.mails).toHaveLength(1);
  expect(s.mails[0].from).toBe('info@anahtar.io');
  expect(s.mails[0].to).toEqual(['musteri@ornek.com']);
  const m = await simpleParser(s.mails[0].raw);
  expect(m.subject).toBe('Kurumsal teklif talebini aldık');
  expect(m.from.text).toContain('anahtar');
  expect(m.from.value[0].address).toBe('info@anahtar.io');
  expect(m.replyTo.value[0].address).toBe('info@anahtar.io');
  expect(m.html).toContain('<b>Çağrı</b>');
  expect(m.text).toContain('₺99,99');
  expect(s.log.some((l) => /^AUTH/i.test(l))).toBe(true);
  s.close();
});

test('SMTP: yanlış parola, geçersiz alıcı ve satır sonu enjeksiyonu güvenli işlenir', async () => {
  const bad = await smtpServer({ rejectAuth: true });
  setEnv({ ...BASE, SMTP_PORT: String(bad.port) });
  const r = await mod.sendMail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>', text: 'x' });
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/535|kimlik|Invalid login|auth/i);
  bad.close();

  const s = await smtpServer();
  setEnv({ ...BASE, SMTP_PORT: String(s.port) });
  expect((await mod.sendMail({ to: 'yanlis-adres', subject: 'x', html: '', text: '' })).ok).toBe(false);
  expect(s.mails).toHaveLength(0);
  const r2 = await mod.sendMail({ to: 'iyi@ornek.com', subject: 'Konu\r\nBcc: kotu@ornek.com', html: '<p>x</p>', text: 'x' });
  expect(r2.ok).toBe(true);
  const m = await simpleParser(s.mails[0].raw);
  expect(m.bcc).toBeUndefined();                                            // yeni başlık eklenemedi
  expect(s.mails[0].to).toEqual(['iyi@ornek.com']);
  s.close();
});

test('ayarlar eksikse mailConfigured false; SMTP_HOST yoksa Resend yoluna gider', async () => {
  setEnv({ SMTP_HOST: 'smtp.hostinger.com', EMAIL_FROM: 'a <a@b.com>' });
  expect(mod.mailConfigured()).toBe(false);                                 // kullanıcı/parola yok
  expect(mod.mailMissing()).toMatch(/SMTP_USER/);
  setEnv({ EMAIL_FROM: 'a <a@b.com>' });
  expect(mod.mailConfigured()).toBe(false);
  expect(mod.mailMissing()).toMatch(/RESEND_API_KEY/);

  // Resend yolu: sahte API sunucusu (fetch adresi yakalanır).
  const calls = [];
  const api = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { calls.push({ auth: req.headers.authorization, body: JSON.parse(b) }); res.writeHead(200); res.end('{}'); }); });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => realFetch(String(u).replace('https://api.resend.com', `http://127.0.0.1:${api.address().port}`), o);
  setEnv({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'anahtar <info@anahtar.io>' });
  expect(mod.mailConfigured()).toBe(true);
  const r = await mod.sendMail({ to: 'x@y.com', subject: 'Konu', html: '<p>h</p>', text: 't', replyTo: 'info@anahtar.io' });
  globalThis.fetch = realFetch; api.close();
  expect(r.ok).toBe(true);
  expect(calls[0].auth).toBe('Bearer re_test');
  expect(calls[0].body).toMatchObject({ from: 'anahtar <info@anahtar.io>', to: 'x@y.com', subject: 'Konu', reply_to: 'info@anahtar.io' });
});
