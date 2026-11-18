// Banka ekstresinden tahsilat: yönetim ekstreyi (Excel .xls/.xlsx ya da CSV) yükler; gelen ödemeler dairelerin açıklama koduna ve
// sakin adına göre eşleştirilir. Kesin eşleşenler toplu onaylanır, öneriler tek tek; onaysız hiçbir ödeme işlenmez.
// Dosya cihazda okunur ve sunucuya gönderilmez (yalnız işlenen hareketin parmak izi, tarihi ve tutarı: site_bank_apply).
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
import { pickTable } from './media';
import { Pill } from './org';

type Header = { row: number; map: Record<string, number> };
const KEYS: [string, () => string][] = [['date', () => t('Tarih')], ['desc', () => t('Açıklama')], ['amount', () => t('Tutar')]];

export function BankImport({ d, oid, reload }: { d: any; oid: string; reload: () => void }) {
  const c = useColors();
  const [rows, setRows] = useState<any[][] | null>(null);
  const [guess, setGuess] = useState<Header | null>(null);   // başlık tanınmadıysa yöneticinin seçtiği sütunlar
  const [res, setRes] = useState<any[] | null>(null);
  const [seen, setSeen] = useState(0);
  const [bank, setBank] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, 'ok' | 'skip' | 'dup'>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unitBy = Object.fromEntries(d.units.map((u: any) => [u.id, u]));

  const run = async (rs: any[][], h: Header) => {
    const txns = incoming(rs, h);
    if (!txns.length) { setErr(t('Dosyada gelen ödeme bulunamadı.')); return; }
    const s = await seenBankTxns(oid, txns.map((x) => x.fp));
    const fresh = txns.filter((x) => !s.has(x.fp));
    const r = matchTxns(fresh, { units: d.units, residents: d.residents, charges: d.charges });
    setSeen(txns.length - fresh.length); setRes(r); setDone({}); setGuess(null);
    setPick(new Set(r.filter((x) => x.kind === 'exact').map((x) => x.txn.fp)));
  };
  const load = async () => {
    setErr(null); setRes(null); setGuess(null);
    const f = await pickTable();
    if (!f) return;
    setBusy(true);
    try {
      const rs = await readTable(f.bytes);
      setRows(rs); setBank(bankOf(rs));
      const h = findHeader(rs);
      if (h) await run(rs, h as Header);
      else {
        // Tanınmayan biçim: en az üç dolu hücresi olan ilk satır başlık sayılır, yönetici sütunları seçer.
        const row = rs.findIndex((r) => (r || []).filter((x: any) => String(x).trim()).length >= 3);
        if (row < 0) setErr(t('Dosya okunamadı. Bankadan Excel ya da CSV olarak indir.'));
        else setGuess({ row, map: {} });
      }
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const apply = async (list: any[]) => {
    setBusy(true); setErr(null);
    const next = { ...done };
    for (const m of list) {
      try { next[m.txn.fp] = (await applyBankTxn(oid, m, bank)) ? 'ok' : 'dup'; }
      catch (e) { setErr(humanError(e)); break; }
    }
    setDone(next); setBusy(false); reload();
  };

  const line = (m: any) => [fmtFull(parse(m.txn.date)), tl(m.txn.amount)].join(' · ');
  const target = (m: any) => (m.unit ? unitLabel(unitBy[m.unit.id] || m.unit) : '') + (m.parts.length ? ' · ' + m.parts.map((p: any) => monthYear(p.charge.month) + ' ' + kindLabel(p.charge.kind, p.charge.title)).join(', ') : '');
  const state = (fp: string) => done[fp] === 'ok' ? <Chip label={t('İşlendi')} tone="ok" /> : done[fp] === 'dup' ? <Chip label={t('Daha önce işlenmiş')} /> : done[fp] === 'skip' ? <Chip label={t('Atlandı')} /> : null;
  const exact = (res || []).filter((x) => x.kind === 'exact'), sug = (res || []).filter((x) => x.kind === 'suggest'), none = (res || []).filter((x) => x.kind === 'none');
  const todo = exact.filter((x) => pick.has(x.txn.fp) && !done[x.txn.fp]);

  return (
    <Card gap={12}>
      <H2>{t('Banka ekstresinden tahsilat')}</H2>
      <Muted>{t('Bankadan indirdiğin hesap hareketlerini (Excel ya da CSV) yükle; gelen ödemeler dairelerin açıklama koduna ve adına göre eşleşir. Onaylamadan hiçbir ödeme işlenmez; dosya sunucuya gönderilmez.')}</Muted>
      <Button kind={res ? 'ghost' : 'primary'} style={{ alignSelf: 'flex-start' }} loading={busy && !res} title={res ? t('Başka ekstre yükle') : t('Ekstre yükle')} onPress={load} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}

      {guess && rows ? (
        <View style={{ gap: 10 }}>
          <Note warn>{t('Bu bankanın biçimini henüz tanımıyoruz. Hangi sütunun tarih, açıklama ve tutar olduğunu seç.')}</Note>
          {KEYS.map(([k, label]) => (
            <View key={k} style={{ gap: 6 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label()}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(rows[guess.row] || []).map((h: any, i: number) => String(h).trim() ? <Pill key={i} label={String(h)} on={guess.map[k] === i} onPress={() => setGuess({ ...guess, map: { ...guess.map, [k]: i } })} /> : null)}
              </View>
            </View>
          ))}
          <Button style={{ alignSelf: 'flex-start' }} title={t('Eşleştir')} disabled={KEYS.some(([k]) => guess.map[k] === undefined)} onPress={() => run(rows, guess).catch((e) => setErr(humanError(e)))} />
        </View>
      ) : null}

      {res ? (
        <View style={{ gap: 14 }}>
          <Muted>{[bank, t('{n} gelen ödeme', { n: res.length + seen }), t('{n} kesin', { n: exact.length }), t('{n} öneri', { n: sug.length }), t('{n} eşleşmeyen', { n: none.length }),
            seen ? t('{n} daha önce işlenmiş', { n: seen }) : ''].filter(Boolean).join(' · ')}</Muted>

          {exact.length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.bodyXBold }}>{t('Kesin eşleşenler')}</Text>
              {exact.map((m) => {
                const on = pick.has(m.txn.fp);
                return (
                  <Pressable key={m.txn.fp} disabled={!!done[m.txn.fp]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on}
                    onPress={() => { const s = new Set(pick); on ? s.delete(m.txn.fp) : s.add(m.txn.fp); setPick(s); }}
                    style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Text v="small" color={c.accentInk} style={{ fontSize: 12, lineHeight: 14 }}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{target(m)}</Text><Muted>{line(m)}</Muted></View>
                    {state(m.txn.fp)}
                  </Pressable>
                );
              })}
              <Button style={{ alignSelf: 'flex-start' }} loading={busy} disabled={!todo.length} title={t('Seçilenleri onayla ({n})', { n: todo.length })} onPress={() => apply(todo)} />
            </View>
          ) : null}

          {sug.length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.bodyXBold }}>{t('Öneriler: kontrol et')}</Text>
              {sug.map((m) => (
                <View key={m.txn.fp} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderColor: c.line }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{target(m)}</Text>
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

          {none.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: fonts.bodyXBold }}>{t('Eşleşmeyenler')}</Text>
              <Muted>{t('Bu ödemeleri dairenin satırındaki "Ödendi işaretle" ile elle işleyebilirsin. Sakinlerden açıklamaya daire kodunu yazmalarını iste.')}</Muted>
              {none.map((m) => <Muted key={m.txn.fp}>{line(m) + ' · ' + m.txn.desc + ' · ' + t(m.why)}</Muted>)}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
