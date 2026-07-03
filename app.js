const cards = document.querySelector('#cards');
const filters = document.querySelector('#filters');
const searchInput = document.querySelector('#searchInput');
const resultCount = document.querySelector('#resultCount');
const emptyState = document.querySelector('#emptyState');
const dialog = document.querySelector('#addDialog');
const addForm = document.querySelector('#addForm');
let activeCategory = 'Всички';

const storedLinks = () => {
  try { return JSON.parse(localStorage.getItem('my-space-links') || '[]'); }
  catch { return []; }
};
const allLinks = () => [...window.DASHBOARD_LINKS, ...storedLinks()];
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const openAddDialog = () => {
  dialog.showModal();
  requestAnimationFrame(() => addForm.elements.title.focus());
};

function renderFilters() {
  const categories = ['Всички', ...new Set(allLinks().map(item => item.category))];
  filters.innerHTML = categories.map(category => `<button type="button" class="filter ${category === activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase('bg');
  const visible = allLinks().filter(item => (activeCategory === 'Всички' || item.category === activeCategory) && `${item.title} ${item.description} ${item.category}`.toLocaleLowerCase('bg').includes(query));
  const linkCards = visible.map((item, index) => `
    <a class="card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="--delay:${index * 35}ms">
      <div class="card-top"><span class="app-icon ${escapeHtml(item.color || 'violet')}">${escapeHtml(item.icon || '↗')}</span><span class="arrow">↗</span></div>
      <div><span class="category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || 'Отвори приложението.')}</p></div>
    </a>`).join('');
  const addCard = !query && activeCategory === 'Всички' ? `
    <button class="card add-link-card" type="button" data-add-link style="--delay:${visible.length * 35}ms">
      <span class="add-card-icon">＋</span>
      <span><strong>Добави нов линк</strong><small>Запази още приложение или любим сайт</small></span>
    </button>` : '';
  cards.innerHTML = linkCards + addCard;
  resultCount.textContent = `${visible.length} ${visible.length === 1 ? 'приложение' : 'приложения'}`;
  emptyState.hidden = visible.length > 0;
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  activeCategory = button.dataset.category;
  renderFilters(); render();
});
cards.addEventListener('click', event => {
  if (event.target.closest('[data-add-link]')) openAddDialog();
});
searchInput.addEventListener('input', render);
document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== searchInput) { event.preventDefault(); searchInput.focus(); }
  if (event.key === 'Escape' && dialog.open) dialog.close();
});

document.querySelector('#openAddButton').addEventListener('click', openAddDialog);
['#closeDialogButton', '#cancelButton'].forEach(selector => document.querySelector(selector).addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
addForm.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(addForm);
  const custom = storedLinks();
  custom.push({ title: data.get('title'), url: data.get('url'), category: data.get('category'), description: data.get('description'), icon: '🔗', color: 'violet' });
  localStorage.setItem('my-space-links', JSON.stringify(custom));
  addForm.reset(); dialog.close(); activeCategory = 'Всички'; searchInput.value = ''; renderFilters(); render();
});

const themeButton = document.querySelector('#themeButton');
const savedTheme = localStorage.getItem('my-space-theme');
if (savedTheme === 'light') document.documentElement.classList.add('light');
themeButton.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  localStorage.setItem('my-space-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
});

renderFilters(); render();
