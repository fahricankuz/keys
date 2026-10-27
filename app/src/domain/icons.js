/* anahtar line-art simge seti (marka kiti v2; ev, anahtar, kira, takvim, sözleşme, depozito, bildirim, mesaj, arıza, profil kitten):
   24 px ızgara, 2 px çizgi, yuvarlak uçlar, köşe yarıçapı ~4 px.
   Çizgi 'currentColor', imza "halka nokta" {RING} (Kiremit) ile çizilir.
   Düz arayüz işaretleri (artı, çarpı, geri, gönder, ara, ayar, güneş, ay, bayrak, harita) halkasızdır. */

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const R = (cx, cy, r = 1.7) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="{RING}" stroke-width="2"/>`;
const svg = body => `<svg viewBox="0 0 24 24" ${S}>${body}</svg>`;

export const I = {
  home:     svg('<path d="M4 11 12 4l8 7v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle fill="{RING}" stroke="none" cx="12" cy="13" r="1.7"/><path fill="{RING}" stroke="none" d="M11 13.8 L10.6 16.6 H13.4 L13 13.8Z"/>'),
  grid:     svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/>' + R(17, 17, 2.4)),
  card:     svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle fill="{RING}" stroke="none" cx="16.5" cy="14.5" r="1.8"/>'),
  wrench:   svg('<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/><circle fill="{RING}" stroke="none" cx="18" cy="18" r="1.8"/>'),
  chat:     svg('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/><circle fill="{RING}" stroke="none" cx="12" cy="10.5" r="1.8"/>'),
  doc:      svg('<path d="M6 3h8l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 11h7M8 15h4"/><circle fill="{RING}" stroke="none" cx="16" cy="15.2" r="1.36"/><path fill="{RING}" stroke="none" d="M15.2 15.84 L14.88 18.08 H17.12 L16.8 15.84Z"/>'),
  chart:    svg('<path d="M4 18 9.5 12.5l3.5 3 3.2-4.2"/>' + R(18.6, 8, 1.9)),
  bell:     svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/><circle fill="{RING}" stroke="none" cx="17.5" cy="6" r="2.2"/>'),
  phone:    svg('<path d="M21 16.9v2.6a2 2 0 0 1-2.2 2A18.6 18.6 0 0 1 2.5 5.2 2 2 0 0 1 4.5 3h2.6a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 10.7a15 15 0 0 0 5.2 5.2l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>' + R(18, 6, 1.5)),
  plus:     svg('<path d="M12 5v14M5 12h14"/>'),
  cam:      svg('<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/>' + R(12, 13, 3.2)),
  back:     svg('<path d="M15 5l-7 7 7 7"/>'),
  gear:     svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
  x:        svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  send:     svg('<path d="M21 3 10 14M21 3l-6.5 18-4-7-7-4z"/>'),
  search:   svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  map:      svg('<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>'),
  sun:      svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>'),
  globe:    svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/>'),
  moon:     svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  flag:     svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><rect fill="{RING}" stroke="none" x="14" y="13.5" width="3.5" height="3.5" rx="1"/>'),
  key:      svg('<circle cx="8" cy="8" r="4.5"/><path d="M11.2 11.2 20 20M16.5 16.5l2-2M14 14l2-2"/><circle fill="{RING}" stroke="none" cx="8" cy="8" r="1.8"/>'),
  office:   svg('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2"/>' + R(12, 17.4, 1.6)),
  shop:     svg('<path d="M4 9.5 5.5 4h13L20 9.5a2.5 2.5 0 0 1-4 2 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4-2z"/><path d="M5.5 13v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6"/>' + R(12, 16.5, 1.6)),
  box:      svg('<path d="M4 8 12 4l8 4v8.5L12 20.5 4 16.5z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>' + R(16.2, 5.9, 1.3)),
  safe:     svg('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M7 19v2M17 19v2"/><circle fill="{RING}" stroke="none" cx="12" cy="10.5" r="1.7"/><path fill="{RING}" stroke="none" d="M11 11.3 L10.6 14.1 H13.4 L13 11.3Z"/>'),
  meter:    svg('<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M8 17h8"/>' + R(15.2, 9.2, 1.6) + '<path d="M12 14.5l2.3-3.5"/>'),
  landlord: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><circle fill="{RING}" stroke="none" cx="18.5" cy="5" r="1.8"/>'),
  check:    svg('<circle cx="12" cy="12" r="9"/>' + R(7.2, 12.4, 1.2).replace('r="1.2"', 'r="1.2"') + '<path d="M10 12.5l2.2 2.2L16.5 10"/>')
};

/** Mülk tipinin ikonu. */
export const TYPE_ICON = { 'Konut':'home', 'Ofis':'office', 'Mağaza':'shop', 'Depo':'box' };

/** İkonu verilen boyutla döndürür. */
export function ic(k, s = 18){
  return (I[k] || I.bell).replace('<svg', '<svg width="'+s+'" height="'+s+'"');
}
