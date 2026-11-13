// Edge Function testleri için ortak donanım (spec dosyası değildir). Fonksiyonun index.ts dosyası esbuild ile derlenir;
// `npm:` bağımlılıkları (supabase-js, @sentry/deno, nodemailer, jose, web-push) sahte modüllerle değiştirilir ve Deno.serve
// yakalanır; böylece gerçek işleyici Node içinde, sahte ortam, sahte fetch ve sahte veritabanıyla çalıştırılır.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../supabase/functions/', import.meta.url).pathname;
let seq = 0;

/** Sahte modüller: gerçek davranış globalThis.__edge üzerinden testten gelir. */
const STUBS = {
  '@supabase/supabase-js': 'export const createClient = (...a) => globalThis.__edge.createClient(...a);',
  '@sentry/deno': `
    const S = () => globalThis.__edge.sentry;
    export const init = (o) => S().init(o);
    export const withScope = (f) => S().withScope(f);
    export const flush = (t) => S().flush(t);
    export const captureCheckIn = (...a) => S().captureCheckIn(...a);
    export const captureMessage = (...a) => S().captureMessage(...a);
    export const captureException = (...a) => S().captureException(...a);`,
  nodemailer: 'export default { createTransport: (o) => ({ sendMail: (m) => globalThis.__edge.smtp(o, m) }) };',
  jose: `
    export const importPKCS8 = async () => ({});
    export class SignJWT { constructor() {} setProtectedHeader() { return this; } setIssuer() { return this; } setAudience() { return this; }
      setIssuedAt() { return this; } setExpirationTime() { return this; } async sign() { return 'jwt.sahte'; } }`,
  'web-push': 'export default { setVapidDetails() {}, sendNotification: (...a) => globalThis.__edge.webpush(...a) };',
};

const stubPlugin = {
  name: 'npm-stub',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path.replace(/^npm:/, '').replace(/@[\d.]+$|@2$/, ''), namespace: 'npm-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'npm-stub' }, (a) => {
      if (!(a.path in STUBS)) throw new Error('sahte modül tanımlı değil: ' + a.path);
      return { contents: STUBS[a.path], loader: 'js' };
    });
  },
};

/** Bir .ts dosyasını (npm: bağımlılıkları sahte) derleyip yeni bir modül örneği olarak yükler.
    `{ contents }` verilirse supabase/functions/ klasöründe çözülen sanal bir giriş derlenir (birkaç modülü aynı örnekte toplamak için). */
export async function bundleModule(relPath) {
  const entry = typeof relPath === 'string' ? { entryPoints: [ROOT + relPath] } : { stdin: { contents: relPath.contents, resolveDir: ROOT, loader: 'ts' } };
  const { outputFiles } = await build({
    ...entry, bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'esnext',
    logLevel: 'silent', plugins: [stubPlugin],
  });
  const tmp = `${tmpdir()}/anahtar-edge-${process.pid}-${seq++}.mjs`;
  writeFileSync(tmp, outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}

/**
 * Ortamı kurar, modülü yükler ve geri alma işlevini döndürür. `env` değişebilir bir nesnedir (test sırasında güncellenebilir).
 * opts: { env, fetch, createClient, sentry, smtp, webpush }
 */
export async function withEdge(relPath, opts, run) {
  const env = opts.env ?? {};
  const saved = { Deno: globalThis.Deno, fetch: globalThis.fetch, __edge: globalThis.__edge, error: console.error, warn: console.warn, log: console.log };
  let handler = null;
  const lines = [];
  globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
  globalThis.fetch = opts.fetch ?? (async () => new Response('{}', { status: 200 }));
  globalThis.__edge = {
    createClient: opts.createClient ?? (() => { throw new Error('createClient beklenmiyordu'); }),
    sentry: opts.sentry, smtp: opts.smtp, webpush: opts.webpush,
  };
  for (const k of ['error', 'warn', 'log']) console[k] = (l) => lines.push({ k, l });
  try {
    const mod = await bundleModule(relPath);
    return await run({ mod, handler, env, lines });
  } finally {
    globalThis.Deno = saved.Deno; globalThis.fetch = saved.fetch; globalThis.__edge = saved.__edge;
    console.error = saved.error; console.warn = saved.warn; console.log = saved.log;
  }
}

/** İstek üretici: POST, JSON gövde. */
export const post = (url, body, headers = {}) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

/**
 * Çok küçük sahte Supabase istemcisi (yalnızca fonksiyonların kullandığı zincirler):
 *   from(t).select().eq()....maybeSingle() / single() / await, insert(), update().eq()....select(), delete().eq(), rpc(), auth.getUser, auth.admin.getUserById.
 * state.tables[tablo] = satır dizisi. state.log = yapılan yazmalar. hooks.beforeUpdate(row) ile yarış simüle edilir.
 */
export function fakeSupabase(state) {
  state.tables ??= {};
  state.log ??= [];
  state.users ??= {};          // jeton -> { id }
  state.accounts ??= {};       // kullanıcı kimliği -> { email }
  state.rpc ??= {};            // ad -> (args) => ({ data, error })
  const rows = (t) => (state.tables[t] ??= []);
  function from(table) {
    const q = { op: 'select', filters: [], payload: null, ret: false };
    const match = (r) => q.filters.every(([k, v]) => r[k] === v);
    const run = async (mode) => {
      const t = rows(table);
      if (q.op === 'insert') {
        const err = state.insertError?.(table, q.payload);
        if (err) return { data: null, error: err };
        t.push({ ...q.payload }); state.log.push(['insert', table, q.payload]);
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        state.beforeUpdate?.(table, t);
        const hit = t.filter(match);
        for (const r of hit) Object.assign(r, q.payload);
        state.log.push(['update', table, q.payload, hit.length]);
        return { data: q.ret ? hit.map((r) => ({ user_id: r.user_id })) : null, error: null };
      }
      if (q.op === 'delete') { state.tables[table] = t.filter((r) => !match(r)); state.log.push(['delete', table]); return { data: null, error: null }; }
      const hit = t.filter(match);
      if (state.readError?.(table)) return { data: null, error: state.readError(table) };
      if (mode === 'one') return { data: hit[0] ? { ...hit[0] } : null, error: null };
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select() { if (q.op !== 'select') q.ret = true; return b; },
      eq(k, v) { q.filters.push([k, v]); return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      update(p) { q.op = 'update'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      maybeSingle: () => run('one'),
      single: () => run('one'),
      then: (res, rej) => run('many').then(res, rej),
    };
    return b;
  }
  return {
    from,
    rpc: async (name, args) => (state.rpc[name] ? state.rpc[name](args) : { data: null, error: { message: 'rpc yok: ' + name } }),
    auth: {
      getUser: async (token) => (state.users[token] ? { data: { user: state.users[token] }, error: null } : { data: { user: null }, error: { message: 'jeton geçersiz' } }),
      admin: { getUserById: async (id) => (state.accounts[id] ? { data: { user: { id, ...state.accounts[id] } }, error: null } : { data: { user: null }, error: { message: 'kullanıcı yok' } }) },
    },
  };
}
