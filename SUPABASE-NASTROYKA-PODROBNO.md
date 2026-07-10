# Подробна настройка на синхронизацията между компютър и телефон

Тази инструкция е за твоя `MY SPACE Dashboard`.

Идеята е проста:

- GitHub Pages показва сайта.
- Supabase пази списъка с линкове.
- Когато добавиш линк от компютъра, той се записва в Supabase.
- Когато отвориш сайта от телефона, телефонът чете същия списък от Supabase.

Това е нужно, защото GitHub Pages е статичен сайт. Той може да показва файлове, но не може сам да записва нови линкове от бутона „Добави линк“.

---

## Какво ще ти трябва

Ще ти трябват:

1. GitHub Pages сайтът, който вече имаш.
2. Безплатен Supabase акаунт.
3. Около 10 минути за първата настройка.

След това няма да го правиш пак. Само добавяш линкове от сайта.

---

## Стъпка 1: Създай Supabase акаунт

1. Отвори:

   https://supabase.com

2. Натисни `Start your project` или `Sign in`.
3. Влез с GitHub профила си или с email.

Ако те пита за организация/organization:

- избери съществуваща, ако имаш;
- или създай нова.

---

## Стъпка 2: Създай нов project

1. В Supabase натисни `New project`.
2. Попълни:

   - `Project name`: например `my-space-dashboard`
   - `Database Password`: сложи парола и си я запази някъде
   - `Region`: избери най-близкия регион, например Europe

3. Натисни `Create new project`.

Изчакай няколко минути. Supabase ще създаде базата.

---

## Стъпка 3: Създай таблицата за линковете

1. В Supabase проекта отвори менюто вляво.
2. Натисни `SQL Editor`.
3. Натисни `New query`.
4. Изтрий всичко в полето, ако има нещо.
5. Копирай този код:

```sql
create table if not exists dashboard_links (
  profile_id text primary key,
  links jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard_links enable row level security;

drop policy if exists "dashboard read" on dashboard_links;
drop policy if exists "dashboard insert" on dashboard_links;
drop policy if exists "dashboard update" on dashboard_links;

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

6. Постави го в SQL Editor.
7. Натисни `Run`.

Ако всичко е наред, няма да има червена грешка.

---

## Стъпка 4: Вземи Project URL

1. В Supabase отвори `Project Settings`.
2. Отвори секцията `API` или `API Keys`.
3. Намери `Project URL`.
4. Копирай го.

Изглежда горе-долу така:

```txt
https://xxxxxxxxxxxxxxxxxxxx.supabase.co
```

Това е първата стойност, която ти трябва.

---

## Стъпка 5: Вземи публичния ключ

Пак в `Project Settings` → `API` / `API Keys`:

Търси един от тези варианти:

- `Publishable key`
- или `anon public`
- или `anon key`

Копирай публичния ключ.

Важно:

- Може да използваш `Publishable key`, ако Supabase ти го показва.
- Ако виждаш само стария `anon public` key, може да използваш него.
- Не използвай `secret key`.
- Не използвай `service_role`.

Публичният ключ е нормално да стои в GitHub Pages сайт. Тайният ключ не е.

---

## Стъпка 6: Отвори файла sync-config.js

В твоя проект отвори файла:

```txt
sync-config.js
```

В момента той изглежда така:

```js
window.DASHBOARD_SYNC_CONFIG = {
  enabled: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  table: 'dashboard_links',
  profileId: 'my-space'
};
```

---

## Стъпка 7: Попълни настройките

Промени го така:

```js
window.DASHBOARD_SYNC_CONFIG = {
  enabled: true,
  supabaseUrl: 'ТУК_СЛОЖИ_PROJECT_URL',
  supabaseAnonKey: 'ТУК_СЛОЖИ_PUBLIC_KEY',
  table: 'dashboard_links',
  profileId: 'my-space'
};
```

Пример:

```js
window.DASHBOARD_SYNC_CONFIG = {
  enabled: true,
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabaseAnonKey: 'sb_publishable_XXXXXXXXXXXXXXXXXXXXXXXX',
  table: 'dashboard_links',
  profileId: 'my-space'
};
```

Ако ключът ти е стар `anon public`, примерът може да изглежда така:

```js
window.DASHBOARD_SYNC_CONFIG = {
  enabled: true,
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  table: 'dashboard_links',
  profileId: 'my-space'
};
```

Запази файла.

---

## Стъпка 8: Качи файловете в GitHub

Качи обновените файлове в GitHub repository-то:

- `index.html`
- `app.js`
- `styles.css`
- `links.js`
- `sync-config.js`
- папката `assets`
- този файл с инструкцията, ако искаш да си го пазиш

Ако качваш ZIP:

1. Разархивирай ZIP файла.
2. Качи съдържанието вътре в repository-то.
3. Важно: `index.html` трябва да е в главната папка на repository-то, не в допълнителна подпапка.

---

## Стъпка 9: Провери дали работи на компютъра

1. Отвори GitHub Pages адреса на dashboard-а.
2. Горе трябва да видиш статус.
3. Ако всичко е наред, статусът ще стане:

```txt
Синхронизирано
```

или:

```txt
Запазено в облака
```

4. Натисни `Добави линк`.
5. Добави тестов линк, например:

   - Име: `Test`
   - Адрес: `https://google.com`
   - Категория: `Други`

6. Натисни `Запази`.

Ако статусът стане `Запазено в облака`, значи компютърът вече записва онлайн.

---

## Стъпка 10: Провери от телефона

1. Отвори същия GitHub Pages адрес от телефона.
2. Изчакай 1-2 секунди.
3. Ако не виждаш новия линк, презареди страницата.

На телефона трябва да се появи същият линк.

---

## Как да разбереш какъв режим работи

Горе в сайта има малък статус:

### `Локален режим`

Supabase не е включен.

Причини:

- в `sync-config.js` още пише `enabled: false`;
- липсват `supabaseUrl` или `supabaseAnonKey`;
- файлът `sync-config.js` не е качен.

### `Синхронизирано`

Всичко е наред. Сайтът чете от Supabase.

### `Запазване...`

В момента записва промяната.

### `Запазено в облака`

Промяната е записана онлайн. Телефонът ще я види след refresh.

### `Офлайн копие` или `Пази се само тук`

Сайтът не е успял да се свърже със Supabase.

Причини:

- грешен Project URL;
- грешен key;
- няма интернет;
- Supabase таблицата не е създадена;
- policies не са създадени;
- GitHub Pages още не е обновил последните файлове.

---

## Най-чести грешки

### 1. На компютъра се добавя, но на телефона не се вижда

Провери:

- дали в `sync-config.js` пише `enabled: true`;
- дали си качил `sync-config.js` в GitHub;
- дали телефонът отваря GitHub Pages адреса, а не стар локален адрес;
- дали си презаредил страницата на телефона.

---

### 2. Горе пише `Локален режим`

Това значи, че облакът не е включен.

Провери файла `sync-config.js`.

Трябва да е така:

```js
enabled: true
```

Не така:

```js
enabled: false
```

---

### 3. Горе пише `Облакът не е достъпен`

Най-често това е интернет/зареждане на Supabase библиотеката.

Провери:

- имаш ли интернет;
- сайтът отваря ли се през `https://`;
- не блокира ли браузърът външни скриптове.

---

### 4. Горе пише `Пази се само тук`

Това значи: сайтът е запазил линка само в текущия браузър, но не е успял да го запише в Supabase.

Провери:

- SQL кодът изпълнен ли е;
- таблицата `dashboard_links` съществува ли;
- policies създадени ли са;
- Project URL правилен ли е;
- public key правилен ли е.

---

### 5. В Supabase има `secret key` и `publishable key` — кой да взема?

Вземи:

```txt
Publishable key
```

или ако няма такъв:

```txt
anon public
```

Не вземай:

```txt
secret key
service_role
```

---

## Важна забележка за сигурност

Тази настройка е удобна за личен dashboard с линкове.

Не слагай вътре:

- пароли;
- API ключове;
- лични токени;
- банкови данни;
- тайни служебни адреси.

Причината е, че GitHub Pages е публичен сайт. Публичният Supabase ключ е нормален за такъв сайт, но самият dashboard не трябва да се използва като сейф за тайни.

---

## Ако искаш да имаш различни списъци

В `sync-config.js` има това:

```js
profileId: 'my-space'
```

Ако някой ден искаш втори отделен dashboard, можеш да смениш името, например:

```js
profileId: 'work-links'
```

Тогава Supabase ще пази отделен списък.

За твоя случай остави:

```js
profileId: 'my-space'
```

---

## Най-кратката версия

Ако вече знаеш какво правиш, стъпките са:

1. Създай Supabase project.
2. SQL Editor → Run този SQL:

```sql
create table if not exists dashboard_links (
  profile_id text primary key,
  links jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard_links enable row level security;

drop policy if exists "dashboard read" on dashboard_links;
drop policy if exists "dashboard insert" on dashboard_links;
drop policy if exists "dashboard update" on dashboard_links;

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

3. Вземи Project URL.
4. Вземи Publishable key или anon public key.
5. Попълни `sync-config.js`.
6. Качи файловете в GitHub.
7. Отвори сайта на компютър и телефон.

Готово.
