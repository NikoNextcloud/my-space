import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { api, parseResult } from "../worker/index.js";
import { emptyDocument } from "../projects.js";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync("drizzle/0000_work_center.sql", "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = sqlite.prepare(sql);
          return {
            first: async () => stmt.get(...args),
            all: async () => ({ results: stmt.all(...args) }),
            run: async () => ({
              meta: { changes: Number(stmt.run(...args).changes) },
            }),
          };
        },
      };
    },
  };
}
function req(path, body, owner = "user-a", origin = "https://test.site") {
  const headers = {
    "oai-authenticated-user-id": owner,
    "Content-Type": "application/json",
    Origin: origin,
  };
  return new Request("https://test.site" + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
test("append revisions, reject lost updates, deduplicate, isolate owners and restore without deleting history", async () => {
  const env = { DB: database() },
    doc = emptyDocument();
  let r = await api(
    req("/api/work", {
      project: "audit",
      base: 0,
      requestId: "request-0001",
      doc,
    }),
    env,
    {},
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).revision, 1);
  r = await api(
    req("/api/work", {
      project: "audit",
      base: 0,
      requestId: "request-0001",
      doc,
    }),
    env,
    {},
  );
  assert.equal((await r.json()).duplicate, true);
  r = await api(
    req("/api/work", {
      project: "audit",
      base: 0,
      requestId: "request-0002",
      doc,
    }),
    env,
    {},
  );
  assert.equal(r.status, 409);
  doc.notes.push({
    id: "note-1",
    title: "First decision",
    body: "Context",
    state: "open",
  });
  r = await api(
    req("/api/work", {
      project: "audit",
      base: 1,
      requestId: "request-0003",
      doc,
    }),
    env,
    {},
  );
  assert.equal(r.status, 200);
  r = await api(req("/api/work?project=audit"), env, {});
  let rows = (await r.json()).revisions;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].payload.notes.length, 0);
  r = await api(req("/api/work?project=audit", null, "user-b"), env, {});
  assert.equal((await r.json()).revisions.length, 0);
  r = await api(
    req("/api/work", {
      project: "audit",
      base: 2,
      requestId: "request-0004",
      doc: rows[1].payload,
    }),
    env,
    {},
  );
  assert.equal(r.status, 200);
  r = await api(req("/api/work?project=audit"), env, {});
  assert.equal((await r.json()).revisions.length, 3);
});
test("deny anonymous, cross-origin, unsafe payloads, arbitrary resources and production mutations", async () => {
  const env = { DB: database() };
  assert.equal(
    (await api(req("/api/work?project=audit", null, ""), env, {})).status,
    401,
  );
  assert.equal(
    (
      await api(
        req("/api/work", { project: "audit" }, "user-a", "https://evil.test"),
        env,
        {},
      )
    ).status,
    403,
  );
  const doc = emptyDocument();
  doc.links.site = "javascript:alert(1)";
  assert.equal(
    (
      await api(
        req("/api/work", {
          project: "audit",
          base: 0,
          requestId: "request-0001",
          doc,
        }),
        env,
        {},
      )
    ).status,
    400,
  );
  for (const source of ["merge", "deploy", "publish", "arbitrary"])
    assert.equal(
      (await api(req("/api/source", { project: "audit", source }), env, {}))
        .status,
      422,
    );
  assert.equal(
    (
      await api(
        req("/api/source", {
          project: "audit",
          source: "github",
          resource: "secrets",
        }),
        env,
        {},
      )
    ).status,
    400,
  );
});
test("source routes select fixed read actions and bound pagination; no provider credentials in browser", async () => {
  const calls = [],
    ctx = {
      props: {
        CONNECTORS: {
          async invoke(...args) {
            calls.push(args);
            return {
              status: "success",
              result: { content: [], structuredContent: { content: "[]" } },
            };
          },
        },
      },
    };
  const response = await api(
    req("/api/source", {
      project: "football",
      source: "github",
      resource: "pulls",
      page: 2,
    }),
    {},
    ctx,
  );
  assert.equal((await response.json()).status, "success");
  assert.equal(calls[0][1], "fetch");
  assert.match(calls[0][2].url, /FootballLeague\/pulls\?.*page=2$/);
});
test("compare pins exact base/head SHA and fetches tests for PR head", async () => {
  const calls = [];
  const sha1 = "a".repeat(40),
    sha2 = "b".repeat(40);
  const ctx = {
    props: {
      CONNECTORS: {
        async invoke(connector, action, args) {
          calls.push({ action, args });
          return {
            status: "success",
            result: {
              content: [],
              structuredContent: {
                content: JSON.stringify(
                  calls.length === 1
                    ? {
                        number: 4,
                        base: { sha: "c".repeat(40) },
                        head: { sha: sha2 },
                      }
                    : calls.length === 2
                      ? [{ sha: sha1 }]
                      : calls.length === 3
                        ? { files: [] }
                        : { workflow_runs: [] },
                ),
              },
            },
          };
        },
      },
    },
  };
  const r = await api(
    req("/api/source", { project: "football", source: "compare", number: 4 }),
    {},
    ctx,
  );
  assert.equal(r.status, 200);
  assert.equal(calls[2].args.base, sha1);
  assert.equal(calls[2].args.head, sha2);
  assert.ok(calls[3].args.url.includes(sha2));
});
test("connector outcomes preserve errors, diagnostics and falsy data", () => {
  assert.deepEqual(
    parseResult({
      status: "success",
      result: { content: [], structuredContent: false },
    }).data,
    false,
  );
  const e = parseResult({
    status: "rate_limited",
    message: "Wait",
    retryAfterMs: 1000,
    requestId: "r",
    result: { content: [] },
  });
  assert.equal(e.retryAfterMs, 1000);
  assert.equal(e.requestId, "r");
  assert.equal(
    parseResult({ status: "success", result: { isError: true } }).status,
    "tool_error",
  );
});

test("the main catalog includes every original application once and preserves core project IDs", async () => {
  const vm = await import("node:vm");
  const context = { window: {} };
  vm.runInNewContext(readFileSync("links.js", "utf8"), context);
  const { projects } = await import("../projects.js");
  const normalize = (url) => url.replace(/\/$/, "").toLowerCase();
  for (const item of context.window.DASHBOARD_LINKS) {
    assert.equal(
      projects.filter(
        (p) => p.site && normalize(p.site) === normalize(item.url),
      ).length,
      1,
      item.title + " must appear once",
    );
  }
  assert.equal(projects.length, 19);
  assert.deepEqual(
    projects.slice(0, 6).map((p) => p.id),
    ["vinilpechat", "football", "audit", "caritas", "heritage", "fitness"],
  );
  assert.equal(new Set(projects.map((p) => p.id)).size, projects.length);
});
