import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");
const writableRoot = path.resolve(process.env.LINKOTECA_HOME || projectRoot);
const dataDir = path.join(writableRoot, "data");
const backupDir = path.join(dataDir, "backups");
const dbPath = path.join(dataDir, "linkoteca.json");
const bundledDbPath = path.join(projectRoot, "data", "linkoteca.json");
const publicDir = path.join(projectRoot, "public");
const defaultExcelPath = "C:\\Users\\erpec\\Desktop\\Links.xlsx";
const port = Number(process.env.PORT || 4387);
const appUrl = `http://localhost:${port}`;
const appVersion = "0.3.0-beta.2";
const latestVersionUrl = "https://raw.githubusercontent.com/colombianitov2/Linkoteca/main/updates/latest.json";

const blockedRoots = [
  path.resolve("D:\\Nube"),
  path.resolve("D:\\Nube\\Fotos y videos")
];

const defaultExportDir = path.join(writableRoot, "exports");

function normalizeForCompare(value) {
  return path.resolve(value).toLowerCase();
}

function assertWritableInsideProject(targetPath) {
  const root = normalizeForCompare(writableRoot);
  const target = normalizeForCompare(targetPath);
  if (!(target === root || target.startsWith(root + path.sep.toLowerCase()))) {
    throw new Error(`Ruta de escritura no permitida: ${targetPath}`);
  }
  for (const blocked of blockedRoots) {
    const blockedNorm = normalizeForCompare(blocked);
    if (target === blockedNorm || target.startsWith(blockedNorm + path.sep.toLowerCase())) {
      throw new Error(`Ruta bloqueada por seguridad: ${targetPath}`);
    }
  }
}

function assertAllowedExternalWritePath(targetPath) {
  const target = normalizeForCompare(targetPath);
  for (const blocked of blockedRoots) {
    const blockedNorm = normalizeForCompare(blocked);
    if (target === blockedNorm || target.startsWith(blockedNorm + path.sep.toLowerCase())) {
      throw new Error(`Ruta bloqueada por seguridad: ${targetPath}`);
    }
  }
}

function defaultSettings() {
  return {
    contact: {
      ownerName: "Ernesto Pernett",
      ownerTitle: "Ingeniero Mecánico",
      supportEmail: "epernett1020@hotmail.com"
    },
    storage: {
      path: defaultExportDir,
      format: "json"
    },
    sync: {
      mode: "none",
      provider: "none",
      autoOnOpen: true,
      remoteUrl: "",
      webdavUrl: "",
      folderPath: "",
      username: "",
      password: ""
    },
    trash: {
      retentionDays: 30
    },
    updates: {
      latestVersionUrl
    }
  };
}

function mergeSettings(settings = {}) {
  const defaults = defaultSettings();
  const updates = {
    latestVersionUrl: settings.updates?.latestVersionUrl || defaults.updates.latestVersionUrl
  };
  const rawSync = { ...defaults.sync, ...(settings.sync || {}) };
  const allowedModes = new Set(["none", "webdav", "ip"]);
  const mode = allowedModes.has(rawSync.mode) ? rawSync.mode : "none";
  const retentionDays = [5, 10, 15, 30].includes(Number(settings.trash?.retentionDays))
    ? Number(settings.trash.retentionDays)
    : defaults.trash.retentionDays;
  for (const key of Object.keys(defaults.updates)) {
    if (!updates[key]) updates[key] = defaults.updates[key];
  }
  return {
    ...defaults,
    ...settings,
    contact: { ...defaults.contact, supportEmail: "epernett1020@hotmail.com" },
    storage: { ...defaults.storage, ...(settings.storage || {}) },
    sync: {
      ...defaults.sync,
      mode,
      provider: mode,
      autoOnOpen: rawSync.autoOnOpen !== false,
      remoteUrl: String(rawSync.remoteUrl || "").trim(),
      webdavUrl: String(rawSync.webdavUrl || "").trim(),
      folderPath: String(rawSync.folderPath || "").trim(),
      username: "",
      password: ""
    },
    trash: { retentionDays },
    updates
  };
}

function ensureDatabaseShape(db) {
  db.version = db.version || 1;
  db.categories = Array.isArray(db.categories) ? db.categories : [];
  db.links = Array.isArray(db.links) ? db.links : [];
  for (const link of db.links) {
    if (link.status === ["auto", "clasificado"].join("-")) link.status = "confirmado";
    if (link.archived && link.status === "archivado") link.status = "eliminado";
    delete link[["auto", "Classified"].join("")];
    delete link.classificationMethod;
  }
  db.settings = mergeSettings(db.settings);
  db.safety = {
    writableRoot,
    blockedRoots
  };
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

function safeFileName(value, fallback = "sin-nombre") {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || fallback;
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

function isInstagramUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase().includes("instagram.com");
  } catch {
    return false;
  }
}

function isFacebookUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host.includes("facebook.com") || host.includes("fb.watch");
  } catch {
    return false;
  }
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

async function fetchYouTubePreview(url) {
  const youtubeId = getYouTubeId(url);
  if (!youtubeId) return null;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: cleanPreviewText(data.title || ""),
      description: data.author_name ? `Canal: ${data.author_name}` : "",
      thumbnail: data.thumbnail_url || thumbnailFromUrl(url),
      platform: "YouTube",
      author: data.author_name || "",
      authorUrl: data.author_url || ""
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function emptyDatabase() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceExcel: defaultExcelPath,
    categories: [],
    links: [],
    settings: defaultSettings(),
    safety: {
      writableRoot,
      blockedRoots
    }
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
  await fs.writeFile(dbPath, nextRaw, "utf8");
}

async function fetchInstagramOEmbedPreview(url) {
  if (!isInstagramUrl(url)) return null;
  const endpoint = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: cleanPreviewText(data.title || data.author_name || "Publicación de Instagram"),
      description: data.author_name ? `Instagram: ${data.author_name}` : "Vista previa de Instagram",
      thumbnail: "",
      platform: "Instagram"
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function previewUserAgentsForUrl(url) {
  if (isInstagramUrl(url)) {
    return [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A",
      "Twitterbot/1.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    ];
  }
  if (isFacebookUrl(url)) {
    return [
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    ];
  }
  return [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
  ];
}

function pruneExpiredTrash(db) {
  const retentionDays = [5, 10, 15, 30].includes(Number(db.settings?.trash?.retentionDays))
    ? Number(db.settings.trash.retentionDays)
    : 30;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const before = db.links.length;
  db.links = db.links.filter((link) => {
    if (!link.archived || !link.archivedAt) return true;
    const archivedAt = new Date(link.archivedAt).getTime();
    if (!Number.isFinite(archivedAt)) return true;
    return archivedAt >= cutoff;
  });
  return before - db.links.length;
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
    await fs.writeFile(backupPath, currentRaw, "utf8");
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
    db.safety = { writableRoot, blockedRoots };
    await writeDatabase(db);
    return db;
  } catch {
    return null;
  }
}

function categoryByName(db, name) {
  const cleanName = String(name || "Sin clasificar").trim() || "Sin clasificar";
  const found = db.categories.find((category) => category.name.toLowerCase() === cleanName.toLowerCase());
  if (found) return found;
  const category = {
    id: idFrom("category", cleanName),
    name: cleanName,
    slug: slugify(cleanName),
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "manual"
  };
  db.categories.push(category);
  return category;
}

async function seedFromExcelIfNeeded() {
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

function markLinkDeleted(link, now = new Date().toISOString()) {
  link.archived = true;
  link.archivedAt = now;
  link.status = "eliminado";
  link.updatedAt = now;
  return link;
}

function restoreDeletedLink(link, now = new Date().toISOString()) {
  link.archived = false;
  link.archivedAt = "";
  if (link.status === "archivado" || link.status === "eliminado") link.status = "confirmado";
  link.updatedAt = now;
  return link;
}

function mergeRemoteDatabase(local, remote) {
  const merged = structuredClone(local);
  const categories = new Map(merged.categories.map((category) => [category.id, category]));
  const links = new Map(merged.links.map((link) => [link.id, link]));

  for (const category of remote.categories || []) {
    if (!categories.has(category.id)) {
      merged.categories.push(category);
      categories.set(category.id, category);
    }
  }

  for (const remoteLink of remote.links || []) {
    const localLink = links.get(remoteLink.id);
    if (!localLink) {
      merged.links.push(remoteLink);
      links.set(remoteLink.id, remoteLink);
      continue;
    }
    const localDate = new Date(localLink.updatedAt || 0).getTime();
    const remoteDate = new Date(remoteLink.updatedAt || 0).getTime();
    if (remoteDate > localDate) Object.assign(localLink, remoteLink);
  }

  return merged;
}

function faviconFallback(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return "";
  }
}

async function fetchPreview(url) {
  const youtubePreview = await fetchYouTubePreview(url);
  if (youtubePreview) return youtubePreview;
  const instagramOEmbedPreview = await fetchInstagramOEmbedPreview(url);

  const base = {
    title: instagramOEmbedPreview?.title || "",
    description: instagramOEmbedPreview?.description || "",
    thumbnail: thumbnailFromUrl(url),
    platform: instagramOEmbedPreview?.platform || detectPlatform(url)
  };
  for (const userAgent of previewUserAgentsForUrl(url)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "es-ES,es;q=0.9,en;q=0.8",
          "user-agent": userAgent
        }
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = cleanPreviewText(pickMeta(html, ["og:title", "twitter:title"]) || titleMatch?.[1] || "");
      const description = cleanPreviewText(pickMeta(html, ["og:description", "twitter:description", "description"]));
      const image = absolutizeUrl(pickMeta(html, ["og:image", "twitter:image", "twitter:image:src", "image"]), url);
      const platform = isInstagramUrl(url)
        ? "Instagram"
        : isFacebookUrl(url)
          ? "Facebook"
          : cleanPreviewText(pickMeta(html, ["og:site_name", "twitter:site"]) || detectPlatform(url));
      if (title && !/^instagram$/i.test(title)) base.title = title;
      if (description) base.description = description;
      if (image) base.thumbnail = image;
      if (platform) base.platform = platform;
      if (base.title && base.thumbnail) break;
    } catch {
      // Sigue probando otros agentes de vista previa.
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!base.thumbnail) base.thumbnail = faviconFallback(url);
  return base;
}

function shouldApplyPreviewTitle(link, preview) {
  if (!preview.title) return false;
  const title = String(link.title || "").trim().toLowerCase();
  return !title || title === "enlace sin titulo" || title === hostFromUrlSafe(link.url);
}

function hostFromUrlSafe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function applyPreviewToLink(link, preview) {
  let changed = false;
  if (shouldApplyPreviewTitle(link, preview)) {
    link.title = cleanPreviewText(preview.title).slice(0, 180);
    changed = true;
  }
  const description = cleanPreviewText(preview.description);
  if ((!link.description || /^<|^meta\s/i.test(link.description)) && description) {
    link.description = description.slice(0, 1200);
    changed = true;
  }
  if (!link.thumbnail && preview.thumbnail) {
    link.thumbnail = preview.thumbnail;
    changed = true;
  }
  if (preview.platform && preview.platform !== link.platform) {
    link.platform = preview.platform;
    changed = true;
  }
  if (changed) link.updatedAt = new Date().toISOString();
  return changed;
}

function sanitizeLinkPreviewFields(link) {
  let changed = false;
  if (link.description) {
    const cleaned = cleanPreviewText(link.description);
    if (cleaned !== link.description) {
      link.description = cleaned;
      changed = true;
    }
  }
  if (link.title) {
    const cleaned = cleanPreviewText(link.title);
    if (cleaned && cleaned !== link.title) {
      link.title = cleaned.slice(0, 180);
      changed = true;
    }
  }
  if (changed) link.updatedAt = new Date().toISOString();
  return changed;
}

function syncHeaders(settings) {
  return { "content-type": "application/json" };
}

function looksLikeFilePath(value) {
  const text = String(value || "").trim();
  return /^[a-zA-Z]:[\\/]/.test(text) || /^\\\\[^\\]+\\[^\\]+/.test(text);
}

function getSyncUrl(settings) {
  if (settings.mode === "webdav") return settings.webdavUrl;
  if (settings.mode === "ip" && !looksLikeFilePath(settings.remoteUrl)) return settings.remoteUrl;
  return "";
}

function getFolderSyncPath(settings) {
  if (settings.mode !== "ip") return "";
  const target = String(settings.remoteUrl || "").trim();
  if (!looksLikeFilePath(target)) return "";
  return path.extname(target).toLowerCase() === ".json"
    ? target
    : path.join(target, "linkoteca.json");
}

function effectiveUpdates(settings = {}) {
  const defaults = defaultSettings().updates;
  return {
    latestVersionUrl: settings.latestVersionUrl || defaults.latestVersionUrl
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function libraryToRows(db) {
  const categoryMap = new Map(db.categories.map((category) => [category.id, category.name]));
  return db.links.map((link) => ({
    title: link.title || "",
    url: link.url || "",
    description: link.description || "",
    category: categoryMap.get(link.categoryId) || "",
    platform: link.platform || "",
    status: link.status || "",
    source: link.source || "",
    createdAt: link.createdAt || "",
    updatedAt: link.updatedAt || ""
  }));
}

function libraryToCsv(db) {
  const headers = ["title", "url", "description", "category", "platform", "status", "source", "createdAt", "updatedAt"];
  const rows = libraryToRows(db);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

function libraryToTxt(db) {
  return libraryToRows(db)
    .map((row) => [
      `Título: ${row.title}`,
      `URL: ${row.url}`,
      `Carpeta: ${row.category}`,
      `Plataforma: ${row.platform}`,
      row.description ? `Descripción: ${row.description}` : "",
      "---"
    ].filter(Boolean).join("\n"))
    .join("\n");
}

function escapeExcelHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJsSingleQuoted(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replace(/\r?\n/g, " ");
}

function libraryToExcelHtml(db) {
  const rows = libraryToRows(db);
  const headers = ["Título", "URL", "Descripción", "Carpeta", "Plataforma", "Estado", "Origen", "Creado", "Actualizado"];
  const keys = ["title", "url", "description", "category", "platform", "status", "source", "createdAt", "updatedAt"];
  const head = headers.map((header) => `<th>${escapeExcelHtml(header)}</th>`).join("");
  const body = rows.map((row) => {
    return `<tr>${keys.map((key) => `<td>${escapeExcelHtml(row[key])}</td>`).join("")}</tr>`;
  }).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; }
    th { background: #111111; color: #ffffff; font-weight: 700; }
    th, td { border: 1px solid #d9d9d9; padding: 6px 8px; vertical-align: top; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

function linkSummaryText(link, categoryName) {
  return [
    `Titulo: ${link.title || "Enlace sin titulo"}`,
    `URL: ${link.url || ""}`,
    `Carpeta: ${categoryName || "Sin carpeta"}`,
    `Plataforma: ${link.platform || "Web"}`,
    `Estado: ${link.status || "pendiente"}`,
    `Confianza: ${typeof link.confidence === "number" ? link.confidence : 0}`,
    `Etiquetas: ${Array.isArray(link.tags) && link.tags.length ? link.tags.join(", ") : ""}`,
    `Origen: ${link.source || ""}`,
    `Categoria ID: ${link.categoryId || ""}`,
    link.description ? `Descripcion: ${link.description}` : "",
    `Actualizado: ${link.updatedAt || ""}`
  ].filter(Boolean).join("\n");
}

function shortcutFileBody(link) {
  return `[InternetShortcut]\nURL=${link.url || ""}\n`;
}

function linkMetadataJson(link, categoryName) {
  return JSON.stringify({
    title: link.title || "Enlace sin titulo",
    url: link.url || "",
    description: link.description || "",
    thumbnail: link.thumbnail || "",
    platform: link.platform || "Web",
    status: link.status || "pendiente",
    confidence: typeof link.confidence === "number" ? link.confidence : 0,
    tags: Array.isArray(link.tags) ? link.tags : [],
    categoryId: link.categoryId || "",
    categoryName: categoryName || "Sin carpeta",
    source: link.source || "",
    sourceSheet: link.sourceSheet || "",
    sourceCell: link.sourceCell || "",
    createdAt: link.createdAt || "",
    updatedAt: link.updatedAt || ""
  }, null, 2);
}

function staticGalleryStyles() {
  return `
:root {
  color-scheme: light;
  --bg: #f4f2ed;
  --surface: #ffffff;
  --ink: #111111;
  --muted: #6b665f;
  --line: #e4e0d8;
  --rose: #e11d48;
  --teal: #0f766e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
}
header {
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--line);
  background: rgba(251, 250, 247, 0.94);
  backdrop-filter: blur(14px);
  padding: 22px clamp(16px, 4vw, 38px);
}
.eyebrow {
  color: var(--rose);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}
h1 {
  margin: 5px 0 4px;
  font-size: clamp(28px, 5vw, 46px);
  line-height: 1.05;
}
p {
  color: var(--muted);
  line-height: 1.5;
}
main {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 22px;
  padding: 26px clamp(16px, 4vw, 38px) 44px;
}
.card {
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(17, 17, 17, 0.06);
}
.thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: linear-gradient(135deg, #111 0 48%, var(--rose) 48% 64%, var(--teal) 64% 100%);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  color: #fff;
  font-size: 34px;
  font-weight: 900;
}
.platform {
  position: absolute;
  left: 10px;
  bottom: 10px;
  border-radius: 8px;
  padding: 5px 8px;
  color: #fff;
  background: rgba(17, 17, 17, 0.78);
  font-size: 12px;
  font-weight: 800;
}
.body {
  padding: 14px;
}
h2 {
  margin: 0 0 8px;
  font-size: 17px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.body p {
  margin: 0;
  font-size: 13px;
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--line);
}
.actions a,
.actions button {
  min-height: 44px;
  border: 0;
  color: var(--ink);
  background: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  text-decoration: none;
  cursor: pointer;
}
.actions a {
  display: grid;
  place-items: center;
}
.actions button {
  border-left: 1px solid var(--line);
}
.actions a:hover,
.actions button:hover {
  color: var(--rose);
  background: #fbf2f4;
}
header a {
  color: var(--ink);
  font-weight: 800;
}
.folder-card .body p {
  font-weight: 800;
}
@media (max-width: 580px) {
  main { grid-template-columns: 1fr; }
}
`;
}

function staticGalleryScript() {
  return `
<script>
  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      alert("Enlace copiado");
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      alert("Enlace copiado");
    }
  }
</script>`;
}

function staticGalleryPage({ title, subtitle, cards, backHref = "" }) {
  const back = backHref ? `<p><a href="${escapeExcelHtml(backHref)}">Volver a carpetas</a></p>` : "";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeExcelHtml(title)}</title>
  <link rel="stylesheet" href="${backHref ? "../" : ""}styles.css">
</head>
<body>
  <header>
    <span class="eyebrow">Linkoteca exportada</span>
    <h1>${escapeExcelHtml(title)}</h1>
    <p>${escapeExcelHtml(subtitle)}</p>
    ${back}
  </header>
  <main>
    ${cards.join("\n")}
  </main>
  ${staticGalleryScript()}
</body>
</html>`;
}

function staticLinkCard(link) {
  const title = link.title || "Enlace sin titulo";
  const initial = escapeExcelHtml(String(link.platform || "W").slice(0, 1).toUpperCase());
  const thumb = link.thumbnail
    ? `<img src="${escapeExcelHtml(link.thumbnail)}" alt="">`
    : `<div class="placeholder">${initial}</div>`;
  return `<article class="card">
  <div class="thumb">
    ${thumb}
    <span class="platform">${escapeExcelHtml(link.platform || "Web")}</span>
  </div>
  <div class="body">
    <h2>${escapeExcelHtml(title)}</h2>
    <p>${escapeExcelHtml(link.description || hostFromUrlSafe(link.url) || link.url)}</p>
  </div>
  <div class="actions">
    <a href="${escapeExcelHtml(link.url || "#")}" target="_blank" rel="noopener">Abrir</a>
    <button type="button" onclick="copyLink('${escapeExcelHtml(escapeJsSingleQuoted(link.url || ""))}')">Copiar</button>
  </div>
</article>`;
}

function staticFolderCard(category, count, folderName) {
  return `<article class="card folder-card">
  <div class="thumb"><div class="placeholder">${escapeExcelHtml(String(category.name || "C").slice(0, 1).toUpperCase())}</div></div>
  <div class="body">
    <h2>${escapeExcelHtml(category.name)}</h2>
    <p>${count} enlaces</p>
  </div>
  <div class="actions">
    <a href="${encodeURIComponent(folderName)}/index.html">Abrir carpeta</a>
    <button type="button" onclick="copyLink('${escapeExcelHtml(escapeJsSingleQuoted(category.name))}')">Copiar nombre</button>
  </div>
</article>`;
}

async function exportStaticGallery(db, folderPath) {
  const root = path.join(path.resolve(folderPath || defaultExportDir), "Linkoteca Galeria");
  assertAllowedExternalWritePath(root);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "styles.css"), staticGalleryStyles(), "utf8");

  const categoryMap = new Map(db.categories.map((category) => [category.id, category]));
  const activeLinks = db.links.filter((link) => !link.archived);
  const byCategory = new Map();
  for (const link of activeLinks) {
    const category = categoryMap.get(link.categoryId) || {
      id: "sin-clasificar",
      name: "Sin clasificar",
      slug: "sin-clasificar"
    };
    if (!byCategory.has(category.id)) byCategory.set(category.id, { category, links: [] });
    byCategory.get(category.id).links.push(link);
  }

  const folderCards = [];
  for (const { category, links } of [...byCategory.values()].sort((a, b) => a.category.name.localeCompare(b.category.name, "es"))) {
    const folderName = safeFileName(category.name, category.id);
    const categoryDir = path.join(root, folderName);
    assertAllowedExternalWritePath(categoryDir);
    await fs.mkdir(categoryDir, { recursive: true });

    const cards = [];
    const sortedLinks = [...links].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "es"));
    for (const [index, link] of sortedLinks.entries()) {
      const fileBase = `${String(index + 1).padStart(3, "0")} - ${safeFileName(link.title || hostFromUrlSafe(link.url), link.id)}`;
      await fs.writeFile(path.join(categoryDir, `${fileBase}.url`), shortcutFileBody(link), "utf8");
      await fs.writeFile(path.join(categoryDir, `${fileBase}.txt`), `${linkSummaryText(link, category.name)}\n`, "utf8");
      await fs.writeFile(path.join(categoryDir, `${fileBase}.json`), `${linkMetadataJson(link, category.name)}\n`, "utf8");
      cards.push(staticLinkCard(link));
    }

    await fs.writeFile(path.join(categoryDir, "index.html"), staticGalleryPage({
      title: category.name,
      subtitle: `${links.length} enlaces clasificados en esta carpeta.`,
      cards,
      backHref: "../index.html"
    }), "utf8");
    await fs.writeFile(path.join(categoryDir, "index.txt"), `${links.map((link) => linkSummaryText(link, category.name)).join("\n\n")}\n`, "utf8");
    folderCards.push(staticFolderCard(category, links.length, folderName));
  }

  await fs.writeFile(path.join(root, "index.html"), staticGalleryPage({
    title: "Linkoteca",
    subtitle: `${activeLinks.length} enlaces activos organizados en ${byCategory.size} carpetas.`,
    cards: folderCards
  }), "utf8");
  await fs.writeFile(path.join(root, "index.txt"), `${activeLinks.map((link) => linkSummaryText(link, categoryMap.get(link.categoryId)?.name || "Sin clasificar")).join("\n\n")}\n`, "utf8");
  await fs.writeFile(path.join(root, "linkoteca.json"), `${JSON.stringify(db, null, 2)}\n`, "utf8");

  return {
    root,
    folders: byCategory.size,
    links: activeLinks.length,
    index: path.join(root, "index.html")
  };
}

function exportPayload(db, format) {
  if (format === "xls") {
    return {
      contentType: "application/vnd.ms-excel; charset=utf-8",
      extension: "xls",
      body: libraryToExcelHtml(db)
    };
  }
  if (format === "csv") return { contentType: "text/csv; charset=utf-8", extension: "csv", body: libraryToCsv(db) };
  if (format === "txt") return { contentType: "text/plain; charset=utf-8", extension: "txt", body: libraryToTxt(db) };
  return { contentType: "application/json; charset=utf-8", extension: "json", body: JSON.stringify(db, null, 2) };
}

async function exportToFolder(db, folderPath, formats = ["json"]) {
  const resolved = path.resolve(folderPath || defaultExportDir);
  assertAllowedExternalWritePath(resolved);
  await fs.mkdir(resolved, { recursive: true });
  const written = [];
  for (const format of formats) {
    const payload = exportPayload(db, format);
    const filePath = path.join(resolved, `linkoteca.${payload.extension}`);
    assertAllowedExternalWritePath(filePath);
    await fs.writeFile(filePath, `${payload.body}\n`, "utf8");
    written.push(filePath);
  }
  return written;
}

function openInBrowser(url) {
  if (process.env.LINKOTECA_NO_OPEN === "1" || process.env.CI) return;

  const openers = {
    win32: ["rundll32.exe", ["url.dll,FileProtocolHandler", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]]
  };
  const opener = openers[process.platform];
  if (!opener) return;

  execFile(opener[0], opener[1], { windowsHide: true }, () => {});
}

await seedFromExcelIfNeeded();

const app = express();
app.use((req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

app.get("/api/library", async (_req, res) => {
  const db = await readDatabase();
  if (pruneExpiredTrash(db) > 0) await writeDatabase(db);
  res.json(db);
});

app.get("/api/version", async (_req, res) => {
  const db = await readDatabase();
  const updates = effectiveUpdates(db.settings.updates || {});
  const latestVersionUrl = updates.latestVersionUrl || "";
  let latest = appVersion;
  let status = "local";
  if (latestVersionUrl) {
    try {
      const response = await fetch(latestVersionUrl, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        const payload = JSON.parse(text);
        latest = String(payload.version || payload.latest || appVersion);
      } catch {
        latest = text.trim().split(/\s+/)[0] || appVersion;
      }
      status = latest === appVersion ? "current" : "update_available";
    } catch (error) {
      status = `check_failed: ${error.message}`;
    }
  }
  res.json({
    ok: true,
    app: "Linkoteca",
    version: appVersion,
    latest,
    latestVersionUrl,
    status
  });
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

app.post("/api/export/local", async (req, res) => {
  try {
    const db = await readDatabase();
    const folderPath = String(req.body?.folderPath || db.settings.storage.path || defaultExportDir);
    const formats = Array.isArray(req.body?.formats) ? req.body.formats : [db.settings.storage.format || "json"];
    const allowedFormats = formats.filter((format) => ["json", "csv", "txt", "xls"].includes(format));
    const written = await exportToFolder(db, folderPath, allowedFormats.length ? allowedFormats : ["json"]);
    res.json({ ok: true, written });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/export/gallery", async (req, res) => {
  try {
    const db = await readDatabase();
    const folderPath = String(req.body?.folderPath || db.settings.storage.path || defaultExportDir);
    const result = await exportStaticGallery(db, folderPath);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/export/desktop", async (_req, res) => {
  try {
    const db = await readDatabase();
    const desktopPath = path.resolve(process.env.USERPROFILE || process.env.HOME || defaultExportDir, "Desktop");
    const result = await exportStaticGallery(db, desktopPath);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/folders/pick", async (req, res) => {
  try {
    const title = String(req.body?.title || "Elegir carpeta");
    const initialPath = String(req.body?.initialPath || "").trim();
    const command = `
      Add-Type -AssemblyName System.Windows.Forms
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = ${JSON.stringify(title)}
      $dialog.ShowNewFolderButton = $true
      $initial = ${JSON.stringify(initialPath)}
      if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }
    `;
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      command
    ], {
      cwd: projectRoot,
      timeout: 600000,
      windowsHide: false
    });
    const selectedPath = stdout.trim();
    if (!selectedPath) return res.json({ ok: true, path: "" });
    assertAllowedExternalWritePath(selectedPath);
    res.json({ ok: true, path: selectedPath });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/import/excel", async (req, res) => {
  try {
    const scriptPath = path.join(projectRoot, "scripts", "import-excel.ps1");
    assertWritableInsideProject(dbPath);
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath
    ], {
      cwd: projectRoot,
      env: { ...process.env, LINKOTECA_HOME: writableRoot },
      timeout: 120000,
      windowsHide: true
    });
    const db = await readDatabase();
    res.json({ ok: true, categories: db.categories.length, links: db.links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const db = await readDatabase();
    const category = categoryByName(db, req.body?.name);
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
    category.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    res.json({ ok: true, category });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const db = await readDatabase();
    const categoryIndex = db.categories.findIndex((item) => item.id === req.params.id);
    if (categoryIndex < 0) return res.status(404).json({ ok: false, error: "Carpeta no encontrada" });
    const [category] = db.categories.splice(categoryIndex, 1);
    const now = new Date().toISOString();
    const links = db.links
      .filter((link) => link.categoryId === category.id && !link.archived)
      .map((link) => markLinkDeleted(link, now));
    await writeDatabase(db);
    res.json({ ok: true, category, links, deletedLinks: links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
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
        error: `Este enlace ya existe en ${category?.name || "otra carpeta"}.`
      });
    }
    const category = req.body.categoryId
      ? db.categories.find((item) => item.id === req.body.categoryId)
      : categoryByName(db, req.body.categoryName || "General");
    if (!category) return res.status(400).json({ ok: false, error: "Carpeta invalida" });
    const now = new Date().toISOString();
    const link = {
      id: idFrom(payload.url, now),
      ...payload,
      categoryId: category.id,
      status: "pendiente",
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
      if (Boolean(req.body.archived)) markLinkDeleted(link);
      else restoreDeletedLink(link);
    }
    if (req.body.categoryId !== undefined) {
      const category = db.categories.find((item) => item.id === req.body.categoryId);
      if (!category) return res.status(400).json({ ok: false, error: "Carpeta invalida" });
      link.categoryId = category.id;
      link.archived = false;
      link.archivedAt = "";
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

app.post("/api/links/bulk/delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? new Set(req.body.ids.map(String)) : new Set();
    if (ids.size === 0) return res.status(400).json({ ok: false, error: "Selecciona enlaces primero" });
    const db = await readDatabase();
    const now = new Date().toISOString();
    const links = db.links
      .filter((link) => ids.has(link.id))
      .map((link) => markLinkDeleted(link, now));
    await writeDatabase(db);
    res.json({ ok: true, links, count: links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/links/bulk/restore", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? new Set(req.body.ids.map(String)) : new Set();
    if (ids.size === 0) return res.status(400).json({ ok: false, error: "Selecciona enlaces primero" });
    const db = await readDatabase();
    const now = new Date().toISOString();
    const links = db.links
      .filter((link) => ids.has(link.id))
      .map((link) => restoreDeletedLink(link, now));
    await writeDatabase(db);
    res.json({ ok: true, links, count: links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.delete("/api/links/:id", async (req, res) => {
  const db = await readDatabase();
  const link = db.links.find((item) => item.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });
  markLinkDeleted(link);
  await writeDatabase(db);
  res.json({ ok: true, archived: true, link });
});

app.post("/api/links/:id/restore", async (req, res) => {
  const db = await readDatabase();
  const link = db.links.find((item) => item.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });
  restoreDeletedLink(link);
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

app.post("/api/previews/enrich", async (req, res) => {
  try {
    const db = await readDatabase();
    let cleaned = 0;
    for (const link of db.links) {
      if (sanitizeLinkPreviewFields(link)) cleaned += 1;
    }
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 24), 60));
    const onlyMissing = req.body?.onlyMissing !== false;
    const candidates = db.links.filter((link) => {
      if (!/^https?:\/\//i.test(link.url || "")) return false;
      if (!onlyMissing) return true;
      return !link.description || !link.thumbnail;
    }).slice(0, limit);

    let updated = 0;
    const details = [];
    for (const link of candidates) {
      const preview = await fetchPreview(link.url);
      const changed = applyPreviewToLink(link, preview);
      if (changed) updated += 1;
      details.push({
        id: link.id,
        title: link.title,
        updated: changed,
        hasDescription: Boolean(link.description),
        hasThumbnail: Boolean(link.thumbnail)
      });
    }

    if (updated > 0 || cleaned > 0) await writeDatabase(db);
    const remaining = db.links.filter((link) => !link.description || !link.thumbnail).length;
    res.json({ ok: true, processed: candidates.length, updated, cleaned, remaining, details });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.patch("/api/settings", async (req, res) => {
  const db = await readDatabase();
  db.settings = mergeSettings({
    ...db.settings,
    ...req.body,
    contact: { ...db.settings.contact, ...(req.body.contact || {}) },
    storage: { ...db.settings.storage, ...(req.body.storage || {}) },
    sync: { ...db.settings.sync, ...(req.body.sync || {}) },
    trash: { ...db.settings.trash, ...(req.body.trash || {}) },
    updates: { ...db.settings.updates, ...(req.body.updates || {}) }
  });
  await writeDatabase(db);
  res.json({ ok: true, settings: db.settings });
});

app.post("/api/sync/push", async (_req, res) => {
  try {
    const db = await readDatabase();
    const settings = db.settings.sync || {};
    const folderSyncPath = getFolderSyncPath(settings);
    if (folderSyncPath) {
      assertAllowedExternalWritePath(folderSyncPath);
      await fs.mkdir(path.dirname(folderSyncPath), { recursive: true });
      await fs.writeFile(folderSyncPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
      return res.json({ ok: true, status: 200, path: folderSyncPath });
    }
    const url = getSyncUrl(settings);
    if (!url) throw new Error("Configura una URL de sincronizacion primero");
    const response = await fetch(url, {
      method: "PUT",
      headers: syncHeaders(settings),
      body: JSON.stringify(db, null, 2)
    });
    if (!response.ok) throw new Error(`Servidor remoto respondio ${response.status}`);
    res.json({ ok: true, status: response.status });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/sync/pull", async (_req, res) => {
  try {
    const db = await readDatabase();
    const settings = db.settings.sync || {};
    const folderSyncPath = getFolderSyncPath(settings);
    if (folderSyncPath) {
      assertAllowedExternalWritePath(folderSyncPath);
      const raw = await fs.readFile(folderSyncPath, "utf8");
      const remote = ensureDatabaseShape(JSON.parse(raw.replace(/^\uFEFF/, "")));
      const merged = mergeRemoteDatabase(db, remote);
      await writeDatabase(merged);
      return res.json({ ok: true, categories: merged.categories.length, links: merged.links.length, path: folderSyncPath });
    }
    const url = getSyncUrl(settings);
    if (!url) throw new Error("Configura una URL de sincronizacion primero");
    const response = await fetch(url, {
      headers: syncHeaders(settings)
    });
    if (!response.ok) throw new Error(`Servidor remoto respondio ${response.status}`);
    const remote = await response.json();
    const merged = mergeRemoteDatabase(db, remote);
    await writeDatabase(merged);
    res.json({ ok: true, categories: merged.categories.length, links: merged.links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/sync/auto", async (_req, res) => {
  try {
    const db = await readDatabase();
    const settings = db.settings.sync || {};
    if (!settings.autoOnOpen || !settings.mode || settings.mode === "none") {
      return res.json({ ok: true, synced: false, reason: "Sin sincronización automática" });
    }

    const folderSyncPath = getFolderSyncPath(settings);
    if (folderSyncPath) {
      assertAllowedExternalWritePath(folderSyncPath);
      try {
        const raw = await fs.readFile(folderSyncPath, "utf8");
        const remote = ensureDatabaseShape(JSON.parse(raw.replace(/^\uFEFF/, "")));
        const merged = mergeRemoteDatabase(db, remote);
        await writeDatabase(merged);
        return res.json({ ok: true, synced: true, source: "folder", categories: merged.categories.length, links: merged.links.length });
      } catch (error) {
        if (error.code === "ENOENT") {
          await fs.mkdir(path.dirname(folderSyncPath), { recursive: true });
          await fs.writeFile(folderSyncPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
          return res.json({ ok: true, synced: true, source: "folder-created", categories: db.categories.length, links: db.links.length });
        }
        throw error;
      }
    }

    const url = getSyncUrl(settings);
    if (!url) return res.json({ ok: true, synced: false, reason: "Falta URL de sincronización" });
    const response = await fetch(url, { headers: syncHeaders(settings) });
    if (!response.ok) throw new Error(`Servidor remoto respondio ${response.status}`);
    const remote = await response.json();
    const merged = mergeRemoteDatabase(db, remote);
    await writeDatabase(merged);
    res.json({ ok: true, synced: true, source: "remote", categories: merged.categories.length, links: merged.links.length });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Linkoteca lista en ${appUrl}`);
  console.log(`Datos: ${dbPath}`);
  console.log(`Raiz de usuario: ${writableRoot}`);
  if (process.env.LINKOTECA_OPEN_FROM_SERVER === "1") {
    console.log("Abriendo interfaz visual en el navegador...");
    openInBrowser(appUrl);
  }
});
