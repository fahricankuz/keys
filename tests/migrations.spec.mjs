// Migration düzeni: dosya adları, sıra, baseline, schema.sql'in migration'lardan üretilmişliği ve yeni migration üreticisi.
import { test, expect } from '@playwright/test';
import { readFileSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { files, build, NAME, SCHEMA, MIGRATIONS } from '../scripts/db-derle.mjs';
import { yeni, slug, stamp } from '../scripts/db-yeni.mjs';

test('migration dosyaları: ad biçimi, benzersiz zaman damgası, ilk dosya baseline', () => {
  const list = files();
  expect(list.length).toBeGreaterThan(0);
  for (const f of list) expect(f, f).toMatch(NAME);
  const stamps = list.map((f) => f.slice(0, 14));
  expect(new Set(stamps).size).toBe(stamps.length);
  expect(list[0]).toBe('20261101000000_baseline.sql');
  // Baseline, bütün temel tabloları içerir (eski schema.sql'in kopyası).
  const base = readFileSync(join(MIGRATIONS, list[0]), 'utf8');
  for (const t of ['public.profiles', 'public.properties', 'public.messages', 'public.requests']) expect(base).toContain(t);
});

test('schema.sql, migration\'lardan üretilmiştir (elle düzenlenmemiş / güncel)', () => {
  expect(readFileSync(SCHEMA, 'utf8')).toBe(build());
});

test('yeni migration üreticisi: ad temizlenir, zaman damgası ve şablon yazılır, aynısı iki kez açılmaz', () => {
  expect(slug('Kullanıcı Silme: şifre & çağrı')).toBe('kullanici_silme_sifre_cagri');
  expect(stamp(new Date('2026-11-02T09:30:05Z'))).toBe('20261102093005');
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  const now = new Date('2026-11-02T09:30:05Z');
  const f = yeni('Kullanıcı silme', dir, now);
  expect(f).toBe('20261102093005_kullanici_silme.sql');
  expect(f).toMatch(NAME);
  expect(readFileSync(join(dir, f), 'utf8')).toContain('Yeniden çalıştırılabilir yaz');
  expect(() => yeni('Kullanıcı silme', dir, now)).toThrow(/zaten var/);
  expect(() => yeni('   ', dir, now)).toThrow(/Ad gerekli/);
  expect(readdirSync(dir)).toEqual([f]);
});

test('birleştirme: ek migration baseline\'ın sonuna, sıralı ve ayraçla eklenir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  writeFileSync(join(dir, '20261101000000_baseline.sql'), 'create table a(x int);\n');
  writeFileSync(join(dir, '20261102000000_b.sql'), 'alter table a add column if not exists y int;\n');
  writeFileSync(join(dir, '20261103000000_c.sql'), 'create index if not exists a_y on a(y);\n');
  expect(build(dir)).toBe('create table a(x int);\n\n-- ===== migration: 20261102000000_b.sql =====\nalter table a add column if not exists y int;\n\n-- ===== migration: 20261103000000_c.sql =====\ncreate index if not exists a_y on a(y);\n');
});

test('migration iş akışı: elle tetiklenir, link/jeton kullanmaz, CLI sürümü sabit, güvenlik denetimi yazmadan önce çalışır', () => {
  const wf = readFileSync(new URL('../.github/workflows/db-migrate.yml', import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');   // açıklama satırları sayılmaz
  const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));
  expect(on).toContain('workflow_dispatch:');
  expect(on).not.toMatch(/\n\s+(push|pull_request|schedule):/);
  expect(wf).not.toMatch(/supabase link|SUPABASE_ACCESS_TOKEN/);
  expect(wf).toMatch(/version: \d+\.\d+\.\d+/);
  expect(wf).toContain('[ "$TARGET" = "$ENV_NAME" ]');
  const denetim = wf.indexOf('scripts/db-preflight.sh');
  expect(denetim).toBeGreaterThan(0);
  for (const yazan of ['migration repair', 'db push --db-url "$DB_URL" --yes']) expect(wf.indexOf(yazan), yazan).toBeGreaterThan(denetim);
  expect(readFileSync(new URL('../scripts/db-preflight.sh', import.meta.url), 'utf8')).toContain('20261101000000');
});
