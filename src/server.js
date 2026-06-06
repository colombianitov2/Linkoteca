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
const appVersion = "0.3.0-beta.1";
const releaseBaseUrl = "https://github.com/colombianitov2/linkoteca-beta/releases/latest/download";
const latestVersionUrl = "https://raw.githubusercontent.com/colombianitov2/linkoteca-beta/main/updates/latest.json";

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
      supportEmail: "epernett1020@hotmail.com",
      paypalUrl: "https://www.paypal.com/paypalme/Wolframica?locale.x=es_XC&country.x=CO"
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
      password: "",
      googleClientId: "",
      googleClientSecret: "",
      googleRefreshToken: "",
      googleAccessToken: "",
      googleTokenExpiresAt: "",
      googleEmail: "",
      googleFileName: "linkoteca.json"
    },
    updates: {
      latestVersionUrl,
      androidUrl: `${releaseBaseUrl}/Linkoteca-Android-debug.apk`,
      iosUrl: `${releaseBaseUrl}/Linkoteca-macOS.dmg`,
      pcUrl: `${releaseBaseUrl}/Linkoteca-Windows-Setup.exe`
    }
  };
}

function mergeSettings(settings = {}) {
  const defaults = defaultSettings();
  const updates = { ...defaults.updates, ...(settings.updates || {}) };
  for (const key of Object.keys(defaults.updates)) {
    if (!updates[key]) updates[key] = defaults.updates[key];
  }
  return {
    ...defaults,
    ...settings,
    contact: { ...defaults.contact, ...(settings.contact || {}) },
    storage: { ...defaults.storage, ...(settings.storage || {}) },
    sync: { ...defaults.sync, ...(settings.sync || {}) },
    updates
  };
}

function ensureDatabaseShape(db) {
  db.version = db.version || 1;
  db.categories = Array.isArray(db.categories) ? db.categories : [];
  db.links = Array.isArray(db.links) ? db.links : [];
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

const CLASSIFICATION_RULES = [
  { patterns: [/github\.com|gitlab\.com|bitbucket\.org/i], keywords: ["repo", "codigo", "programacion", "desarrollo"], category: "Programas" },
  { patterns: [/stackoverflow\.com|stackexchange\.com|npmjs\.com|pypi\.org/i], keywords: ["error", "solucion", "paquete", "libreria"], category: "Programas" },
  { patterns: [/amazon\.|mercadolibre\.|ebay\.|aliexpress\.|temu\.|shopify\./i], keywords: ["comprar", "producto", "precio", "oferta", "tienda"], category: "Compras" },
  { patterns: [/booking\.|airbnb\.|tripadvisor\.|expedia\.|despegar\.|skyscanner\./i], keywords: ["viaje", "hotel", "vuelo", "turismo", "reserva"], category: "Para visitar-Viajes" },
  { patterns: [/maps\.google\.|google\.[^/]+\/maps/i], keywords: ["mapa", "ubicacion", "ruta", "direccion"], category: "Para visitar-Viajes" },
  { patterns: [/udemy\.|coursera\.|platzi\.|edx\.|skillshare\.|domestika\./i], keywords: ["curso", "clase", "aprender", "formacion"], category: "Estudios-Cursos-Clases" },
  { patterns: [/drive\.google\.|docs\.google\.|notion\.so|trello\.com/i], keywords: ["documento", "nota", "organizacion"], category: "Trabajo-Negocios" },
  { patterns: [/spotify\.|soundcloud\.|music\.apple\./i], keywords: ["musica", "playlist", "cancion", "podcast"], category: "Modelo de vida" },
  { patterns: [/instagram\.|facebook\.|fb\.watch|tiktok\.|x\.com|twitter\.|linkedin\./i], keywords: ["red social", "reel", "post", "perfil"], category: "Social-Financiero" }
];

const KEYWORD_GROUPS = [
  { keywords: ["ingenier", "mecanica", "termodinamica", "fluidos", "materiales", "calculo", "solidworks", "autocad", "cad", "simulacion", "fem", "fea", "industrial"], category: "Ingeniería" },
  { keywords: ["viaje", "viajar", "turismo", "destino", "playa", "hotel", "hostal", "mochilero", "aventura", "visitar"], category: "Para visitar-Viajes" },
  { keywords: ["colombia", "bogota", "medellin", "cartagena", "barranquilla", "cali", "santa marta", "san andres"], category: "Para visitar-Viajes" },
  { keywords: ["receta", "cocina", "comida", "ingrediente", "preparar", "cocinar", "gastronomia"], category: "Cocina-recetas" },
  { keywords: ["ejercicio", "fitness", "gimnasio", "rutina", "salud", "nutricion", "deporte"], category: "Ejercicios" },
  { keywords: ["inversion", "finanzas", "ahorro", "cripto", "bitcoin", "trading", "bolsa", "dinero", "negocio"], category: "Social-Financiero" },
  { keywords: ["comprar", "producto", "precio", "oferta", "tienda", "catalogo", "amazon", "mercado libre"], category: "Compras" },
  { keywords: ["carro", "auto", "automotriz", "vehiculo", "motor", "repuesto", "pintura automotriz"], category: "Carro" },
  { keywords: ["casa", "hogar", "herramienta", "mueble", "decoracion", "reparacion"], category: "Para la casa" },
  { keywords: ["curso", "clase", "estudi", "aprender", "tutorial", "guia", "paso a paso"], category: "Estudios-Cursos-Clases" },
  { keywords: ["programa", "software", "app", "codigo", "script", "extension", "github"], category: "Programas" },
  { keywords: ["proyecto", "emprendimiento", "idea", "prototipo", "plan"], category: "Proyectos" },
  { keywords: ["juego", "gaming", "gamer", "videojuego", "consola"], category: "Juegos" },
  { keywords: ["trabajo", "negocio", "empresa", "cliente", "venta", "marketing"], category: "Trabajo-Negocios" }
];

function findBestCategoryMatch(name, categories) {
  const target = String(name || "").toLowerCase().trim();
  const exact = categories.find((category) => category.name.toLowerCase() === target);
  if (exact) return exact;
  return categories.find((category) => {
    const current = category.name.toLowerCase();
    return current.includes(target) || target.includes(current);
  }) || null;
}

function classifyLink(link, categories) {
  const url = String(link.url || "").toLowerCase();
  const title = String(link.title || "").toLowerCase();
  const description = String(link.description || "").toLowerCase();
  const haystack = `${url} ${title} ${description}`;

  let bestMatch = null;
  let bestScore = 0;

  for (const rule of CLASSIFICATION_RULES) {
    const domainScore = rule.patterns.some((pattern) => pattern.test(url)) ? 2 : 0;
    const keywordScore = rule.keywords.filter((keyword) => haystack.includes(keyword)).length;
    const score = domainScore + keywordScore;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { category: rule.category, method: domainScore ? "domain" : "keywords" };
    }
  }

  for (const group of KEYWORD_GROUPS) {
    const score = group.keywords.filter((keyword) => haystack.includes(keyword)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { category: group.category, method: "keywords" };
    }
  }

  for (const category of categories) {
    const words = category.name.toLowerCase().split(/[\s-]+/).filter((word) => word.length > 2);
    const score = words.filter((word) => haystack.includes(word)).length * 2;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { category: category.name, categoryId: category.id, method: "existing-category" };
    }
  }

  if (!bestMatch || bestScore < 1) {
    return { categoryName: "Por revisar", confidence: 0, method: "fallback" };
  }

  if (bestMatch.categoryId) {
    return { categoryId: bestMatch.categoryId, confidence: Math.min(bestScore * 0.25, 0.95), method: bestMatch.method };
  }

  const category = findBestCategoryMatch(bestMatch.category, categories);
  if (category) {
    return { categoryId: category.id, confidence: Math.min(bestScore * 0.25, 0.95), method: bestMatch.method };
  }

  return { categoryName: bestMatch.category, confidence: Math.min(bestScore * 0.2, 0.85), method: bestMatch.method };
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

  const base = {
    title: "",
    description: "",
    thumbnail: thumbnailFromUrl(url),
    platform: detectPlatform(url)
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Linkoteca/0.2 (+local preview fetcher)"
      }
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return base;
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    base.title = cleanPreviewText(pickMeta(html, ["og:title", "twitter:title"]) || titleMatch?.[1] || "");
    base.description = cleanPreviewText(pickMeta(html, ["og:description", "twitter:description", "description"]));
    base.thumbnail = base.thumbnail || absolutizeUrl(pickMeta(html, ["og:image", "twitter:image", "image"]), url);
  } catch {
    // Mantiene la base y usa favicon como miniatura si no hubo OpenGraph.
  } finally {
    clearTimeout(timeout);
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
  const headers = { "content-type": "application/json" };
  if (settings.username && settings.password) {
    const token = Buffer.from(`${settings.username}:${settings.password}`).toString("base64");
    headers.authorization = `Basic ${token}`;
  }
  return headers;
}

function getSyncUrl(settings) {
  if (settings.mode === "webdav") return settings.webdavUrl;
  if (settings.mode === "ip") return settings.remoteUrl;
  return "";
}

function getFolderSyncPath(settings) {
  if (!["localFolder", "oneDrive"].includes(settings.mode)) return "";
  const folderPath = String(settings.folderPath || settings.storagePath || "").trim();
  if (!folderPath) return "";
  return path.join(folderPath, "linkoteca.json");
}

function effectiveUpdates(settings = {}) {
  const defaults = defaultSettings().updates;
  return {
    latestVersionUrl: settings.latestVersionUrl || defaults.latestVersionUrl,
    androidUrl: settings.androidUrl || defaults.androidUrl,
    iosUrl: settings.iosUrl || defaults.iosUrl,
    pcUrl: settings.pcUrl || defaults.pcUrl
  };
}

function googleRedirectUri() {
  return `${appUrl}/api/google/callback`;
}

function googleConfig(settings = {}) {
  return {
    clientId: String(settings.googleClientId || "").trim(),
    clientSecret: String(settings.googleClientSecret || "").trim(),
    refreshToken: String(settings.googleRefreshToken || "").trim(),
    accessToken: String(settings.googleAccessToken || "").trim(),
    tokenExpiresAt: String(settings.googleTokenExpiresAt || "").trim(),
    email: String(settings.googleEmail || "").trim(),
    fileName: String(settings.googleFileName || "linkoteca.json").trim() || "linkoteca.json"
  };
}

function ensureGoogleConfigured(settings = {}) {
  const config = googleConfig(settings);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Configura Google Client ID y Client Secret primero");
  }
  return config;
}

async function exchangeGoogleToken(params) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google respondio ${response.status}`);
  return data;
}

async function getGoogleUser(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return {};
  return response.json();
}

async function googleAccessToken(db) {
  const settings = db.settings.sync || {};
  const config = ensureGoogleConfigured(settings);
  const expiresAt = new Date(config.tokenExpiresAt || 0).getTime();
  if (config.accessToken && expiresAt - Date.now() > 60000) return config.accessToken;
  if (!config.refreshToken) throw new Error("Conecta una cuenta Google primero");

  const token = await exchangeGoogleToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token"
  });

  settings.googleAccessToken = token.access_token;
  settings.googleTokenExpiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  db.settings.sync = settings;
  await writeDatabase(db);
  return settings.googleAccessToken;
}

async function googleDriveRequest(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Drive respondio ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  return response;
}

async function findGoogleBackupFile(accessToken, fileName) {
  const query = encodeURIComponent(`name='${fileName.replaceAll("'", "\\'")}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
  const response = await googleDriveRequest(accessToken, url);
  const data = await response.json();
  return data.files?.[0] || null;
}

function databaseForCloudBackup(db) {
  const backup = structuredClone(db);
  if (backup.settings?.sync) {
    delete backup.settings.sync.password;
    delete backup.settings.sync.googleClientSecret;
    delete backup.settings.sync.googleRefreshToken;
    delete backup.settings.sync.googleAccessToken;
    delete backup.settings.sync.googleTokenExpiresAt;
  }
  return backup;
}

function googleMultipartBody(metadata, content) {
  const boundary = `linkoteca-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    content,
    `--${boundary}--`,
    ""
  ].join("\r\n");
  return { boundary, body };
}

async function uploadGoogleBackup(db) {
  const settings = db.settings.sync || {};
  const config = googleConfig(settings);
  const accessToken = await googleAccessToken(db);
  const content = JSON.stringify(databaseForCloudBackup(db), null, 2);
  const existing = await findGoogleBackupFile(accessToken, config.fileName);

  if (existing) {
    await googleDriveRequest(
      accessToken,
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json; charset=UTF-8" },
        body: content
      }
    );
    return { ok: true, provider: "googleDrive", fileId: existing.id, updated: true };
  }

  const multipart = googleMultipartBody({
    name: config.fileName,
    parents: ["appDataFolder"],
    mimeType: "application/json"
  }, content);

  const response = await googleDriveRequest(
    accessToken,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${multipart.boundary}` },
      body: multipart.body
    }
  );
  const data = await response.json();
  return { ok: true, provider: "googleDrive", fileId: data.id, updated: false };
}

async function downloadGoogleBackup(db) {
  const settings = db.settings.sync || {};
  const config = googleConfig(settings);
  const accessToken = await googleAccessToken(db);
  const existing = await findGoogleBackupFile(accessToken, config.fileName);
  if (!existing) throw new Error("No hay backup de Linkoteca en Google Drive");
  const response = await googleDriveRequest(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`
  );
  return response.json();
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
    link.description ? `Descripcion: ${link.description}` : "",
    `Actualizado: ${link.updatedAt || ""}`
  ].filter(Boolean).join("\n");
}

function shortcutFileBody(link) {
  return `[InternetShortcut]\nURL=${link.url || ""}\n`;
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
      cards.push(staticLinkCard(link));
    }

    await fs.writeFile(path.join(categoryDir, "index.html"), staticGalleryPage({
      title: category.name,
      subtitle: `${links.length} enlaces clasificados en esta carpeta.`,
      cards,
      backHref: "../index.html"
    }), "utf8");
    folderCards.push(staticFolderCard(category, links.length, folderName));
  }

  await fs.writeFile(path.join(root, "index.html"), staticGalleryPage({
    title: "Linkoteca",
    subtitle: `${activeLinks.length} enlaces activos organizados en ${byCategory.size} carpetas.`,
    cards: folderCards
  }), "utf8");
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

app.get("/api/google/status", async (_req, res) => {
  const db = await readDatabase();
  const config = googleConfig(db.settings.sync || {});
  res.json({
    ok: true,
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(config.refreshToken),
    email: config.email,
    fileName: config.fileName
  });
});

app.post("/api/google/auth-url", async (_req, res) => {
  try {
    const db = await readDatabase();
    const config = ensureGoogleConfigured(db.settings.sync || {});
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/drive.appdata",
        "openid",
        "email",
        "profile"
      ].join(" "),
      access_type: "offline",
      prompt: "consent"
    });
    res.json({ ok: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/google/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error));
    const code = String(req.query.code || "");
    if (!code) throw new Error("Google no devolvio codigo de autorizacion");
    const db = await readDatabase();
    const settings = db.settings.sync || {};
    const config = ensureGoogleConfigured(settings);
    const token = await exchangeGoogleToken({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri()
    });
    settings.googleRefreshToken = token.refresh_token || settings.googleRefreshToken || "";
    settings.googleAccessToken = token.access_token || "";
    settings.googleTokenExpiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
    const user = token.access_token ? await getGoogleUser(token.access_token) : {};
    settings.googleEmail = user.email || settings.googleEmail || "";
    settings.mode = "googleDrive";
    settings.provider = "googleDrive";
    db.settings.sync = settings;
    await writeDatabase(db);
    res.type("html").send(`
      <!doctype html>
      <meta charset="utf-8">
      <title>Linkoteca conectada</title>
      <body style="font-family: system-ui; padding: 32px; background: #f7f5ef; color: #181818">
        <h1>Google Drive conectado</h1>
        <p>Ya puedes volver a Linkoteca y usar Subir nube o Descargar nube.</p>
        <p>Cuenta: ${String(settings.googleEmail || "conectada").replaceAll("<", "&lt;")}</p>
      </body>
    `);
  } catch (error) {
    res.status(400).type("html").send(`
      <!doctype html>
      <meta charset="utf-8">
      <title>Error conectando Google</title>
      <body style="font-family: system-ui; padding: 32px; background: #fff5f5; color: #181818">
        <h1>No se pudo conectar Google Drive</h1>
        <p>${String(error.message).replaceAll("<", "&lt;")}</p>
      </body>
    `);
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
    const desktopPath = path.join(process.env.USERPROFILE || process.env.HOME || defaultExportDir, "Desktop");
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
      : categoryByName(db, req.body.categoryName || "Por revisar");
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
      link.archived = Boolean(req.body.archived);
      link.archivedAt = link.archived ? new Date().toISOString() : "";
      if (link.archived) link.status = "archivado";
      else if (link.status === "archivado") link.status = "confirmado";
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

app.delete("/api/links/:id", async (req, res) => {
  const db = await readDatabase();
  const link = db.links.find((item) => item.id === req.params.id);
  if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });
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
  link.archived = false;
  link.archivedAt = "";
  if (link.status === "archivado") link.status = "confirmado";
  link.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  res.json({ ok: true, restored: true, link });
});

app.post("/api/links/:id/classify", async (req, res) => {
  try {
    const db = await readDatabase();
    const link = db.links.find((item) => item.id === req.params.id);
    if (!link) return res.status(404).json({ ok: false, error: "Enlace no encontrado" });

    const suggestion = classifyLink(link, db.categories);
    const category = suggestion.categoryId
      ? db.categories.find((item) => item.id === suggestion.categoryId)
      : categoryByName(db, suggestion.categoryName || "Por revisar");

    if (category && category.id !== link.categoryId) {
      link.categoryId = category.id;
      link.autoClassified = suggestion.method !== "fallback";
      link.classificationMethod = suggestion.method;
      link.confidence = suggestion.confidence;
      if (suggestion.method !== "fallback") link.status = "auto-clasificado";
      link.updatedAt = new Date().toISOString();
      await writeDatabase(db);
    }

    res.json({ ok: true, link, category: category?.name || "", method: suggestion.method, confidence: suggestion.confidence });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/classify/batch", async (req, res) => {
  try {
    const db = await readDatabase();
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 50), 200));
    const candidates = db.links.filter((link) => {
      if (link.archived) return false;
      const category = db.categories.find((item) => item.id === link.categoryId);
      return !category || category.name.toLowerCase() === "por revisar" || link.status === "pendiente";
    }).slice(0, limit);

    let moved = 0;
    const details = [];
    for (const link of candidates) {
      const suggestion = classifyLink(link, db.categories);
      if (suggestion.method === "fallback") {
        details.push({ id: link.id, title: link.title, moved: false, reason: "sin coincidencia" });
        continue;
      }

      const category = suggestion.categoryId
        ? db.categories.find((item) => item.id === suggestion.categoryId)
        : categoryByName(db, suggestion.categoryName);

      if (category && category.id !== link.categoryId) {
        link.categoryId = category.id;
        link.autoClassified = true;
        link.classificationMethod = suggestion.method;
        link.confidence = suggestion.confidence;
        link.status = "auto-clasificado";
        link.updatedAt = new Date().toISOString();
        moved += 1;
        details.push({ id: link.id, title: link.title, moved: true, category: category.name, method: suggestion.method });
      } else {
        details.push({ id: link.id, title: link.title, moved: false, reason: "ya clasificado" });
      }
    }

    if (moved > 0) await writeDatabase(db);
    res.json({ ok: true, processed: candidates.length, moved, details });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
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
    updates: { ...db.settings.updates, ...(req.body.updates || {}) }
  });
  await writeDatabase(db);
  res.json({ ok: true, settings: db.settings });
});

app.post("/api/sync/push", async (_req, res) => {
  try {
    const db = await readDatabase();
    const settings = db.settings.sync || {};
    if (settings.mode === "googleDrive") {
      const result = await uploadGoogleBackup(db);
      return res.json(result);
    }
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
    if (settings.mode === "googleDrive") {
      const remote = ensureDatabaseShape(await downloadGoogleBackup(db));
      const merged = mergeRemoteDatabase(db, remote);
      await writeDatabase(merged);
      return res.json({ ok: true, provider: "googleDrive", categories: merged.categories.length, links: merged.links.length });
    }
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

    if (settings.mode === "googleDrive") {
      try {
        const remote = ensureDatabaseShape(await downloadGoogleBackup(db));
        const merged = mergeRemoteDatabase(db, remote);
        await writeDatabase(merged);
        return res.json({ ok: true, synced: true, source: "googleDrive", categories: merged.categories.length, links: merged.links.length });
      } catch (error) {
        if (/No hay backup/.test(error.message)) {
          await uploadGoogleBackup(db);
          return res.json({ ok: true, synced: true, source: "googleDrive-created", categories: db.categories.length, links: db.links.length });
        }
        throw error;
      }
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

async function findFileByExtension(dir, extension) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileByExtension(fullPath, extension);
      if (found) return found;
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      return fullPath;
    }
  }
  return null;
}

function platformInstructions(platform) {
  if (platform === "android") {
    return {
      name: "Linkoteca-Android-Instrucciones.txt",
      body: [
        "Linkoteca - Android",
        "====================",
        "",
        "1. Instala Android Studio y JDK 21 LTS.",
        "2. En la carpeta del proyecto ejecuta: npm run dist:android",
        "3. El APK queda en android\\app\\build\\outputs\\apk\\debug\\app-debug.apk",
        "4. En el celular, conecta la app a la IP del PC, por ejemplo http://192.168.1.50:4387"
      ].join("\r\n")
    };
  }
  if (platform === "ios") {
    return {
      name: "Linkoteca-iOS-Instrucciones.txt",
      body: [
        "Linkoteca - iOS",
        "===============",
        "",
        "1. Se requiere macOS con Xcode.",
        "2. Ejecuta: npx cap sync ios",
        "3. Ejecuta: npx cap open ios",
        "4. Compila desde Xcode y conecta la app a la IP del PC."
      ].join("\r\n")
    };
  }
  return {
    name: "Linkoteca-PC-Instrucciones.txt",
    body: [
      "Linkoteca - Windows",
      "===================",
      "",
      "1. En la carpeta del proyecto ejecuta: npm run dist:win",
      "2. Los ejecutables quedan en dist\\",
      `3. Usa Linkoteca Setup ${appVersion}.exe como instalador o Linkoteca ${appVersion}.exe como portable.`
    ].join("\r\n")
  };
}

app.get("/api/download/:platform", async (req, res) => {
  try {
    const db = await readDatabase();
    const platform = String(req.params.platform || "pc").toLowerCase();
    const updates = effectiveUpdates(db.settings.updates || {});

    if (platform === "pc" || platform === "windows") {
      const distDir = path.join(projectRoot, "dist");
      const files = await fs.readdir(distDir).catch(() => []);
      const setup = files.find((file) => /\.exe$/i.test(file) && /setup/i.test(file));
      const portable = files.find((file) => /\.exe$/i.test(file));
      const localFile = setup || portable;
      if (localFile) return res.download(path.join(distDir, localFile));
      if (updates.pcUrl) return res.redirect(updates.pcUrl);
    }

    if (platform === "android") {
      const apk = await findFileByExtension(path.join(projectRoot, "android"), ".apk");
      if (apk) return res.download(apk);
      if (updates.androidUrl) return res.redirect(updates.androidUrl);
    }

    if (platform === "ios") {
      if (updates.iosUrl) return res.redirect(updates.iosUrl);
    }

    const instructions = platformInstructions(platform);
    res.setHeader("content-disposition", `attachment; filename="${instructions.name}"`);
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.send(instructions.body);
  } catch (error) {
    res.status(500).send(`Error al preparar descarga: ${error.message}`);
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
