// Sunucu satırları ↔ uygulama verisi eşlemesinin birim testleri.
import { test, expect } from '@playwright/test';
import { buildProperty, diffProperty, pendingMedia, storedPaths } from '../assets/js/mapping.js';

const L = 'user-l', T = 'user-t';

function rows(){
  return {
    prop: { id:'p1', owner_id:L, name:'Moda', addr:'Kadıköy', rent:'30000', due_day:5, aidat:'1000', aidat_payer:'Kiracı',
            deposit:'60000', deposit_note:'Banka', start_date:'2026-01-01', contract_end:'2026-12-31', dask:'2026-11-01', value:null, bills:[] },
    shared: { property_id:'p1', inspect:{ tenantOk:true, landlordOk:false, rooms:[{ n:'Salon', note:'', photos:0, shots:['sb:p1/a.jpg'] }] }, move_out:null, renewal:null },
    members: [
      { property_id:'p1', user_id:L, role:'landlord', display_name:'Ev Sahibi', phone:'05001', email:'' },
      { property_id:'p1', user_id:T, role:'tenant', display_name:'Kiracı', phone:'05002', email:'k@x.com' }
    ],
    profiles: { [L]:{ name:'Ev Sahibi' }, [T]:{ name:'Kiracı' } },
    invites: [{ code:'ABCD1234', property_id:'p1', name:'Ev arkadaşı', email:'', phone:'', accepted_by:null }],
    payments: [{ property_id:'p1', month:'2026-01', status:'approved', amount:'30000', paid_on:'2026-01-03', receipt_name:'d.pdf', receipt_path:'p1/r.jpg', note:null, reject_reason:null, approved_at:'2026-01-04T10:00:00.000Z' }],
    history: [{ id:'p1:2026-01-01', property_id:'p1', from_date:'2026-01-01', amount:'30000', note:'Sözleşme başlangıcı' }],
    requests: [{ id:'r1', property_id:'p1', cat:'Arıza', title:'Kombi', descr:'', urgency:'Normal', status:1, cost:'Belirlenmedi', cost_ok:false, decision:null, req_date:'2026-02-01', photos:0, shots:[], log:[], quotes:[], invoice:null }],
    messages: [{ id:'m1', property_id:'p1', from_role:'tenant', by_user:T, body:'Merhaba', at:'2026-02-01T09:00:00.000Z' }],
    documents: [{ id:'d1', property_id:'p1', cat:'Kira sözleşmesi', name:'s.pdf', path:null, uploaded_on:'2026-01-01', until:null }],
    expenses: [{ id:'e1', property_id:'p1', cat:'Emlak vergisi', amount:'4000', spent_on:'2026-05-20', note:'', req_id:null }]
  };
}

const clone = o => JSON.parse(JSON.stringify(o));

test('satırlar uygulama biçimine çevrilir', () => {
  const p = buildProperty(rows());
  expect(p.rent).toBe(30000);
  expect(p.landlord.name).toBe('Ev Sahibi');
  expect(p.tenants.map(t => t.name)).toEqual(['Kiracı', 'Ev arkadaşı']);
  expect(p.tenants[1].pending).toBe(true);
  expect(p.pay['2026-01'].photo).toBe('sb:p1/r.jpg');
  expect(p.msgs[0]).toMatchObject({ from:'tenant', by:T, text:'Merhaba' });
  expect(storedPaths(p).sort()).toEqual(['p1/a.jpg', 'p1/r.jpg']);
});

test('değişmeyen ev için hiçbir yazma işlemi üretilmez', () => {
  const p = buildProperty(rows());
  expect(diffProperty(p, clone(p), { role:'landlord', meId:L })).toEqual([]);
  expect(diffProperty(p, clone(p), { role:'tenant', meId:T })).toEqual([]);
});

test('kiracının değişiklikleri doğru tablolara, doğru biçimde gider', () => {
  const before = buildProperty(rows());
  const after = clone(before);
  after.pay['2026-02'] = { status:'review', date:'2026-02-03', amount:30000, receipt:'subat.jpg', photo:'sb:p1/s.jpg' };
  after.msgs.push({ id:'m2', from:'tenant', by:T, text:'Dekont yüklendi', at:Date.parse('2026-02-03T10:00:00Z') });
  after.msgs.push({ id:'m3', from:'system', text:'Şubat kirası için dekont yüklendi', at:Date.parse('2026-02-03T10:00:01Z') });
  after.requests[0].status = 3;
  after.rent = 99999;                         // kiracı kirayı değiştiremez
  after.expenses.push({ id:'e2', cat:'x', amount:1, date:'2026-02-01', note:'' });

  const ops = diffProperty(before, after, { role:'tenant', meId:T });
  const tables = ops.map(o => o.table);
  expect(tables).not.toContain('properties');
  expect(tables).not.toContain('expenses');

  const pay = ops.find(o => o.table === 'payments');
  expect(pay.rows).toEqual([expect.objectContaining({ month:'2026-02', status:'review', receipt_path:'p1/s.jpg' })]);

  const msgs = ops.find(o => o.table === 'messages');
  expect(msgs.rows.map(r => [r.id, r.from_role, r.by_user])).toEqual([['m2', 'tenant', T], ['m3', 'system', T]]);

  expect(ops.find(o => o.table === 'requests').rows[0]).toMatchObject({ id:'r1', status:3 });
});

test('kiracı yenilemeyi yalnızca kabul edebilir; yerel temizlik gönderilmez', () => {
  const r = rows();
  r.shared.renewal = { amount:36000, max:37500, cpi:25, status:'sent' };
  const before = buildProperty(r);

  const accepted = clone(before);
  accepted.renewal.status = 'accepted';
  const op = diffProperty(before, accepted, { role:'tenant', meId:T }).find(o => o.table === 'property_shared');
  expect(op.values.renewal.status).toBe('accepted');

  const cleared = clone(before);
  cleared.renewal = null;                     // ör. sözleşme süresi yerelde dolmuş
  expect(diffProperty(before, cleared, { role:'tenant', meId:T })).toEqual([]);
});

test('ev sahibinin değişiklikleri: ev bilgisi, gider ekleme/silme, kira geçmişi', () => {
  const before = buildProperty(rows());
  const after = clone(before);
  after.rent = 35000;
  after.rentHistory.push({ from:'2026-06-01', amount:35000, note:'Elle güncellendi' });
  after.expenses = [{ id:'e2', cat:'Tamir ve bakım', amount:2500, date:'2026-06-02', note:'Musluk' }];
  after.pay['2026-01'].status = 'approved';

  const ops = diffProperty(before, after, { role:'landlord', meId:L });
  const find = (t, k) => ops.find(o => o.table === t && o.kind === k);
  expect(find('properties', 'update').values.rent).toBe(35000);
  expect(find('rent_history', 'upsert').rows.map(r => r.id)).toEqual(['p1:2026-06-01']);
  expect(find('expenses', 'upsert').rows.map(r => r.id)).toEqual(['e2']);
  expect(find('expenses', 'delete').match.id).toEqual(['e1']);
});

test('yeni ev: ev satırı eklenir, ardından ortak alan güncellenir', () => {
  const p = buildProperty(rows());
  p.id = 'p9';
  const ops = diffProperty(null, p, { role:'landlord', meId:L });
  expect(ops[0]).toMatchObject({ table:'properties', kind:'insert' });
  expect(ops[0].rows[0].owner_id).toBe(L);
  expect(ops[1]).toMatchObject({ table:'property_shared', kind:'update', match:{ property_id:'p9' } });
});

test('silinen ev yalnızca sahibi tarafından silinir', () => {
  const p = buildProperty(rows());
  expect(diffProperty(p, null, { role:'landlord', meId:L })).toEqual([{ table:'properties', kind:'delete', match:{ id:'p1' } }]);
  expect(diffProperty(p, null, { role:'tenant', meId:T })).toEqual([]);
});

test('yüklenmemiş görseller bulunur', () => {
  const p = buildProperty(rows());
  p.inspect.rooms[0].shots.push('data:image/jpeg;base64,xx');
  p.pay['2026-01'].photo = 'data:image/jpeg;base64,yy';
  expect(pendingMedia(p).length).toBe(2);
});

test('v4 alanları: mülk tipi, şirket, stopaj; eski "Ev sahibi" değeri yeni adla okunur', () => {
  const r = rows();
  Object.assign(r.prop, { prop_type:'Mağaza', area:'85', company:{ name:'Esnaf', taxNo:'1', taxOffice:'X' }, stopaj:true, deposit_kind:'Teminat mektubu',
    aidat_payer:'Ev sahibi', bills:[{ n:'Su', who:'Ev sahibi' }], dask:null });
  r.requests[0].cost = 'Ev sahibi';
  const p = buildProperty(r);
  expect(p).toMatchObject({ type:'Mağaza', area:85, stopaj:true, depositKind:'Teminat mektubu', aidatPayer:'Mülk sahibi', dask:null });
  expect(p.company.name).toBe('Esnaf');
  expect(p.bills[0].who).toBe('Mülk sahibi');
  expect(p.requests[0].cost).toBe('Mülk sahibi');

  // Geri yazarken yeni sütunlar da gider.
  const next = clone(p);
  next.type = 'Ofis'; next.stopaj = false; next.company = null;
  const ops = diffProperty(p, next, { role:'landlord', meId:L });
  const up = ops.find(o => o.table === 'properties');
  expect(up.values).toMatchObject({ prop_type:'Ofis', stopaj:false, company:null });
});
