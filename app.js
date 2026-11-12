import { projects, emptyDocument } from "./projects.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const uid = () => crypto.randomUUID(),
  statusNames = {
    active: "В развитие",
    review: "За преглед",
    blocked: "Блокиран",
    paused: "На пауза",
    unlinked: "За свързване",
    linked: "Уеб приложение",
    attention: "Има проблем",
  },
  recordStates = {
    open: "Отворен",
    progress: "В работа",
    blocked: "Блокиран",
    done: "Завършен",
  };
const docs = {},
  revisions = {},
  live = {},
  reviews = {};
let persistent = false,
  storageReady = false,
  storageBlocked = false,
  tab = "summary",
  prFilter = "open",
  prPage = 1,
  loading = false,
  compare = null;
const date = (value, withTime = false) =>
  value && !isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("bg-BG", {
        timeZone: "Europe/Sofia",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(value))
    : "—";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
};
const link = (url, text, cls = "") =>
  url
    ? `<a class="${cls}" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`
    : "";
const toast = (text) => {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 4500);
};
function current() {
  const [view, id] = location.hash.slice(1).split("/");
  return { view: view || "overview", id };
}
function projectData(p) {
  return { ...p, ...docs[p.id]?.links };
}
function source(p, key) {
  return live[p.id]?.[key];
}
function sourceData(p, key) {
  return source(p, key)?.data;
}
function state(p) {
  if (!projectData(p).repo) return projectData(p).site ? "linked" : "unlinked";
  const runs = currentRuns(p);
  if (
    runs.some((r) =>
      ["failure", "timed_out", "action_required"].includes(r.conclusion),
    )
  )
    return "attention";
  return docs[p.id]?.status || "active";
}
function badge(status, text) {
  return `<span class="badge ${["blocked", "attention", "failure", "error"].includes(status) ? "red" : ["unlinked", "paused", "unknown", "closed"].includes(status) ? "gray" : status === "review" ? "purple" : ["pending", "progress"].includes(status) ? "amber" : ""}">${esc(text || statusNames[status] || status)}</span>`;
}
function getProjects() {
  const q = $("#search").value.trim().toLocaleLowerCase("bg");
  return projects.filter(
    (p) =>
      ($("#projectFilter").value === "all" ||
        p.id === $("#projectFilter").value) &&
      ($("#statusFilter").value === "all" ||
        state(p) === $("#statusFilter").value) &&
      (!q ||
        `${p.name} ${(p.aliases || []).join(" ")} ${p.description} ${["tasks", "notes", "decisions"].flatMap((k) => (docs[p.id]?.[k] || []).map((r) => r.title + " " + r.body)).join(" ")}`
          .toLocaleLowerCase("bg")
          .includes(q)),
  );
}
function pendingTasks(ps = projects) {
  return ps.flatMap((p) =>
    (docs[p.id]?.tasks || [])
      .filter((t) => t.state !== "done")
      .map((t) => ({ ...t, project: p })),
  );
}
function reviewPRs(ps = projects) {
  return ps.flatMap((p) =>
    (sourceData(p, "pulls") || [])
      .filter((r) => r.state === "open")
      .map((r) => ({ ...r, project: p })),
  );
}
function renderNav() {
  const route = current();
  const moreOpen =
    $("#moreProjects")?.open ||
    projects.slice(6).some((p) => p.id === route.id);
  const navItem = (p) =>
    `<a href="#project/${p.id}" class="${route.id === p.id ? "active" : ""}"><span class="project-dot" style="background:${p.color}"></span>${esc(p.name)}</a>`;
  $("#projectNav").innerHTML =
    projects.slice(0, 6).map(navItem).join("") +
    `<details id="moreProjects" ${moreOpen ? "open" : ""}><summary>Още приложения (${projects.length - 6})</summary>${projects.slice(6).map(navItem).join("")}</details>`;
  $("#projectCount").textContent = projects.length;
  document
    .querySelectorAll("[data-view]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.view === route.view),
    );
  $("#todayCount").textContent = pendingTasks().filter(
    (t) => t.due && t.due <= today(),
  ).length;
}
function renderMetrics(ps) {
  const prs = reviewPRs(ps),
    runs = ps.flatMap((p) => currentRuns(p)),
    bad = runs.filter((r) =>
      ["failure", "timed_out", "action_required"].includes(r.conclusion),
    ),
    read = ps.filter((p) => sourceData(p, "pulls")).length;
  $("#metrics").innerHTML = [
    [
      "Приложения и проекти",
      String(ps.length).padStart(2, "0"),
      "Цялата колекция. Един работен център.",
      "▦",
    ],
    [
      "Отворени pull request-и",
      read ? prs.length : "—",
      read
        ? `Прочетени ${read} от ${ps.length} проекта · последни PR-и`
        : "Изчакай прочит от GitHub",
      "⑂",
    ],
    [
      "Проверки с проблем",
      runs.length ? bad.length : "—",
      runs.length
        ? "В последните получени workflow изпълнения"
        : "Още няма потвърдени проверки",
      "◉",
    ],
    [
      "Следващи задачи",
      pendingTasks(ps).length,
      "Отворени, в работа и блокирани",
      "☷",
    ],
  ]
    .map(
      ([label, n, sub, icon]) =>
        `<article class="metric"><span>${label}</span><span class="metric-icon">${icon}</span><strong>${n}</strong><small>${sub}</small></article>`,
    )
    .join("");
}
function deployments(p) {
  const value = sourceData(p, "vercel");
  return Array.isArray(value?.deployments)
    ? value.deployments
    : Array.isArray(value?.deployments?.deployments)
      ? value.deployments.deployments
      : [];
}
function currentRuns(p) {
  const sha = sourceData(p, "commits")?.[0]?.sha;
  const latest = new Map();
  for (const run of sourceData(p, "runs")?.workflow_runs || []) {
    const key = run.workflow_id || run.name;
    if (sha && run.head_sha === sha && !latest.has(key)) latest.set(key, run);
  }
  return [...latest.values()];
}
function check(p, kind) {
  const runs = currentRuns(p);
  if (kind === "seo") {
    const s = source(p, "seo");
    if (s?.data) {
      const total = s.data.total;
      return {
        label:
          typeof total === "number"
            ? total
              ? total + " проблема"
              : "0 отчетени"
            : "Прочетен",
        style: total ? "pending" : "",
      };
    }
    return { label: "Непроверено", style: "" };
  }
  if (kind === "deploy") {
    const deps = deployments(p);
    if (deps?.length) {
      const d = deps[0],
        st = d.state || d.readyState;
      return {
        label: st === "READY" ? "Готов" : st || "Непроверено",
        style: st === "READY" ? "good" : st === "ERROR" ? "bad" : "pending",
      };
    }
  }
  const pattern = {
    tests: /test|check|тест|quality|accessibility/i,
    build: /build|сборка/i,
    deploy: /deploy|pages|vercel/i,
  }[kind];
  const match = runs.find((r) => pattern?.test(r.name));
  if (!match) return { label: "Непроверено", style: "" };
  return {
    label:
      match.status !== "completed"
        ? "Изпълнява се"
        : match.conclusion === "success"
          ? "Успешно"
          : match.conclusion === "skipped"
            ? "Пропуснато"
            : match.conclusion || "Непроверено",
    style:
      match.conclusion === "success"
        ? "good"
        : ["failure", "timed_out"].includes(match.conclusion)
          ? "bad"
          : "pending",
  };
}
function checkRow(p) {
  return `<div class="check-row">${[
    ["tests", "Тестове"],
    ["build", "Build"],
    ["deploy", "Deploy"],
    ["seo", "SEO"],
  ]
    .map(([key, name]) => {
      const c = check(p, key);
      return `<div class="check">${name}<strong class="${c.style}"><span class="check-symbol">${c.style === "good" ? "✓" : c.style === "bad" ? "×" : "○"}</span>${esc(c.label)}</strong></div>`;
    })
    .join("")}</div>`;
}
function projectCard(p) {
  const prs = sourceData(p, "pulls"),
    commit = sourceData(p, "commits")?.[0],
    s = source(p, "repo");
  return `<article class="project-card" style="--project-color:${p.color}"><div class="card-heading"><span class="project-logo">${p.initials}</span>${badge(state(p))}</div><h3><a href="#project/${p.id}">${esc(p.name)}</a></h3><div class="category">${esc(p.category)}</div><p class="description">${esc(p.description)}</p>${checkRow(p)}<div class="card-foot"><span>⑂ ${prs ? prs.filter((r) => r.state === "open").length : "—"} отворени PR</span><a href="#project/${p.id}">Към таблото <span>→</span></a></div><div class="card-meta">${commit ? `Последно: ${esc(commit.commit?.message?.split("\n")[0])}` : s?.error ? esc(s.error) : p.repo ? "Очаква обновяване от GitHub" : projectData(p).site ? "Достъп чрез уеб адрес" : "Добави адрес на хранилището"}${Object.values(live[p.id] || {}).some((value) => value.stale) ? " · Има остарели данни" : ""}</div>${projectData(p).site ? `<div class="app-launch">${link(projectData(p).site, "Отвори приложението", "button subtle")}</div>` : ""}</article>`;
}
function guard() {
  return `<section class="panel guard-card"><div class="guard-icon">♧</div><h2>Всяка промяна минава през теб.</h2><p>Работното пространство събира данни и подготвя решения. Публикуването изисква отделно одобрение за конкретната версия.</p><ul><li>Без автоматично сливане на PR</li><li>Без автоматичен deploy</li><li>Съхранена история на редакциите</li></ul></section>`;
}
function activities(ps) {
  const all = ps
    .flatMap((p) =>
      (sourceData(p, "commits") || []).slice(0, 3).map((c) => ({
        title: c.commit?.message?.split("\n")[0],
        time: c.commit?.committer?.date,
        project: p.name,
        url: c.html_url,
      })),
    )
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 5);
  return `<section class="panel"><h2>Последни промени</h2>${all.length ? all.map((a) => `<div class="activity"><span class="activity-icon">⌘</span><div><strong>${link(a.url, a.title)}</strong><p>${esc(a.project)}</p><small>${date(a.time, true)}</small></div></div>`).join("") : '<div class="empty"><strong>Историята започва от източника.</strong>Обнови проверките, за да видиш последните commit-и.</div>'}</section>`;
}
function render() {
  renderNav();
  const route = current(),
    ps = getProjects(),
    p = projects.find((p) => p.id === route.id);
  renderMetrics(ps);
  $("#metrics").hidden = route.view === "project";
  $(".toolbar").hidden = route.view === "project";
  const titles = {
    overview: [
      "ВСИЧКО НА ЕДНО МЯСТО",
      "Твоите проекти. Ясна посока.",
      "От последната промяна до следващото решение.",
      "Общ преглед",
    ],
    today: [
      "ТВОЯТ ФОКУС",
      "Какво е важно днес.",
      "Задачи със срок, блокиращи проблеми и промени от днес.",
      "Днес",
    ],
    review: [
      "КОНТРОЛ ПРЕДИ ПУБЛИКУВАНЕ",
      "Прегледай. Провери. Реши.",
      "Всеки PR се преглежда спрямо конкретен commit.",
      "Преди публикуване",
    ],
    history: [
      "КОНТЕКСТ, КОЙТО ОСТАВА",
      "Решенията имат история.",
      "Бележки, задачи и решения с предишните им версии.",
      "История на решенията",
    ],
    project: [
      "ПРОЕКТНО ТАБЛО",
      p?.name || "Проект",
      "Един проект. Всички важни детайли.",
      p?.name || "Проект",
    ],
  };
  const t = titles[route.view] || titles.overview;
  $("#eyebrow").textContent = t[0];
  $("#pageTitle").textContent = t[1];
  $("#subtitle").textContent = t[2];
  $("#breadcrumb").textContent = t[3];
  if (route.view === "project" && p) renderProject(p);
  else if (route.view === "today") renderToday(ps);
  else if (route.view === "review") renderReview(ps);
  else if (route.view === "history") renderHistory(ps);
  else
    $("#view").innerHTML =
      `<div class="section-top"><h2>Всички приложения и проекти <span class="muted"> / ${String(ps.length).padStart(2, "0")}</span></h2><p>GitHub · проверки · работни записи</p></div><div class="project-grid">${ps.map(projectCard).join("") || '<div class="empty">Няма проекти с тези филтри.</div>'}</div><div class="bottom-grid">${activities(ps)}${guard()}</div>`;
}
function recordHTML(p, r, kind) {
  return `<article class="record"><div class="record-head"><h3>${esc(r.title)}</h3>${badge(r.state === "blocked" ? "blocked" : r.state === "done" ? "active" : "unknown", recordStates[r.state])}</div>${r.body ? `<p>${esc(r.body)}</p>` : ""}<small>${esc(p.name)} · ${date(r.updatedAt, true)}${r.due ? " · Срок: " + esc(r.due) : ""}</small><div class="record-actions"><button class="button subtle" data-edit="${esc(r.id)}" data-project="${p.id}" data-kind="${kind}">Редактирай</button><button class="button subtle" data-record-history="${esc(r.id)}" data-project="${p.id}" data-kind="${kind}">История</button>${kind === "tasks" && r.state !== "done" ? `<button class="button subtle" data-done="${esc(r.id)}" data-project="${p.id}">✓ Завърши</button>` : ""}</div></article>`;
}
function sourceError(s) {
  return s?.error
    ? `<p class="error">${esc(s.error)}${s.stale ? " Предишните данни са остарели." : ""}</p>${s.status === "reauthentication_required" && s.chatGPTSignInPath ? `<a class="button" href="${esc(s.chatGPTSignInPath)}" target="_top">Свържи източника</a>` : ""}`
    : "";
}
function renderToday(ps) {
  const tasks = pendingTasks(ps).filter(
      (t) => t.state === "blocked" || (t.due && t.due <= today()),
    ),
    issues = ps.flatMap((p) =>
      (sourceData(p, "issues") || [])
        .filter((i) => !i.pull_request)
        .slice(0, 4)
        .map((i) => ({ ...i, project: p })),
    );
  $("#view").innerHTML =
    `<div class="section-top"><h2>Фокус за ${date(new Date())}</h2><button class="button primary" data-add="tasks">＋ Нова задача</button></div><div class="detail-grid"><section class="panel"><h2>Задачи за днес и просрочени</h2>${tasks.map((t) => recordHTML(t.project, t, "tasks")).join("") || '<div class="empty"><strong>Няма задачи със срок днес.</strong>Задай срок на задача, за да се появи тук.</div>'}</section><section class="panel"><h2>Текущи GitHub проблеми</h2>${issues.map((i) => `<div class="record"><h3>${link(i.html_url, "#" + i.number + " " + i.title)}</h3><small>${esc(i.project.name)}</small></div>`).join("") || '<div class="empty">Няма заредени отворени issues.</div>'}</section></div><div class="bottom-grid">${activitiesToday(ps)}${guard()}</div>`;
}
function activitiesToday(ps) {
  const filtered = ps.map((p) => ({ ...p }));
  const all = filtered.flatMap((p) =>
    (sourceData(p, "commits") || [])
      .filter(
        (c) =>
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Sofia",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(c.commit.committer.date)) === today(),
      )
      .map((c) => ({ p, c })),
  );
  return `<section class="panel"><h2>Промени днес</h2>${all.map(({ p, c }) => `<div class="activity"><span class="activity-icon">⌘</span><div><strong>${link(c.html_url, c.commit.message.split("\n")[0])}</strong><p>${esc(p.name)} · ${date(c.commit.committer.date, true)}</p></div></div>`).join("") || '<div class="empty">Няма заредени промени от днес.</div>'}</section>`;
}
function renderProject(p) {
  const pd = projectData(p),
    tabs = [
      ["summary", "Обобщение"],
      ["pulls", "Pull requests"],
      ["checks", "Проверки"],
      ["tasks", "Задачи"],
      ["notes", "Бележки"],
      ["decisions", "Решения"],
    ];
  $("#view").innerHTML =
    `<div class="project-header" style="--project-color:${p.color}"><span class="project-logo">${p.initials}</span><div><h2>${esc(p.name)}</h2>${badge(state(p))}</div><button class="button subtle" style="margin-left:auto" data-settings="${p.id}">Настройки</button></div><div class="project-links">${link(pd.repo ? "https://github.com/" + pd.repo : "", "GitHub", "button")}${link(pd.site, "Уебсайт", "button")}${link(pd.vercel, "Vercel", "button")}${link(pd.supabase, "Supabase", "button")}${link(pd.seo, "OpenSEO", "button")}<span class="muted">${!pd.repo ? "GitHub: за свързване. " : ""}${!pd.vercel ? "Vercel: няма потвърден адрес. " : ""}${!pd.supabase ? "Supabase: няма потвърден адрес." : ""}</span></div><nav class="detail-tabs" aria-label="Детайли на проекта">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? "active" : ""}">${label}</button>`).join("")}</nav><div id="projectContent"></div>`;
  const container = $("#projectContent");
  if (["tasks", "notes", "decisions"].includes(tab)) {
    container.innerHTML = `<section class="panel"><div class="section-top"><h2>${tabs.find((t) => t[0] === tab)[1]}</h2><button class="button primary" data-add="${tab}" data-project="${p.id}">＋ Нов запис</button></div>${(docs[p.id]?.[tab] || []).map((r) => recordHTML(p, r, tab)).join("") || '<div class="empty"><strong>Всичко започва с първия запис.</strong>Добави контекст, който ще остане с проекта.</div>'}</section>`;
    return;
  }
  if (tab === "pulls") {
    renderPulls(p, container);
    return;
  }
  if (tab === "checks") {
    container.innerHTML = checksPanel(p);
    return;
  }
  const prs = sourceData(p, "pulls") || [],
    commits = sourceData(p, "commits") || [],
    issues = (sourceData(p, "issues") || []).filter((i) => !i.pull_request),
    branch = sourceData(p, "repo")?.default_branch;
  container.innerHTML = `<div class="detail-grid"><section class="panel"><h2>Последни промени ${branch ? "· " + esc(branch) : ""}</h2>${sourceError(source(p, "commits"))}${commits.map((c) => `<div class="activity"><span class="activity-icon">⌘</span><div><strong>${link(c.html_url, c.commit?.message?.split("\n")[0])}</strong><p class="mono">${esc(c.sha?.slice(0, 8))}</p><small>${date(c.commit?.committer?.date, true)}</small></div></div>`).join("") || '<div class="empty">Няма прочетена история на commit-и.</div>'}</section><div><section class="panel"><h2>Работен фокус</h2><p class="muted">${prs.filter((r) => r.state === "open").length} отворени · ${prs.filter((r) => r.merged_at).length} обединени сред прочетените PR-и.</p>${
    pendingTasks([p])
      .slice(0, 3)
      .map((r) => recordHTML(p, r, "tasks"))
      .join("") || '<p class="muted">Още няма следващи задачи.</p>'
  }<button class="button primary" data-add="tasks" data-project="${p.id}">＋ Следваща задача</button></section><section class="panel" style="margin-top:16px"><h2>Текущи проблеми</h2>${sourceError(source(p, "issues"))}${issues.map((i) => `<div class="record"><h3>${link(i.html_url, "#" + i.number + " " + i.title)}</h3></div>`).join("") || '<p class="muted">Няма заредени отворени issues. Това не потвърждава липса на проблеми.</p>'}</section></div></div><div style="margin-top:16px">${checksPanel(p)}</div>`;
}
function renderPulls(p, container) {
  const prs = sourceData(p, "pulls") || [],
    shown = prs.filter((r) =>
      prFilter === "open"
        ? r.state === "open"
        : prFilter === "merged"
          ? !!r.merged_at
          : r.state === "closed" && !r.merged_at,
    );
  container.innerHTML = `<section class="panel"><div class="section-top"><h2>Pull requests</h2><select id="prFilter" aria-label="Статус на PR"><option value="open" ${prFilter === "open" ? "selected" : ""}>Отворени</option><option value="merged" ${prFilter === "merged" ? "selected" : ""}>Обединени</option><option value="closed" ${prFilter === "closed" ? "selected" : ""}>Затворени</option></select></div><p class="muted">Страница ${prPage} · до 30 PR-а, подредени по последна промяна.</p>${sourceError(source(p, "pulls"))}<div class="table-wrap"><table><thead><tr><th>Pull request</th><th>Клон</th><th>Статус</th><th>Сравнение</th></tr></thead><tbody>${shown.map((r) => `<tr><td>${link(r.html_url, "#" + r.number + " " + r.title)}<small>${date(r.updated_at, true)}</small></td><td class="mono">${esc(r.head?.ref)} → ${esc(r.base?.ref)}</td><td>${badge(r.merged_at ? "active" : r.state === "closed" ? "closed" : "review", r.merged_at ? "Обединен" : r.draft ? "Draft" : r.state === "closed" ? "Затворен" : "Отворен")}</td><td><button class="button subtle" data-compare="${r.number}" data-project="${p.id}">Сравни →</button></td></tr>`).join("") || '<tr><td colspan="4">Няма PR-и с този статус в прочетената страница.</td></tr>'}</tbody></table></div><div class="pagination"><button class="button subtle" id="previousPR" ${prPage === 1 ? "disabled" : ""}>← Предишни</button><button class="button subtle" id="nextPR" ${prs.length < 30 ? "disabled" : ""}>Следващи →</button></div><div id="comparison">${compare?.project === p.id ? comparisonHTML(p, compare) : ""}</div></section>`;
}
function checksPanel(p) {
  const runs = sourceData(p, "runs")?.workflow_runs || [],
    deps = deployments(p),
    seo = sourceData(p, "seo");
  return `<section class="panel"><h2>Тестове, build, deploy и SEO</h2><p class="muted">Източникът и commit-ът са показани за всяка проверка. Успешен build не потвърждава успешни тестове.</p>${checkRow(p)}${sourceError(source(p, "runs"))}<div class="table-wrap"><table><thead><tr><th>GitHub Actions</th><th>Commit / клон</th><th>Резултат</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${link(r.html_url, r.name)}<small>${date(r.updated_at, true)}</small></td><td class="mono">${esc(r.head_sha?.slice(0, 8))}<small>${esc(r.head_branch)}</small></td><td>${badge(r.conclusion === "success" ? "active" : ["failure", "timed_out"].includes(r.conclusion) ? "failure" : "pending", r.conclusion || r.status)}</td></tr>`).join("") || '<tr><td colspan="3">Няма заредени workflow проверки.</td></tr>'}</tbody></table></div><h3>Vercel</h3>${sourceError(source(p, "vercel"))}${deps.map((d) => `<div class="check-detail"><div>${link(d.url ? "https://" + d.url : "", d.name || "Deployment")}<p>${esc(d.target || "preview")} · ${date(d.createdAt || d.created, true)} · ${esc(d.meta?.githubCommitSha?.slice(0, 8) || "SHA липсва")}</p></div>${badge((d.state || d.readyState) === "READY" ? "active" : "pending", d.state || d.readyState || "Непроверено")}</div>`).join("") || '<p class="muted">Няма потвърдени Vercel deployment данни за този проект.</p>'}<h3>SEO проверки</h3>${sourceError(source(p, "seo"))}${seo ? `<p class="muted">Общо: ${esc(seo.total ?? "—")} · показани до 30 проблема от последния наличен одит.</p>${(seo.issues || []).map((i) => `<div class="record"><h3>${esc(i.type || i.issue_type || i.title || "SEO проблем")}</h3><p>${esc(i.url || i.page_url || i.description || "")}</p><p>${esc(i.how_to_fix || "")}</p></div>`).join("")}` : '<p class="muted">SEO не е проверено. Не се стартира автоматичен платен одит.</p>'}</section>`;
}
function comparisonHTML(p, c) {
  if (c.error) return `<p class="error">${esc(c.error)}</p>`;
  const d = c.data || {},
    files = d.files || [],
    meta = d.comparison || d,
    pr = c.pr;
  return `<div style="margin-top:25px"><h2>Основен клон ↔ PR #${pr?.number || ""}</h2><p class="mono">${esc(pr?.base?.ref)} @ ${esc(pr?.base?.sha?.slice(0, 8))} → ${esc(pr?.head?.ref)} @ ${esc(pr?.head?.sha?.slice(0, 8))}</p><p class="muted">${esc(meta.status || d.status || "Сравнение")} · Прегледът е обвързан с тези commit-и.</p><div class="compare-summary"><div class="compare-stat"><strong>${esc(meta.ahead_by ?? d.ahead_by ?? "—")}</strong>Commit-и напред</div><div class="compare-stat"><strong>${esc(meta.behind_by ?? d.behind_by ?? "—")}</strong>Commit-и назад</div><div class="compare-stat"><strong>${files.length}</strong>Получени файлове</div></div><p class="muted">Големи сравнения може да са ограничени от GitHub. Пълният diff е достъпен във връзката по-долу.</p>${(c.checks?.data?.workflow_runs || []).map((r) => `<div class="check-detail"><span>${link(r.html_url, r.name)}</span>${badge(r.conclusion === "success" ? "active" : "pending", r.conclusion || r.status)}</div>`).join("")}${sourceError(c.checks)}${files.map((f) => `<div class="record"><span class="mono">${esc(f.filename || f.path)}</span> <span class="file-add">+${f.additions || 0}</span> <span class="file-delete">−${f.deletions || 0}</span></div>`).join("")}${link(pr?.html_url ? pr.html_url + "/files" : "", "Пълен diff в GitHub", "button")}<div class="banner" style="margin-top:18px">Прегледът не слива PR и не публикува промени.</div></div>`;
}
function renderReview(ps) {
  const prs = reviewPRs(ps);
  $("#view").innerHTML =
    `<div class="banner"><strong>За всяка версия е нужно отделно одобрение.</strong><br>Отметките по-долу са само преглед на готовността. Няма действие за merge, deploy или промяна на продукцията.</div><section class="panel"><h2>Отворени предложения</h2>${
      prs
        .map((pr) => {
          const key = pr.project.id + "-" + pr.number + "-" + pr.head?.sha;
          return `<div class="review-item"><div><h3>${link(pr.html_url, "#" + pr.number + " " + pr.title)}</h3><p>${esc(pr.project.name)} · ${pr.draft ? "Draft" : "Отворен PR"} · <span class="mono">${esc(pr.head?.sha?.slice(0, 8))}</span></p><p>Преглед: ${reviews[key] ? "завършен на това устройство" : "очаква"} · разрешение за публикуване: не е дадено</p></div><button class="button" data-review="${esc(key)}">${reviews[key] ? "Отмени отметката" : "Отбележи като прегледан"}</button><button class="button subtle" data-review-open="${pr.number}" data-project="${pr.project.id}">Сравнение →</button></div>`;
        })
        .join("") ||
      '<div class="empty"><strong>Няма заредени отворени PR-и.</strong>Обнови GitHub данните за проектите.</div>'
    }</section><div class="bottom-grid"><section class="panel"><h2>Проверка преди одобрение</h2>${["Преглед на diff спрямо основния клон", "Успешни тестове за точния SHA", "Успешен build и проверена preview версия", "Проверка на телефон и компютър", "SEO проверка при промяна на публични страници", "Отделно одобрение за конкретния commit"].map((t) => `<label class="review-item review-form"><span>${t}</span><input type="checkbox" aria-label="${t}"></label>`).join("")}<p class="muted">Контролният списък е за текущата сесия. Той не разрешава външни действия.</p></section>${guard()}</div>`;
}
function renderHistory(ps) {
  $("#view").innerHTML =
    `<section class="panel"><div class="section-top"><h2>Решения и работна история</h2><button class="button primary" data-add="decisions">＋ Ново решение</button></div>${
      ps
        .flatMap((p) => (docs[p.id]?.decisions || []).map((r) => ({ p, r })))
        .sort((a, b) => new Date(b.r.updatedAt) - new Date(a.r.updatedAt))
        .map(({ p, r }) => recordHTML(p, r, "decisions"))
        .join("") || '<div class="empty">Още няма записани решения.</div>'
    }<h2 style="margin-top:28px">Версии на проектните данни</h2>${ps.map((p) => `<div class="review-item"><div><h3>${esc(p.name)}</h3><p>Текуща версия: ${revisions[p.id]?.[0]?.revision || 0} · ${revisions[p.id]?.length || 0} прочетени версии</p></div><button class="button subtle" data-project-history="${p.id}">Виж историята</button></div>`).join("")}</section>`;
}
async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Server API не е достъпно в този режим.");
  }
  if (!response.ok || data.error)
    throw Object.assign(new Error(data.error || "Неуспешна заявка"), {
      code: response.status,
      ...data,
    });
  return data;
}
async function loadWork() {
  try {
    const session = await api("/api/session");
    persistent = session.persistent;
    if (session.authenticated && !session.persistent) {
      storageBlocked = true;
      throw new Error(
        "Работното хранилище не е свързано. Редакциите са временно блокирани.",
      );
    }
  } catch (e) {
    if (storageBlocked) {
      $("#storageNotice").textContent = e.message;
      return;
    }
  }
  if (persistent) {
    await Promise.all(
      projects.map(async (p) => {
        try {
          const data = await api("/api/work?project=" + p.id);
          revisions[p.id] = data.revisions;
          docs[p.id] = data.revisions[0]?.payload || emptyDocument();
        } catch (e) {
          storageBlocked = true;
          $("#storageNotice").textContent = "Грешка при прочит: " + e.message;
        }
      }),
    );
    if (!storageBlocked)
      $("#storageNotice").textContent =
        "Историята и работните записи се пазят към твоя профил и са достъпни от всички устройства.";
  } else {
    for (const p of projects) {
      try {
        revisions[p.id] = JSON.parse(
          localStorage.getItem("my-space-work-" + p.id) || "[]",
        );
        docs[p.id] = revisions[p.id][0]?.payload || emptyDocument();
      } catch {
        docs[p.id] = emptyDocument();
        revisions[p.id] = [];
      }
    }
    $("#storageNotice").innerHTML =
      "Локален преглед · записите се пазят само в този браузър. Използвай Експорт за архив. След публикуване Site ще пази работните записи към профила ти.";
  }
  storageReady = !storageBlocked;
  render();
}
async function save(p, doc) {
  if (!storageReady || storageBlocked)
    throw new Error("Работните данни още не са заредени.");
  const currentRevision = revisions[p.id]?.[0]?.revision || 0;
  let revision = currentRevision + 1;
  if (persistent) {
    const result = await api("/api/work", {
      project: p.id,
      base: currentRevision,
      requestId: uid(),
      doc,
    });
    revision = result.revision;
  }
  const rev = {
    revision,
    payload: structuredClone(doc),
    created_at: new Date().toISOString(),
  };
  if (!persistent) {
    const next = [rev, ...(revisions[p.id] || [])];
    localStorage.setItem("my-space-work-" + p.id, JSON.stringify(next));
  }
  revisions[p.id] = [rev, ...(revisions[p.id] || [])];
  docs[p.id] = structuredClone(doc);
  render();
}
async function readSource(p, key, resource, extra = {}) {
  live[p.id] ||= {};
  let result;
  try {
    result = await api("/api/source", {
      project: p.id,
      source: ["vercel", "seo"].includes(key)
        ? key
        : key === "compare"
          ? "compare"
          : "github",
      resource,
      ...extra,
    });
    if (result.status !== "success")
      throw Object.assign(
        new Error(result.error || "Непотвърден отговор"),
        result,
      );
    live[p.id][key] = { ...result, time: new Date().toISOString() };
    return result;
  } catch (error) {
    live[p.id][key] = {
      ...live[p.id][key],
      error: error.message,
      status: error.status,
      chatGPTSignInPath: error.chatGPTSignInPath,
      stale: !!live[p.id][key]?.data,
    };
    return { error: error.message };
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  $("#refreshButton").disabled = true;
  $("#refreshButton").textContent = "Обновяване…";
  const route = current(),
    ps =
      route.view === "project"
        ? projects.filter((p) => p.id === route.id)
        : getProjects();
  for (const p of ps) {
    if (!projectData(p).repo) continue;
    await Promise.all(
      ["repo", "pulls", "commits", "issues", "runs"].map((key) =>
        readSource(p, key, key, key === "pulls" ? { page: prPage } : {}),
      ),
    );
    if (p.id === "vinilpechat")
      await Promise.all([readSource(p, "vercel"), readSource(p, "seo")]);
    render();
  }
  loading = false;
  $("#refreshButton").disabled = false;
  $("#refreshButton").innerHTML = "<span>↻</span> Обнови проверките";
  toast("Обновяването приключи. Виж статуса на всеки източник.");
}
function openEditor(kind = "tasks", project = projects[0].id, id) {
  if (!storageReady) {
    toast("Изчакай зареждането на работните данни.");
    return;
  }
  const form = $("#editForm");
  form.reset();
  form.elements.project.value = project;
  form.elements.kind.value = kind;
  form.elements.recordId.value = id || "";
  form.elements.project.disabled = !!id;
  form.elements.kind.disabled = !!id;
  if (id) {
    const r = docs[project][kind].find((r) => r.id === id);
    for (const key of ["title", "body", "state", "due"])
      form.elements[key].value = r[key] || "";
  }
  $("#editorTitle").textContent = id
    ? "Редакция с история"
    : "Нов работен запис";
  $("#editor").showModal();
}
async function loadOlder(p) {
  if (!persistent) return;
  const oldest = revisions[p.id]?.at(-1)?.revision;
  if (!oldest || oldest === 1) return;
  const data = await api("/api/work?project=" + p.id + "&before=" + oldest);
  revisions[p.id].push(...data.revisions);
}
function snapshotHTML(doc) {
  return `<p class="muted">Работен статус: ${esc(statusNames[doc.status])}</p>${["tasks", "notes", "decisions"].map((kind) => `<h3>${{ tasks: "Задачи", notes: "Бележки", decisions: "Решения" }[kind]}</h3>${doc[kind].map((r) => `<div class="record"><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><small>${esc(recordStates[r.state])}${r.due ? " · " + esc(r.due) : ""}</small></div>`).join("") || '<p class="muted">Няма записи.</p>'}`).join("")}`;
}
function historyDialog(p, kind, id) {
  const rows = revisions[p.id] || [];
  $("#historyContent").innerHTML =
    rows
      .map((rev) => {
        const value = id
          ? rev.payload[kind]?.find((r) => r.id === id)
          : rev.payload;
        if (!value) return "";
        return `<details class="revision"><summary>Версия ${rev.revision} · ${date(rev.created_at, true)}</summary>${id ? `<h3>${esc(value.title)}</h3><p style="white-space:pre-wrap">${esc(value.body)}</p><p class="muted">${esc(recordStates[value.state])}</p>` : snapshotHTML(value)}${!id ? `<button class="button" data-restore="${rev.revision}" data-project="${p.id}">Възстанови като нова версия</button>` : ""}</details>`;
      })
      .join("") || '<p class="muted">Няма предишни версии.</p>';
  if (persistent && rows.at(-1)?.revision > 1)
    $("#historyContent").insertAdjacentHTML(
      "beforeend",
      `<button class="button" data-older="${p.id}" data-kind="${kind || ""}" data-record="${id || ""}">По-стари версии →</button>`,
    );
  if (!$("#historyDialog").open) $("#historyDialog").showModal();
}
$("#refreshButton").onclick = refresh;
for (const id of ["search", "projectFilter", "statusFilter"])
  $("#" + id).addEventListener(id === "search" ? "input" : "change", render);
window.addEventListener("hashchange", () => {
  tab = "summary";
  compare = null;
  prPage = 1;
  $("#sidebar").classList.remove("open");
  $("#menuButton").setAttribute("aria-expanded", "false");
  render();
});
$("#menuButton").onclick = () => {
  $("#sidebar").classList.toggle("open");
  $("#menuButton").setAttribute(
    "aria-expanded",
    String($("#sidebar").classList.contains("open")),
  );
};
document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-close")) {
    target.closest("dialog").close();
    return;
  }
  const d = target.dataset,
    p =
      projects.find((p) => p.id === (d.project || current().id)) || projects[0];
  if (d.tab) {
    tab = d.tab;
    compare = null;
    render();
  }
  if (d.add) openEditor(d.add, d.project || current().id || projects[0].id);
  if (d.edit) openEditor(d.kind, d.project, d.edit);
  if (d.done) {
    const doc = structuredClone(docs[p.id]),
      r = doc.tasks.find((t) => t.id === d.done);
    r.state = "done";
    r.updatedAt = new Date().toISOString();
    try {
      await save(p, doc);
      toast("Задачата е завършена. Историята е запазена.");
    } catch (e) {
      toast(e.message);
    }
  }
  if (d.settings) {
    const pd = projectData(p),
      form = $("#settingsForm");
    form.elements.project.value = d.settings;
    form.elements.status.value = docs[d.settings].status;
    const selected = projectData(projects.find((v) => v.id === d.settings));
    $("#linkInputs").innerHTML = Object.entries({
      repo: "GitHub хранилище (NikoNextcloud/име)",
      site: "Уебсайт",
      vercel: "Vercel",
      supabase: "Supabase",
      seo: "SEO отчет",
    })
      .map(
        ([key, label]) =>
          `<label>${label}<input name="${key}" value="${esc(selected[key] || "")}" ${key === "repo" ? 'pattern="NikoNextcloud/[A-Za-z0-9_.-]+"' : 'type="url"'} placeholder="${key === "repo" ? "NikoNextcloud/име" : "https://..."}"></label>`,
      )
      .join("");
    $("#settings").showModal();
  }
  if (d.older) {
    target.disabled = true;
    try {
      const oldProject = projects.find((p) => p.id === d.older);
      await loadOlder(oldProject);
      historyDialog(oldProject, d.kind, d.record);
    } catch (e) {
      toast(e.message);
    } finally {
      target.disabled = false;
    }
  }
  if (d.recordHistory) historyDialog(p, d.kind, d.recordHistory);
  if (d.projectHistory)
    historyDialog(projects.find((p) => p.id === d.projectHistory));
  if (d.restore) {
    const previous = revisions[p.id].find(
      (r) => r.revision === Number(d.restore),
    );
    try {
      await save(p, previous.payload);
      $("#historyDialog").close();
      toast("Възстановено като нова версия. Старата история е запазена.");
    } catch (e) {
      toast(e.message);
    }
  }
  if (d.review) {
    reviews[d.review] = !reviews[d.review];
    render();
  }
  if (d.reviewOpen) {
    location.hash = "project/" + p.id;
    setTimeout(() => {
      tab = "pulls";
      render();
      document.querySelector(`[data-compare="${d.reviewOpen}"]`)?.click();
    }, 50);
  }
  if (d.compare) {
    target.disabled = true;
    target.textContent = "Сравняване…";
    const result = await readSource(p, "compare", undefined, {
      number: Number(d.compare),
    });
    compare = { ...result, project: p.id };
    render();
  }
  if (target.id === "nextPR" || target.id === "previousPR") {
    prPage += target.id === "nextPR" ? 1 : -1;
    await readSource(p, "pulls", "pulls", { page: prPage });
    render();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "prFilter") {
    prFilter = event.target.value;
    render();
  }
});
$("#editForm").onsubmit = async (event) => {
  event.preventDefault();
  const f = event.target,
    p = projects.find((p) => p.id === f.elements.project.value),
    kind = f.elements.kind.value,
    doc = structuredClone(docs[p.id]),
    id = f.elements.recordId.value;
  const r = {
    id: id || uid(),
    title: f.elements.title.value.trim(),
    body: f.elements.body.value,
    state: f.elements.state.value,
    due: f.elements.due.value,
    updatedAt: new Date().toISOString(),
  };
  if (!r.title) return;
  const button = f.querySelector("[type=submit]");
  button.disabled = true;
  try {
    if (id) doc[kind] = doc[kind].map((old) => (old.id === id ? r : old));
    else doc[kind].unshift(r);
    await save(p, doc);
    $("#editor").close();
    toast("Запазена е нова версия.");
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
$("#settingsForm").onsubmit = async (event) => {
  event.preventDefault();
  const f = event.target,
    p = projects.find((p) => p.id === f.elements.project.value),
    doc = structuredClone(docs[p.id]);
  doc.status = f.elements.status.value;
  for (const key of ["repo", "site", "vercel", "supabase", "seo"]) {
    const value = f.elements[key].value.trim();
    if (value && key !== "repo" && !value.startsWith("https://")) {
      toast("Използвай https адрес.");
      return;
    }
    doc.links[key] = value;
  }
  const button = f.querySelector(".primary");
  button.disabled = true;
  try {
    await save(p, doc);
    live[p.id] = {};
    $("#settings").close();
    render();
    toast("Настройките са запазени с история.");
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
$("#exportButton").onclick = async () => {
  const button = $("#exportButton");
  button.disabled = true;
  try {
    if (persistent)
      for (const p of projects)
        while (revisions[p.id].at(-1)?.revision > 1) {
          const count = revisions[p.id].length;
          await loadOlder(p);
          if (count === revisions[p.id].length) break;
        }
    const blob = new Blob(
        [
          JSON.stringify(
            {
              format: "my-space-work-v1",
              exportedAt: new Date().toISOString(),
              revisions,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-space-work-" + today() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
$("#importButton").onclick = () => $("#importFile").click();
function validImport(doc) {
  return (
    doc &&
    ["active", "review", "paused", "blocked"].includes(doc.status) &&
    doc.links &&
    Object.entries(doc.links).every(
      ([k, v]) =>
        ["repo", "site", "vercel", "supabase", "seo"].includes(k) &&
        typeof v === "string" &&
        v.length < 600 &&
        (!v ||
          (k === "repo"
            ? /^NikoNextcloud\/[A-Za-z0-9_.-]+$/.test(v)
            : v.startsWith("https://"))),
    ) &&
    ["tasks", "notes", "decisions"].every(
      (k) =>
        Array.isArray(doc[k]) &&
        doc[k].length <= 500 &&
        doc[k].every(
          (r) =>
            r &&
            typeof r.id === "string" &&
            typeof r.title === "string" &&
            r.title.length <= 150 &&
            typeof r.body === "string" &&
            r.body.length <= 5000 &&
            ["open", "progress", "blocked", "done"].includes(r.state),
        ),
    )
  );
}
$("#importFile").onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3000000) throw new Error("Архивът е прекалено голям.");
    const archive = JSON.parse(await file.text());
    if (archive.format !== "my-space-work-v1")
      throw new Error("Неподдържан архив.");
    const entries = projects
      .map((p) => ({ p, rows: archive.revisions[p.id] }))
      .filter((x) => x.rows?.length);
    for (const { rows } of entries)
      if (!Array.isArray(rows) || !validImport(rows[0].payload))
        throw new Error("Невалидни проектни данни.");
    if (
      !confirm(
        `Да добавя актуалните данни от архива за ${entries.length} проекта като нови версии? Сегашната история ще се запази.`,
      )
    )
      return;
    for (const { p, rows } of entries) await save(p, rows[0].payload);
    toast(
      "Импортирани са нови версии. Архивът запазва пълната изходна история.",
    );
  } catch (e) {
    toast(e.message);
  } finally {
    event.target.value = "";
  }
};
$("#currentDate").textContent = date(new Date());
for (const p of projects) {
  docs[p.id] = emptyDocument();
  revisions[p.id] = [];
  $("#projectFilter").insertAdjacentHTML(
    "beforeend",
    `<option value="${p.id}">${esc(p.name)}</option>`,
  );
  $("#editProject").insertAdjacentHTML(
    "beforeend",
    `<option value="${p.id}">${esc(p.name)}</option>`,
  );
}
render();
loadWork().then(() => {
  if (persistent && !storageBlocked) refresh();
});
