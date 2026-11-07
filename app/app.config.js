// app.json'a ek olarak:
// - GitHub Pages proje adresinde (…github.io/project_evim/) yayın için EXPO_BASE_URL=/project_evim verilir. Kendi alan
//   adında (anahtar.io) boş bırakılır.
// - Android anlık bildirimi (FCM) için Firebase dosyası: EAS'te "file" türünde GOOGLE_SERVICES_JSON ortam değişkeni ya da
//   app/google-services.json (depoya eklenmez). Dosya yoksa uygulama bildirimsiz derlenir.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const gs = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : '');
  return {
    ...config,
    android: { ...config.android, ...(gs ? { googleServicesFile: gs } : {}) },
    experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) }
  };
};
