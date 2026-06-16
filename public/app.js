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
  detailDirty: false,
  detailSaveTimer: 0,
  selectedLinkIds: new Set(),
  confirmResolver: null,
  apiBase: localStorage.getItem("linkotecaApiBase") || ""
};

const PENDING_SHARES_KEY = "linkotecaPendingShares";
const GITHUB_PROFILE_URL = "https://github.com/colombianitov2";

const els = {
  allLinksButton: document.querySelector("#allLinksButton"),
  allCount: document.querySelector("#allCount"),
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
  bulkActions: document.querySelector("#bulkActions"),
  bulkSelectionText: document.querySelector("#bulkSelectionText"),
  bulkDeleteButton: document.querySelector("#bulkDeleteButton"),
  bulkRestoreButton: document.querySelector("#bulkRestoreButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
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
  detailDeleteButton: document.querySelector("#detailDeleteButton"),
  newCategoryButton: document.querySelector("#newCategoryButton"),
  categoryDialog: document.querySelector("#categoryDialog"),
  categoryNameInput: document.querySelector("#categoryNameInput"),
  confirmCategoryButton: document.querySelector("#confirmCategoryButton"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmNoButton: document.querySelector("#confirmNoButton"),
  confirmYesButton: document.querySelector("#confirmYesButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  folderSearchInput: document.querySelector("#folderSearchInput"),
  toggleFoldersButton: document.querySelector("#toggleFoldersButton"),
  exportDesktopButton: document.querySelector("#exportDesktopButton"),
  installedVersionInput: document.querySelector("#installedVersionInput"),
  githubProfileButton: document.querySelector("#githubProfileButton"),
  checkVersionButton: document.querySelector("#checkVersionButton"),
  storagePathInput: document.querySelector("#storagePathInput"),
  storageFormatInput: document.querySelector("#storageFormatInput"),
  chooseStorageFolderButton: document.querySelector("#chooseStorageFolderButton"),
  downloadDataButton: document.querySelector("#downloadDataButton"),
  exportLocalButton: document.querySelector("#exportLocalButton"),
  syncModeInput: document.querySelector("#syncModeInput"),
  remoteUrlInput: document.querySelector("#remoteUrlInput"),
  webdavUrlInput: document.querySelector("#webdavUrlInput"),
  autoSyncInput: document.querySelector("#autoSyncInput"),
  trashRetentionDaysInput: document.querySelector("#trashRetentionDaysInput"),
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

function instagramEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.replace(/^www\./, "").toLowerCase().includes("instagram.com")) return "";
    const [type, shortcode] = parsed.pathname.split("/").filter(Boolean);
    if (!["p", "reel", "tv"].includes(type) || !shortcode) return "";
    return `https://www.instagram.com/${type}/${shortcode}/embed/`;
  } catch {
    return "";
  }
}

function facebookVideoEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const isFacebook = host.includes("facebook.com") || host.includes("fb.watch");
    const isVideoPath = /\/(videos|watch|reel|reels)\b/i.test(parsed.pathname) || host.includes("fb.watch");
    if (!isFacebook || !isVideoPath) return "";
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=560`;
  } catch {
    return "";
  }
}

function socialVideoEmbedUrl(url) {
  return instagramEmbedUrl(url) || facebookVideoEmbedUrl(url);
}

function isVideoPreviewLink(link) {
  return Boolean(getYouTubeId(link.url) || socialVideoEmbedUrl(link.url));
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
      categoryName: "General",
      tags: ["compartido"]
    })
  });

  state.db.links.unshift(data.link);
  state.activeCategoryId = "all";
  render();
  toast("Enlace compartido guardado");
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
  clearTimeout(toast.timer);
  clearTimeout(toast.hideTimer);
  const openDialogs = [...document.querySelectorAll("dialog[open]")];
  const toastHost = openDialogs.at(-1) || document.body;
  if (els.toast.parentElement !== toastHost) toastHost.appendChild(els.toast);

  els.toast.textContent = message;
  els.toast.classList.remove("show");

  requestAnimationFrame(() => els.toast.classList.add("show"));
  toast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
    toast.hideTimer = setTimeout(() => {
      if (els.toast.parentElement !== document.body) document.body.appendChild(els.toast);
    }, 180);
  }, 2200);
}

function updateLocalLink(updatedLink) {
  const index = state.db.links.findIndex((link) => link.id === updatedLink.id);
  if (index >= 0) state.db.links[index] = updatedLink;
}

function clearSelection() {
  state.selectedLinkIds.clear();
}

function pruneSelectionToExistingLinks() {
  const existingIds = new Set(state.db.links.map((link) => link.id));
  for (const id of [...state.selectedLinkIds]) {
    if (!existingIds.has(id)) state.selectedLinkIds.delete(id);
  }
}

function selectedLinks() {
  return state.db.links.filter((link) => state.selectedLinkIds.has(link.id));
}

function confirmAction(message) {
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
    els.confirmMessage.textContent = message;
    els.confirmDialog.showModal();
  });
}

function resolveConfirm(value) {
  const resolver = state.confirmResolver;
  state.confirmResolver = null;
  if (els.confirmDialog.open) els.confirmDialog.close();
  if (resolver) resolver(value);
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
  const duplicatesSet = duplicateUrlSet();
  const duplicatesCount = activeLinks.filter((link) => duplicatesSet.has(normalizedUrl(link.url))).length;
  const trashCount = state.db.links.filter((link) => link.archived).length;
  els.allCount.textContent = activeLinks.length;
  els.duplicatesCount.textContent = duplicatesCount;
  els.trashCount.textContent = trashCount;
  els.categoryList.innerHTML = "";
  const folderFilter = state.folderSearch.trim().toLowerCase();
  const categories = sortedCategories();
  const maxVisible = 15;
  let visibleCount = 0;

  for (const category of categories) {
    const row = document.createElement("div");
    row.className = "category-row";
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
      row.classList.add("hidden-folder");
    } else {
      visibleCount += 1;
      if (!folderFilter && !state.foldersExpanded && visibleCount > maxVisible && state.activeCategoryId !== category.id) {
        row.classList.add("hidden-folder");
      }
    }
    button.addEventListener("click", () => {
      clearSelection();
      state.activeCategoryId = category.id;
      render();
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "category-delete-button";
    deleteButton.title = `Eliminar carpeta ${category.name}`;
    deleteButton.setAttribute("aria-label", `Eliminar carpeta ${category.name}`);
    deleteButton.innerHTML = icon("trash");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCategory(category.id).catch((error) => toast(error.message));
    });
    row.append(button, deleteButton);
    els.categoryList.append(row);
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
  els.duplicatesButton.classList.toggle("active", state.activeCategoryId === "duplicates");
  els.trashButton.classList.toggle("active", state.activeCategoryId === "trash");
}

function renderHeader(links) {
  const activeCategory = state.db.categories.find((category) => category.id === state.activeCategoryId);
  const title = state.activeCategoryId === "all"
    ? "Todos"
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

function renderBulkActions() {
  pruneSelectionToExistingLinks();
  const selected = selectedLinks();
  els.bulkActions.hidden = selected.length === 0;
  if (selected.length === 0) return;
  els.bulkSelectionText.textContent = `${selected.length} seleccionado${selected.length === 1 ? "" : "s"}`;
  const isTrashView = state.activeCategoryId === "trash";
  els.bulkDeleteButton.hidden = isTrashView;
  els.bulkRestoreButton.hidden = !isTrashView;
}

function renderGallery() {
  const links = filteredLinks();
  renderHeader(links);
  renderBulkActions();
  els.gallery.innerHTML = "";
  els.emptyState.hidden = links.length > 0;

  for (const link of links) {
    const article = document.createElement("article");
    article.className = "link-card";
    article.innerHTML = `
      <label class="card-select" title="Seleccionar enlace">
        <input type="checkbox" data-action="select" ${state.selectedLinkIds.has(link.id) ? "checked" : ""}>
        <span></span>
      </label>
      <div class="thumb">
        ${link.thumbnail ? `<img src="${escapeAttr(link.thumbnail)}" alt="">` : `<div class="placeholder">${escapeHtml(platformInitial(link.platform))}</div>`}
        ${isVideoPreviewLink(link) ? `<span class="play-badge">${icon("play")}</span>` : ""}
        <span class="platform">${escapeHtml(link.platform || "Web")}</span>
      </div>
      <div class="card-body">
        <h2>${escapeHtml(link.title || "Enlace sin titulo")}</h2>
        <p class="description">${escapeHtml(link.description || hostFromUrl(link.url))}</p>
        <div class="card-meta">
          <span class="pill">${icon("folder", `--icon-bg: ${getFolderGradient(categoryName(link.categoryId))};`)}<span>${escapeHtml(categoryName(link.categoryId))}</span></span>
          <span class="pill">${icon("globe")}<span>${escapeHtml(hostFromUrl(link.url))}</span></span>
          ${link.status !== "confirmado" ? `<span class="pill status">${icon("clock-3")}<span>${escapeHtml(link.status)}</span></span>` : ""}
        </div>
      </div>
      <div class="card-actions">
        <button type="button" data-action="open" title="Abrir enlace">${icon("arrow-up-right")}Abrir</button>
        <button type="button" data-action="copy" title="Copiar enlace">${icon("copy")}Copiar</button>
        <button type="button" data-action="detail" title="Editar enlace">${icon("settings")}Editar</button>
        ${link.archived
          ? `<button type="button" data-action="restore" title="Restaurar enlace">${icon("check")}Restaurar</button>`
          : `
            <button type="button" data-action="move" title="Mover de carpeta">${icon("move-right")}Mover</button>
            <button type="button" data-action="delete" title="Eliminar enlace">${icon("trash")}Eliminar</button>
          `}
      </div>
    `;
    article.addEventListener("click", (event) => {
      if (!event.target.closest("button, input, label")) openDetailDialog(link.id);
    });
    article.querySelector('[data-action="select"]').addEventListener("change", (event) => {
      event.stopPropagation();
      if (event.target.checked) state.selectedLinkIds.add(link.id);
      else state.selectedLinkIds.delete(link.id);
      renderBulkActions();
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
    const deleteAction = article.querySelector('[data-action="delete"]');
    if (deleteAction) {
      deleteAction.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteLink(link.id).catch((error) => toast(error.message));
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
  state.detailDirty = false;
  clearTimeout(state.detailSaveTimer);
  els.detailTitleInput.value = link.title || "";
  els.detailDescriptionInput.value = link.description || "";
  els.detailCategorySelect.value = link.categoryId;
  els.detailUrlInput.value = link.url;
  const youtubeId = getYouTubeId(link.url);
  const socialEmbedUrl = socialVideoEmbedUrl(link.url);
  els.detailPreview.innerHTML = youtubeId
    ? `
      <div class="video-container">
        <iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="${escapeAttr(link.title || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `
    : socialEmbedUrl
      ? `
        <div class="video-container social-video-container">
          <iframe src="${escapeAttr(socialEmbedUrl)}" title="${escapeAttr(link.title || "Vista previa")}" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        </div>
      `
    : `
      <div class="thumb detail-thumb">
        ${link.thumbnail ? `<img src="${escapeAttr(link.thumbnail)}" alt="">` : `<div class="placeholder">${escapeHtml(platformInitial(link.platform))}</div>`}
        ${isVideoPreviewLink(link) ? `<span class="play-badge">${icon("play")}</span>` : ""}
        <span class="platform">${escapeHtml(link.platform || "Web")}</span>
      </div>
    `;
  els.detailDeleteButton.innerHTML = link.archived
    ? `${icon("check")} Restaurar`
    : `${icon("trash")} Eliminar`;
  els.detailDeleteButton.classList.toggle("danger-button", !link.archived);
  els.detailDeleteButton.classList.toggle("restore-button", Boolean(link.archived));
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

function scheduleDetailAutosave() {
  if (!state.detailLinkId) return;
  state.detailDirty = true;
  clearTimeout(state.detailSaveTimer);
  state.detailSaveTimer = setTimeout(() => {
    saveDetail({ silent: true }).catch((error) => toast(error.message));
  }, 650);
}

async function saveDetail(options = {}) {
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
  updateLocalLink(data.link);
  state.detailDirty = false;
  render();
  if (options.close) {
    els.detailDialog.close();
    state.detailLinkId = null;
  }
  if (!options.silent) toast("Cambios guardados");
}

async function deleteCurrentDetailLink() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (!link) return;
  if (link.archived) {
    await restoreLink(link.id, { closeDetail: true });
    return;
  }
  state.detailDirty = false;
  await deleteLink(link.id, { closeDetail: true });
}

async function deleteLink(linkId, options = {}) {
  const data = await api(`/api/links/${linkId}`, { method: "DELETE" });
  updateLocalLink(data.link);
  state.selectedLinkIds.delete(linkId);
  if (options.closeDetail) {
    state.detailDirty = false;
    clearTimeout(state.detailSaveTimer);
    state.detailLinkId = null;
    if (els.detailDialog.open) els.detailDialog.close();
  }
  render();
  toast("Enlace enviado a Papelera");
}

async function bulkDeleteSelected() {
  const ids = selectedLinks().filter((link) => !link.archived).map((link) => link.id);
  if (ids.length === 0) return;
  const confirmed = await confirmAction(`¿Está seguro que desea eliminar ${ids.length} enlace${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}?`);
  if (!confirmed) return;
  const data = await api("/api/links/bulk/delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
  for (const link of data.links) updateLocalLink(link);
  clearSelection();
  render();
  toast(`${data.links.length} enlace${data.links.length === 1 ? "" : "s"} enviado${data.links.length === 1 ? "" : "s"} a Papelera`);
}

async function bulkRestoreSelected() {
  const ids = selectedLinks().filter((link) => link.archived).map((link) => link.id);
  if (ids.length === 0) return;
  const data = await api("/api/links/bulk/restore", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
  for (const link of data.links) updateLocalLink(link);
  clearSelection();
  state.activeCategoryId = "all";
  render();
  toast(`${data.links.length} enlace${data.links.length === 1 ? "" : "s"} restaurado${data.links.length === 1 ? "" : "s"}`);
}

async function deleteCategory(categoryId) {
  const category = state.db.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const confirmed = await confirmAction("¿Está seguro que desea borrar esta carpeta?");
  if (!confirmed) return;
  const data = await api(`/api/categories/${categoryId}`, { method: "DELETE" });
  state.db.categories = state.db.categories.filter((item) => item.id !== categoryId);
  for (const link of data.links || []) updateLocalLink(link);
  if (state.activeCategoryId === categoryId) state.activeCategoryId = "all";
  clearSelection();
  render();
  toast(`Carpeta eliminada. ${data.links?.length || 0} enlaces a Papelera`);
}

async function restoreLink(linkId, options = {}) {
  const data = await api(`/api/links/${linkId}/restore`, { method: "POST" });
  updateLocalLink(data.link);
  state.selectedLinkIds.delete(linkId);
  state.activeCategoryId = "all";
  if (options.closeDetail) {
    state.detailDirty = false;
    clearTimeout(state.detailSaveTimer);
    state.detailLinkId = null;
    if (els.detailDialog.open) els.detailDialog.close();
  }
  render();
  toast("Enlace restaurado en Todos");
}

function openDetailLink() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (link) window.open(link.url, "_blank", "noopener");
}

function copyDetailUrl() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (link) copyLink(link.url);
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

function fillSettings() {
  const settings = state.db.settings || {};
  const storage = settings.storage || {};
  const sync = settings.sync || {};
  const trash = settings.trash || {};
  els.storagePathInput.value = storage.path || "";
  els.storageFormatInput.value = storage.format || "json";
  els.syncModeInput.value = ["none", "webdav", "ip"].includes(sync.mode) ? sync.mode : "none";
  els.remoteUrlInput.value = sync.remoteUrl || "";
  els.webdavUrlInput.value = sync.webdavUrl || "";
  els.autoSyncInput.checked = sync.autoOnOpen !== false;
  const retention = String(trash.retentionDays || 30);
  els.trashRetentionDaysInput.value = ["5", "10", "15", "30"].includes(retention) ? retention : "30";
  els.installedVersionInput.value = "Consultando...";
  checkVersion(false).catch(() => {
    els.installedVersionInput.value = "0.2.0";
  });
}

async function saveSettings() {
  const currentUpdates = state.db.settings?.updates || {};
  const settings = {
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
      folderPath: "",
      username: "",
      password: ""
    },
    trash: {
      retentionDays: Number(els.trashRetentionDaysInput.value || 30)
    },
    updates: {
      ...currentUpdates
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
  window.open(apiUrl("/api/export/json"), "_blank", "noopener");
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
  clearSelection();
  state.activeCategoryId = "all";
  render();
});

els.duplicatesButton.addEventListener("click", () => {
  clearSelection();
  state.activeCategoryId = "duplicates";
  render();
});

els.trashButton.addEventListener("click", () => {
  clearSelection();
  state.activeCategoryId = "trash";
  render();
});

els.searchInput.addEventListener("input", (event) => {
  clearSelection();
  state.search = event.target.value;
  renderGallery();
});

els.addLinkForm.addEventListener("submit", (event) => {
  addLink(event).catch((error) => toast(error.message));
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

els.detailTitleInput.addEventListener("input", () => {
  scheduleDetailAutosave();
});

els.detailDescriptionInput.addEventListener("input", () => {
  scheduleDetailAutosave();
});

els.detailCategorySelect.addEventListener("change", () => {
  scheduleDetailAutosave();
});

els.detailDeleteButton.addEventListener("click", () => {
  deleteCurrentDetailLink().catch((error) => toast(error.message));
});

els.detailDialog.addEventListener("close", () => {
  clearTimeout(state.detailSaveTimer);
  if (state.detailDirty && state.detailLinkId) {
    saveDetail({ silent: true }).catch((error) => toast(error.message));
  }
  els.detailPreview.innerHTML = "";
  state.detailLinkId = null;
  state.detailDirty = false;
});

els.newCategoryButton.addEventListener("click", () => {
  els.categoryDialog.showModal();
  els.categoryNameInput.focus();
});

els.confirmCategoryButton.addEventListener("click", () => {
  createCategory().catch((error) => toast(error.message));
});

els.confirmYesButton.addEventListener("click", () => {
  resolveConfirm(true);
});

els.confirmNoButton.addEventListener("click", () => {
  resolveConfirm(false);
});

els.confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  resolveConfirm(false);
});

els.settingsButton.addEventListener("click", () => {
  fillSettings();
  els.settingsDialog.showModal();
});

els.saveSettingsButton.addEventListener("click", () => {
  saveSettings().catch((error) => toast(error.message));
});

els.githubProfileButton.addEventListener("click", () => {
  window.open(GITHUB_PROFILE_URL, "_blank", "noopener");
});

els.checkVersionButton.addEventListener("click", () => {
  checkVersion(true).catch((error) => toast(error.message));
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

els.exportDesktopButton.addEventListener("click", () => {
  exportDesktop().catch((error) => toast(error.message));
});

els.folderSearchInput.addEventListener("input", (event) => {
  state.folderSearch = event.target.value;
  renderCategories();
});

els.toggleFoldersButton.addEventListener("click", () => {
  state.foldersExpanded = !state.foldersExpanded;
  renderCategories();
});

els.bulkDeleteButton.addEventListener("click", () => {
  bulkDeleteSelected().catch((error) => toast(error.message));
});

els.bulkRestoreButton.addEventListener("click", () => {
  bulkRestoreSelected().catch((error) => toast(error.message));
});

els.clearSelectionButton.addEventListener("click", () => {
  clearSelection();
  renderGallery();
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
