// Gerçek Postgres (PGlite) üzerinde şema testleri için ortak kurulum: Supabase'in auth/storage çatısı,
// şema (iki kez), örnek kullanıcılar ve rol geçişi.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

export const STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, banned_until timestamptz);
  create table if not exists auth.sessions (id uuid default gen_random_uuid(), user_id uuid);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean);
  create table if not exists storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant select, insert, delete on storage.objects to authenticated;
`;

export const ID = {
  L: '00000000-0000-0000-0000-00000000000a',   // mülk sahibi
  T: '00000000-0000-0000-0000-00000000000b',   // kiracı
  A: '00000000-0000-0000-0000-00000000000e',   // yönetici
  X: '00000000-0000-0000-0000-00000000000f',   // yabancı kiracı
  L2: '00000000-0000-0000-0000-0000000000a2'   // başka mülk sahibi
};

/** Şemayı kurar; L (mülk sahibi, p1 mülkü) ve T (kiracı, p1'e bağlı), A (yönetici), X (yabancı), L2 (başka mülk sahibi, p2). */
export async function newDb() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);                         // ikinci çalıştırma zararsız olmalı
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'ev@ornek.com', '{"name":"Ev Sahibi","role":"landlord"}'),
    ($2, 'kiraci@ornek.com', '{"name":"Kiracı","role":"tenant"}'),
    ($3, 'admin@ornek.com', '{"name":"Yönetici","role":"tenant"}'),
    ($4, 'diger@ornek.com', '{"name":"Diğer","role":"tenant"}'),
    ($5, 'ev2@ornek.com', '{"name":"Başka Ev Sahibi","role":"landlord"}')`, [ID.L, ID.T, ID.A, ID.X, ID.L2]);
  await db.exec(`insert into public.admins (user_id) values ('${ID.A}')`);
  const as = async (uid, anon = false) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);` + (uid ? ' set role authenticated;' : anon ? ' set role anon;' : ''));
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  await as(ID.L);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p1', $1, 'Moda', 30000, 5)`, [ID.L]);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p1', $1) returning code`, [ID.L]);
  await as(ID.T);
  await q(`select public.accept_invite($1)`, [code]);
  await as(ID.L2);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p2', $1, 'Bebek', 40000, 1)`, [ID.L2]);
  await as(null);
  return { db, as, q };
}

/** İşlevi çağırır; izin/yetki hatası bekleniyorsa hata iletisini döner. */
export async function tryCall(db, sql, params) {
  try { await db.query(sql, params); return null; } catch (e) { return String(e.message || e); }
}
