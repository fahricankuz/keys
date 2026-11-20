// Telefon düzeni: app/src/ui/layers.js kuralları, telefondaki düzen motoru Yoga ile (React Native'in varsayılan uyumluluk ayarı: Errata.All)
// denenir. Web testleri tarayıcının CSS motorunu kullandığı için bu hataları göremez. Her denemede eski kalıp da kurulur ve bozulduğu
// doğrulanır: Yoga ayarı telefondakiyle aynı değilse test bunu fark eder.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Yoga, { Align, Direction, Edge, Errata, FlexDirection, Gutter, MeasureMode, PositionType, Wrap } from 'yoga-layout';

const D = new URL('../app/src/ui/', import.meta.url).pathname;
let L;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'duzen-')), 'm.mjs');
  buildSync({ entryPoints: [D + 'layers.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  L = await import(pathToFileURL(out).href);
});

const CFG = Yoga.Config.create();
CFG.setErrata(Errata.All);   // React Native (Fabric) varsayılanı: YogaLayoutableShadowNode → YGErrataAll
const ALIGN = { 'flex-start': Align.FlexStart, center: Align.Center, 'flex-end': Align.FlexEnd, stretch: Align.Stretch, baseline: Align.Baseline };

/** React Native stil nesnesini Yoga düğümüne uygular (bu testte kullanılan özellikler). */
function node(style = {}, children = []) {
  const n = Yoga.Node.create(CFG);
  for (const [k, v] of Object.entries(style)) {
    if (k === 'flexDirection') n.setFlexDirection(v === 'row' ? FlexDirection.Row : FlexDirection.Column);
    else if (k === 'flexWrap') n.setFlexWrap(v === 'wrap' ? Wrap.Wrap : Wrap.NoWrap);
    else if (k === 'flex') n.setFlex(v);
    else if (k === 'flexGrow') n.setFlexGrow(v);
    else if (k === 'flexShrink') n.setFlexShrink(v);
    else if (k === 'flexBasis') n.setFlexBasis(v);
    else if (['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'].includes(k)) n['set' + k[0].toUpperCase() + k.slice(1)](v);
    else if (k === 'alignSelf') n.setAlignSelf(ALIGN[v]);
    else if (k === 'alignItems') n.setAlignItems(ALIGN[v]);
    else if (k === 'position') n.setPositionType(v === 'absolute' ? PositionType.Absolute : PositionType.Relative);
    else if (['top', 'left', 'right', 'bottom'].includes(k)) n.setPosition({ top: Edge.Top, left: Edge.Left, right: Edge.Right, bottom: Edge.Bottom }[k], v);
    else if (k === 'padding') n.setPadding(Edge.All, v);
    else if (k === 'paddingHorizontal') n.setPadding(Edge.Horizontal, v);
    else if (k === 'borderWidth') n.setBorder(Edge.All, v);
    else if (k === 'gap') n.setGap(Gutter.All, v);
  }
  children.forEach((c, i) => n.insertChild(c, i));
  return n;
}
/** Metin: 8.5 px karakter, 22 px satır (sarılan metin yaklaşığı). */
function text(s) {
  const n = Yoga.Node.create(CFG);
  n.setMeasureFunc((w, wm) => { const width = wm === MeasureMode.Undefined ? s.length * 8.5 : w; const per = Math.max(1, Math.floor(width / 8.5)); return { width: Math.min(width, s.length * 8.5), height: Math.ceil(s.length / per) * 22 }; });
  return n;
}
const box = (n) => { const l = n.getComputedLayout(); return { x: l.left, y: l.top, w: l.width, h: l.height }; };

/** PressScale kartı: dış (Pressable) + iç (görünüm) + içerik (Card: padding 20, kenarlık 1; başlık, açıklama, simge). */
function pressCard(layers, title, body) {
  const content = node({ flexDirection: 'row', alignItems: 'center', gap: 10 }, [node({ flex: 1 }, [text(title), text(body)]), node({ width: 22, height: 22 })]);
  return node(layers.outer, [node(layers.inner, [content])]);
}
const OLD = (flat) => { const { outer, inner } = L.pressLayers(flat); delete outer.flexDirection; const { flexGrow, flexShrink, ...rest } = inner; return { outer, inner: { alignSelf: 'stretch', flexGrow: 1, ...rest } }; };

/** Portföy: "Ekip ve işlem geçmişi" ve "Toplu içe aktar" kartları sarılan satırda (Row wrap), altında "Öncelikli işler" başlığı. */
function portfolio(width, layersOf) {
  const card = { flex: 1, minWidth: 240, padding: 20, borderWidth: 1, gap: 4 };
  const row = node({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, maxWidth: '100%', minWidth: 0 }, [
    pressCard(layersOf(card), 'Ekip ve işlem geçmişi', 'Emlakçı, muhasebeci ya da personel davet et; kimin neyi değiştirdiğini gör.'),
    pressCard(layersOf(card), 'Toplu içe aktar', 'Excel ya da CSV dosyasıyla mülklerini ve kiracılarını tek seferde ekle.')
  ]);
  const next = node({ height: 30 });
  const page = node({ width, paddingHorizontal: 20, gap: 14 }, [row, next]);
  page.calculateLayout(undefined, undefined, Direction.LTR);
  const cards = [0, 1].map((i) => box(row.getChild(i)));
  const natural = [0, 1].map((i) => box(row.getChild(i).getChild(0).getChild(0)).h + 2 * 21);   // içerik + iç boşluk + kenarlık
  return { cards, natural, rowY: box(row).y, next: box(next) };
}

test('sarılan satırdaki dokunulabilir kartlar telefonda üst üste binmez ve boşuna uzamaz (iPhone genişliği)', () => {
  const now = portfolio(390, L.pressLayers);
  // Alt alta: ikinci kart birincinin bittiği yerden sonra başlar, sonraki başlık ikinci kartın altında.
  expect(now.cards[1].y).toBeGreaterThanOrEqual(now.cards[0].y + now.cards[0].h);
  expect(now.next.y).toBeGreaterThanOrEqual(now.rowY + now.cards[1].y + now.cards[1].h);
  expect(now.cards.map((c) => c.h)).toEqual(now.natural);
  expect(now.cards.map((c) => c.w)).toEqual([350, 350]);
  // Eski kalıp (iç katman dikeyde büyür) aynı ayarla bozuk: ekran görüntüsündeki hata.
  const old = portfolio(390, OLD);
  expect(old.next.y).toBeLessThan(old.rowY + old.cards[1].y + old.cards[1].h);
});

test('geniş ekranda kartlar yan yana, eşit genişlikte (web/tablet düzeni değişmez)', () => {
  const now = portfolio(900, L.pressLayers);
  expect(now.cards[0].y).toBe(now.cards[1].y);
  expect(now.cards[0].w).toBe(now.cards[1].w);
  expect(now.cards[1].x).toBeGreaterThan(now.cards[0].x);
});

test('dış katmanı dolduran kart: genişlik ve yükseklik (sabit yükseklikli alanda flex:1) iç katmana geçer', () => {
  const tall = L.pressLayers({ flex: 1, padding: 10 });
  const col = node({ width: 300, height: 400 }, [pressCard(tall, 'A', 'B')]);
  col.calculateLayout(undefined, undefined, Direction.LTR);
  expect(box(col.getChild(0).getChild(0))).toMatchObject({ w: 300, h: 400 });
  const wide = L.pressLayers({ width: 200, padding: 10 });
  const holder = node({ width: 300 }, [pressCard(wide, 'A', 'B')]);
  holder.calculateLayout(undefined, undefined, Direction.LTR);
  expect(box(holder.getChild(0).getChild(0)).w).toBe(200);
  // Flex/genişlik almayan düğme kendi içeriği kadar kalır.
  expect(L.pressLayers({ padding: 10 }).outer).toEqual({});
});

test('koyu kartın deseni kartın tamamını kaplar (kenar boşluğuna göre küçülmez)', () => {
  const svg = node({ width: '100%', height: '100%' });
  const hero = node({ width: 350, padding: L.HERO_PAD }, [node(L.HERO_BG, [svg]), node({ height: 200 })]);
  hero.calculateLayout(undefined, undefined, Direction.LTR);
  expect(box(svg)).toMatchObject({ w: 350, h: 200 + 2 * L.HERO_PAD });
  // Eski kalıp: SVG'nin kendisi mutlak ve %100 → kenar boşluğu düşülmüş genişlik.
  const oldSvg = node({ ...L.HERO_BG, width: '100%', height: '100%' });
  const oldHero = node({ width: 350, padding: L.HERO_PAD }, [oldSvg, node({ height: 200 })]);
  oldHero.calculateLayout(undefined, undefined, Direction.LTR);
  expect(box(oldSvg).w).toBe(350 - 2 * L.HERO_PAD);
});
