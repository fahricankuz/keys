// Banka ekstresinden tahsilat (kurum paneli ve bireysel mülk sahibi aynı ekranı kullanır): ekstre (Excel .xls/.xlsx ya da CSV) yüklenir;
// gelen ödemeler açıklama koduna ve kişi adına göre eşleştirilir. Kesin eşleşenler toplu onaylanır, öneriler tek tek; onaysız hiçbir
// ödeme işlenmez. Başka yolla (dekont, elle, kart) zaten işlenmiş ödemeler ve kart tahsilatı aktarımları ayrı listelenir, işlenmez.
// Dosya cihazda okunur ve sunucuya gönderilmez (yalnız işlenen hareketin parmak izi, tarihi ve tutarı).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { t } from '../domain/i18n';
import { humanError } from '../domain/backend';
import { readTable } from '../domain/importer';
import { bankOf, findHeader, incoming, matchTxns } from '../domain/ekstre';
import { applyBankTxn, kindLabel, seenBankTxns, unitLabel } from '../domain/site';
import { fmtFull, monthYear, parse, tl } from '../domain/util';
import { Button, Chip, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Muted, Note, Row } from './blocks';
import { pickTables } from './media';
import { Pill } from './org';

type Header = { row: number; map: Record<string, number> };
const KEYS: [string, () => string][] = [['date', () => t('Tarih')], ['desc', () => t('Açıklama')], ['amount', () => t('Tutar')]];

/** Eşleştirme kaynağı: units [{ id, pay_code }], residents [{ unit_id, name }], charges (tahakkuk benzeri: id, unit_id, month, kind,
    title, amount, status, paid_amount, paid_on). target: eşleşmenin ekrandaki adı. */
export type Source = { units: any[]; residents: any[]; charges: any[]; target: (m: any) => string };

export function StatementImport({ source, seen: loadSeen, apply: applyOne, reload, lead }: {
  source: Source; seen: (fps: string[]) => Promise<Set<string>>; apply: (m: any, bank: string) => Promise<boolean>; reload: () => void; lead: string;
}) {
  const c = useColors();
  const [guess, setGuess] = useState<(Header & { rows: any[][]; name: string; bank: string }) | null>(null);   // tanınmayan dosya: sütunları yönetici seçer
  const [pending, setPending] = useState<{ name: string; rows: any[][]; bank: string }[]>([]);                  // sırada bekleyen tanınmayan dosyalar
  const [files, setFiles] = useState<string[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [fresh, setFresh] = useState<any[]>([]);
  const [res, setRes] = useState<any[] | null>(null);   // eşleşme dosya eklenince hesaplanır, sonra dondurulur: işlenen satır yeniden sınıflanmaz
  const [separate, setSeparate] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState(0);
  const [twice, setTwice] = useState(0);                // birden çok dosyada aynı hareket (çakışan dönemler): bir kez sayılır
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, 'ok' | 'skip' | 'dup'>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Yeni hareketleri ekler: daha önce işlenmiş ve bu oturumda zaten eklenmiş olanlar çıkar; işlenmemişler yeniden eşleştirilir. */
  const addTxns = async (txns: any[], cur: { fresh: any[]; res: any[] }) => {
    const have = new Set(cur.fresh.map((x) => x.fp));
    const uniq = txns.filter((x) => !have.has(x.fp));
    const s = uniq.length ? await loadSeen(uniq.map((x) => x.fp)) : new Set<string>();
    const add = uniq.filter((x) => !s.has(x.fp));
    const all = [...cur.fresh, ...add];
    const kept = cur.res.filter((x) => done[x.txn.fp]);
    const again = matchTxns(all.filter((x) => !done[x.fp]), source, { separate });
    const next = [...kept, ...again];
    setTwice((n) => n + txns.length - uniq.length); setSeen((n) => n + uniq.length - add.length);
    setFresh(all); setRes(next);
    setPick((p) => new Set([...p, ...again.filter((x) => x.kind === 'exact' && !cur.res.some((y) => y.txn.fp === x.txn.fp)).map((x) => x.txn.fp)]));
    return { fresh: all, res: next };
  };
  const reset = () => { setGuess(null); setPending([]); setFiles([]); setBanks([]); setFresh([]); setRes(null); setSeparate(new Set()); setSeen(0); setTwice(0); setPick(new Set()); setDone({}); setErr(null); };
  const askColumns = (queue: { name: string; rows: any[][]; bank: string }[]) => {
    const [f, ...rest] = queue;
    setPending(rest);
    if (!f) { setGuess(null); return; }
    // Tanınmayan biçim: en az üç dolu hücresi olan ilk satır başlık sayılır, yönetici sütunları seçer.
    const row = f.rows.findIndex((r) => (r || []).filter((x: any) => String(x).trim()).length >= 3);
    if (row < 0) { setErr(t('{f} okunamadı. Bankadan Excel ya da CSV olarak indir.', { f: f.name })); askColumns(rest); return; }
    setGuess({ ...f, row, map: {} });
  };
  const load = async () => {
    setErr(null);
    const picked = await pickTables();
    if (!picked.length) return;
    setBusy(true);
    let cur = { fresh, res: res || [] }, empty: string[] = [];
    const queue: { name: string; rows: any[][]; bank: string }[] = [];
    try {
      for (const f of picked) {
        const rs = await readTable(f.bytes), bank = bankOf(rs), h = findHeader(rs);
        setFiles((x) => [...x, f.name]); if (bank) setBanks((x) => (x.includes(bank) ? x : [...x, bank]));
        if (!h) { queue.push({ name: f.name, rows: rs, bank }); continue; }
        const txns = incoming(rs, h as Header).map((x) => ({ ...x, bank }));
        if (!txns.length) { empty.push(f.name); continue; }
        cur = await addTxns(txns, cur);
      }
      if (!cur.res.length && !queue.length) setRes(null);
      if (empty.length) setErr(t('Gelen ödeme bulunamadı: {f}', { f: empty.join(', ') }));
      askColumns(queue);
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const runGuess = async () => {
    if (!guess) return;
    const txns = incoming(guess.rows, guess).map((x) => ({ ...x, bank: guess.bank }));
    if (!txns.length) setErr(t('Gelen ödeme bulunamadı: {f}', { f: guess.name }));
    else await addTxns(txns, { fresh, res: res || [] });
    askColumns(pending);
  };
  const apply = async (list: any[]) => {
    setBusy(true); setErr(null);
    const next = { ...done };
    for (const m of list) {
      try { next[m.txn.fp] = (await applyOne(m, m.txn.bank || '')) ? 'ok' : 'dup'; }
      catch (e) { setErr(humanError(e)); break; }
    }
    setDone(next); setBusy(false); reload();
  };

  /** "Bu ayrı bir ödeme": yalnız işlenmemiş satırlar yeniden eşleştirilir; işlenenler olduğu gibi kalır. */
  const separateOne = (fp: string) => {
    const sep = new Set(separate); sep.add(fp); setSeparate(sep);
    const open = fresh.filter((x) => !done[x.fp]);
    const again = new Map(matchTxns(open, source, { separate: sep }).map((x) => [x.txn.fp, x]));
    const next = (res || []).map((x) => again.get(x.txn.fp) || x);
    setRes(next);
    const m = again.get(fp); if (m?.kind === 'exact') setPick(new Set([...pick, fp]));
  };
  const line = (m: any) => [fmtFull(parse(m.txn.date)), tl(m.txn.amount)].join(' · ');
  const state = (fp: string) => done[fp] === 'ok' ? <Chip label={t('İşlendi')} tone="ok" /> : done[fp] === 'dup' ? <Chip label={t('Daha önce işlenmiş')} /> : done[fp] === 'skip' ? <Chip label={t('Atlandı')} /> : null;
  const of = (k: string) => (res || []).filter((x) => x.kind === k);
  const exact = of('exact'), sug = of('suggest'), none = of('none'), known = of('known'), card = of('card');
  const todo = exact.filter((x) => pick.has(x.txn.fp) && !done[x.txn.fp]);
  const head = (s: string) => <Text style={{ fontFamily: fonts.bodyXBold }}>{s}</Text>;

  return (
    <Card gap={12}>
      <H2>{t('Banka ekstresinden tahsilat')}</H2>
      <Muted>{lead}</Muted>
      <Row wrap>
        <Button kind={res || guess ? 'ghost' : 'primary'} loading={busy && !res} title={res || guess ? t('Ekstre ekle') : t('Ekstre yükle')} onPress={load} />
        {res || guess ? <Button kind="quiet" title={t('Temizle')} onPress={reset} /> : null}
      </Row>
      {!res && !guess ? <Muted>{t('Birden çok ekstre seçebilirsin (farklı hesaplar ya da aylar); aynı hareket birden çok dosyada varsa bir kez sayılır.')}</Muted> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}

      {guess ? (
        <View style={{ gap: 10 }}>
          <Note warn>{t('{f}: bu bankanın biçimini henüz tanımıyoruz. Hangi sütunun tarih, açıklama ve tutar olduğunu seç.', { f: guess.name })}</Note>
          {KEYS.map(([k, label]) => (
            <View key={k} style={{ gap: 6 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label()}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(guess.rows[guess.row] || []).map((h: any, i: number) => String(h).trim() ? <Pill key={i} label={String(h)} on={guess.map[k] === i} onPress={() => setGuess({ ...guess, map: { ...guess.map, [k]: i } })} /> : null)}
              </View>
            </View>
          ))}
          <Button style={{ alignSelf: 'flex-start' }} title={t('Eşleştir')} disabled={KEYS.some(([k]) => guess.map[k] === undefined)} onPress={() => runGuess().catch((e) => setErr(humanError(e)))} />
        </View>
      ) : null}

      {res ? (
        <View style={{ gap: 14 }}>
          <Muted>{[banks.join(', '), files.length > 1 ? t('{n} dosya', { n: files.length }) : '', t('{n} gelen ödeme', { n: res.length + seen }), t('{n} kesin', { n: exact.length }), t('{n} öneri', { n: sug.length }), t('{n} eşleşmeyen', { n: none.length }),
            known.length ? t('{n} zaten kayıtlı', { n: known.length }) : '', card.length ? t('{n} kart aktarımı', { n: card.length }) : '',
            seen ? t('{n} daha önce işlenmiş', { n: seen }) : '', twice ? t('{n} hareket birden çok dosyada (bir kez sayıldı)', { n: twice }) : ''].filter(Boolean).join(' · ')}</Muted>

          {exact.length ? (
            <View style={{ gap: 8 }}>
              {head(t('Kesin eşleşenler'))}
              {exact.map((m) => {
                const on = pick.has(m.txn.fp);
                return (
                  <Pressable key={m.txn.fp} disabled={!!done[m.txn.fp]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on}
                    onPress={() => { const s = new Set(pick); on ? s.delete(m.txn.fp) : s.add(m.txn.fp); setPick(s); }}
                    style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Text v="small" color={c.accentInk} style={{ fontSize: 12, lineHeight: 14 }}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{source.target(m)}</Text><Muted>{line(m)}</Muted></View>
                    {state(m.txn.fp)}
                  </Pressable>
                );
              })}
              <Button style={{ alignSelf: 'flex-start' }} loading={busy} disabled={!todo.length} title={t('Seçilenleri onayla ({n})', { n: todo.length })} onPress={() => apply(todo)} />
            </View>
          ) : null}

          {sug.length ? (
            <View style={{ gap: 8 }}>
              {head(t('Öneriler: kontrol et'))}
              {sug.map((m) => (
                <View key={m.txn.fp} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderColor: c.line }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{source.target(m)}</Text>
                  <Muted>{line(m) + ' · ' + t(m.why) + (m.extra ? ' · ' + t('{x} fazla', { x: tl(m.extra) }) : '')}</Muted>
                  <Muted>{m.txn.desc}</Muted>
                  {state(m.txn.fp) || (
                    <Row wrap>
                      <Button kind="ghost" loading={busy} title={t('Onayla')} onPress={() => apply([m])} />
                      <Button kind="quiet" title={t('Atla')} onPress={() => setDone({ ...done, [m.txn.fp]: 'skip' })} />
                    </Row>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {known.length ? (
            <View style={{ gap: 6 }}>
              {head(t('Zaten kayıtlı'))}
              <Muted>{t('Bu ödemeler dekontla, elle ya da kartla zaten işlenmiş görünüyor; tekrar sayılmaz. Gerçekten ayrı bir ödemeyse "Bu ayrı bir ödeme" de.')}</Muted>
              {known.map((m) => (
                <View key={m.txn.fp} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderColor: c.line }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{source.target(m)}</Text>
                  <Muted>{line(m) + ' · ' + t(m.why) + ' · ' + m.txn.desc}</Muted>
                  <Button kind="quiet" style={{ alignSelf: 'flex-start' }} title={t('Bu ayrı bir ödeme')} onPress={() => separateOne(m.txn.fp)} />
                </View>
              ))}
            </View>
          ) : null}

          {card.length ? (
            <View style={{ gap: 6 }}>
              {head(t('Kart tahsilatı aktarımları'))}
              <Muted>{t('Ödeme kuruluşunun ya da POS’un toplu aktarımları. Kart ödemeleri uygulamada tek tek işlendiği için bunlar bir daireye yazılmaz.')}</Muted>
              {card.map((m) => <Muted key={m.txn.fp}>{line(m) + ' · ' + m.txn.desc}</Muted>)}
            </View>
          ) : null}

          {none.length ? (
            <View style={{ gap: 6 }}>
              {head(t('Eşleşmeyenler'))}
              <Muted>{t('Bu ödemeleri dairenin satırındaki "Ödendi işaretle" ile elle işleyebilirsin. Sakinlerden açıklamaya daire kodunu yazmalarını iste.')}</Muted>
              {none.map((m) => <Muted key={m.txn.fp}>{line(m) + ' · ' + m.txn.desc + ' · ' + t(m.why)}</Muted>)}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Kurum paneli (site aidatı, AVM/depo/GYO kirası): Aidat / Kira sekmesinde. Yetki: "Dekont onayı". */
export function BankImport({ d, oid, reload }: { d: any; oid: string; reload: () => void }) {
  const unitBy = Object.fromEntries(d.units.map((u: any) => [u.id, u]));
  const target = (m: any) => (m.unit && unitBy[m.unit.id] ? unitLabel(unitBy[m.unit.id]) : '')
    + (m.parts.length ? ' · ' + m.parts.map((p: any) => monthYear(p.charge.month) + ' ' + kindLabel(p.charge.kind, p.charge.title)).join(', ') : '');
  return (
    <StatementImport source={{ units: d.units, residents: d.residents, charges: d.charges, target }} reload={reload}
      seen={(fps) => seenBankTxns(oid, fps)} apply={(m, bank) => applyBankTxn(oid, m, bank)}
      lead={t('Bankadan indirdiğin hesap hareketlerini (Excel ya da CSV) yükle; gelen ödemeler dairelerin açıklama koduna ve adına göre eşleşir. Onaylamadan hiçbir ödeme işlenmez; dosya sunucuya gönderilmez.')} />
  );
}
