/* Kiracım line-art simge seti (docs/marka-kimligi.md):
   24 px ızgara, 2 px çizgi, yuvarlak uçlar, köşe yarıçapı ~4 px.
   Çizgi 'currentColor', imza "halka nokta" {RING} (Kiremit) ile çizilir.
   Düz arayüz işaretleri (artı, çarpı, geri, gönder, ara, ayar, güneş, ay, bayrak, harita) halkasızdır. */

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const R = (cx, cy, r = 1.7) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="{RING}" stroke-width="2"/>`;
const svg = body => `<svg viewBox="0 0 24 24" ${S}>${body}</svg>`;

export const I = {
  home:     svg('<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>' + R(12, 14.2)),
  grid:     svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/>' + R(17, 17, 2.4)),
  card:     svg('<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18"/>' + R(16.5, 14.5, 1.5)),
  wrench:   svg('<path d="M4 9h9a3 3 0 0 1 3 3v2"/><path d="M8 9V5.5M5.5 5.5h5"/>' + R(16, 17.8, 1.7)),
  chat:     svg('<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-4.5 4v-4H7a3 3 0 0 1-3-3z"/>' + R(12, 10, 1.6)),
  doc:      svg('<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8.5 12.5h4"/>' + R(15.5, 17, 1.6)),
  chart:    svg('<path d="M4 18 9.5 12.5l3.5 3 3.2-4.2"/>' + R(18.6, 8, 1.9)),
  bell:     svg('<rect x="6.5" y="3" width="11" height="18" rx="3.5"/><path d="M10 17.3h4"/>' + R(12, 9.5, 2.2)),
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
  moon:     svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  flag:     svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="16" rx="3.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>' + R(14.5, 15.2, 1.7)),
  key:      svg('<path d="M10.7 12H21M17.5 12v3M21 12v2.5"/>' + R(7.2, 12, 3.4)),
  office:   svg('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2"/>' + R(12, 17.4, 1.6)),
  shop:     svg('<path d="M4 9.5 5.5 4h13L20 9.5a2.5 2.5 0 0 1-4 2 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4-2z"/><path d="M5.5 13v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6"/>' + R(12, 16.5, 1.6)),
  box:      svg('<path d="M4 8 12 4l8 4v8.5L12 20.5 4 16.5z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>' + R(16.2, 5.9, 1.3)),
  safe:     svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8 19.5v1.5M16 19.5v1.5"/>' + R(12, 12, 3)),
  meter:    svg('<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M8 17h8"/>' + R(15.2, 9.2, 1.6) + '<path d="M12 14.5l2.3-3.5"/>'),
  landlord: svg('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 11.5-4"/>' + R(18, 17, 2.2) + '<path d="M18 19.2v2"/>'),
  check:    svg('<circle cx="12" cy="12" r="9"/>' + R(7.2, 12.4, 1.2).replace('r="1.2"', 'r="1.2"') + '<path d="M10 12.5l2.2 2.2L16.5 10"/>')
};

/** Mülk tipinin ikonu. */
export const TYPE_ICON = { 'Konut':'home', 'Ofis':'office', 'Mağaza':'shop', 'Depo':'box' };

/** İkonu verilen boyutla döndürür. */
export function ic(k, s = 18){
  return (I[k] || I.bell).replace('<svg', '<svg width="'+s+'" height="'+s+'"');
}
