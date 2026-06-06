const state = {
  db: null,
  activeCategoryId: "all",
  search: "",
  folderSearch: "",
  foldersExpanded: false,
  processingSharedLinks: false,
  lastSharedUrlKey: "",
  lastSharedAt: 0,
  movingLinkId: null,
  detailLinkId: null,
  installPrompt: null,
  apiBase: localStorage.getItem("linkotecaApiBase") || ""
};

const PENDING_SHARES_KEY = "linkotecaPendingShares";

const els = {
  allLinksButton: document.querySelector("#allLinksButton"),
  allCount: document.querySelector("#allCount"),
  reviewLinksButton: document.querySelector("#reviewLinksButton"),
  reviewCount: document.querySelector("#reviewCount"),
  duplicatesButton: document.querySelector("#duplicatesButton"),
  duplicatesCount: document.querySelector("#duplicatesCount"),
  trashButton: document.querySelector("#trashButton"),
  trashCount: document.querySelector("#trashCount"),
  categoryList: document.querySelector("#categoryList"),
  activeTitle: document.querySelector("#activeTitle"),
  libraryStats: document.querySelector("#libraryStats"),
  searchInput: document.querySelector("#searchInput"),
  gallery: document.querySelector("#gallery"),
  emptyState: document.querySelector("#emptyState"),
  addLinkForm: document.querySelector("#addLinkForm"),
  linkUrlInput: document.querySelector("#linkUrlInput"),
  linkTitleInput: document.querySelector("#linkTitleInput"),
  linkCategoryInput: document.querySelector("#linkCategoryInput"),
  enrichButton: document.querySelector("#enrichButton"),
  moveDialog: document.querySelector("#moveDialog"),
  moveCategorySelect: document.querySelector("#moveCategorySelect"),
  confirmMoveButton: document.querySelector("#confirmMoveButton"),
  detailDialog: document.querySelector("#detailDialog"),
  detailPreview: document.querySelector("#detailPreview"),
  detailTitleInput: document.querySelector("#detailTitleInput"),
  detailDescriptionInput: document.querySelector("#detailDescriptionInput"),
  detailCategorySelect: document.querySelector("#detailCategorySelect"),
  detailUrlInput: document.querySelector("#detailUrlInput"),
  detailOpenButton: document.querySelector("#detailOpenButton"),
  detailCopyButton: document.querySelector("#detailCopyButton"),
  detailSaveButton: document.querySelector("#detailSaveButton"),
  detailArchiveButton: document.querySelector("#detailArchiveButton"),
  newCategoryButton: document.querySelector("#newCategoryButton"),
  categoryDialog: document.querySelector("#categoryDialog"),
  categoryNameInput: document.querySelector("#categoryNameInput"),
  confirmCategoryButton: document.querySelector("#confirmCategoryButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  folderSearchInput: document.querySelector("#folderSearchInput"),
  toggleFoldersButton: document.querySelector("#toggleFoldersButton"),
  autoClassifyButton: document.querySelector("#autoClassifyButton"),
  exportDesktopButton: document.querySelector("#exportDesktopButton"),
  supportEmailInput: document.querySelector("#supportEmailInput"),
  paypalUrlInput: document.querySelector("#paypalUrlInput"),
  reportErrorButton: document.querySelector("#reportErrorButton"),
  suggestionButton: document.querySelector("#suggestionButton"),
  donateButton: document.querySelector("#donateButton"),
  latestVersionUrlInput: document.querySelector("#latestVersionUrlInput"),
  installedVersionInput: document.querySelector("#installedVersionInput"),
  androidUrlInput: document.querySelector("#androidUrlInput"),
  iosUrlInput: document.querySelector("#iosUrlInput"),
  pcUrlInput: document.querySelector("#pcUrlInput"),
  checkVersionButton: document.querySelector("#checkVersionButton"),
  installAppButton: document.querySelector("#installAppButton"),
  downloadAndroidButton: document.querySelector("#downloadAndroidButton"),
  downloadIosButton: document.querySelector("#downloadIosButton"),
  downloadPcButton: document.querySelector("#downloadPcButton"),
  storagePathInput: document.querySelector("#storagePathInput"),
  storageFormatInput: document.querySelector("#storageFormatInput"),
  downloadFormatInput: document.querySelector("#downloadFormatInput"),
  chooseStorageFolderButton: document.querySelector("#chooseStorageFolderButton"),
  downloadDataButton: document.querySelector("#downloadDataButton"),
  exportLocalButton: document.querySelector("#exportLocalButton"),
  exportGalleryButton: document.querySelector("#exportGalleryButton"),
  syncModeInput: document.querySelector("#syncModeInput"),
  remoteUrlInput: document.querySelector("#remoteUrlInput"),
  webdavUrlInput: document.querySelector("#webdavUrlInput"),
  syncFolderPathInput: document.querySelector("#syncFolderPathInput"),
  autoSyncInput: document.querySelector("#autoSyncInput"),
  chooseSyncFolderButton: document.querySelector("#chooseSyncFolderButton"),
  syncUserInput: document.querySelector("#syncUserInput"),
  syncPasswordInput: document.querySelector("#syncPasswordInput"),
  googleClientIdInput: document.querySelector("#googleClientIdInput"),
  googleClientSecretInput: document.querySelector("#googleClientSecretInput"),
  googleStatusText: document.querySelector("#googleStatusText"),
  connectGoogleButton: document.querySelector("#connectGoogleButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  pullSyncButton: document.querySelector("#pullSyncButton"),
  pushSyncButton: document.querySelector("#pushSyncButton"),
  connectionDialog: document.querySelector("#connectionDialog"),
  apiBaseInput: document.querySelector("#apiBaseInput"),
  useLocalApiButton: document.querySelector("#useLocalApiButton"),
  saveApiBaseButton: document.querySelector("#saveApiBaseButton"),
  toast: document.querySelector("#toast")
};

const GRADIENTS = [
  "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #10b981 0%, #0f766e 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #e11d48 100%)",
  "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
  "linear-gradient(135deg, #f97316 0%, #eab308 100%)",
  "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)"
];

function getFolderGradient(name) {
  let hash = 0;
  const value = String(name || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
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

function apiUrl(path) {
  if (!state.apiBase) return path;
  return new URL(path, state.apiBase).toString();
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "Error inesperado");
  return data;
}

function categoryName(categoryId) {
  return state.db.categories.find((category) => category.id === categoryId)?.name || "Sin carpeta";
}

function sortedCategories() {
  return [...state.db.categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function countByCategory() {
  const counts = new Map();
  for (const link of state.db.links.filter((item) => !item.archived)) {
    counts.set(link.categoryId, (counts.get(link.categoryId) || 0) + 1);
  }
  return counts;
}

function normalizedUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[)\]}>,.;]+$/, "") : "";
}

function normalizeSharedPayload(raw = {}) {
  const sourceText = String(raw.text || raw.url || raw.title || "");
  const url = extractFirstUrl(raw.url) || extractFirstUrl(sourceText);
  if (!url) return null;
  const title = String(raw.title || "").trim();
  const description = sourceText.replace(url, "").trim();
  return {
    url,
    title: title && title !== url ? title.slice(0, 180) : "",
    description: description.slice(0, 1200),
    source: String(raw.source || "share-target"),
    receivedAt: raw.receivedAt || new Date().toISOString()
  };
}

function readQueuedShares() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SHARES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueuedShares(items) {
  localStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(items.slice(0, 20)));
}

function queueSharedLink(raw) {
  const payload = normalizeSharedPayload(raw);
  if (!payload) {
    toast("No encontré un enlace para guardar");
    return;
  }
  const queue = readQueuedShares();
  const key = normalizedUrl(payload.url);
  const now = Date.now();
  if (state.lastSharedUrlKey === key && now - state.lastSharedAt < 5000) return;
  state.lastSharedUrlKey = key;
  state.lastSharedAt = now;
  if (!queue.some((item) => normalizedUrl(item.url) === key)) {
    queue.push(payload);
    writeQueuedShares(queue);
  }
  toast("Enlace recibido desde Compartir");
  processQueuedSharedLinks().catch((error) => toast(error.message));
}

function captureWebShareTarget() {
  const params = new URLSearchParams(window.location.search);
  const hasSharePayload = params.has("url") || params.has("text") || params.has("title");
  if (!hasSharePayload) return;
  queueSharedLink({
    url: params.get("url") || "",
    title: params.get("title") || "",
    text: params.get("text") || "",
    source: "pwa-share-target"
  });
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function saveSharedLink(payload) {
  const existing = state.db.links.find((link) => normalizedUrl(link.url) === normalizedUrl(payload.url));
  if (existing) {
    const category = categoryName(existing.categoryId);
    toast(`Ese enlace ya existe en ${category}`);
    return;
  }

  let title = payload.title;
  let description = payload.description || "";
  let thumbnail = "";

  try {
    const preview = await api("/api/preview", {
      method: "POST",
      body: JSON.stringify({ url: payload.url })
    });
    title = title || preview.preview.title || hostFromUrl(payload.url);
    description = description || preview.preview.description || "";
    thumbnail = preview.preview.thumbnail || "";
  } catch {
    title = title || hostFromUrl(payload.url);
  }

  const data = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({
      url: payload.url,
      title,
      description,
      thumbnail,
      categoryName: "Por revisar",
      tags: ["compartido"]
    })
  });

  state.db.links.unshift(data.link);
  state.activeCategoryId = "review";
  render();
  toast("Enlace compartido guardado en Por revisar");
}

async function processQueuedSharedLinks() {
  if (state.processingSharedLinks || !state.db) return;
  state.processingSharedLinks = true;
  try {
    const queue = readQueuedShares();
    while (queue.length > 0) {
      const payload = queue[0];
      try {
        await saveSharedLink(payload);
        queue.shift();
        writeQueuedShares(queue);
      } catch (error) {
        if (/fetch|network|failed|conectar|servidor/i.test(error.message || "")) {
          writeQueuedShares(queue);
          openConnectionDialog(error);
          return;
        }
        queue.shift();
        writeQueuedShares(queue);
        toast(error.message);
      }
    }
  } finally {
    state.processingSharedLinks = false;
  }
}

function duplicateUrlSet() {
  const counts = new Map();
  for (const link of state.db.links.filter((item) => !item.archived)) {
    const key = normalizedUrl(link.url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([url]) => url));
}

function platformInitial(platform) {
  return String(platform || "W").trim().slice(0, 1).toUpperCase();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function icon(name, extraStyles = "") {
  return `<span class="icon" style="--icon: url('/icons/${name}.svg'); ${extraStyles}"></span>`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function filteredLinks() {
  const term = state.search.trim().toLowerCase();
  const duplicateUrls = state.activeCategoryId === "duplicates" ? duplicateUrlSet() : null;
  return state.db.links.filter((link) => {
    const archived = Boolean(link.archived);
    const inCategory =
      (state.activeCategoryId === "trash" && archived) ||
      (!archived && (
        state.activeCategoryId === "all" ||
        (state.activeCategoryId === "review" && link.status !== "confirmado") ||
        (state.activeCategoryId === "duplicates" && duplicateUrls.has(normalizedUrl(link.url))) ||
        link.categoryId === state.activeCategoryId
      ));
    if (!inCategory) return false;
    if (!term) return true;
    const haystack = [
      link.title,
      link.description,
      link.url,
      link.platform,
      categoryName(link.categoryId),
      ...(link.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function renderCategoryOptions() {
  const options = sortedCategories()
    .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
    .join("");
  els.linkCategoryInput.innerHTML = options;
  els.moveCategorySelect.innerHTML = options;
  els.detailCategorySelect.innerHTML = options;
}

function renderCategories() {
  const counts = countByCategory();
  const activeLinks = state.db.links.filter((link) => !link.archived);
  const reviewCount = activeLinks.filter((link) => link.status !== "confirmado" && link.status !== "auto-clasificado").length;
  const duplicatesSet = duplicateUrlSet();
  const duplicatesCount = activeLinks.filter((link) => duplicatesSet.has(normalizedUrl(link.url))).length;
  const trashCount = state.db.links.filter((link) => link.archived).length;
  els.allCount.textContent = activeLinks.length;
  els.reviewCount.textContent = reviewCount;
  els.duplicatesCount.textContent = duplicatesCount;
  els.trashCount.textContent = trashCount;
  els.categoryList.innerHTML = "";
  const folderFilter = state.folderSearch.trim().toLowerCase();
  const categories = sortedCategories();
  const maxVisible = 15;
  let visibleCount = 0;

  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button${state.activeCategoryId === category.id ? " active" : ""}`;
    button.dataset.categoryId = category.id;
    const iconStyle = `--icon-bg: ${getFolderGradient(category.name)};`;
    button.innerHTML = `
      <span class="category-name">
        ${icon(state.activeCategoryId === category.id ? "folder-open" : "folder", iconStyle)}
        <span>${escapeHtml(category.name)}</span>
      </span>
      <span class="count">${counts.get(category.id) || 0}</span>
    `;
    if (folderFilter && !category.name.toLowerCase().includes(folderFilter)) {
      button.classList.add("hidden-folder");
    } else {
      visibleCount += 1;
      if (!folderFilter && !state.foldersExpanded && visibleCount > maxVisible && state.activeCategoryId !== category.id) {
        button.classList.add("hidden-folder");
      }
    }
    button.addEventListener("click", () => {
      state.activeCategoryId = category.id;
      render();
    });
    els.categoryList.append(button);
  }
  if (categories.length > maxVisible && !folderFilter) {
    els.toggleFoldersButton.hidden = false;
    els.toggleFoldersButton.querySelector("span:last-child").textContent = state.foldersExpanded
      ? "Mostrar menos"
      : `Mostrar todas (${categories.length})`;
  } else {
    els.toggleFoldersButton.hidden = true;
  }
  els.allLinksButton.classList.toggle("active", state.activeCategoryId === "all");
  els.reviewLinksButton.classList.toggle("active", state.activeCategoryId === "review");
  els.duplicatesButton.classList.toggle("active", state.activeCategoryId === "duplicates");
  els.trashButton.classList.toggle("active", state.activeCategoryId === "trash");
}

function renderHeader(links) {
  const activeCategory = state.db.categories.find((category) => category.id === state.activeCategoryId);
  const title = state.activeCategoryId === "all"
    ? "Todos"
    : state.activeCategoryId === "review"
      ? "Por revisar"
      : state.activeCategoryId === "duplicates"
        ? "Duplicados"
        : state.activeCategoryId === "trash"
          ? "Papelera"
          : activeCategory?.name || "Carpeta";
  els.activeTitle.textContent = title;
  const total = state.db.links.filter((link) => !link.archived).length;
  const folders = state.db.categories.length;
  els.libraryStats.textContent = `${links.length} visibles · ${total} enlaces · ${folders} carpetas`;
}

function renderGallery() {
  const links = filteredLinks();
  renderHeader(links);
  els.gallery.innerHTML = "";
  els.emptyState.hidden = links.length > 0;

  for (const link of links) {
    const article = document.createElement("article");
    article.className = "link-card";
    article.innerHTML = `
      <div class="thumb">
        ${link.thumbnail ? `<img src="${escapeAttr(link.thumbnail)}" alt="">` : `<div class="placeholder">${escapeHtml(platformInitial(link.platform))}</div>`}
        <span class="platform">${escapeHtml(link.platform || "Web")}</span>
      </div>
      <div class="card-body">
        <h2>${escapeHtml(link.title || "Enlace sin titulo")}</h2>
        <p class="description">${escapeHtml(link.description || hostFromUrl(link.url))}</p>
        <div class="card-meta">
          <span class="pill">${icon("folder", `--icon-bg: ${getFolderGradient(categoryName(link.categoryId))};`)}<span>${escapeHtml(categoryName(link.categoryId))}</span></span>
          <span class="pill">${icon("globe")}<span>${escapeHtml(hostFromUrl(link.url))}</span></span>
          ${link.status === "auto-clasificado" ? `<span class="pill auto-badge">${icon("sparkles")}<span>Auto</span></span>` : ""}
          ${link.status !== "confirmado" && link.status !== "auto-clasificado" ? `<span class="pill status">${icon("clock-3")}<span>${escapeHtml(link.status)}</span></span>` : ""}
        </div>
      </div>
      <div class="card-actions">
        <button type="button" data-action="open" title="Abrir enlace">${icon("arrow-up-right")}Abrir</button>
        <button type="button" data-action="copy" title="Copiar enlace">${icon("copy")}Copiar</button>
        <button type="button" data-action="detail" title="Editar enlace">${icon("settings")}Editar</button>
        ${link.archived
          ? `<button type="button" data-action="restore" title="Restaurar enlace">${icon("check")}Restaurar</button>`
          : `<button type="button" data-action="move" title="Mover de carpeta">${icon("move-right")}Mover</button>`}
      </div>
    `;
    article.addEventListener("click", (event) => {
      if (!event.target.closest("button")) openDetailDialog(link.id);
    });
    article.querySelector('[data-action="open"]').addEventListener("click", (event) => {
      event.stopPropagation();
      window.open(link.url, "_blank", "noopener");
    });
    article.querySelector('[data-action="copy"]').addEventListener("click", (event) => {
      event.stopPropagation();
      copyLink(link.url);
    });
    article.querySelector('[data-action="detail"]').addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailDialog(link.id);
    });
    const moveAction = article.querySelector('[data-action="move"]');
    if (moveAction) {
      moveAction.addEventListener("click", (event) => {
        event.stopPropagation();
        openMoveDialog(link.id);
      });
    }
    const restoreAction = article.querySelector('[data-action="restore"]');
    if (restoreAction) {
      restoreAction.addEventListener("click", (event) => {
        event.stopPropagation();
        restoreLink(link.id);
      });
    }
    els.gallery.append(article);
  }
}

function render() {
  renderCategoryOptions();
  renderCategories();
  renderGallery();
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast("Enlace copiado");
}

function openMoveDialog(linkId) {
  state.movingLinkId = linkId;
  const link = state.db.links.find((item) => item.id === linkId);
  if (link) els.moveCategorySelect.value = link.categoryId;
  els.moveDialog.showModal();
}

function openDetailDialog(linkId) {
  const link = state.db.links.find((item) => item.id === linkId);
  if (!link) return;
  state.detailLinkId = linkId;
  els.detailTitleInput.value = link.title || "";
  els.detailDescriptionInput.value = link.description || "";
  els.detailCategorySelect.value = link.categoryId;
  els.detailUrlInput.value = link.url;
  const youtubeId = getYouTubeId(link.url);
  els.detailPreview.innerHTML = youtubeId
    ? `
      <div class="video-container">
        <iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(link.title || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `
    : `
      <div class="thumb detail-thumb">
        ${link.thumbnail ? `<img src="${escapeAttr(link.thumbnail)}" alt="">` : `<div class="placeholder">${escapeHtml(platformInitial(link.platform))}</div>`}
        <span class="platform">${escapeHtml(link.platform || "Web")}</span>
      </div>
    `;
  els.detailArchiveButton.innerHTML = link.archived
    ? `${icon("check")} Restaurar`
    : `${icon("x")} Archivar`;
  els.detailArchiveButton.classList.toggle("danger-button", !link.archived);
  els.detailArchiveButton.classList.toggle("restore-button", Boolean(link.archived));
  els.detailDialog.showModal();
}

async function moveCurrentLink() {
  if (!state.movingLinkId) return;
  const categoryId = els.moveCategorySelect.value;
  const data = await api(`/api/links/${state.movingLinkId}`, {
    method: "PATCH",
    body: JSON.stringify({ categoryId })
  });
  const index = state.db.links.findIndex((link) => link.id === data.link.id);
  if (index >= 0) state.db.links[index] = data.link;
  els.moveDialog.close();
  state.movingLinkId = null;
  render();
  toast("Enlace movido");
}

async function saveDetail() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (!link) return;
  const data = await api(`/api/links/${link.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: els.detailTitleInput.value,
      description: els.detailDescriptionInput.value,
      categoryId: els.detailCategorySelect.value
    })
  });
  const index = state.db.links.findIndex((item) => item.id === data.link.id);
  if (index >= 0) state.db.links[index] = data.link;
  els.detailDialog.close();
  state.detailLinkId = null;
  render();
  toast("Enlace guardado");
}

async function archiveCurrentDetailLink() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (!link) return;
  if (link.archived) {
    await restoreLink(link.id, { closeDetail: true });
    return;
  }
  const data = await api(`/api/links/${link.id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true })
  });
  const index = state.db.links.findIndex((item) => item.id === data.link.id);
  if (index >= 0) state.db.links[index] = data.link;
  els.detailDialog.close();
  state.detailLinkId = null;
  render();
  toast("Enlace enviado a Papelera");
}

async function restoreLink(linkId, options = {}) {
  const data = await api(`/api/links/${linkId}/restore`, { method: "POST" });
  const index = state.db.links.findIndex((item) => item.id === data.link.id);
  if (index >= 0) state.db.links[index] = data.link;
  if (options.closeDetail) {
    els.detailDialog.close();
    state.detailLinkId = null;
  }
  render();
  toast("Enlace restaurado");
}

function openDetailLink() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (link) window.open(link.url, "_blank", "noopener");
}

function copyDetailUrl() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (link) copyLink(link.url);
}

function openExternal(url, missingMessage) {
  if (!url) {
    toast(missingMessage);
    return;
  }
  window.open(url, "_blank", "noopener");
}

function openConnectionDialog(error) {
  els.libraryStats.textContent = "No se pudo conectar con el servidor";
  els.apiBaseInput.value = state.apiBase || "";
  if (els.connectionDialog.open) return;
  els.connectionDialog.showModal();
  if (error?.message) toast(error.message);
}

async function saveApiBase() {
  const value = els.apiBaseInput.value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value)) {
    toast("Escribe una URL tipo http://192.168.1.50:4387");
    return;
  }
  state.apiBase = value;
  localStorage.setItem("linkotecaApiBase", value);
  els.connectionDialog.close();
  await load();
  toast("Servidor conectado");
}

async function useLocalApi() {
  state.apiBase = "";
  localStorage.removeItem("linkotecaApiBase");
  els.connectionDialog.close();
  await load();
  toast("Usando servidor local");
}

function openMail(kind) {
  const email = els.supportEmailInput.value.trim();
  if (!email) {
    toast("Confirma primero el email de destino");
    return;
  }
  const subject = kind === "error" ? "Reporte de error - Linkoteca" : "Sugerencia - Linkoteca";
  const body = [
    "Hola Ernesto,",
    "",
    kind === "error" ? "Quiero reportar este error:" : "Tengo esta sugerencia:",
    "",
    "",
    "Información útil:",
    `Versión: ${els.installedVersionInput.value || "sin verificar"}`,
    `Enlaces: ${state.db.links.length}`,
    `Carpetas: ${state.db.categories.length}`
  ].join("\n");
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function createCategory() {
  const name = els.categoryNameInput.value.trim();
  if (!name) return;
  const data = await api("/api/categories", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  const existing = state.db.categories.findIndex((category) => category.id === data.category.id);
  if (existing >= 0) state.db.categories[existing] = data.category;
  else state.db.categories.push(data.category);
  els.categoryNameInput.value = "";
  els.categoryDialog.close();
  render();
  toast("Carpeta creada");
}

async function addLink(event) {
  event.preventDefault();
  const url = els.linkUrlInput.value.trim();
  let title = els.linkTitleInput.value.trim();
  let description = "";
  let thumbnail = "";

  if (!title) {
    try {
      const preview = await api("/api/preview", {
        method: "POST",
        body: JSON.stringify({ url })
      });
      title = preview.preview.title || hostFromUrl(url);
      description = preview.preview.description || "";
      thumbnail = preview.preview.thumbnail || "";
    } catch {
      title = hostFromUrl(url);
    }
  }

  const data = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({
      url,
      title,
      description,
      thumbnail,
      categoryId: els.linkCategoryInput.value
    })
  });

  state.db.links.unshift(data.link);
  els.linkUrlInput.value = "";
  els.linkTitleInput.value = "";
  render();
  toast("Enlace agregado");
}

async function enrichPreviews() {
  const original = els.enrichButton.innerHTML;
  els.enrichButton.disabled = true;
  els.enrichButton.innerHTML = `${icon("refresh-cw")} Actualizando...`;
  try {
    const result = await api("/api/previews/enrich", {
      method: "POST",
      body: JSON.stringify({ limit: 24, onlyMissing: true })
    });
    await load();
    if (result.processed === 0) {
      toast("No hay vistas pendientes");
    } else {
      toast(`Vistas actualizadas: ${result.updated}/${result.processed}`);
    }
  } finally {
    els.enrichButton.disabled = false;
    els.enrichButton.innerHTML = original;
  }
}

function fillSettings() {
  const settings = state.db.settings || {};
  const contact = settings.contact || {};
  const storage = settings.storage || {};
  const sync = settings.sync || {};
  const updates = settings.updates || {};
  els.supportEmailInput.value = contact.supportEmail || "";
  els.paypalUrlInput.value = contact.paypalUrl || "";
  els.storagePathInput.value = storage.path || "";
  els.storageFormatInput.value = storage.format || "json";
  els.syncModeInput.value = sync.mode || "none";
  els.remoteUrlInput.value = sync.remoteUrl || "";
  els.webdavUrlInput.value = sync.webdavUrl || "";
  els.syncFolderPathInput.value = sync.folderPath || "";
  els.autoSyncInput.checked = sync.autoOnOpen !== false;
  els.syncUserInput.value = sync.username || "";
  els.syncPasswordInput.value = sync.password || "";
  els.googleClientIdInput.value = sync.googleClientId || "";
  els.googleClientSecretInput.value = sync.googleClientSecret || "";
  els.googleStatusText.textContent = sync.googleEmail
    ? `Conectado: ${sync.googleEmail}`
    : "Google Drive sin conectar";
  els.latestVersionUrlInput.value = updates.latestVersionUrl || "";
  els.androidUrlInput.value = updates.androidUrl || "";
  els.iosUrlInput.value = updates.iosUrl || "";
  els.pcUrlInput.value = updates.pcUrl || "";
  els.installedVersionInput.value = "Consultando...";
  checkVersion(false).catch(() => {
    els.installedVersionInput.value = "0.2.0";
  });
}

async function saveSettings() {
  const settings = {
    contact: {
      supportEmail: els.supportEmailInput.value.trim(),
      paypalUrl: els.paypalUrlInput.value.trim()
    },
    storage: {
      path: els.storagePathInput.value.trim(),
      format: els.storageFormatInput.value
    },
    sync: {
      mode: els.syncModeInput.value,
      provider: els.syncModeInput.value,
      autoOnOpen: els.autoSyncInput.checked,
      remoteUrl: els.remoteUrlInput.value.trim(),
      webdavUrl: els.webdavUrlInput.value.trim(),
      folderPath: els.syncFolderPathInput.value.trim(),
      username: els.syncUserInput.value.trim(),
      password: els.syncPasswordInput.value,
      googleClientId: els.googleClientIdInput.value.trim(),
      googleClientSecret: els.googleClientSecretInput.value.trim(),
      googleFileName: "linkoteca.json"
    },
    updates: {
      latestVersionUrl: els.latestVersionUrlInput.value.trim(),
      androidUrl: els.androidUrlInput.value.trim(),
      iosUrl: els.iosUrlInput.value.trim(),
      pcUrl: els.pcUrlInput.value.trim()
    }
  };
  const data = await api("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(settings)
  });
  state.db.settings = data.settings;
  toast("Configuración guardada");
}

async function syncPull() {
  await saveSettings();
  await api("/api/sync/pull", { method: "POST" });
  await load();
  toast("Banco descargado");
}

async function checkVersion(showToast = true) {
  const data = await api("/api/version");
  els.installedVersionInput.value = data.version;
  if (showToast) {
    if (data.status === "update_available") toast(`Hay actualización: ${data.latest}`);
    else if (data.status === "current") toast(`Estás al día: ${data.version}`);
    else if (String(data.status).startsWith("check_failed")) toast("No pude verificar la versión remota");
    else toast(`Versión local: ${data.version}`);
  }
}

async function connectGoogle() {
  await saveSettings();
  const result = await api("/api/google/auth-url", { method: "POST" });
  window.open(result.authUrl, "_blank", "noopener");
  els.googleStatusText.textContent = "Completa el acceso en Google y vuelve a Linkoteca";
  toast("Abriendo acceso a Google Drive");
}

async function chooseFolder(targetInput, title) {
  const result = await api("/api/folders/pick", {
    method: "POST",
    body: JSON.stringify({
      title,
      initialPath: targetInput.value.trim()
    })
  });
  if (result.path) {
    targetInput.value = result.path;
    toast("Carpeta seleccionada");
  }
}

function downloadData() {
  const format = els.downloadFormatInput.value || "json";
  window.open(`/api/export/${format}`, "_blank", "noopener");
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    toast("Solicitud de instalación enviada");
    return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isiOS) {
    toast("En iOS: Compartir y luego Agregar a pantalla de inicio");
    return;
  }
  toast("Usa el menú del navegador para instalar Linkoteca");
}

async function exportLocal() {
  await saveSettings();
  const formats = Array.from(new Set(["json", els.storageFormatInput.value || "json", "xls", "csv", "txt"]));
  const result = await api("/api/export/local", {
    method: "POST",
    body: JSON.stringify({
      folderPath: els.storagePathInput.value.trim(),
      formats
    })
  });
  toast(`Exportado: ${result.written.length} archivos`);
}

async function exportGallery() {
  await saveSettings();
  const result = await api("/api/export/gallery", {
    method: "POST",
    body: JSON.stringify({
      folderPath: els.storagePathInput.value.trim()
    })
  });
  toast(`Galería creada: ${result.folders} carpetas`);
}

async function autoClassifyBatch() {
  const original = els.autoClassifyButton.innerHTML;
  els.autoClassifyButton.disabled = true;
  els.autoClassifyButton.innerHTML = `${icon("sparkles")} Clasificando...`;
  try {
    const result = await api("/api/classify/batch", {
      method: "POST",
      body: JSON.stringify({ limit: 50 })
    });
    await load();
    toast(result.moved === 0
      ? "No encontré enlaces pendientes para reclasificar"
      : `${result.moved} enlaces clasificados automáticamente`);
  } finally {
    els.autoClassifyButton.disabled = false;
    els.autoClassifyButton.innerHTML = original;
  }
}

async function exportDesktop() {
  const result = await api("/api/export/desktop", { method: "POST" });
  toast(`Galería exportada al Escritorio: ${result.folders} carpetas`);
}

async function syncPush() {
  await saveSettings();
  await api("/api/sync/push", { method: "POST" });
  toast("Banco subido");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

async function load() {
  if (!load.autoSyncAttempted) {
    load.autoSyncAttempted = true;
    try {
      const result = await api("/api/sync/auto", { method: "POST" });
      if (result.synced) toast("Sincronización automática lista");
    } catch {
      // La biblioteca debe cargar aunque la nube no esté disponible.
    }
  }
  try {
    state.db = await api("/api/library");
    render();
    await processQueuedSharedLinks();
  } catch (error) {
    openConnectionDialog(error);
    throw error;
  }
}

els.allLinksButton.addEventListener("click", () => {
  state.activeCategoryId = "all";
  render();
});

els.reviewLinksButton.addEventListener("click", () => {
  state.activeCategoryId = "review";
  render();
});

els.duplicatesButton.addEventListener("click", () => {
  state.activeCategoryId = "duplicates";
  render();
});

els.trashButton.addEventListener("click", () => {
  state.activeCategoryId = "trash";
  render();
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderGallery();
});

els.addLinkForm.addEventListener("submit", (event) => {
  addLink(event).catch((error) => toast(error.message));
});

els.enrichButton.addEventListener("click", () => {
  enrichPreviews().catch((error) => toast(error.message));
});

els.confirmMoveButton.addEventListener("click", () => {
  moveCurrentLink().catch((error) => toast(error.message));
});

els.detailOpenButton.addEventListener("click", () => {
  openDetailLink();
});

els.detailCopyButton.addEventListener("click", () => {
  copyDetailUrl();
});

els.detailSaveButton.addEventListener("click", () => {
  saveDetail().catch((error) => toast(error.message));
});

els.detailArchiveButton.addEventListener("click", () => {
  archiveCurrentDetailLink().catch((error) => toast(error.message));
});

els.detailDialog.addEventListener("close", () => {
  els.detailPreview.innerHTML = "";
});

els.newCategoryButton.addEventListener("click", () => {
  els.categoryDialog.showModal();
  els.categoryNameInput.focus();
});

els.confirmCategoryButton.addEventListener("click", () => {
  createCategory().catch((error) => toast(error.message));
});

els.settingsButton.addEventListener("click", () => {
  fillSettings();
  els.settingsDialog.showModal();
});

els.saveSettingsButton.addEventListener("click", () => {
  saveSettings().catch((error) => toast(error.message));
});

els.reportErrorButton.addEventListener("click", () => {
  openMail("error");
});

els.suggestionButton.addEventListener("click", () => {
  openMail("suggestion");
});

els.donateButton.addEventListener("click", () => {
  openExternal(els.paypalUrlInput.value.trim(), "Confirma primero el link de PayPal");
});

els.checkVersionButton.addEventListener("click", () => {
  checkVersion(true).catch((error) => toast(error.message));
});

els.installAppButton.addEventListener("click", () => {
  installApp().catch((error) => toast(error.message));
});

els.downloadAndroidButton.addEventListener("click", () => {
  window.open(apiUrl("/api/download/android"), "_blank", "noopener");
});

els.downloadIosButton.addEventListener("click", () => {
  window.open(apiUrl("/api/download/ios"), "_blank", "noopener");
});

els.downloadPcButton.addEventListener("click", () => {
  window.open(apiUrl("/api/download/pc"), "_blank", "noopener");
});

els.downloadDataButton.addEventListener("click", () => {
  downloadData();
});

els.chooseStorageFolderButton.addEventListener("click", () => {
  chooseFolder(els.storagePathInput, "Elegir carpeta para guardar exportaciones").catch((error) => toast(error.message));
});

els.exportLocalButton.addEventListener("click", () => {
  exportLocal().catch((error) => toast(error.message));
});

els.exportGalleryButton.addEventListener("click", () => {
  exportGallery().catch((error) => toast(error.message));
});

els.exportDesktopButton.addEventListener("click", () => {
  exportDesktop().catch((error) => toast(error.message));
});

els.autoClassifyButton.addEventListener("click", () => {
  autoClassifyBatch().catch((error) => toast(error.message));
});

els.folderSearchInput.addEventListener("input", (event) => {
  state.folderSearch = event.target.value;
  renderCategories();
});

els.toggleFoldersButton.addEventListener("click", () => {
  state.foldersExpanded = !state.foldersExpanded;
  renderCategories();
});

els.chooseSyncFolderButton.addEventListener("click", () => {
  chooseFolder(els.syncFolderPathInput, "Elegir carpeta sincronizada").catch((error) => toast(error.message));
});

els.connectGoogleButton.addEventListener("click", () => {
  connectGoogle().catch((error) => toast(error.message));
});

els.pullSyncButton.addEventListener("click", () => {
  syncPull().catch((error) => toast(error.message));
});

els.pushSyncButton.addEventListener("click", () => {
  syncPush().catch((error) => toast(error.message));
});

els.saveApiBaseButton.addEventListener("click", () => {
  saveApiBase().catch((error) => openConnectionDialog(error));
});

els.useLocalApiButton.addEventListener("click", () => {
  useLocalApi().catch((error) => openConnectionDialog(error));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
});

window.addEventListener("linkoteca:shared-link", (event) => {
  queueSharedLink(event.detail || {});
});

captureWebShareTarget();

if (window.__linkotecaPendingShare) {
  queueSharedLink(window.__linkotecaPendingShare);
}

load().catch((error) => {
  els.libraryStats.textContent = error.message;
});
