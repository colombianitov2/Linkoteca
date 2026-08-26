import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const projectArea = path.resolve(repositoryRoot, "..");
const outputDir = path.join(projectArea, "Local_Backups");
const inactiveStatuses = new Set([
  "archivado",
  "archived",
  "deleted",
  "eliminado",
  "trash",
  "trashed",
  "obsolete",
  "obsoleto"
]);
const sensitiveKeyPattern = /(password|secret|token|cookie|oauth|credential|authorization|settings|sync)/i;
const usefulLinkFields = [
  "url",
  "title",
  "description",
  "thumbnail",
  "platform",
  "tags",
  "createdAt",
  "updatedAt",
  "source",
  "sourceSheet",
  "sourceCell",
  "confidence"
];

function parseArguments(argv) {
  const sourceIndex = argv.indexOf("--source");
  if (sourceIndex < 0 || !argv[sourceIndex + 1]) {
    throw new Error("Uso: node scripts/create-active-links-backup.mjs --source <linkoteca.json>");
  }
  return { sourcePath: path.resolve(argv[sourceIndex + 1]) };
}

function timestampForFile(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function assertInsideProjectArea(targetPath) {
  const relative = path.relative(projectArea, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`La salida queda fuera del proyecto asignado: ${targetPath}`);
  }
}

function isActiveLink(link, categoriesById, groupsById) {
  if (!link || typeof link !== "object" || link.archived === true) return false;
  if (inactiveStatuses.has(String(link.status || "").trim().toLowerCase())) return false;

  const category = link.categoryId ? categoriesById.get(String(link.categoryId)) : null;
  if (category?.archived === true) return false;
  const group = category?.groupId ? groupsById.get(String(category.groupId)) : null;
  return group?.archived !== true;
}

function backupLink(link) {
  const clean = {};
  for (const field of usefulLinkFields) {
    if (link[field] !== undefined) clean[field] = structuredClone(link[field]);
  }
  clean.url = String(clean.url || "").trim();
  clean.title = String(clean.title || clean.url).trim();
  return clean;
}

function findSensitiveKeys(value, currentPath = "root", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveKeys(item, `${currentPath}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key)) found.push(`${currentPath}.${key}`);
    findSensitiveKeys(child, `${currentPath}.${key}`, found);
  }
  return found;
}

function validateBackup(backup, expectedCount) {
  if (!backup || !Array.isArray(backup.links)) throw new Error("El respaldo no contiene una lista de enlaces");
  if (backup.metadata?.restoreTargetFolder !== "Todos") throw new Error("El destino de restauración no es Todos");
  if (backup.metadata?.activeLinkCount !== expectedCount || backup.links.length !== expectedCount) {
    throw new Error("El conteo del respaldo no coincide con los enlaces activos únicos");
  }

  const urls = backup.links.map((link) => String(link.url || "").trim().toLowerCase());
  if (urls.some((url) => !/^https?:\/\//i.test(url))) throw new Error("El respaldo contiene una URL inválida");
  if (new Set(urls).size !== urls.length) throw new Error("El respaldo contiene URLs duplicadas");

  const forbiddenPlacementKeys = new Set(["categoryId", "groupId", "archived", "archivedAt", "status"]);
  for (const link of backup.links) {
    for (const key of forbiddenPlacementKeys) {
      if (Object.hasOwn(link, key)) throw new Error(`El respaldo contiene la clave no permitida ${key}`);
    }
  }

  const sensitiveKeys = findSensitiveKeys(backup);
  if (sensitiveKeys.length) throw new Error(`El respaldo contiene claves sensibles: ${sensitiveKeys.join(", ")}`);
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

async function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const handle = await fs.open(temporaryPath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporaryPath, filePath);
}

async function main() {
  const { sourcePath } = parseArguments(process.argv.slice(2));
  const sourceRaw = await fs.readFile(sourcePath, "utf8");
  const database = JSON.parse(sourceRaw.replace(/^\uFEFF/, ""));
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"));

  const groupsById = new Map((database.groups || []).map((group) => [String(group.id), group]));
  const categoriesById = new Map((database.categories || []).map((category) => [String(category.id), category]));
  const uniqueLinks = new Map();
  for (const link of database.links || []) {
    if (!isActiveLink(link, categoriesById, groupsById)) continue;
    const key = String(link.url || "").trim().toLowerCase();
    if (!key || uniqueLinks.has(key)) continue;
    uniqueLinks.set(key, backupLink(link));
  }

  const now = new Date();
  const links = [...uniqueLinks.values()];
  const backup = {
    metadata: {
      format: "linkoteca-active-links-local-backup",
      schemaVersion: 1,
      createdAt: now.toISOString(),
      appVersionDetected: String(packageJson.version || "unknown"),
      activeLinkCount: links.length,
      sourceDataFile: sourcePath,
      restoreTargetFolder: "Todos",
      note: "Al restaurar, agregar todos los enlaces a una sola carpeta llamada Todos. No recrear la estructura anterior."
    },
    links
  };

  validateBackup(backup, links.length);
  await fs.mkdir(outputDir, { recursive: true });
  assertInsideProjectArea(outputDir);
  const outputPath = path.join(outputDir, `linkoteca_active_links_local_backup_${timestampForFile(now)}.json`);
  assertInsideProjectArea(outputPath);
  await writeAtomic(outputPath, `${JSON.stringify(backup, null, 2)}\n`);

  const reloaded = JSON.parse(await fs.readFile(outputPath, "utf8"));
  validateBackup(reloaded, links.length);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath,
    activeLinkCount: links.length,
    sha256: await sha256(outputPath)
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
