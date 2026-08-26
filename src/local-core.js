import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";

const blockedAddresses = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]
]) blockedAddresses.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96],
  ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
]) blockedAddresses.addSubnet(network, prefix, "ipv6");

const inactiveStatuses = new Set([
  "archivado", "archived", "deleted", "eliminado", "trash", "trashed", "obsolete", "obsoleto"
]);
const secretKeyPattern = /(password|secret|token|cookie|oauth|credential|authorization|settings|sync)/i;
const linkExportFields = [
  "id", "url", "title", "description", "thumbnail", "platform", "tags", "categoryId", "status",
  "confidence", "source", "sourceSheet", "sourceCell", "createdAt", "updatedAt", "archived", "archivedAt",
  "archivedByCategoryId", "archivedByGroupId"
];
const activeBackupFields = [
  "url", "title", "description", "thumbnail", "platform", "tags", "createdAt", "updatedAt", "source",
  "sourceSheet", "sourceCell", "confidence"
];

function pickFields(value, fields) {
  const picked = {};
  for (const field of fields) {
    if (value?.[field] !== undefined) picked[field] = structuredClone(value[field]);
  }
  return picked;
}

export function containsSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  return Object.entries(value).some(([key, child]) => secretKeyPattern.test(key) || containsSensitiveKey(child));
}

export function sanitizeExportDatabase(database) {
  const result = {
    format: "linkoteca-local-export",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    databaseVersion: database.version || 1,
    groups: (database.groups || []).map((group) => pickFields(group, [
      "id", "name", "createdAt", "updatedAt", "archived", "archivedAt"
    ])),
    categories: (database.categories || []).map((category) => pickFields(category, [
      "id", "name", "slug", "parentId", "groupId", "source", "createdAt", "updatedAt", "archived",
      "archivedAt", "archivedByGroupId"
    ])),
    links: (database.links || []).map((link) => pickFields(link, linkExportFields))
  };
  if (containsSensitiveKey(result)) throw new Error("La exportación contiene una clave sensible");
  return result;
}

export function isActiveLink(link, categoriesById, groupsById) {
  if (!link || typeof link !== "object" || link.archived === true) return false;
  if (inactiveStatuses.has(String(link.status || "").trim().toLowerCase())) return false;
  const category = link.categoryId ? categoriesById.get(String(link.categoryId)) : null;
  if (category?.archived === true) return false;
  const group = category?.groupId ? groupsById.get(String(category.groupId)) : null;
  return group?.archived !== true;
}

export function createActiveBackupPayload(database, metadata) {
  const groupsById = new Map((database.groups || []).map((group) => [String(group.id), group]));
  const categoriesById = new Map((database.categories || []).map((category) => [String(category.id), category]));
  const unique = new Map();
  for (const link of database.links || []) {
    if (!isActiveLink(link, categoriesById, groupsById)) continue;
    const key = String(link.url || "").trim().toLowerCase();
    if (!key || unique.has(key)) continue;
    const clean = pickFields(link, activeBackupFields);
    clean.url = String(clean.url || "").trim();
    clean.title = String(clean.title || clean.url).trim();
    unique.set(key, clean);
  }
  const links = [...unique.values()];
  const result = {
    metadata: {
      format: "linkoteca-active-links-local-backup",
      schemaVersion: 1,
      ...metadata,
      activeLinkCount: links.length,
      restoreTargetFolder: "Todos"
    },
    links
  };
  if (containsSensitiveKey(result)) throw new Error("El respaldo contiene una clave sensible");
  return result;
}

export function importActiveLinksBackup(database, backup, randomId = () => crypto.randomUUID()) {
  if (backup?.metadata?.format !== "linkoteca-active-links-local-backup") {
    throw new Error("El archivo no es un respaldo local de enlaces activos");
  }
  if (backup.metadata.restoreTargetFolder !== "Todos" || !Array.isArray(backup.links)) {
    throw new Error("El respaldo no está preparado para restaurar en Todos");
  }
  if (containsSensitiveKey(backup)) throw new Error("El respaldo contiene claves sensibles");

  const now = new Date().toISOString();
  let category = (database.categories || []).find((item) => !item.archived && String(item.name).trim().toLowerCase() === "todos");
  if (!category) {
    category = { id: randomId(), name: "Todos", slug: "todos", parentId: null, groupId: null, source: "restore", createdAt: now, updatedAt: now };
    database.categories = [...(database.categories || []), category];
  }

  const knownUrls = new Set((database.links || []).map((link) => String(link.url || "").trim().toLowerCase()));
  let imported = 0;
  for (const sourceLink of backup.links) {
    const url = String(sourceLink?.url || "").trim();
    const key = url.toLowerCase();
    if (!/^https?:\/\//i.test(url) || knownUrls.has(key)) continue;
    const link = pickFields(sourceLink, activeBackupFields);
    Object.assign(link, {
      id: randomId(),
      url,
      title: String(link.title || url).trim(),
      categoryId: category.id,
      status: "confirmado",
      archived: false,
      archivedAt: "",
      updatedAt: now,
      createdAt: link.createdAt || now
    });
    database.links.push(link);
    knownUrls.add(key);
    imported += 1;
  }
  return { imported, categoryId: category.id, targetFolder: "Todos" };
}

export async function writeFileAtomic(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const handle = await fs.open(temporaryPath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function validateRemoteUrl(value) {
  const url = new URL(String(value || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Solo se permiten URLs HTTP o HTTPS");
  if (url.username || url.password) throw new Error("No se permiten credenciales en la URL");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Puerto remoto no permitido");
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".home.arpa")) {
    throw new Error("Host local no permitido");
  }
  return url;
}

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return true;
  return blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function resolvePublicTarget(value, lookup = dns.lookup) {
  const url = validateRemoteUrl(value);
  const literalFamily = net.isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new Error("La URL resuelve a una dirección local, privada o reservada");
  }
  return { url, address: addresses[0] };
}

function requestUrlAtAddress(url, address, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: address.address,
      family: address.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.protocol === "https:" ? url.hostname : undefined,
      headers: { host: url.host, "user-agent": "Linkoteca/1.0 local preview" },
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy(new Error("La respuesta de vista previa es demasiado grande"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("timeout", () => request.destroy(new Error("Tiempo de espera agotado")));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchHtmlSafely(value, options = {}) {
  const lookup = options.lookup || dns.lookup;
  const request = options.request || requestUrlAtAddress;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = String(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const { url, address } = await resolvePublicTarget(current, lookup);
    const response = await request(url, address, options.timeoutMs || 8000, options.maxBytes || 2_000_000);
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (redirect === maxRedirects) throw new Error("Demasiadas redirecciones");
      const location = response.headers.location;
      if (!location) throw new Error("Redirección sin destino");
      current = new URL(location, url).toString();
      continue;
    }
    const contentType = String(response.headers["content-type"] || "");
    return { url: url.toString(), statusCode: response.statusCode, contentType, body: response.body };
  }
  throw new Error("No se pudo obtener la vista previa");
}

export function assertPathInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Ruta fuera del área permitida");
}
