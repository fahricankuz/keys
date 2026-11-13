// Web derlemesinde react-native-reanimated yerine hafif karşılığı (src/web/reanimated.tsx) kullanılır:
// ana sayfa ~650 KB daha az JavaScript indirir. iOS ve Android gerçek kütüphaneyi kullanır.
// Sentry: paketlere hata ayıklama kimliği (debug ID) eklenir ki kaynak haritaları eşleşsin. Web'de @sentry/browser kullanıldığı
// için replay/geri bildirim kodu paketlenmez ve sürüm kodu eklenmez (sürüm src/domain/sentry.js'te EXPO_PUBLIC_SENTRY_RELEASE'ten gelir).
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname, { includeWebReplay: false, includeWebFeedback: false, injectReleaseForWeb: false });
const shim = path.resolve(__dirname, 'src/web/reanimated.tsx');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (platform === 'web' && name === 'react-native-reanimated') return { type: 'sourceFile', filePath: shim };
  return (upstream || context.resolveRequest)(context, name, platform);
};
module.exports = config;
