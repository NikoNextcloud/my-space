// За синхронизация между компютър и телефон попълни тези данни от Supabase.
// Подробно: отвори файла SUPABASE-NASTROYKA-PODROBNO.md.
// Докато enabled е false, приложението работи само локално в текущия браузър.
window.DASHBOARD_SYNC_CONFIG = {
  enabled: false,
  supabaseUrl: '',
  // Тук може да сложиш новия Publishable key или стария anon public key.
  supabaseAnonKey: '',
  table: 'dashboard_links',
  profileId: 'my-space'
};
