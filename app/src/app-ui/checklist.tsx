/* Kurulum kontrol listesi kartı: yarım kalan adımlar, ilerleme çubuğu, adıma dokununca ilgili ekran.
   Hepsi bitince ya da "Gizle" ile kaybolur (S.settings[hideKey]). Adımlar domain/checklist.js'te hesaplanır. */
import { useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { S } from '../domain/state';
import { act } from '../domain/services';
import { progressOf } from '../domain/checklist';
import { Button, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Bar, Card, H2, Muted, Row } from './blocks';
import { useStore } from './hooks';

export type Step = { key: string; label: string; done: boolean; hint?: string; progress?: number; act?: any };

export function SetupChecklist({ steps, hideKey, onAct, title }: { steps: Step[]; hideKey: string; onAct: (a: any) => void; title?: string }) {
  useStore();
  const c = useColors();
  const { done, total } = progressOf(steps);
  const [all, setAll] = useState(false);   // tamamlanan adımlar kapalı gelir; "tamamlananları göster" ile açılır
  if (!total || done === total || (S as any).settings?.[hideKey]) return null;
  const shown = all ? steps : steps.filter((x) => !x.done);
  return (
    <Card gap={12} style={{ borderWidth: 1.5, borderColor: c.accentSoft }}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
          <H2>{title || t('Kurulumu tamamla')}</H2>
          <Muted>{t('{a}/{b} adım tamam', { a: done, b: total })}</Muted>
        </View>
        <Button kind="quiet" title={t('Gizle')} onPress={() => act('setSetting', { k: hideKey, v: true, bool: true })} />
      </Row>
      <Bar pct={(done / total) * 100} />
      <View style={{ gap: 2 }}>
        {shown.map((s) => {
          const row = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: s.done ? c.okBg : 'transparent', borderWidth: s.done ? 0 : 1.5, borderColor: c.line }}>
                {s.done ? <Text v="small" color={c.okInk} style={{ fontFamily: fonts.bodyXBold, lineHeight: 16 }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text v="small" color={s.done ? c.muted : c.ink} style={{ fontFamily: s.done ? fonts.body : fonts.bodyBold, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.label}</Text>
                {!s.done && s.progress ? <Muted>{t('%{n} tamam', { n: Math.round(s.progress * 100) })}</Muted> : null}
                {!s.done && s.hint ? <Muted>{s.hint}</Muted> : null}
              </View>
              {!s.done && s.act ? <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{t('Yap')} ›</Text> : null}
            </View>
          );
          return !s.done && s.act
            ? <PressScale key={s.key} onPress={() => onAct(s.act)} accessibilityRole="button" accessibilityLabel={s.label} scaleTo={0.99} style={{ borderRadius: radius.sm }}>{row}</PressScale>
            : <View key={s.key}>{row}</View>;
        })}
      </View>
      {done ? (
        <PressScale onPress={() => setAll(!all)} accessibilityRole="button" accessibilityState={{ expanded: all }} scaleTo={0.99} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text v="small" color={c.muted} style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{all ? t('Tamamlananları gizle') : t('Tamamlanan {n} adımı göster', { n: done })}</Text>
        </PressScale>
      ) : null}
    </Card>
  );
}
