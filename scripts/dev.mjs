// Local preview only. Production identity is supplied exclusively by Sites.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { api } from "../worker/index.js";
import { activePreview, previewBinding } from "./preview-binding.mjs";
const root = process.cwd();
const args = process.argv.slice(2),
  port =
    Number(args[args.indexOf("--port") + 1]) ||
    Number(process.env.PORT) ||
    3000;
createServer(async (req, res) => {
  try {
    const origin = "http://" + req.headers.host,
      url = new URL(req.url, origin);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers(req.headers);
      headers.delete("oai-authenticated-user-id");
      headers.delete("oai-authenticated-user-email");
      const active = await activePreview();
      if (active && url.pathname === "/api/source")
        headers.set("oai-authenticated-user-id", "local-preview");
      const response = await api(
        new Request(url, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.concat(chunks),
        }),
        {},
        active ? { props: { CONNECTORS: previewBinding } } : {},
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname =
      url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const allowed = [
      "/index.html",
      "/app.js",
      "/styles.css",
      "/projects.js",
      "/links.js",
      "/sync-config.js",
      "/legacy/index.html",
      "/legacy/app.js",
      "/legacy/styles.css",
      "/assets/dashboard-icon-3.png",
    ];
    if (!allowed.includes(pathname)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const data = await readFile(resolve(root, "." + pathname));
    const ext = pathname.split(".").pop();
    res.writeHead(200, {
      "Content-Type": {
        html: "text/html; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        png: "image/png",
      }[ext],
    });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Preview error");
  }
}).listen(port, "0.0.0.0", () =>
  console.log("Local: http://localhost:" + port),
);
