const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`El servidor terminó con código ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/api/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("El servidor local no inició a tiempo");
}

test("el servidor local aplica origen estricto y token a mutaciones", async () => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempHome = path.join(__dirname, `.tmp-server-${process.pid}-${Date.now()}`);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), LINKOTECA_HOME: tempHome, LINKOTECA_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitUntilReady(baseUrl, child);
    const sessionResponse = await fetch(`${baseUrl}/api/session`);
    const session = await sessionResponse.json();
    assert.ok(session.token);

    const foreign = await fetch(`${baseUrl}/api/library`, { headers: { origin: "https://evil.example" } });
    assert.equal(foreign.status, 403);

    const sameOrigin = await fetch(`${baseUrl}/api/library`, { headers: { origin: baseUrl } });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get("access-control-allow-origin"), baseUrl);

    const denied = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sin token" })
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
      body: JSON.stringify({ name: "Local" })
    });
    assert.equal(allowed.status, 200);
    const allowedBody = await allowed.json();

    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
      body: JSON.stringify({ name: `Concurrente ${index}` })
    })));
    assert.ok(concurrent.every((response) => response.status === 200));
    const libraryAfter = await fetch(`${baseUrl}/api/library`).then((response) => response.json());
    assert.equal(libraryAfter.categories.length, 9);

    const createdLinks = await Promise.all(["uno", "dos"].map(async (name) => {
      const response = await fetch(`${baseUrl}/api/links`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
        body: JSON.stringify({
          url: `https://example.com/${name}`,
          title: `Enlace ${name}`,
          categoryId: allowedBody.category.id
        })
      });
      assert.equal(response.status, 200);
      return (await response.json()).link;
    }));
    const linkIds = createdLinks.map((link) => link.id);

    const archivedResponse = await fetch(`${baseUrl}/api/links`, {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
      body: JSON.stringify({ ids: [...linkIds, linkIds[0]] })
    });
    assert.equal(archivedResponse.status, 200);
    const archivedResult = await archivedResponse.json();
    assert.equal(archivedResult.processed, 2);
    assert.equal(archivedResult.archivedLinks.length, 2);
    assert.deepEqual(archivedResult.deletedIds, []);
    const libraryWithTrash = await fetch(`${baseUrl}/api/library`).then((response) => response.json());
    assert.ok(linkIds.every((id) => libraryWithTrash.links.find((link) => link.id === id)?.archived === true));

    const deletedResponse = await fetch(`${baseUrl}/api/links`, {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
      body: JSON.stringify({ ids: linkIds })
    });
    assert.equal(deletedResponse.status, 200);
    const deletedResult = await deletedResponse.json();
    assert.equal(deletedResult.archivedLinks.length, 0);
    assert.deepEqual(new Set(deletedResult.deletedIds), new Set(linkIds));
    const libraryWithoutLinks = await fetch(`${baseUrl}/api/library`).then((response) => response.json());
    assert.ok(linkIds.every((id) => !libraryWithoutLinks.links.some((link) => link.id === id)));

    const emptyTrashLinks = await Promise.all(["archivar", "conservar"].map(async (name) => {
      const response = await fetch(`${baseUrl}/api/links`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
        body: JSON.stringify({
          url: `https://example.com/${name}`,
          title: `Enlace ${name}`,
          categoryId: allowedBody.category.id
        })
      });
      assert.equal(response.status, 200);
      return (await response.json()).link;
    }));
    const [linkToArchive, linkToKeep] = emptyTrashLinks;
    const archiveOne = await fetch(`${baseUrl}/api/links`, {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token },
      body: JSON.stringify({ ids: [linkToArchive.id] })
    });
    assert.equal(archiveOne.status, 200);

    const deniedEmptyTrash = await fetch(`${baseUrl}/api/trash/links`, { method: "DELETE" });
    assert.equal(deniedEmptyTrash.status, 403);
    const emptyTrashResponse = await fetch(`${baseUrl}/api/trash/links`, {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token }
    });
    assert.equal(emptyTrashResponse.status, 200);
    const emptyTrashResult = await emptyTrashResponse.json();
    assert.equal(emptyTrashResult.deleted, 1);
    assert.deepEqual(emptyTrashResult.deletedIds, [linkToArchive.id]);
    const libraryAfterEmptyTrash = await fetch(`${baseUrl}/api/library`).then((response) => response.json());
    assert.equal(libraryAfterEmptyTrash.categories.length, 9);
    assert.equal(libraryAfterEmptyTrash.groups.length, 0);
    assert.ok(!libraryAfterEmptyTrash.links.some((link) => link.id === linkToArchive.id));
    assert.equal(libraryAfterEmptyTrash.links.find((link) => link.id === linkToKeep.id)?.archived, false);

    const databasePath = path.join(tempHome, "data", "linkoteca.json");
    const databaseBeforeEmptyNoop = await fs.readFile(databasePath, "utf8");
    const emptyNoopResponse = await fetch(`${baseUrl}/api/trash/links`, {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-linkoteca-session": session.token }
    });
    assert.equal(emptyNoopResponse.status, 200);
    assert.equal((await emptyNoopResponse.json()).deleted, 0);
    assert.equal(await fs.readFile(databasePath, "utf8"), databaseBeforeEmptyNoop);

    const serverSource = await fs.readFile(path.join(__dirname, "..", "src", "server.js"), "utf8");
    assert.match(serverSource, /app\.listen\(port, host/);
    assert.match(serverSource, /const host = "127\.0\.0\.1"/);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
