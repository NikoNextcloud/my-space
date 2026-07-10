// За синхронизация между компютър и телефон попълни тези данни от Supabase.
// Докато enabled е false, приложението работи само локално в текущия браузър.
window.DASHBOARD_SYNC_CONFIG = {
  enabled: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  table: 'dashboard_links',
  profileId: 'my-space'
};
