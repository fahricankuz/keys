// Eski Excel (.xls, BIFF8) okuyucusu: bankaların "hesap hareketleri" indirmeleri çoğunlukla bu biçimde gelir (ör. Garanti BBVA).
// Bağımlılıksız: önce Compound File (CFB) kabından "Workbook" akışı çıkarılır, sonra ilk çalışma sayfasının hücreleri okunur.
// Desteklenen hücreler: paylaşılan metin (LABELSST), metin (LABEL), sayı (NUMBER, RK, MULRK), formül sonucu (sayı ya da STRING).
// Dönen: satır dizisi; her hücre metin (sayılar String(n)). Biçim, tarih biçimlendirmesi ve birden çok sayfa okunmaz.

const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export const isXls = (b) => b && b.length > 8 && SIG.every((x, i) => b[i] === x);

const ENDCHAIN = 0xfffffffe, FREE = 0xffffffff;

function cfbStream(b, wanted) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true);
  const ssz = 1 << u16(0x1e), msz = 1 << u16(0x20);
  const sector = (id) => 512 + id * ssz;
  // FAT sektörleri: başlıktaki 109 DIFAT girişi, gerekirse DIFAT zinciri.
  const fatIds = [];
  for (let i = 0; i < 109; i++) { const id = u32(0x4c + i * 4); if (id !== FREE && id !== ENDCHAIN) fatIds.push(id); }
  let dif = u32(0x44), ndif = u32(0x48);
  while (ndif-- > 0 && dif !== ENDCHAIN && dif !== FREE) {
    const o = sector(dif);
    for (let i = 0; i < ssz / 4 - 1; i++) { const id = u32(o + i * 4); if (id !== FREE && id !== ENDCHAIN) fatIds.push(id); }
    dif = u32(o + ssz - 4);
  }
  const fat = [];
  for (const id of fatIds) { const o = sector(id); for (let i = 0; i < ssz / 4; i++) fat.push(u32(o + i * 4)); }
  const chain = (start, table) => {
    const out = []; let id = start, guard = 0;
    while (id !== ENDCHAIN && id !== FREE && id < table.length && guard++ < 1e6) { out.push(id); id = table[id]; }
    return out;
  };
  const readBig = (start, size) => {
    const out = new Uint8Array(size); let off = 0;
    for (const id of chain(start, fat)) { const o = sector(id); const n = Math.min(ssz, size - off); if (n <= 0) break; out.set(b.subarray(o, o + n), off); off += n; }
    return out;
  };
  // Dizin girişleri.
  const dirBytes = (() => { const ids = chain(u32(0x30), fat); const out = new Uint8Array(ids.length * ssz); ids.forEach((id, i) => out.set(b.subarray(sector(id), sector(id) + ssz), i * ssz)); return out; })();
  const ddv = new DataView(dirBytes.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const nlen = ddv.getUint16(o + 0x40, true);
    let name = ''; for (let i = 0; i + 2 < nlen; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    entries.push({ name, type: dirBytes[o + 0x42], start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const ent = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!ent) throw new Error('Dosyada çalışma kitabı bulunamadı');
  if (ent.size >= u32(0x38) || !root) return readBig(ent.start, ent.size);
  // Küçük akış: mini akış (kök girişinin zinciri) + mini FAT.
  const mini = readBig(root.start, root.size);
  const minifat = [];
  for (const id of chain(u32(0x3c), fat)) { const o = sector(id); for (let i = 0; i < ssz / 4; i++) minifat.push(u32(o + i * 4)); }
  const out = new Uint8Array(ent.size); let off = 0;
  for (const id of chain(ent.start, minifat)) { const n = Math.min(msz, ent.size - off); if (n <= 0) break; out.set(mini.subarray(id * msz, id * msz + n), off); off += n; }
  return out;
}

function rk(v) {
  let n;
  if (v & 2) n = v >> 2;
  else { const buf = new DataView(new ArrayBuffer(8)); buf.setUint32(4, v & 0xfffffffc, true); buf.setUint32(0, 0, true); n = buf.getFloat64(0, true); }
  return v & 1 ? n / 100 : n;
}

/** SST: dizeler CONTINUE kayıtlarına bölünebilir; her CONTINUE başında kalan karakterlerin genişlik bayrağı yeniden gelir. */
function readSst(parts) {
  let pi = 0, p = parts[0], off = 8;
  const total = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(4, true);
  const next = () => { pi++; p = parts[pi]; off = 0; };
  const need = (n) => { if (off + n > p.length) next(); };
  const u8 = () => { need(1); return p[off++]; };
  const u16 = () => { need(2); const v = p[off] | (p[off + 1] << 8); off += 2; return v; };
  const u32 = () => { need(4); const v = (p[off] | (p[off + 1] << 8) | (p[off + 2] << 16) | (p[off + 3] << 24)) >>> 0; off += 4; return v; };
  const skip = (n) => { while (n > 0) { const k = Math.min(n, p.length - off); off += k; n -= k; if (n > 0) next(); } };
  const out = [];
  for (let i = 0; i < total && p; i++) {
    const cch = u16(); let flags = u8();
    const runs = flags & 8 ? u16() : 0, ext = flags & 4 ? u32() : 0;
    let s = '', left = cch;
    while (left > 0) {
      if (off >= p.length) { next(); if (!p) break; flags = p[off++]; }
      const wide = flags & 1, avail = Math.floor((p.length - off) / (wide ? 2 : 1)), k = Math.min(left, avail);
      for (let j = 0; j < k; j++) s += String.fromCharCode(wide ? p[off + j * 2] | (p[off + j * 2 + 1] << 8) : p[off + j]);
      off += k * (wide ? 2 : 1); left -= k;
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

/** .xls baytlarından ilk çalışma sayfasının satırları. */
export function parseXls(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const wb = cfbStream(b, ['Workbook', 'Book']);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  let sst = [], sstParts = null, sheet = 0, pendingStr = null;
  const rows = [];
  const put = (r, c, v) => { (rows[r] ||= [])[c] = String(v).trim(); };
  for (let o = 0; o + 4 <= wb.length;) {
    const type = dv.getUint16(o, true), len = dv.getUint16(o + 2, true), d = o + 4, rec = wb.subarray(d, d + len);
    o = d + len;
    if (sstParts && type !== 0x003c) { sst = readSst(sstParts); sstParts = null; }
    if (type === 0x0809) { if (sheet === 0 && dv.getUint16(d + 2, true) === 0x0010) sheet = 1; continue; }   // BOF: 0x0010 = çalışma sayfası
    if (type === 0x000a) { if (sheet === 1) break; continue; }                                                // ilk sayfanın EOF'u
    if (type === 0x00fc) { sstParts = [rec]; continue; }
    if (type === 0x003c && sstParts) { sstParts.push(rec); continue; }
    if (sheet !== 1) continue;
    const row = dv.getUint16(d, true), col = dv.getUint16(d + 2, true);
    if (type === 0x00fd) put(row, col, sst[dv.getUint32(d + 6, true)] ?? '');
    else if (type === 0x0203) put(row, col, dv.getFloat64(d + 6, true));
    else if (type === 0x027e) put(row, col, rk(dv.getUint32(d + 6, true)));
    else if (type === 0x00bd) { const last = dv.getUint16(d + len - 2, true); for (let c = col, p = d + 4; c <= last; c++, p += 6) put(row, c, rk(dv.getUint32(p + 2, true))); }
    else if (type === 0x0204) {
      const cch = dv.getUint16(d + 6, true), wide = wb[d + 8] & 1; let s = '';
      for (let j = 0; j < cch; j++) s += String.fromCharCode(wide ? dv.getUint16(d + 9 + j * 2, true) : wb[d + 9 + j]);
      put(row, col, s);
    } else if (type === 0x0006) {
      if (dv.getUint16(d + 12, true) === 0xffff) { if (wb[d + 6] === 0) pendingStr = [row, col]; }
      else put(row, col, dv.getFloat64(d + 6, true));
    } else if (type === 0x0207 && pendingStr) {
      const cch = dv.getUint16(d, true), wide = wb[d + 2] & 1; let s = '';
      for (let j = 0; j < cch; j++) s += String.fromCharCode(wide ? dv.getUint16(d + 3 + j * 2, true) : wb[d + 3 + j]);
      put(pendingStr[0], pendingStr[1], s); pendingStr = null;
    }
  }
  return Array.from(rows, (r) => Array.from(r || [], (v) => v ?? ''));
}
