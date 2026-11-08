// Ek hazırlanırken gönderme beklesin (app/src/domain/file-prep.js): hazırlık süresince sayılır, iptal ve hatada da biter.
import { test, expect } from '@playwright/test';
import { filesPreparing, onFilesPreparing, preparing } from '../app/src/domain/file-prep.js';

test('hazırlık sayacı: süresince açık; iç içe ve hatalı işte de doğru kapanır; dinleyiciler haber alır', async () => {
  const seen = [];
  const off = onFilesPreparing(() => seen.push(filesPreparing()));
  expect(filesPreparing()).toBe(false);
  let release;
  const a = preparing(() => new Promise((r) => { release = r; }));
  expect(filesPreparing()).toBe(true);
  await expect(preparing(async () => { throw new Error('iptal'); })).rejects.toThrow('iptal');
  expect(filesPreparing()).toBe(true);                       // ilki hâlâ sürüyor
  release('tamam');
  expect(await a).toBe('tamam');
  expect(filesPreparing()).toBe(false);
  off();
  await preparing(async () => {});
  expect(seen).toEqual([true, true, true, false]);          // başla, iç başla, iç bitti, bitti; dinleyici kaldırılınca haber yok
});
