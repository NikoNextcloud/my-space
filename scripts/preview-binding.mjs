// Development only. Uses the standard Sites preview mailbox and never ships in the Worker.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm, access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
const root = path.resolve(".sites-runtime/connector-preview");
export async function activePreview() {
  try {
    const session = JSON.parse(
      await readFile(path.join(root, "session.json"), "utf8"),
    );
    return (
      /^[0-9a-f-]{36}$/.test(session.id) &&
      (session.expiresAt === null || session.expiresAt > Date.now())
    );
  } catch {
    return false;
  }
}
export const previewBinding = {
  async invoke(connectorId, actionName, args) {
    let requestPath, responsePath;
    try {
      const s = JSON.parse(
        await readFile(path.join(root, "session.json"), "utf8"),
      );
      if (
        !/^[0-9a-f-]{36}$/.test(s.id) ||
        !Number.isInteger(s.timeoutMs) ||
        s.timeoutMs <= 0 ||
        s.timeoutMs > 120000 ||
        (s.expiresAt !== null && s.expiresAt <= Date.now())
      )
        throw new Error();
      const directory = path.join(root, s.id),
        id = randomUUID();
      requestPath = path.join(directory, id + ".request");
      responsePath = path.join(directory, id + ".response");
      await writeFile(
        requestPath + ".tmp",
        JSON.stringify({ connectorId, actionName, arguments: args }),
        { mode: 0o600 },
      );
      await rename(requestPath + ".tmp", requestPath);
      const deadline = Math.min(
        s.expiresAt ?? Infinity,
        Date.now() + s.timeoutMs + 2000,
      );
      while (Date.now() < deadline) {
        try {
          return JSON.parse(await readFile(responsePath, "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          await access(directory);
          await delay(50);
        }
      }
      return {
        status: "upstream_error",
        message: "Времето за отговор изтече.",
      };
    } catch {
      return {
        status: "binding_unavailable",
        message: "Няма активна сесия за локален прочит.",
      };
    } finally {
      await Promise.all(
        [requestPath, requestPath && requestPath + ".tmp", responsePath]
          .filter(Boolean)
          .map((p) => rm(p, { force: true })),
      );
    }
  },
};
