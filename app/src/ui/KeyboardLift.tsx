/* Klavye açılınca içeriği klavyenin üstüne iter (iPhone). KeyboardAvoidingView ekranın tepesinden uzaklığı bilmez: yalnız kendi üst
   kabına göre ölçer. Ekranın ortasında başlayan bir alanda (ör. üstte başlık ve sekmeler olan sohbet) bu yüzden klavye altında kalırdı;
   burada alanın pencere içindeki gerçek konumu ölçülür ve keyboardVerticalOffset'e verilir. Web ve Android'de eskisi gibi çalışır. */
import { ElementRef, ReactNode, useRef, useState } from 'react';
import { KeyboardAvoidingView, LayoutChangeEvent, Platform, StyleProp, View, ViewStyle } from 'react-native';

export function KeyboardLift({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  // Alanın sol üst köşesinde duran 0x0 işaretçi: pencere içindeki üst konumu ondan ölçülür.
  const probe = useRef<ElementRef<typeof View>>(null);
  const [offset, setOffset] = useState(0);
  if (Platform.OS !== 'ios') return <KeyboardAvoidingView style={style}>{children}</KeyboardAvoidingView>;
  const onLayout = (e: LayoutChangeEvent) => {
    // Pencere içindeki üst konum eksi üst kabına göre konum: KeyboardAvoidingView kendi yerleşim konumunu ekler, toplam ekran konumu olur.
    const own = e.nativeEvent.layout.y;
    probe.current?.measureInWindow((_x: number, y: number) => setOffset((o) => (Math.abs(o - (y - own)) < 0.5 ? o : y - own)));
  };
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset} onLayout={onLayout} style={style}>
      <View ref={probe} collapsable={false} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }} />
      {children}
    </KeyboardAvoidingView>
  );
}
