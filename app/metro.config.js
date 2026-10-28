// Web derlemesinde react-native-reanimated yerine hafif karşılığı (src/web/reanimated.tsx) kullanılır:
// ana sayfa ~650 KB daha az JavaScript indirir. iOS ve Android gerçek kütüphaneyi kullanır.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shim = path.resolve(__dirname, 'src/web/reanimated.tsx');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (platform === 'web' && name === 'react-native-reanimated') return { type: 'sourceFile', filePath: shim };
  return (upstream || context.resolveRequest)(context, name, platform);
};
module.exports = config;
