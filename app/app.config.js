// app.json'a ek olarak: GitHub Pages proje adresinde (…github.io/project_evim/) yayın için
// EXPO_BASE_URL=/project_evim verilir. Kendi alan adında (kiracim.online) boş bırakılır.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) }
});
