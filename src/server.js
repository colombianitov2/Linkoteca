import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  fetchHtmlSafely,
  importActiveLinksBackup,
  sanitizeExportDatabase,
  writeFileAtomic
} from "./local-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const writableRoot = path.resolve(process.env.LINKOTECA_HOME || projectRoot);
const dataDir = path.join(writableRoot, "data");
const backupDir = path.join(dataDir, "backups");
const dbPath = path.join(dataDir, "linkoteca.json");
const bundledDbPath = path.join(projectRoot, "data", "linkoteca.json");
const publicDir = path.join(projectRoot, "public");
const port = Number(process.env.PORT || 4387);
const host = "127.0.0.1";
const appUrl = `http://${host}:${port}`;
const appVersion = "1.0.4";
const latestVersionUrl = "https://raw.githubusercontent.com/colombianitov2/Linkoteca/main/updates/latest.json";
let updateController = null;

export function registerUpdateController(controller) {
  updateController = controller;
}

function normalizeForCompare(value) {
  return path.resolve(value).toLowerCase();
}

function assertWritableInsideProject(targetPath) {
  const root = normalizeForCompare(writableRoot);
  const target = normalizeForCompare(targetPath);
  if (!(target === root || target.startsWith(root + path.sep.toLowerCase()))) {
    throw new Error(`Ruta de escritura no permitida: ${targetPath}`);
  }
}

function defaultSettings() {
  return {
    storage: {
      format: "json"
    },
    updates: {
      latestVersionUrl
    }
  };
}

function mergeSettings(settings = {}) {
  const defaults = defaultSettings();
  return {
    storage: {
      ...defaults.storage,
      format: ["json", "csv", "txt", "xls"].includes(settings.storage?.format)
        ? settings.storage.format
        : defaults.storage.format
    },
    updates: {
      ...defaults.updates,
      latestVersionUrl: typeof settings.updates?.latestVersionUrl === "string"
        ? settings.updates.latestVersionUrl
        : defaults.updates.latestVersionUrl
    }
  };
}

function compareVersionParts(leftValue, rightValue) {
  const left = String(leftValue || "").replace(/^v/i, "").split(/[+-]/, 1)[0].split(".").map(Number);
  const right = String(rightValue || "").replace(/^v/i, "").split(/[+-]/, 1)[0].split(".").map(Number);
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const leftPart = Number.isFinite(left[index]) ? left[index] : 0;
    const rightPart = Number.isFinite(right[index]) ? right[index] : 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function effectiveUpdates(settings = {}) {
  const defaults = defaultSettings().updates;
  return {
    latestVersionUrl: settings.latestVersionUrl || defaults.latestVersionUrl
  };
}

function trustedUpdateDownload(value) {
  try {
    const url = new URL(String(value || ""));
    const trustedPath = /^\/colombianitov2\/linkoteca(?:-beta)?\/releases\/download\//i.test(url.pathname);
    return url.protocol === "https:" && url.hostname === "github.com" && trustedPath ? url.toString() : "";
  } catch {
    return "";
  }
}

function ensureDatabaseShape(db) {
  db.version = db.version || 1;
  db.sourceFile = db.sourceFile || "";
  db.groups = Array.isArray(db.groups) ? db.groups : [];
  db.categories = Array.isArray(db.categories) ? db.categories : [];
  db.links = Array.isArray(db.links) ? db.links : [];
  for (const group of db.groups) {
    group.archived = Boolean(group.archived);
    group.archivedAt = group.archived ? String(group.archivedAt || "") : "";
  }
  const groupIds = new Set(db.groups.map((group) => group.id));
  for (const category of db.categories) {
    category.groupId = groupIds.has(category.groupId) ? category.groupId : null;
    category.archived = Boolean(category.archived);
    category.archivedAt = category.archived ? String(category.archivedAt || "") : "";
  }
  for (const link of db.links) {
    link.archived = Boolean(link.archived);
    link.archivedAt = link.archived ? String(link.archivedAt || "") : "";
  }
  db.settings = mergeSettings(db.settings);
  delete db.safety;
  return db;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80) || "sin-nombre";
}

function idFrom(...parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("instagram.com")) return "Instagram";
    if (host.includes("facebook.com") || host.includes("fb.watch")) return "Facebook";
    if (host.includes("tiktok.com")) return "TikTok";
    if (host.includes("vimeo.com")) return "Vimeo";
    return host.split(".")[0] || "Web";
  } catch {
    return "Web";
  }
}

function getYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").split(/[?&/]/)[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || null;
    }
  } catch {
    return null;
  }
  return null;
}

function thumbnailFromUrl(url) {
  const youtubeId = getYouTubeId(url);
  if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  return "";
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPreviewText(value) {
  const text = decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || /^<|^meta\s/i.test(text)) return "";
  return text;
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function pickMeta(html, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const pattern = /<meta\s+[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (wanted.has(key) && attrs.content) return attrs.content;
  }
  return "";
}

function emptyDatabase() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFile: "",
    groups: [],
    categories: [],
    links: [],
    settings: defaultSettings(),
  };
}

async function ensureDataDir() {
  assertWritableInsideProject(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
}

async function readDatabase() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    return ensureDatabaseShape(JSON.parse(raw.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error.code === "ENOENT") {
      const db = ensureDatabaseShape(emptyDatabase());
      await writeDatabase(db);
      return db;
    }
    throw error;
  }
}

async function writeDatabase(db) {
  await ensureDataDir();
  assertWritableInsideProject(dbPath);
  ensureDatabaseShape(db);
  db.updatedAt = new Date().toISOString();
  const nextRaw = `${JSON.stringify(db, null, 2)}\n`;
  await backupDatabaseIfChanged(nextRaw);
  await writeFileAtomic(dbPath, nextRaw);
}

async function backupDatabaseIfChanged(nextRaw) {
  try {
    const currentRaw = await fs.readFile(dbPath, "utf8");
    if (currentRaw === nextRaw) return;
    assertWritableInsideProject(backupDir);
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `linkoteca-${stamp}.json`);
    assertWritableInsideProject(backupPath);
    await writeFileAtomic(backupPath, currentRaw);
    await pruneBackups(50);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function pruneBackups(maxBackups) {
  const files = await fs.readdir(backupDir, { withFileTypes: true }).catch(() => []);
  const backups = files
    .filter((file) => file.isFile() && /^linkoteca-.+\.json$/.test(file.name))
    .map((file) => file.name)
    .sort()
    .reverse();
  const remove = backups.slice(maxBackups);
  await Promise.all(remove.map((name) => fs.rm(path.join(backupDir, name), { force: true })));
}

async function seedFromBundledDatabaseIfNeeded() {
  if (process.env.LINKOTECA_SEED_BUNDLED !== "1") return null;
  if (normalizeForCompare(dbPath) === normalizeForCompare(bundledDbPath)) return null;
  try {
    const raw = await fs.readFile(bundledDbPath, "utf8");
    const db = ensureDatabaseShape(JSON.parse(raw.replace(/^\uFEFF/, "")));
    await writeDatabase(db);
    return db;
  } catch {
    return null;
  }
}

function categoryByName(db, name, groupId = undefined) {
  const cleanName = String(name || "Sin clasificar").trim() || "Sin clasificar";
  const found = db.categories.find((category) => !category.archived && category.name.toLowerCase() === cleanName.toLowerCase());
  if (found) {
    if (groupId !== undefined) found.groupId = groupId || null;
    return found;
  }
  const category = {
    id: idFrom("category", cleanName),
    name: cleanName,
    slug: slugify(cleanName),
    parentId: null,
    groupId: groupId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "manual"
  };
  db.categories.push(category);
  return category;
}

async function initializeDatabaseIfNeeded() {
  try {
    await fs.access(dbPath);
  } catch {
    const bundled = await seedFromBundledDatabaseIfNeeded();
    if (bundled) return bundled;
    const db = emptyDatabase();
    await writeDatabase(db);
    return db;
  }
  return readDatabase();
}

function safeLinkPayload(body) {
  const url = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("El enlace debe iniciar con http:// o https://");
  return {
    title: String(body.title || "Enlace sin titulo").trim().slice(0, 180),
    url,
    description: String(body.description || "").trim().slice(0, 1200),
    thumbnail: String(body.thumbnail || thumbnailFromUrl(url) || "").trim(),
    platform: detectPlatform(url),
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : []
  };
}

function mergeImportedDatabase(local, imported) {
  const merged = structuredClone(local);
  const groups = new Map(merged.groups.map((group) => [group.id, group]));
  const categories = new Map(merged.categories.map((category) => [category.id, category]));
  const links = new Map(merged.links.map((link) => [link.id, link]));

  for (const group of imported.groups || []) {
    const localGroup = groups.get(group.id);
    if (!localGroup) {
      merged.groups.push(group);
      groups.set(group.id, group);
      continue;
    }
    const localDate = new Date(localGroup.updatedAt || 0).getTime();
    const importedDate = new Date(group.updatedAt || 0).getTime();
    if (importedDate > localDate) Object.assign(localGroup, group);
  }

  for (const category of imported.categories || []) {
    const localCategory = categories.get(category.id);
    if (!localCategory) {
      merged.categories.push(category);
      categories.set(category.id, category);
      continue;
    }
    const localDate = new Date(localCategory.updatedAt || 0).getTime();
    const importedDate = new Date(category.updatedAt || 0).getTime();
    if (importedDate > localDate) Object.assign(localCategory, category);
  }

  for (const importedLink of imported.links || []) {
    const localLink = links.get(importedLink.id);
    if (!localLink) {
      merged.links.push(importedLink);
      links.set(importedLink.id, importedLink);
      continue;
    }
    const localDate = new Date(localLink.updatedAt || 0).getTime();
    const importedDate = new Date(importedLink.updatedAt || 0).getTime();
    if (importedDate > localDate) Object.assign(localLink, importedLink);
  }

  return merged;
}

async function fetchPreview(url) {
  const base = {
    title: "",
    description: "",
    thumbnail: thumbnailFromUrl(url),
    platform: detectPlatform(url)
  };
  try {
    const response = await fetchHtmlSafely(url);
    const contentType = response.contentType;
    if (!contentType.includes("text/html")) return base;
    const html = response.body;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    base.title = cleanPreviewText(pickMeta(html, ["og:title", "twitter:title"]) || titleMatch?.[1] || "");
    base.description = cleanPreviewText(pickMeta(html, ["og:description", "twitter:description", "description"]));
    base.thumbnail = base.thumbnail || absolutizeUrl(pickMeta(html, ["og:image", "twitter:image", "image"]), url);
  } catch (error) {
    if (/local|privada|reservada|Host local|Puerto remoto|credenciales/i.test(error.message)) throw error;
  }
  return base;
}

function tabularRows(db) {
  const categoryNames = new Map(db.categories.map((category) => [category.id, category.name]));
  return db.links.filter((link) => !link.archived).map((link) => ({
    url: link.url || "",
    title: link.title || "",
    description: link.description || "",
    category: categoryNames.get(link.categoryId) || ""
  }));
}

function delimitedText(db, delimiter) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (delimiter === "\t") return text.replaceAll("\t", " ").replaceAll(/\r?\n/g, " ");
    return `"${text.replaceAll('"', '""')}"`;
  };
  const columns = ["url", "title", "description", "category"];
  return [columns.join(delimiter), ...tabularRows(db).map((row) => columns.map((key) => escapeCell(row[key])).join(delimiter))].join("\r\n");
}

function exportPayload(db, format = "json") {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: JSON.stringify(sanitizeExportDatabase(db), null, 2)
    };
  }
  if (format === "csv") return { contentType: "text/csv; charset=utf-8", extension: "csv", body: delimitedText(db, ",") };
  if (format === "txt") return { contentType: "text/plain; charset=utf-8", extension: "txt", body: delimitedText(db, "\t") };
  if (format === "xls") return { contentType: "application/vnd.ms-excel; charset=utf-8", extension: "xls", body: delimitedText(db, "\t") };
  throw new Error("Formato no soportado");
}

function parseDelimited(content, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((value) => value.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function databaseFromRows(rows) {
  const now = new Date().toISOString();
  const categories = [];
  const categoryIds = new Map();
  const links = [];
  for (const row of rows) {
    const url = String(row.url || row.enlace || "").trim();
    if (!url) continue;
    const categoryName = String(row.category || row.carpeta || "").trim();
    let categoryId = null;
    if (categoryName) {
      const key = categoryName.toLocaleLowerCase("es");
      categoryId = categoryIds.get(key);
      if (!categoryId) {
        categoryId = crypto.randomUUID();
        categoryIds.set(key, categoryId);
        categories.push({ id: categoryId, name: categoryName, groupId: null, createdAt: now, updatedAt: now });
      }
    }
    links.push({
      id: crypto.randomUUID(),
      url,
      title: String(row.title || row.titulo || url).trim(),
      description: String(row.description || row.descripcion || "").trim(),
      thumbnail: "",
      categoryId,
      status: "confirmado",
      createdAt: now,
      updatedAt: now
    });
  }
  return { groups: [], categories, links };
}

await initializeDatabaseIfNeeded();

const app = express();
const sessionToken = crypto.randomBytes(32).toString("base64url");
let mutationTail = Promise.resolve();

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && origin !== appUrl) return res.status(403).json({ ok: false, error: "Origen no permitido" });
  if (origin === appUrl) res.setHeader("access-control-allow-origin", appUrl);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-linkoteca-session");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) return next();
  const supplied = req.get("x-linkoteca-session") || "";
  const expected = Buffer.from(sessionToken);
  const received = Buffer.from(supplied);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(403).json({ ok: false, error: "Sesión local no válida" });
  }

  const previous = mutationTail;
  let release;
  mutationTail = new Promise((resolve) => { release = resolve; });
  previous.then(() => {
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      release();
    };
    res.once("finish", done);
    res.once("close", done);
    next();
  }).catch(next);
});
app.use(express.static(publicDir));

app.get("/api/session", (_req, res) => {
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, token: sessionToken });
});

app.get("/api/library", async (_req, res) => {
  const db = await readDatabase();
  const clean = sanitizeExportDatabase(db);
  res.json({
    version: clean.databaseVersion,
    groups: clean.groups,
    categories: clean.categories,
    links: clean.links,
    settings: defaultSettings()
  });
});

app.get("/api/version", async (_req, res) => {
  let automaticUpdateError = "";
  if (updateController) {
    try {
      const result = await updateController.check();
      if (result) return res.json({ ok: true, app: "Linkoteca", ...result });
    } catch (error) {
      automaticUpdateError = error.message;
    }
  }

  const db = await readDatabase();
  const updates = effectiveUpdates(db.settings.updates || {});
  const versionFeed = updates.latestVersionUrl || "";
  let latest = appVersion;
  let status = "local";
  let notes = "";
  let downloadUrl = "";

  if (versionFeed) {
    try {
      const response = await fetch(versionFeed, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        const payload = JSON.parse(text);
        latest = String(payload.version || payload.latest || appVersion);
        notes = String(payload.notes || "").trim();
        downloadUrl = trustedUpdateDownload(payload.downloads?.windows || payload.downloadUrl);
      } catch {
        latest = text.trim().split(/\s+/)[0] || appVersion;
      }
      const comparison = compareVersionParts(latest, appVersion);
      if (comparison > 0) status = "update_available";
      else if (comparison < 0) status = "local_newer";
      else status = "current";
    } catch (error) {
      status = `check_failed: ${error.message}`;
    }
  }

  res.json({
    ok: true,
    app: "Linkoteca",
    version: appVersion,
    latest,
    latestVersionUrl: versionFeed,
    notes,
    downloadUrl,
    automaticUpdateError,
    status
  });
});

app.get("/api/update/status", (_req, res) => {
  if (!updateController) return res.json({ ok: true, status: "unavailable", percent: 0 });
  res.json({ ok: true, ...updateController.status() });
});

app.post("/api/update/download", async (_req, res) => {
  try {
    if (!updateController) throw new Error("La actualización automática solo está disponible en la aplicación instalada");
    res.json({ ok: true, ...(await updateController.download()) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/update/install", (_req, res) => {
  try {
    if (!updateController) throw new Error("La actualización automática solo está disponible en la aplicación instalada");
    res.json({ ok: true, ...updateController.install() });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/export/:format", async (req, res) => {
  try {
    const format = String(req.params.format || "json").toLowerCase();
    if (!["json", "csv", "txt", "xls"].includes(format)) throw new Error("Formato no soportado");
    const db = await readDatabase();
    const payload = exportPayload(db, format);
    res.setHeader("content-type", payload.contentType);
    res.setHeader("content-disposition", `attachment; filename="linkoteca.${payload.extension}"`);
    res.send(payload.body);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/import", async (req, res) => {
  try {
    const format = String(req.body?.format || "json").toLowerCase();
    const content = String(req.body?.content || "").replace(/^\uFEFF/, "");
    const db = await readDatabase();
    if (!["json", "csv", "txt", "xls"].includes(format)) throw new Error("Formato no soportado");
    const parsedJson = format === "json" ? JSON.parse(content) : null;
    if (parsedJson?.metadata?.format === "linkoteca-active-links-local-backup") {
      const result = importActiveLinksBackup(db, parsedJson);
      await writeDatabase(db);
      return res.json({ ok: true, ...result, categories: db.categories.length, links: db.links.length });
    }
    const imported = format === "json"
      ? ensureDatabaseShape(parsedJson)
      : databaseFromRows(parseDelimited(content, format === "csv" ? "," : "\t"));
    const merged = mergeImportedDatabase(db, imported);
    const importedCount = Math.max(0, merged.links.length - db.links.length);
    await writeDatabase(merged);
    res.json({ ok: true, imported: importedCount, categories: merged.categories.length, links: merged.links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const db = await readDatabase();
    const groupId = req.body?.groupId || null;
    if (groupId && !db.groups.some((group) => group.id === groupId && !group.archived)) {
      return res.status(400).json({ ok: false, error: "Grupo invalido" });
    }
    const category = categoryByName(db, req.body?.name, groupId);
    category.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    res.json({ ok: true, category });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch("/api/categories/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const category = db.categories.find((item) => item.id === req.params.id);
    if (!category) return res.status(404).json({ ok: false, error: "Carpeta no encontrada" });
    if (req.body.name) {
      category.name = String(req.body.name).trim().slice(0, 120);
      category.slug = slugify(category.name);
    }
    if ("parentId" in req.body) category.parentId = req.body.parentId || null;
    if ("groupId" in req.body) {
      const groupId = req.body.groupId || null;
      if (groupId && !db.groups.some((group) => group.id === groupId && !group.archived)) {
        return res.status(400).json({ ok: false, error: "Grupo invalido" });
      }
      category.groupId = groupId;
    }
    category.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    res.json({ ok: true, category });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/groups", async (req, res) => {
  try {
    const db = await readDatabase();
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ ok: false, error: "Escribe un nombre para el grupo" });
    const existing = db.groups.find((group) => !group.archived && group.name.toLowerCase() === name.toLowerCase());
    if (existing) return res.json({ ok: true, group: existing });
    const now = new Date().toISOString();
    const group = {
      id: idFrom("group", name, now),
      name,
      createdAt: now,
      updatedAt: now
    };
    db.groups.push(group);
    await writeDatabase(db);
    res.json({ ok: true, group });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch("/api/groups/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const group = db.groups.find((item) => item.id === req.params.id);
    if (!group) return res.status(404).json({ ok: false, error: "Grupo no encontrado" });
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ ok: false, error: "Escribe un nombre para el grupo" });
    group.name = name;
    group.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    res.json({ ok: true, group });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/groups/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const index = db.groups.findIndex((item) => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ ok: false, error: "Grupo no encontrado" });
    const group = db.groups[index];
    const categoryIds = new Set(db.categories.filter((category) => category.groupId === group.id).map((category) => category.id));
    if (req.query.permanent === "1") {
      db.groups.splice(index, 1);
      db.categories = db.categories.filter((category) => !categoryIds.has(category.id));
      db.links = db.links.filter((link) => !categoryIds.has(link.categoryId));
      await writeDatabase(db);
      return res.json({ ok: true, deleted: true, group });
    }
    const now = new Date().toISOString();
    group.archived = true;
    group.archivedAt = now;
    group.updatedAt = now;
    for (const category of db.categories) {
      if (!categoryIds.has(category.id) || category.archived) continue;
      category.archived = true;
      category.archivedAt = now;
      category.archivedByGroupId = group.id;
      category.updatedAt = now;
    }
    for (const link of db.links) {
      if (!categoryIds.has(link.categoryId) || link.archived) continue;
      link.archived = true;
      link.archivedAt = now;
      link.archivedByGroupId = group.id;
      link.status = "archivado";
      link.updatedAt = now;
    }
    await writeDatabase(db);
    res.json({ ok: true, archived: true, group });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/groups/:id/restore", async (req, res) => {
  const db = await readDatabase();
  const group = db.groups.find((item) => item.id === req.params.id);
  if (!group) return res.status(404).json({ ok: false, error: "Grupo no encontrado" });
  const now = new Date().toISOString();
  group.archived = false;
  group.archivedAt = "";
  group.updatedAt = now;
  for (const category of db.categories) {
    if (category.archivedByGroupId !== group.id) continue;
    category.archived = false;
    category.archivedAt = "";
    delete category.archivedByGroupId;
    category.updatedAt = now;
  }
  for (const link of db.links) {
    if (link.archivedByGroupId !== group.id) continue;
    link.archived = false;
    link.archivedAt = "";
    delete link.archivedByGroupId;
    if (link.status === "archivado") link.status = "confirmado";
    link.updatedAt = now;
  }
  await writeDatabase(db);
  res.json({ ok: true, restored: true, group });
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const index = db.categories.findIndex((item) => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ ok: false, error: "Carpeta no encontrada" });
    const category = db.categories[index];
    if (req.query.permanent === "1") {
      db.categories.splice(index, 1);
      db.links = db.links.filter((link) => link.categoryId !== category.id);
      await writeDatabase(db);
      return res.json({ ok: true, deleted: true, category });
    }
    const now = new Date().toISOString();
    category.archived = true;
    category.archivedAt = now;
    category.updatedAt = now;
    for (const link of db.links) {
      if (link.categoryId !== category.id || link.archived) continue;
      link.archived = true;
      link.archivedAt = now;
      link.archivedByCategoryId = category.id;
      link.status = "archivado";
      link.updatedAt = now;
    }
    await writeDatabase(db);
    res.json({ ok: true, archived: true, category });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/categories/:id/restore", async (req, res) => {
  const db = await readDatabase();
  const category = db.categories.find((item) => item.id === req.params.id);
  if (!category) return res.status(404).json({ ok: false, error: "Carpeta no encontrada" });
  const group = category.groupId ? db.groups.find((item) => item.id === category.groupId) : null;
  if (group?.archived) return res.status(400).json({ ok: false, error: "Restaura primero el grupo de esta carpeta" });
  const now = new Date().toISOString();
  category.archived = false;
  category.archivedAt = "";
  category.updatedAt = now;
  for (const link of db.links) {
    if (link.archivedByCategoryId !== category.id) continue;
    link.archived = false;
    link.archivedAt = "";
    delete link.archivedByCategoryId;
    if (link.status === "archivado") link.status = "confirmado";
    link.updatedAt = now;
  }
  await writeDatabase(db);
  res.json({ ok: true, restored: true, category });
});

app.post("/api/links", async (req, res) => {
  try {
    const db = await readDatabase();
    const payload = safeLinkPayload(req.body || {});
    const existing = db.links.find((link) => link.url.trim().toLowerCase() === payload.url.trim().toLowerCase());
    if (existing) {
      const category = db.categories.find((item) => item.id === existing.categoryId);
      return res.status(409).json({
        ok: false,
        error: `Este enlace ya existe en ${category?.name || "Todos"}.`
      });
    }
    let category = null;
    if (req.body.categoryId) category = db.categories.find((item) => item.id === req.body.categoryId && !item.archived);
    else if (req.body.categoryName) category = categoryByName(db, req.body.categoryName);
    if ((req.body.categoryId || req.body.categoryName) && !category) {
      return res.status(400).json({ ok: false, error: "Carpeta invalida" });
    }
    const now = new Date().toISOString();
    const link = {
      id: idFrom(payload.url, now),
      ...payload,
      categoryId: category?.id || null,
      status: "confirmado",
      confidence: 0,
      source: "manual",
      sourceSheet: "",
      sourceCell: "",
      createdAt: now,
      updatedAt: now
    };
    db.links.unshift(link);
    await writeDatabase(db);
    res.json({ ok: true, link });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch("/api/links/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const link = db.links.find((item) => item.id === req.params.id);
    if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });

    if (req.body.title !== undefined) link.title = String(req.body.title).trim().slice(0, 180);
    if (req.body.description !== undefined) link.description = String(req.body.description).trim().slice(0, 1200);
    if (req.body.thumbnail !== undefined) link.thumbnail = String(req.body.thumbnail).trim();
    if (req.body.status !== undefined) link.status = String(req.body.status).trim();
    if (Array.isArray(req.body.tags)) link.tags = req.body.tags.map(String).slice(0, 20);
    if (req.body.archived !== undefined) {
      link.archived = Boolean(req.body.archived);
      link.archivedAt = link.archived ? new Date().toISOString() : "";
      if (link.archived) link.status = "archivado";
      else if (link.status === "archivado") link.status = "confirmado";
    }
    if (req.body.categoryId !== undefined) {
      const categoryId = req.body.categoryId || null;
      const category = categoryId ? db.categories.find((item) => item.id === categoryId && !item.archived) : null;
      if (categoryId && !category) return res.status(400).json({ ok: false, error: "Carpeta invalida" });
      link.categoryId = category?.id || null;
      link.archived = false;
      link.archivedAt = "";
      delete link.archivedByCategoryId;
      delete link.archivedByGroupId;
      link.status = "confirmado";
      link.confidence = 1;
    }
    link.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    res.json({ ok: true, link });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/trash/links", async (_req, res) => {
  try {
    const db = await readDatabase();
    const deletedIds = db.links
      .filter((link) => link.archived)
      .map((link) => String(link.id));
    if (deletedIds.length === 0) {
      return res.json({ ok: true, deleted: 0, deletedIds: [] });
    }
    const deletedSet = new Set(deletedIds);
    db.links = db.links.filter((link) => !deletedSet.has(String(link.id)));
    await writeDatabase(db);
    res.json({ ok: true, deleted: deletedIds.length, deletedIds });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/links", async (req, res) => {
  try {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ ok: false, error: "Selecciona al menos un enlace" });
    }
    if (rawIds.length > 5000) {
      return res.status(400).json({ ok: false, error: "Demasiados enlaces seleccionados" });
    }
    const normalizedIds = rawIds.map((id) => String(id).trim());
    if (normalizedIds.some((id) => !id)) {
      return res.status(400).json({ ok: false, error: "Selección de enlaces inválida" });
    }
    const ids = [...new Set(normalizedIds)];
    const db = await readDatabase();
    const linksById = new Map(db.links.map((link) => [String(link.id), link]));
    const missingIds = ids.filter((id) => !linksById.has(id));
    if (missingIds.length > 0) {
      return res.status(404).json({ ok: false, error: "Uno o más enlaces ya no existen" });
    }

    const now = new Date().toISOString();
    const archivedLinks = [];
    const deletedIds = [];
    for (const id of ids) {
      const link = linksById.get(id);
      if (link.archived) {
        deletedIds.push(id);
        continue;
      }
      link.archived = true;
      link.archivedAt = now;
      link.status = "archivado";
      link.updatedAt = now;
      archivedLinks.push(link);
    }
    if (deletedIds.length > 0) {
      const deletedSet = new Set(deletedIds);
      db.links = db.links.filter((link) => !deletedSet.has(String(link.id)));
    }
    await writeDatabase(db);
    res.json({ ok: true, processed: ids.length, archivedLinks, deletedIds });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/links/:id", async (req, res) => {
  const db = await readDatabase();
  const index = db.links.findIndex((item) => item.id === req.params.id);
  const link = db.links[index];
  if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });
  if (req.query.permanent === "1" || link.archived) {
    const [deletedLink] = db.links.splice(index, 1);
    await writeDatabase(db);
    return res.json({ ok: true, deleted: true, link: deletedLink });
  }
  link.archived = true;
  link.archivedAt = new Date().toISOString();
  link.status = "archivado";
  link.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  res.json({ ok: true, archived: true, link });
});

app.post("/api/links/:id/restore", async (req, res) => {
  const db = await readDatabase();
  const link = db.links.find((item) => item.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });
  const category = link.categoryId ? db.categories.find((item) => item.id === link.categoryId) : null;
  const group = category?.groupId ? db.groups.find((item) => item.id === category.groupId) : null;
  if (category?.archived || group?.archived) {
    return res.status(400).json({ ok: false, error: "Restaura primero la carpeta o grupo de este enlace" });
  }
  link.archived = false;
  link.archivedAt = "";
  delete link.archivedByCategoryId;
  delete link.archivedByGroupId;
  if (link.status === "archivado") link.status = "confirmado";
  link.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  res.json({ ok: true, restored: true, link });
});

app.get("/api/backups", async (_req, res) => {
  const files = await fs.readdir(backupDir, { withFileTypes: true }).catch(() => []);
  const backups = files
    .filter((file) => file.isFile() && /^linkoteca-.+\.json$/.test(file.name))
    .map((file) => file.name)
    .sort()
    .reverse();
  res.json({ ok: true, backups });
});

app.post("/api/preview", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("URL invalida");
    const preview = await fetchPreview(url);
    res.json({ ok: true, preview });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch("/api/settings", async (req, res) => {
  const db = await readDatabase();
  db.settings = mergeSettings({
    ...db.settings,
    ...req.body,
    storage: { ...db.settings.storage, ...(req.body.storage || {}) }
  });
  await writeDatabase(db);
  res.json({ ok: true, settings: db.settings });
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, host, () => {
  console.log(`Linkoteca lista en ${appUrl}`);
  console.log(`Datos: ${dbPath}`);
  console.log(`Raiz de usuario: ${writableRoot}`);
});
