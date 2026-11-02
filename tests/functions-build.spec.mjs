// Edge Function'ların hepsi (supabase/functions/*/index.ts) derlenir: sözdizimi ve içe aktarma hataları burada yakalanır.
// `npm:` ve `jsr:` bağımlılıkları dışarıda bırakılır (Deno çalışma anında getirir). Ortak gönderici yalnızca Resend/SMTP yolundan geçer.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

const root = new URL('../supabase/functions/', import.meta.url).pathname;
const fns = readdirSync(root).filter((d) => existsSync(`${root}${d}/index.ts`));

for (const fn of fns) {
  test(`derlenir: ${fn}`, async () => {
    const r = await build({ entryPoints: [`${root}${fn}/index.ts`], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent', external: ['npm:*'] });
    const out = r.outputFiles[0].text;
    expect(out.length).toBeGreaterThan(200);
    expect(out).toContain('Deno.serve');
  });
}

test('e-posta gönderen fonksiyonlar ortak göndericiyi kullanır; Resend adresi yalnızca _shared/mail.ts içindedir', () => {
  const senders = ['welcome', 'invite-mail', 'site-invite', 'lead-mail', 'mail-send', 'push', 'report'];
  for (const fn of senders) {
    const src = readFileSync(`${root}${fn}/index.ts`, 'utf8');
    expect(src, fn).toContain("../_shared/mail.ts");
    expect(src, fn).not.toContain('api.resend.com');
  }
  expect(readFileSync(`${root}_shared/mail.ts`, 'utf8')).toContain('api.resend.com');
});
