const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const corePromise = import("../src/local-core.js");

test("la exportación JSON usa whitelist y excluye configuración y secretos", async () => {
  const { containsSensitiveKey, sanitizeExportDatabase } = await corePromise;
  const exported = sanitizeExportDatabase({
    version: 2,
    groups: [{ id: "g1", name: "Grupo", secret: "no" }],
    categories: [{ id: "c1", name: "Carpeta", groupId: "g1" }],
    links: [{ id: "l1", url: "https://example.com", title: "Ejemplo", categoryId: "c1", token: "no" }],
    settings: { password: "no" },
    safety: { writableRoot: "no" }
  });
  assert.equal(exported.groups[0].secret, undefined);
  assert.equal(exported.links[0].token, undefined);
  assert.equal(exported.settings, undefined);
  assert.equal(exported.safety, undefined);
  assert.equal(containsSensitiveKey(exported), false);
});

test("el respaldo contiene solo enlaces activos únicos sin ubicación", async () => {
  const { createActiveBackupPayload } = await corePromise;
  const database = {
    groups: [{ id: "g1", name: "Activo" }, { id: "g2", name: "Archivado", archived: true }],
    categories: [{ id: "c1", name: "Uno", groupId: "g1" }, { id: "c2", name: "Dos", groupId: "g2" }],
    links: [
      { id: "1", url: "https://example.com/a", title: "A", categoryId: "c1", status: "confirmado" },
      { id: "2", url: "HTTPS://EXAMPLE.COM/A", title: "Duplicado", categoryId: "c1" },
      { id: "3", url: "https://example.com/b", title: "Archivado", categoryId: "c1", archived: true },
      { id: "4", url: "https://example.com/c", title: "Grupo archivado", categoryId: "c2" }
    ]
  };
  const backup = createActiveBackupPayload(database, { createdAt: "2026-08-25T00:00:00.000Z", appVersionDetected: "1.0.3" });
  assert.equal(backup.metadata.activeLinkCount, 1);
  assert.equal(backup.metadata.restoreTargetFolder, "Todos");
  assert.equal(backup.links[0].url, "https://example.com/a");
  assert.equal(backup.links[0].categoryId, undefined);
  assert.equal(backup.links[0].archived, undefined);
});

test("el respaldo activo se importa únicamente en Todos y evita duplicados", async () => {
  const { importActiveLinksBackup } = await corePromise;
  const database = { groups: [], categories: [], links: [{ id: "old", url: "https://example.com/existe" }] };
  const backup = {
    metadata: { format: "linkoteca-active-links-local-backup", restoreTargetFolder: "Todos" },
    links: [
      { url: "https://example.com/existe", title: "Existe" },
      { url: "https://example.com/nuevo", title: "Nuevo", categoryId: "anterior" }
    ]
  };
  let nextId = 0;
  const result = importActiveLinksBackup(database, backup, () => `id-${++nextId}`);
  assert.equal(result.imported, 1);
  assert.equal(result.targetFolder, "Todos");
  const todos = database.categories.find((category) => category.name === "Todos");
  assert.ok(todos);
  assert.equal(database.links.find((link) => link.url.endsWith("/nuevo")).categoryId, todos.id);
});

test("SSRF bloquea destinos locales y vuelve a validar cada redirección", async () => {
  const { fetchHtmlSafely, resolvePublicTarget } = await corePromise;
  await assert.rejects(() => resolvePublicTarget("http://127.0.0.1/"), /local|privada|reservada/i);
  await assert.rejects(() => resolvePublicTarget("http://169.254.169.254/latest/meta-data"), /local|privada|reservada/i);
  await assert.rejects(() => resolvePublicTarget("http://localhost/"), /local/i);
  await assert.rejects(
    () => resolvePublicTarget("https://mapped.example", async () => [{ address: "::ffff:127.0.0.1", family: 6 }] ),
    /local|privada|reservada/i
  );

  let requests = 0;
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const request = async () => {
    requests += 1;
    return { statusCode: 302, headers: { location: "http://127.0.0.1/private" }, body: "" };
  };
  await assert.rejects(() => fetchHtmlSafely("https://example.com", { lookup, request }), /local|privada|reservada/i);
  assert.equal(requests, 1);
});

test("la escritura atómica reemplaza el archivo y no deja temporales", async () => {
  const { writeFileAtomic } = await corePromise;
  const tempDir = path.join(__dirname, `.tmp-atomic-${process.pid}-${Date.now()}`);
  const filePath = path.join(tempDir, "data.json");
  await fs.mkdir(tempDir, { recursive: true });
  try {
    await writeFileAtomic(filePath, "uno");
    await writeFileAtomic(filePath, "dos");
    assert.equal(await fs.readFile(filePath, "utf8"), "dos");
    assert.deepEqual((await fs.readdir(tempDir)).sort(), ["data.json"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
