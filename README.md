# MY SPACE Dashboard

Статично уеб приложение, готово за GitHub Pages.

## Качване в GitHub Pages

1. Създай ново repository в GitHub.
2. Качи съдържанието на тази папка в основната директория.
3. Отвори `Settings` → `Pages`.
4. Избери `Deploy from a branch`, branch `main` и папка `/ (root)`.

## Добавяне, редакция и триене

Използвай „Добави линк“ за нов адрес. Бутонът с молив върху всяка карта позволява редактиране и изтриване.

## Синхронизация между компютър и телефон

GitHub Pages не може сам да записва промени, затова за синхронизация е добавена опция със Supabase.

1. Отвори https://supabase.com и създай безплатен project.
2. В `SQL Editor` изпълни:

```sql
create table if not exists dashboard_links (
  profile_id text primary key,
  links jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard_links enable row level security;

create policy "dashboard read"
on dashboard_links for select
using (true);

create policy "dashboard insert"
on dashboard_links for insert
with check (true);

create policy "dashboard update"
on dashboard_links for update
using (true)
with check (true);
```

3. В Supabase отвори `Project Settings` → `API`.
4. Копирай `Project URL` и `anon public` key.
5. Отвори `sync-config.js` и попълни:

```js
window.DASHBOARD_SYNC_CONFIG = {
  enabled: true,
  supabaseUrl: 'ТУК_PROJECT_URL',
  supabaseAnonKey: 'ТУК_ANON_PUBLIC_KEY',
  table: 'dashboard_links',
  profileId: 'my-space'
};
```

След това качи обновените файлове в GitHub. Когато добавиш линк от компютъра, той ще се появява и на телефона след презареждане на страницата.

Важно: не записвай пароли, лични токени или тайни адреси като линкове. Тази настройка е удобна за личен dashboard, но публичният GitHub Pages сайт не е сейф за тайни.

`dashboard-icon-3.png` е зададена като лого, favicon и иконка за пряк път на сайта.
