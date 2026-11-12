import { projects } from "../projects.js";
const GITHUB = "connector_76869538009648d5b282a4bb21c3d157";
const VERCEL = "connector_690a90ec05c881918afb6a55dc9bbaa1";
const SEO = "asdk_app_6abddd2c7e4c819191f1398c4bd8e9b3";
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const fail = (message, status = 400) => json({ error: message }, status);
function validLink(key, value) {
  if (typeof value !== "string" || value.length > 600) return false;
  if (!value) return true;
  if (key === "repo") return /^NikoNextcloud\/[A-Za-z0-9_.-]+$/.test(value);
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function validDoc(doc) {
  return (
    doc &&
    ["active", "review", "paused", "blocked"].includes(doc.status) &&
    ["tasks", "notes", "decisions"].every(
      (k) =>
        Array.isArray(doc[k]) &&
        doc[k].length <= 500 &&
        doc[k].every(
          (v) =>
            v &&
            typeof v.id === "string" &&
            typeof v.title === "string" &&
            v.title.length <= 150 &&
            typeof v.body === "string" &&
            v.body.length <= 5000 &&
            ["open", "progress", "blocked", "done"].includes(v.state) &&
            (!v.updatedAt || !isNaN(Date.parse(v.updatedAt))) &&
            (!v.due || /^\d{4}-\d{2}-\d{2}$/.test(v.due)),
        ),
    ) &&
    doc.links &&
    Object.entries(doc.links).every(
      ([k, v]) =>
        ["repo", "site", "vercel", "supabase", "seo"].includes(k) &&
        validLink(k, v),
    )
  );
}
export function parseResult(envelope) {
  if (envelope?.status !== "success")
    return {
      error: envelope?.message || "Източникът не е достъпен",
      status: envelope?.status || "upstream_error",
      retryAfterMs: envelope?.retryAfterMs,
      requestId: envelope?.requestId,
      result: envelope?.result,
    };
  const r = envelope.result;
  if (r?.isError || r?.error)
    return {
      error: "Източникът върна грешка",
      status: "tool_error",
      result: r,
    };
  let value = r?.structuredContent;
  if (value && typeof value.content === "string") {
    try {
      value = JSON.parse(value.content);
    } catch {}
  }
  if (value == null) {
    for (const item of r?.content || []) {
      if (item.type === "text") {
        try {
          value = JSON.parse(item.text);
          break;
        } catch {}
      }
    }
  }
  if (value && value.result !== undefined) value = value.result;
  return {
    data: value ?? r,
    result: r,
    requestId: envelope.requestId,
    status: "success",
  };
}
async function invoke(ctx, connector, action, args) {
  const binding = ctx?.props?.CONNECTORS;
  if (!binding)
    return {
      error:
        "Свързаните приложения са достъпни в публикувания Site след вход. Локалният преглед не потвърждава достъп.",
      status: "binding_unavailable",
    };
  try {
    const result = parseResult(await binding.invoke(connector, action, args));
    if (result.status === "reauthentication_required") {
      result.chatGPTSignInPath = "/signin-with-chatgpt?return_to=%2F";
    }
    return result;
  } catch {
    return {
      error: "Неуспешна връзка с източника. Опитай отново.",
      status: "upstream_error",
    };
  }
}
export async function api(request, env, ctx) {
  const url = new URL(request.url),
    path = url.pathname;
  const owner = request.headers.get("oai-authenticated-user-id");
  if (path === "/api/session")
    return json({ persistent: !!owner && !!env.DB, authenticated: !!owner });
  if (!owner) return fail("Необходим е вход в Site за работните данни.", 401);
  if (path === "/api/work" && request.method === "GET") {
    if (!env.DB) return fail("Базата за работни данни не е свързана.", 503);
    const id = url.searchParams.get("project");
    if (!projects.some((p) => p.id === id)) return fail("Невалиден проект");
    const before =
      Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(before) || before < 1)
      return fail("Невалидна страница");
    const rows = await env.DB.prepare(
      "SELECT revision,payload,created_at FROM work_revisions WHERE owner_id=? AND project_id=? AND revision<? ORDER BY revision DESC LIMIT 100",
    )
      .bind(owner, id, before)
      .all();
    return json({
      revisions: rows.results.map((r) => ({
        ...r,
        payload: JSON.parse(r.payload),
      })),
    });
  }
  if (request.method !== "POST") return fail("Неподдържана операция", 405);
  if (request.headers.get("Origin") !== url.origin)
    return fail("Невалиден произход", 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return fail("Очаква се JSON", 415);
  const raw = await request.text();
  if (raw.length > 250000) return fail("Прекалено голям запис", 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Невалиден JSON");
  }
  const project = projects.find((p) => p.id === body.project);
  if (!project) return fail("Невалиден проект");
  if (path === "/api/work") {
    if (!env.DB) return fail("Базата за работни данни не е свързана.", 503);
    if (
      !Number.isSafeInteger(body.base) ||
      body.base < 0 ||
      typeof body.requestId !== "string" ||
      !/^[\w-]{8,80}$/.test(body.requestId) ||
      !validDoc(body.doc)
    )
      return fail("Невалиден запис");
    const duplicate = await env.DB.prepare(
      "SELECT revision FROM work_revisions WHERE owner_id=? AND request_id=?",
    )
      .bind(owner, body.requestId)
      .first();
    if (duplicate)
      return json({ revision: duplicate.revision, duplicate: true });
    const revision = body.base + 1;
    try {
      const result = await env.DB.prepare(
        "INSERT INTO work_revisions(owner_id,project_id,revision,request_id,payload,created_at) SELECT ?,?,?,?,?,? WHERE ?=COALESCE((SELECT MAX(revision) FROM work_revisions WHERE owner_id=? AND project_id=?),0)",
      )
        .bind(
          owner,
          project.id,
          revision,
          body.requestId,
          JSON.stringify(body.doc),
          new Date().toISOString(),
          body.base,
          owner,
          project.id,
        )
        .run();
      if (!result.meta?.changes)
        return fail(
          "Има по-нова версия. Презареди записа преди редакция.",
          409,
        );
      return json({ revision });
    } catch (e) {
      if (String(e).includes("UNIQUE"))
        return fail(
          "Има по-нова версия. Презареди записа преди редакция.",
          409,
        );
      throw e;
    }
  }
  if (path === "/api/source") {
    // All targets/actions are chosen here. There is deliberately no merge/deploy/write action.
    let repo = project.repo;
    if (env.DB) {
      const row = await env.DB.prepare(
        "SELECT payload FROM work_revisions WHERE owner_id=? AND project_id=? ORDER BY revision DESC LIMIT 1",
      )
        .bind(owner, project.id)
        .first();
      if (row) repo = JSON.parse(row.payload).links.repo ?? repo;
    }
    if (body.source === "github") {
      if (!repo || !/^NikoNextcloud\/[A-Za-z0-9_.-]+$/.test(repo))
        return fail("Проектът няма свързано хранилище", 422);
      const prefix = `https://api.github.com/repos/${repo}`;
      const page =
        Number.isSafeInteger(body.page) && body.page > 0 && body.page <= 100
          ? body.page
          : 1;
      const routes = {
        repo: "",
        pulls: `/pulls?state=all&sort=updated&direction=desc&per_page=30&page=${page}`,
        commits: "/commits?per_page=8",
        issues: "/issues?state=open&per_page=30",
        runs: "/actions/runs?per_page=15",
      };
      let suffix = routes[body.resource];
      if (suffix === undefined) return fail("Невалиден ресурс");
      suffix = suffix.trim();
      if (body.resource === "runs" && body.sha) {
        if (!/^[a-f0-9]{40}$/.test(body.sha)) return fail("Невалиден SHA");
        suffix = `/actions/runs?head_sha=${body.sha}&per_page=30`;
      }
      return json(await invoke(ctx, GITHUB, "fetch", { url: prefix + suffix }));
    }
    if (body.source === "compare") {
      if (
        !repo ||
        !/^NikoNextcloud\/[A-Za-z0-9_.-]+$/.test(repo) ||
        !Number.isSafeInteger(body.number) ||
        body.number < 1
      )
        return fail("Невалиден PR");
      const pr = await invoke(ctx, GITHUB, "fetch", {
        url: `https://api.github.com/repos/${repo}/pulls/${body.number}`,
      });
      if (pr.error) return json(pr);
      const data = pr.data;
      if (!data?.base?.sha || !data?.head?.sha)
        return fail("Липсват commit данни", 502);
      // GitHub PR metadata can retain an older base SHA. Resolve the current
      // default-branch head explicitly for the main-versus-PR comparison.
      const main = await invoke(ctx, GITHUB, "fetch", {
        url: `https://api.github.com/repos/${repo}/commits?per_page=1`,
      });
      if (main.error) return json(main);
      if (!/^[a-f0-9]{40}$/.test(main.data?.[0]?.sha))
        return fail("Липсва актуален основен commit", 502);
      data.base = { ...data.base, sha: main.data[0].sha, ref: "основен клон" };
      const comparison = await invoke(ctx, GITHUB, "compare_commits", {
        repo_full_name: repo,
        base: data.base.sha,
        head: data.head.sha,
      });
      const checks = await invoke(ctx, GITHUB, "fetch", {
        url: `https://api.github.com/repos/${repo}/actions/runs?head_sha=${data.head.sha}&per_page=30`,
      });
      return json({ ...comparison, pr: data, checks });
    }
    if (body.source === "vercel" && project.id === "vinilpechat")
      return json(
        await invoke(ctx, VERCEL, "list_deployments", {
          projectId: "prj_ugQP83WqOyOFBYpwh7cg82aSI7T6",
          teamId: "team_CjmJjCJM8M2Aa9PwYTWGjaou",
          limit: 10,
        }),
      );
    if (body.source === "seo" && project.id === "vinilpechat")
      return json(
        await invoke(ctx, SEO, "get_audit_issues", {
          projectId: "aa7f6e9e-9649-4596-9408-c791ab867fed",
          limit: 30,
          page: 1,
        }),
      );
    return fail("Няма потвърден източник за тази проверка", 422);
  }
  return fail("Непознат адрес", 404);
}
export default {
  async fetch(request, env, ctx) {
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/")) return await api(request, env, ctx);
      if (!["GET", "HEAD"].includes(request.method))
        return fail("Неподдържана операция", 405);
      const asset = ASSETS[path === "/" ? "/index.html" : path];
      if (!asset) return new Response("Not found", { status: 404 });
      const bytes = Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0));
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": asset.type,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Cache-Control": "private, no-cache",
        },
      });
    } catch {
      return fail(
        "Неуспешна операция. Запазената история остава непроменена.",
        500,
      );
    }
  },
};
