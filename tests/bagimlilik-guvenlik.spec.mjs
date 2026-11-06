// Bağımlılık güvenliği: uuid < 11.1.1 (CWE-787, v3/v5/v6 çıktı tamponu sınır denetimi yok) kilit dosyalarına geri girmesin.
// Kütüphane kodu yamalanmaz; çözüm sürümü yükseltmektir (override ile 11.1.1+ sabit).
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const MIN = [11, 1, 1];
const ge = (v) => { const p = v.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((p[i] || 0) !== MIN[i]) return (p[i] || 0) > MIN[i]; } return true; };

test('uuid: override var ve kilit dosyalarındaki tüm uuid kopyaları 11.1.1 ve üstü', () => {
  const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
  expect(pkg.overrides?.uuid, 'package.json overrides.uuid').toMatch(/\^?(1[1-9]|[2-9]\d)\./);
  for (const f of ['package-lock.json', 'app/package-lock.json']) {
    if (!existsSync(root + f)) continue;
    const lock = JSON.parse(readFileSync(root + f, 'utf8'));
    for (const [path, info] of Object.entries(lock.packages || {})) {
      if (path === 'node_modules/uuid' || path.endsWith('/node_modules/uuid')) expect(ge(info.version), `${f}: ${path} ${info.version}`).toBe(true);
    }
  }
});
