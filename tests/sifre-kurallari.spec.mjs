// Birim: şifre kuralları (app/src/domain/sifre.js). Kurallar Supabase → Auth → Email ayarıyla aynı:
// en az 8 karakter + sızmış şifre engeli; karakter türü zorunlu değil. Sunucu reddi Türkçe metne çevrilir.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;

test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'sifre-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}sifre.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  M = await import(pathToFileURL(out).href);
});

test('maddeler: uzunluk ve eşleşme yazdıkça işaretlenir', () => {
  const ok = (pw, pw2) => Object.fromEntries(M.pwChecks(pw, pw2).map((c) => [c.key, c.ok]));
  expect(ok('', '')).toEqual({ len: false, match: false });         // boş şifre "aynı" sayılmaz
  expect(ok('1234567', '1234567')).toEqual({ len: false, match: true });
  expect(ok('12345678', '1234567')).toEqual({ len: true, match: false });
  expect(ok('12345678', '12345678')).toEqual({ len: true, match: true });
  expect(M.pwChecks('abcdefgh').map((c) => c.key)).toEqual(['len']);  // tekrar alanı yoksa eşleşme maddesi çıkmaz
});

test('karakter türü zorunlu değil (Supabase "Password requirements" seçili değil)', () => {
  expect(M.pwReady('abcdefgh', 'abcdefgh')).toBe(true);
  expect(M.pwReady('abcdefg', 'abcdefg')).toBe(false);
  expect(M.pwReady('abcdefgh', 'abcdefgX')).toBe(false);
});

test('gönderim öncesi hata: önce uzunluk, sonra eşleşme', () => {
  expect(M.pwProblem('kisa', 'baska')).toBe('Şifre en az 8 karakter olmalı.');
  expect(M.pwProblem('uzun-sifre', 'baska-sifre')).toBe('Şifreler aynı değil.');
  expect(M.pwProblem('uzun-sifre', 'uzun-sifre')).toBeNull();
  expect(M.pwProblem('uzun-sifre')).toBeNull();
});

test('sunucu reddi Türkçeye çevrilir: sızmış, kısa, karakter, genel zayıf', () => {
  const leaked = { name: 'AuthWeakPasswordError', code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] };
  expect(M.pwServerError(leaked)).toMatch(/sızan şifreler arasında/);
  expect(M.pwServerError({ code: 'weak_password', message: 'x', weak_password: { reasons: ['pwned'] } })).toMatch(/sızan şifreler arasında/);
  expect(M.pwServerError({ code: 'weak_password', message: 'Password should be at least 8 characters.', reasons: ['length'] })).toBe('Şifre en az 8 karakter olmalı.');
  expect(M.pwServerError({ code: 'weak_password', message: 'Password should contain at least one character of each: abc', reasons: ['characters'] })).toMatch(/karakter türlerini/);
  expect(M.pwServerError({ code: 'weak_password', message: 'weak' })).toMatch(/yeterince güçlü değil/);
  expect(M.pwServerError({ code: 'same_password', message: 'New password should be different from the old password.' })).toBe('Yeni şifre eskisiyle aynı olamaz.');
  // Şifreyle ilgisiz hatalara dokunmaz (backend.humanError kendi eşlemesine devam eder).
  expect(M.pwServerError({ message: 'Invalid login credentials' })).toBeNull();
  expect(M.pwServerError({ message: 'rate limit exceeded' })).toBeNull();
});
