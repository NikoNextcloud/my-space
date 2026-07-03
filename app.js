const cards = document.querySelector('#cards');
const filters = document.querySelector('#filters');
const searchInput = document.querySelector('#searchInput');
const resultCount = document.querySelector('#resultCount');
const emptyState = document.querySelector('#emptyState');
const dialog = document.querySelector('#addDialog');
const addForm = document.querySelector('#addForm');
const deleteButton = document.querySelector('#deleteButton');
const storageKey = 'my-space-links-v2';
let activeCategory = 'Всички';

const makeId = () => globalThis.crypto?.randomUUID?.() || `link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function initialLinks() {
  const defaults = window.DASHBOARD_LINKS.map((item, index) => ({ ...item, id: `default-${index}` }));
  try {
    const previousCustom = JSON.parse(localStorage.getItem('my-space-links') || '[]');
    return [...defaults, ...previousCustom.map(item => ({ ...item, id: makeId() }))];
  } catch { return defaults; }
}

function loadLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch {}
  const links = initialLinks();
  localStorage.setItem(storageKey, JSON.stringify(links));
  return links;
}

let links = loadLinks();
const saveLinks = () => localStorage.setItem(storageKey, JSON.stringify(links));

function renderFilters() {
  const categories = ['Всички', ...new Set(links.map(item => item.category))];
  if (!categories.includes(activeCategory)) activeCategory = 'Всички';
  filters.innerHTML = categories.map(category => `<button type="button" class="filter ${category === activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('bg');
  const visible = links.filter(item => (activeCategory === 'Всички' || item.category === activeCategory) && `${item.title} ${item.description || ''} ${item.category}`.toLocaleLowerCase('bg').includes(query));
  const linkCards = visible.map((item, index) => `
    <article class="card app-card" style="--delay:${index * 35}ms">
      <div class="card-top">
        <span class="app-icon ${escapeHtml(item.color || 'violet')}">${escapeHtml(item.icon || '🔗')}</span>
        <button class="edit-card-button" type="button" data-edit-id="${escapeHtml(item.id)}" aria-label="Редактирай ${escapeHtml(item.title)}" title="Редактирай">✎</button>
      </div>
      <a class="card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Отвори ${escapeHtml(item.title)}">
        <span class="category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || 'Отвори приложението.')}</p><span class="arrow">↗</span>
      </a>
    </article>`).join('');
  const addCard = !query && activeCategory === 'Всички' ? `
    <button class="card add-link-card" type="button" data-add-link style="--delay:${visible.length * 35}ms">
      <span class="add-card-icon">＋</span><span><strong>Добави нов линк</strong><small>Запази още приложение или любим сайт</small></span>
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
  addForm.elements.title.value = item.title;
  addForm.elements.url.value = item.url;
  addForm.elements.category.value = item.category;
  addForm.elements.description.value = item.description || '';
  document.querySelector('#dialogEyebrow').textContent = 'РЕДАКТИРАНЕ';
  document.querySelector('#dialogTitle').textContent = item.title;
  deleteButton.hidden = false;
  dialog.showModal();
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  renderFilters(); render();
});
cards.addEventListener('click', event => {
  const add = event.target.closest('[data-add-link]');
  const edit = event.target.closest('[data-edit-id]');
  if (add) openAddDialog();
  if (edit) openEditDialog(edit.dataset.editId);
});
searchInput.addEventListener('input', render);
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== searchInput && !dialog.open) { event.preventDefault(); searchInput.focus(); }
  if (event.key === 'Escape' && dialog.open) dialog.close();
});

document.querySelector('#openAddButton').addEventListener('click', openAddDialog);
['#closeDialogButton', '#cancelButton'].forEach(selector => document.querySelector(selector).addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
addForm.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(addForm);
  const id = String(data.get('id') || '');
  const current = links.find(item => item.id === id);
  const updated = { id: id || makeId(), title: data.get('title'), url: data.get('url'), category: data.get('category'), description: data.get('description'), icon: current?.icon || '🔗', color: current?.color || 'violet' };
  links = current ? links.map(item => item.id === id ? updated : item) : [...links, updated];
  saveLinks(); addForm.reset(); dialog.close(); activeCategory = 'Всички'; searchInput.value = ''; renderFilters(); render();
});
deleteButton.addEventListener('click', () => {
  const id = addForm.elements.id.value;
  const item = links.find(link => link.id === id);
  if (!item || !window.confirm(`Да изтрия ли „${item.title}“?`)) return;
  links = links.filter(link => link.id !== id);
  saveLinks(); dialog.close(); renderFilters(); render();
});

const themeButton = document.querySelector('#themeButton');
if (localStorage.getItem('my-space-theme') === 'light') document.documentElement.classList.add('light');
themeButton.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  localStorage.setItem('my-space-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
});

renderFilters(); render();
