// app.json'a ek olarak:
// - GitHub Pages proje adresinde (…github.io/project_evim/) yayın için EXPO_BASE_URL=/project_evim verilir. Kendi alan
//   adında (anahtar.io) boş bırakılır.
// - Android anlık bildirimi (FCM) için Firebase dosyası: EAS'te "file" türünde GOOGLE_SERVICES_JSON ortam değişkeni ya da
//   app/google-services.json (depoya eklenmez). Dosya yoksa uygulama bildirimsiz derlenir.
// - iOS anlık bildirim ortamı (aps-environment): eas.json profilindeki EXPO_PUBLIC_APP_ENV 'development' değilse (preview = ad hoc,
//   production = App Store) APNs "production" olur; geliştirme istemcisi ve yerel derleme "development" kalır.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const gs = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : '');
  const apns = (process.env.EXPO_PUBLIC_APP_ENV || 'development') === 'development' ? 'development' : 'production';
  const plugins = (config.plugins || []).map((pl) => (Array.isArray(pl) && pl[0] === 'expo-notifications' ? [pl[0], { ...pl[1], mode: apns }] : pl));
  return {
    ...config,
    plugins,
    android: { ...config.android, ...(gs ? { googleServicesFile: gs } : {}) },
    experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) }
  };
};
