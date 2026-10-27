/* Yönetici paneli için ham satırları birleştirir (saf işlev: ağ ve ekran bağımlılığı yok, birim testli). */

export function derive({ users, props, members, invites, payments, reviews }){
  const userBy = {};
  users.forEach(u => { userBy[u.id] = u; });
  const propBy = {};
  props.forEach(p => { propBy[p.id] = p; });

  const tenantsOf = pid => members.filter(m => m.property_id === pid && m.role === 'tenant');
  const nameOf = id => (userBy[id] && (userBy[id].name || userBy[id].email)) || '—';
  const reviewKey = (kind, pid, ref) => kind + ':' + pid + ':' + ref;
  const reviewBy = {};
  reviews.forEach(r => { reviewBy[reviewKey(r.kind, r.property_id, r.ref_id)] = r; });

  const pays = payments.map(p => {
    const prop = propBy[p.property_id] || {};
    const review = reviewBy[reviewKey('payment', p.property_id, p.month)] || null;
    return Object.assign({}, p, {
      propName: prop.name || '—',
      landlordId: prop.owner_id,
      landlord: nameOf(prop.owner_id),
      tenants: tenantsOf(p.property_id).map(m => m.display_name || nameOf(m.user_id)),
      review
    });
  }).sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(b.updated_at).localeCompare(String(a.updated_at)));

  const queue = reviews.map(r => {
    const prop = propBy[r.property_id] || {};
    return Object.assign({}, r, {
      propName: prop.name || '—',
      landlord: nameOf(prop.owner_id),
      uploaderName: r.uploader ? nameOf(r.uploader) : '—',
      uploaderRole: r.uploader && userBy[r.uploader] ? userBy[r.uploader].role : null
    });
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const landlords = users.filter(u => u.role === 'landlord').map(u => {
    const mine = props.filter(p => p.owner_id === u.id).map(p => ({
      id: p.id, name: p.name, addr: p.addr, rent: Number(p.rent) || 0, type: p.prop_type,
      tenants: tenantsOf(p.id).map(m => ({ id: m.user_id, name: m.display_name || nameOf(m.user_id), phone: m.phone, email: m.email })),
      invited: invites.filter(i => i.property_id === p.id && !i.accepted_by).map(i => ({ code: i.code, name: i.name, email: i.email, phone: i.phone }))
    }));
    return Object.assign({}, u, { props: mine, tenantCount: mine.reduce((n, p) => n + p.tenants.length, 0) });
  });

  const month = new Date().toISOString().slice(0, 7);
  const sum = list => list.reduce((n, p) => n + (Number(p.amount) || 0), 0);
  const stats = {
    landlords: users.filter(u => u.role === 'landlord').length,
    tenants: users.filter(u => u.role === 'tenant' && !u.is_admin).length,
    props: props.length,
    subscribed: users.filter(u => u.role === 'landlord' && u.subscribed).length,
    pending: queue.filter(r => r.status === 'pending').length,
    banned: users.filter(u => u.banned).length,
    approvedThisMonth: sum(pays.filter(p => p.month === month && p.status === 'approved')),
    reviewThisMonth: sum(pays.filter(p => p.month === month && (p.status === 'review' || p.status === 'partial'))),
    month
  };
  // Hiçbir mülke bağlı olmayan kiracılar (kayıt oldu, davet kodunu girmedi).
  const linked = new Set(members.map(m => m.user_id));
  const unlinked = users.filter(u => u.role === 'tenant' && !u.is_admin && !linked.has(u.id));
  return { users, landlords, unlinked, payments: pays, queue, stats };
}

