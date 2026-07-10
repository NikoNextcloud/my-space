const cards = document.querySelector('#cards');
const filters = document.querySelector('#filters');
const searchInput = document.querySelector('#searchInput');
const resultCount = document.querySelector('#resultCount');
const emptyState = document.querySelector('#emptyState');
const dialog = document.querySelector('#addDialog');
const addForm = document.querySelector('#addForm');
const deleteButton = document.querySelector('#deleteButton');
const syncStatus = document.querySelector('#syncStatus');

const storageKey = 'my-space-links-v2';
const oldStorageKey = 'my-space-links';
const themeKey = 'my-space-theme';
const allCategory = 'Всички';
let activeCategory = allCategory;
let links = [];
let syncAdapter = null;
let syncTimer = null;
let isSaving = false;

const makeId = () => globalThis.crypto?.randomUUID?.() || `link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const normalizeUrl = value => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

function setStatus(text, state = 'idle') {
  if (!syncStatus) return;
  syncStatus.textContent = text;
  syncStatus.dataset.state = state;
}

function initialLinks() {
  const defaults = (window.DASHBOARD_LINKS || []).map((item, index) => ({ ...item, id: item.id || `default-${index}` }));
  try {
    const previousCustom = JSON.parse(localStorage.getItem(oldStorageKey) || '[]');
    return [...defaults, ...previousCustom.map(item => ({ ...item, id: item.id || makeId() }))];
  } catch {
    return defaults;
  }
}

function loadLocalLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch {}
  const seeded = initialLinks();
  saveLocalLinks(seeded);
  return seeded;
}

function saveLocalLinks(nextLinks = links) {
  localStorage.setItem(storageKey, JSON.stringify(nextLinks));
}

function getSyncConfig() {
  const config = window.DASHBOARD_SYNC_CONFIG || {};
  const enabled = Boolean(config.enabled && config.supabaseUrl && config.supabaseAnonKey && config.table && config.profileId);
  return { ...config, enabled };
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (window.supabase?.createClient) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function createSupabaseSync() {
  const config = getSyncConfig();
  if (!config.enabled) {
    setStatus('Локален режим', 'local');
    return null;
  }

  if (!window.supabase?.createClient) {
    try {
      setStatus('Зареждане на облака...', 'syncing');
      await loadExternalScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    } catch (error) {
      console.warn('Supabase script load failed:', error);
      setStatus('Облакът не е достъпен', 'error');
      return null;
    }
  }

  if (!window.supabase?.createClient) {
    setStatus('Облакът не е зареден', 'error');
    return null;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const table = config.table;
  const profileId = config.profileId;

  return {
    async load() {
      setStatus('Синхронизиране...', 'syncing');
      const { data, error } = await client
        .from(table)
        .select('links')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (error) throw error;
      if (Array.isArray(data?.links)) return data.links;

      const localSeed = loadLocalLinks();
      await this.save(localSeed);
      return localSeed;
    },
    async save(nextLinks) {
      const payload = {
        profile_id: profileId,
        links: nextLinks,
        updated_at: new Date().toISOString()
      };
      const { error } = await client
        .from(table)
        .upsert(payload, { onConflict: 'profile_id' });
      if (error) throw error;
      setStatus('Запазено в облака', 'online');
    }
  };
}

async function loadLinks() {
  syncAdapter = await createSupabaseSync();
  const localLinks = loadLocalLinks();

  if (!syncAdapter) return localLinks;

  try {
    const remoteLinks = await syncAdapter.load();
    saveLocalLinks(remoteLinks);
    setStatus('Синхронизирано', 'online');
    return remoteLinks;
  } catch (error) {
    console.warn('Sync load failed:', error);
    setStatus('Офлайн копие', 'error');
    return localLinks;
  }
}

async function saveLinks({ immediate = false } = {}) {
  saveLocalLinks(links);
  if (!syncAdapter) return;

  clearTimeout(syncTimer);
  const run = async () => {
    if (isSaving) return;
    isSaving = true;
    try {
      setStatus('Запазване...', 'syncing');
      await syncAdapter.save(links);
    } catch (error) {
      console.warn('Sync save failed:', error);
      setStatus('Пази се само тук', 'error');
    } finally {
      isSaving = false;
    }
  };

  if (immediate) {
    await run();
  } else {
    syncTimer = setTimeout(run, 350);
  }
}

function renderFilters() {
  const categories = [allCategory, ...new Set(links.map(item => item.category).filter(Boolean))];
  if (!categories.includes(activeCategory)) activeCategory = allCategory;
  filters.innerHTML = categories
    .map(category => `<button type="button" class="filter ${category === activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
    .join('');
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('bg');
  const visible = links.filter(item => {
    const haystack = `${item.title || ''} ${item.description || ''} ${item.category || ''}`.toLocaleLowerCase('bg');
    return (activeCategory === allCategory || item.category === activeCategory) && haystack.includes(query);
  });

  const linkCards = visible.map((item, index) => `
    <article class="card app-card" style="--delay:${index * 35}ms">
      <div class="card-top">
        <span class="app-icon ${escapeHtml(item.color || 'violet')}">${escapeHtml(item.icon || '🔗')}</span>
        <button class="edit-card-button" type="button" data-edit-id="${escapeHtml(item.id)}" aria-label="Редактирай ${escapeHtml(item.title)}" title="Редактирай">✎</button>
      </div>
      <a class="card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Отвори ${escapeHtml(item.title)}">
        <span class="category">${escapeHtml(item.category || 'Други')}</span>
        <h3>${escapeHtml(item.title || 'Линк')}</h3>
        <p>${escapeHtml(item.description || 'Отвори приложението.')}</p>
        <span class="arrow">↗</span>
      </a>
    </article>`).join('');

  const addCard = !query && activeCategory === allCategory ? `
    <button class="card add-link-card" type="button" data-add-link style="--delay:${visible.length * 35}ms">
      <span class="add-card-icon">＋</span>
      <span><strong>Добави нов линк</strong><small>Ще се появи и на другите ти устройства при включен облак</small></span>
    </button>` : '';

  cards.innerHTML = linkCards + addCard;
  resultCount.textContent = `${visible.length} ${visible.length === 1 ? 'приложение' : 'приложения'}`;
  emptyState.hidden = visible.length > 0;
}

function openAddDialog() {
  addForm.reset();
  addForm.elements.id.value = '';
  document.querySelector('#dialogEyebrow').textContent = 'НОВ ПРЯК ПЪТ';
  document.querySelector('#dialogTitle').textContent = 'Добави линк';
  deleteButton.hidden = true;
  dialog.showModal();
  requestAnimationFrame(() => addForm.elements.title.focus());
}

function openEditDialog(id) {
  const item = links.find(link => link.id === id);
  if (!item) return;
  addForm.elements.id.value = item.id;
  addForm.elements.title.value = item.title || '';
  addForm.elements.url.value = item.url || '';
  addForm.elements.category.value = item.category || 'Други';
  addForm.elements.description.value = item.description || '';
  document.querySelector('#dialogEyebrow').textContent = 'РЕДАКТИРАНЕ';
  document.querySelector('#dialogTitle').textContent = item.title || 'Линк';
  deleteButton.hidden = false;
  dialog.showModal();
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  renderFilters();
  render();
});

cards.addEventListener('click', event => {
  const add = event.target.closest('[data-add-link]');
  const edit = event.target.closest('[data-edit-id]');
  if (add) openAddDialog();
  if (edit) openEditDialog(edit.dataset.editId);
});

searchInput.addEventListener('input', render);
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== searchInput && !dialog.open) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && dialog.open) dialog.close();
});

document.querySelector('#openAddButton').addEventListener('click', openAddDialog);
['#closeDialogButton', '#cancelButton'].forEach(selector => document.querySelector(selector).addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

addForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(addForm);
  const id = String(data.get('id') || '');
  const current = links.find(item => item.id === id);
  const updated = {
    id: id || makeId(),
    title: String(data.get('title') || '').trim(),
    url: normalizeUrl(data.get('url')),
    category: String(data.get('category') || 'Други'),
    description: String(data.get('description') || '').trim(),
    icon: current?.icon || '🔗',
    color: current?.color || 'violet'
  };

  links = current ? links.map(item => item.id === id ? updated : item) : [...links, updated];
  await saveLinks({ immediate: true });
  addForm.reset();
  dialog.close();
  activeCategory = allCategory;
  searchInput.value = '';
  renderFilters();
  render();
});

deleteButton.addEventListener('click', async () => {
  const id = addForm.elements.id.value;
  const item = links.find(link => link.id === id);
  if (!item || !window.confirm(`Да изтрия ли „${item.title}“?`)) return;
  links = links.filter(link => link.id !== id);
  await saveLinks({ immediate: true });
  dialog.close();
  renderFilters();
  render();
});

const themeButton = document.querySelector('#themeButton');
if (localStorage.getItem(themeKey) === 'light') document.documentElement.classList.add('light');
themeButton.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  localStorage.setItem(themeKey, document.documentElement.classList.contains('light') ? 'light' : 'dark');
});

(async function init() {
  links = await loadLinks();
  renderFilters();
  render();
})();
