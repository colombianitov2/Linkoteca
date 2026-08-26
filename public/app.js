function loadCollapsedGroupIds() {
  try {
    const value = JSON.parse(localStorage.getItem("linkotecaCollapsedGroups") || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function loadSidebarCollapsed() {
  return localStorage.getItem("linkotecaSidebarCollapsed") === "1";
}

const state = {
  db: null,
  activeCategoryId: "all",
  allDateFilter: "today",
  search: "",
  folderSearch: "",
  collapsedGroupIds: loadCollapsedGroupIds(),
  processingSharedLinks: false,
  lastSharedUrlKey: "",
  lastSharedAt: 0,
  movingLinkId: null,
  detailLinkId: null,
  editingCategoryId: null,
  editingGroupId: null,
  sidebarCollapsed: loadSidebarCollapsed(),
  selectionMode: false,
  selectedLinkIds: new Set(),
  sessionToken: "",
  appVersion: ""
};

const PENDING_SHARES_KEY = "linkotecaPendingShares";

const els = {
  appShell: document.querySelector(".app-shell"),
  sidebarToggleButton: document.querySelector("#sidebarToggleButton"),
  allLinksButton: document.querySelector("#allLinksButton"),
  allCount: document.querySelector("#allCount"),
  duplicatesButton: document.querySelector("#duplicatesButton"),
  duplicatesCount: document.querySelector("#duplicatesCount"),
  trashButton: document.querySelector("#trashButton"),
  trashCount: document.querySelector("#trashCount"),
  groupList: document.querySelector("#groupList"),
  categoryList: document.querySelector("#categoryList"),
  activeTitle: document.querySelector("#activeTitle"),
  libraryStats: document.querySelector("#libraryStats"),
  searchWrap: document.querySelector("#searchWrap"),
  searchInput: document.querySelector("#searchInput"),
  selectLinksButton: document.querySelector("#selectLinksButton"),
  bulkDeleteButton: document.querySelector("#bulkDeleteButton"),
  bulkDeleteCount: document.querySelector("#bulkDeleteCount"),
  emptyTrashButton: document.querySelector("#emptyTrashButton"),
  allDateFilterWrap: document.querySelector("#allDateFilterWrap"),
  allDateFilter: document.querySelector("#allDateFilter"),
  gallery: document.querySelector("#gallery"),
  emptyState: document.querySelector("#emptyState"),
  addBand: document.querySelector("#addBand"),
  addLinkForm: document.querySelector("#addLinkForm"),
  linkUrlInput: document.querySelector("#linkUrlInput"),
  linkTitleInput: document.querySelector("#linkTitleInput"),
  linkCategoryInput: document.querySelector("#linkCategoryInput"),
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
  detailDeleteButton: document.querySelector("#detailDeleteButton"),
  newCategoryButton: document.querySelector("#newCategoryButton"),
  categoryDialog: document.querySelector("#categoryDialog"),
  categoryDialogTitle: document.querySelector("#categoryDialogTitle"),
  categoryNameInput: document.querySelector("#categoryNameInput"),
  categoryGroupInput: document.querySelector("#categoryGroupInput"),
  confirmCategoryButton: document.querySelector("#confirmCategoryButton"),
  confirmCategoryLabel: document.querySelector("#confirmCategoryLabel"),
  newGroupButton: document.querySelector("#newGroupButton"),
  groupDialog: document.querySelector("#groupDialog"),
  groupDialogTitle: document.querySelector("#groupDialogTitle"),
  groupNameInput: document.querySelector("#groupNameInput"),
  confirmGroupButton: document.querySelector("#confirmGroupButton"),
  confirmGroupLabel: document.querySelector("#confirmGroupLabel"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  folderSearchWrap: document.querySelector("#folderSearchWrap"),
  folderSearchInput: document.querySelector("#folderSearchInput"),
  localVersion: document.querySelector("#localVersion"),
  dataFormatInput: document.querySelector("#dataFormatInput"),
  exportDataButton: document.querySelector("#exportDataButton"),
  importDataButton: document.querySelector("#importDataButton"),
  importFileInput: document.querySelector("#importFileInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
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

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (["POST", "PATCH", "DELETE"].includes(method)) {
    if (!state.sessionToken) throw new Error("La sesión local todavía no está lista");
    headers["x-linkoteca-session"] = state.sessionToken;
  }
  const response = await fetch(path, {
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "Error inesperado");
  return data;
}

async function initializeLocalSession() {
  const response = await fetch("/api/session", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error("No se pudo iniciar la sesión local");
  state.sessionToken = data.token;
}

function categoryName(categoryId) {
  return state.db.categories.find((category) => category.id === categoryId)?.name || "Sin carpeta";
}

function sortedCategories() {
  const showArchived = state.activeCategoryId === "trash";
  return state.db.categories
    .filter((category) => Boolean(category.archived) === showArchived)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function sortedGroups() {
  const showArchived = state.activeCategoryId === "trash";
  return (state.db.groups || [])
    .filter((group) => Boolean(group.archived) === showArchived)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function linkMatchesAllPeriod(link) {
  if (state.allDateFilter === "blank") return false;
  const createdAt = new Date(link.createdAt || 0);
  if (Number.isNaN(createdAt.getTime())) return false;
  const today = startOfDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  let from = today;
  let to = tomorrow;

  if (state.allDateFilter === "yesterday") {
    to = today;
    from = new Date(today);
    from.setDate(from.getDate() - 1);
  } else if (state.allDateFilter === "week") {
    from = new Date(today);
    const weekday = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - weekday);
  } else if (state.allDateFilter === "month") {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (state.allDateFilter === "year") {
    from = new Date(today.getFullYear(), 0, 1);
  } else if (state.allDateFilter.startsWith("year:")) {
    const year = Number(state.allDateFilter.split(":")[1]);
    from = new Date(year, 0, 1);
    to = new Date(year + 1, 0, 1);
  }
  return createdAt >= from && createdAt < to;
}

function renderAllDateFilter() {
  const currentYear = new Date().getFullYear();
  const dataYears = state.db.links
    .map((link) => new Date(link.createdAt || 0).getFullYear())
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= currentYear);
  const oldestYear = Math.min(2021, ...dataYears, currentYear);
  const yearOptions = [];
  for (let year = currentYear; year >= oldestYear; year -= 1) {
    yearOptions.push(`<option value="year:${year}">Año ${year}</option>`);
  }
  els.allDateFilter.innerHTML = `
    <option value="blank">Panel en blanco</option>
    <option value="today">Hoy</option>
    <option value="yesterday">Ayer</option>
    <option value="week">Esta semana</option>
    <option value="month">Este mes</option>
    <option value="year">Este año</option>
    ${yearOptions.join("")}
  `;
  els.allDateFilter.value = state.allDateFilter;
  els.allDateFilterWrap.hidden = state.activeCategoryId !== "all";
}

function countByCategory() {
  const counts = new Map();
  const showArchived = state.activeCategoryId === "trash";
  for (const link of state.db.links.filter((item) => Boolean(item.archived) === showArchived)) {
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

  await api("/api/links", {
    method: "POST",
    body: JSON.stringify({
      url: payload.url,
      title,
      description,
      thumbnail,
      categoryName: "Compartidos",
      tags: ["compartido"]
    })
  });

  state.db = await api("/api/library");
  const sharedCategory = state.db.categories.find((category) => category.name.toLowerCase() === "compartidos");
  if (sharedCategory) state.activeCategoryId = sharedCategory.id;
  render();
  toast("Enlace compartido guardado en Compartidos");
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
          toast(error.message);
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
  const hideViewControls = state.activeCategoryId === "trash" || state.activeCategoryId === "duplicates";
  const term = hideViewControls ? "" : state.search.trim().toLowerCase();
  const duplicateUrls = state.activeCategoryId === "duplicates" ? duplicateUrlSet() : null;
  return state.db.links.filter((link) => {
    const archived = Boolean(link.archived);
    const inCategory =
      (state.activeCategoryId === "trash" && archived) ||
      (!archived && (
        (state.activeCategoryId === "all" && !link.categoryId && linkMatchesAllPeriod(link)) ||
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

function clearLinkSelection(options = {}) {
  state.selectedLinkIds.clear();
  if (options.exitMode !== false) state.selectionMode = false;
}

function activateView(categoryId) {
  clearLinkSelection();
  state.activeCategoryId = categoryId;
  render();
}

function persistSidebarState() {
  localStorage.setItem("linkotecaSidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
}

function renderSidebarState() {
  els.appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggleButton.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  els.sidebarToggleButton.title = state.sidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral";
  els.sidebarToggleButton.setAttribute("aria-label", state.sidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral");
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  persistSidebarState();
  renderSidebarState();
}

function pruneLinkSelection(links) {
  const visibleIds = new Set(links.map((link) => link.id));
  for (const linkId of state.selectedLinkIds) {
    if (!visibleIds.has(linkId)) state.selectedLinkIds.delete(linkId);
  }
}

function renderSelectionControls() {
  const selectedCount = state.selectedLinkIds.size;
  const inTrash = state.activeCategoryId === "trash";
  const hideViewControls = inTrash || state.activeCategoryId === "duplicates";
  const archivedLinkCount = state.db.links.filter((link) => link.archived).length;
  els.selectLinksButton.setAttribute("aria-pressed", String(state.selectionMode));
  els.selectLinksButton.innerHTML = state.selectionMode
    ? `${icon("x")}Cancelar`
    : `${icon("check")}Seleccionar`;
  els.bulkDeleteCount.textContent = String(selectedCount);
  els.bulkDeleteButton.hidden = selectedCount === 0;
  els.emptyTrashButton.hidden = !inTrash;
  els.emptyTrashButton.disabled = archivedLinkCount === 0;
  els.searchWrap.hidden = hideViewControls;
  els.folderSearchWrap.hidden = hideViewControls;
  els.addBand.hidden = hideViewControls;
  els.settingsButton.hidden = hideViewControls;
  els.gallery.classList.toggle("selection-mode", state.selectionMode);
}

function toggleSelectionMode() {
  if (state.selectionMode) clearLinkSelection();
  else {
    state.selectionMode = true;
    state.selectedLinkIds.clear();
  }
  renderGallery();
}

function toggleLinkSelection(linkId) {
  if (!state.selectionMode) return;
  if (state.selectedLinkIds.has(linkId)) state.selectedLinkIds.delete(linkId);
  else state.selectedLinkIds.add(linkId);
  renderGallery();
}

function renderCategoryOptions() {
  const categories = state.db.categories.filter((category) => !category.archived).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const groupedOptions = (state.db.groups || []).filter((group) => !group.archived).sort((a, b) => a.name.localeCompare(b.name, "es")).map((group) => {
    const items = categories
      .filter((category) => category.groupId === group.id)
      .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
      .join("");
    return items ? `<optgroup label="${escapeAttr(group.name)}">${items}</optgroup>` : "";
  }).join("");
  const ungroupedOptions = categories
    .filter((category) => !category.groupId)
    .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
    .join("");
  const options = `
    <option value="">Sin carpeta (Todos)</option>
    ${groupedOptions}
    ${ungroupedOptions ? `<optgroup label="Sin grupo">${ungroupedOptions}</optgroup>` : ""}
  `;
  els.linkCategoryInput.innerHTML = options;
  els.moveCategorySelect.innerHTML = options;
  els.detailCategorySelect.innerHTML = options;
}

function createCategoryRow(category, counts) {
    const row = document.createElement("div");
    row.className = "category-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button${state.activeCategoryId === category.id ? " active" : ""}`;
    button.dataset.categoryId = category.id;
    button.title = category.name;
    const iconStyle = `--icon-bg: ${getFolderGradient(category.name)};`;
    button.innerHTML = `
      <span class="category-name">
        ${icon(state.activeCategoryId === category.id ? "folder-open" : "folder", iconStyle)}
        <span>${escapeHtml(category.name)}</span>
      </span>
      <span class="count">${counts.get(category.id) || 0}</span>
    `;
    button.addEventListener("click", () => {
      activateView(category.archived ? "trash" : category.id);
    });
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "category-action-button";
    editButton.title = category.archived ? "Restaurar carpeta" : "Editar carpeta";
    editButton.setAttribute("aria-label", `${category.archived ? "Restaurar" : "Editar"} carpeta ${category.name}`);
    editButton.innerHTML = icon(category.archived ? "refresh-cw" : "settings");
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (category.archived) restoreCategory(category.id).catch((error) => toast(error.message));
      else openCategoryDialog(category.id);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "category-action-button category-delete-button";
    deleteButton.title = category.archived ? "Eliminar carpeta definitivamente" : "Borrar carpeta";
    deleteButton.setAttribute("aria-label", `${category.archived ? "Eliminar definitivamente" : "Borrar"} carpeta ${category.name}`);
    deleteButton.innerHTML = icon("trash");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCategory(category.id, { permanent: Boolean(category.archived) }).catch((error) => toast(error.message));
    });
    row.append(button, editButton, deleteButton);
    return row;
}

function persistCollapsedGroups() {
  localStorage.setItem("linkotecaCollapsedGroups", JSON.stringify([...state.collapsedGroupIds]));
}

function renderCategories() {
  const counts = countByCategory();
  const activeLinks = state.db.links.filter((link) => !link.archived);
  const unassignedLinks = activeLinks.filter((link) => !link.categoryId);
  const duplicatesSet = duplicateUrlSet();
  const duplicatesCount = activeLinks.filter((link) => duplicatesSet.has(normalizedUrl(link.url))).length;
  const trashCount = state.db.links.filter((link) => link.archived).length
    + state.db.categories.filter((category) => category.archived).length
    + (state.db.groups || []).filter((group) => group.archived).length;
  els.allCount.textContent = unassignedLinks.length;
  els.duplicatesCount.textContent = duplicatesCount;
  els.trashCount.textContent = trashCount;
  els.groupList.innerHTML = "";
  els.categoryList.innerHTML = "";
  const folderFilter = state.activeCategoryId === "trash" ? "" : state.folderSearch.trim().toLowerCase();
  const categories = sortedCategories();

  const groups = sortedGroups();
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  for (const group of groups) {
    const groupCategories = categories.filter((category) => category.groupId === group.id);
    const visibleCategories = groupCategories.filter((category) => category.name.toLowerCase().includes(folderFilter));
    if (folderFilter && visibleCategories.length === 0 && !group.name.toLowerCase().includes(folderFilter)) continue;
    const section = document.createElement("section");
    section.className = "folder-group";
    const header = document.createElement("div");
    header.className = "folder-group-header";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "folder-group-toggle";
    const collapsed = state.collapsedGroupIds.has(group.id) && !folderFilter;
    const linkCount = groupCategories.reduce((total, category) => total + (counts.get(category.id) || 0), 0);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.innerHTML = `<span class="group-chevron" aria-hidden="true">${collapsed ? "▸" : "▾"}</span><span class="group-name">${escapeHtml(group.name)}</span><span class="count">${linkCount}</span>`;
    toggle.addEventListener("click", () => {
      if (state.collapsedGroupIds.has(group.id)) state.collapsedGroupIds.delete(group.id);
      else state.collapsedGroupIds.add(group.id);
      persistCollapsedGroups();
      renderCategories();
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "group-action-button";
    edit.title = group.archived ? "Restaurar grupo" : "Editar grupo";
    edit.setAttribute("aria-label", `${group.archived ? "Restaurar" : "Editar"} grupo ${group.name}`);
    edit.innerHTML = icon(group.archived ? "refresh-cw" : "settings");
    edit.addEventListener("click", () => {
      if (group.archived) restoreGroup(group.id).catch((error) => toast(error.message));
      else openGroupDialog(group.id);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "group-action-button group-delete-button";
    remove.title = group.archived ? "Eliminar grupo definitivamente" : "Borrar grupo";
    remove.setAttribute("aria-label", `${group.archived ? "Eliminar definitivamente" : "Borrar"} grupo ${group.name}`);
    remove.innerHTML = icon("trash");
    remove.addEventListener("click", () => deleteGroup(group.id, { permanent: Boolean(group.archived) }).catch((error) => toast(error.message)));
    header.append(toggle, edit, remove);
    const body = document.createElement("div");
    body.className = "folder-group-body";
    body.hidden = collapsed;
    const categoriesToRender = folderFilter ? visibleCategories : groupCategories;
    if (categoriesToRender.length === 0) {
      body.innerHTML = '<p class="group-empty">Sin carpetas</p>';
    } else {
      for (const category of categoriesToRender) body.append(createCategoryRow(category, counts));
    }
    section.append(header, body);
    els.groupList.append(section);
  }

  const ungrouped = categories.filter((category) => !visibleGroupIds.has(category.groupId) && category.name.toLowerCase().includes(folderFilter));
  for (const category of ungrouped) {
    els.categoryList.append(createCategoryRow(category, counts));
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
  if (state.activeCategoryId === "trash") {
    const archivedFolders = state.db.categories.filter((category) => category.archived).length;
    const archivedGroups = (state.db.groups || []).filter((group) => group.archived).length;
    els.libraryStats.textContent = `${links.length} enlaces · ${archivedFolders} carpetas · ${archivedGroups} grupos en Papelera`;
    return;
  }
  const total = state.db.links.filter((link) => !link.archived).length;
  const folders = state.db.categories.length;
  els.libraryStats.textContent = `${links.length} visibles · ${total} enlaces · ${folders} carpetas`;
}

function renderGallery() {
  const links = filteredLinks();
  pruneLinkSelection(links);
  renderSelectionControls();
  renderHeader(links);
  els.gallery.innerHTML = "";
  els.emptyState.hidden = links.length > 0;
  if (state.activeCategoryId === "all") {
    els.emptyState.textContent = state.allDateFilter === "blank"
      ? "Panel en blanco. Elige un periodo para ver enlaces sin carpeta."
      : "No hay enlaces sin carpeta en este periodo.";
  } else if (state.activeCategoryId === "trash") {
    els.emptyState.textContent = "No hay enlaces en la Papelera.";
  } else {
    els.emptyState.textContent = "No hay enlaces en esta vista.";
  }

  for (const link of links) {
    const article = document.createElement("article");
    const selected = state.selectedLinkIds.has(link.id);
    article.className = `link-card${selected ? " selected" : ""}`;
    article.setAttribute("aria-selected", String(selected));
    article.innerHTML = `
      <div class="thumb">
        ${state.selectionMode
          ? `<button type="button" class="link-selection-checkbox" data-action="select" aria-label="${selected ? "Deseleccionar" : "Seleccionar"} ${escapeAttr(link.title || "enlace")}" aria-pressed="${selected}">${selected ? icon("check") : ""}</button>`
          : ""}
        ${link.thumbnail ? `<img src="${escapeAttr(link.thumbnail)}" alt="">` : `<div class="placeholder">${escapeHtml(platformInitial(link.platform))}</div>`}
        <span class="platform">${escapeHtml(link.platform || "Web")}</span>
      </div>
      <div class="card-body">
        <h2>${escapeHtml(link.title || "Enlace sin titulo")}</h2>
        <p class="description">${escapeHtml(link.description || hostFromUrl(link.url))}</p>
        <div class="card-meta">
          <span class="pill">${icon("folder", `--icon-bg: ${getFolderGradient(categoryName(link.categoryId))};`)}<span>${escapeHtml(categoryName(link.categoryId))}</span></span>
          <span class="pill">${icon("globe")}<span>${escapeHtml(hostFromUrl(link.url))}</span></span>
        </div>
      </div>
      <div class="card-actions">
        <button type="button" data-action="open" title="Abrir enlace">${icon("arrow-up-right")}Abrir</button>
        <button type="button" data-action="copy" title="Copiar enlace">${icon("copy")}Copiar</button>
        <button type="button" data-action="detail" title="Editar enlace">${icon("settings")}Editar</button>
        ${link.archived
          ? `<button type="button" data-action="restore" title="Restaurar enlace">${icon("check")}Restaurar</button>
             <button type="button" data-action="delete" title="Eliminar definitivamente">${icon("trash")}Eliminar</button>`
          : `<button type="button" data-action="move" title="Mover de carpeta">${icon("move-right")}Mover</button>
             <button type="button" data-action="delete" title="Borrar enlace">${icon("trash")}Borrar</button>`}
      </div>
    `;
    article.addEventListener("click", (event) => {
      if (state.selectionMode) {
        if (!event.target.closest('[data-action="select"]')) toggleLinkSelection(link.id);
        return;
      }
      if (!event.target.closest("button")) openDetailDialog(link.id);
    });
    const selectAction = article.querySelector('[data-action="select"]');
    if (selectAction) {
      selectAction.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleLinkSelection(link.id);
      });
    }
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
    article.querySelector('[data-action="delete"]').addEventListener("click", (event) => {
      event.stopPropagation();
      deleteLink(link.id, { permanent: Boolean(link.archived) }).catch((error) => toast(error.message));
    });
    els.gallery.append(article);
  }
}

function render() {
  renderSidebarState();
  renderCategoryOptions();
  renderCategories();
  renderAllDateFilter();
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
  if (link) els.moveCategorySelect.value = link.categoryId || "";
  els.moveDialog.showModal();
}

function openDetailDialog(linkId) {
  const link = state.db.links.find((item) => item.id === linkId);
  if (!link) return;
  state.detailLinkId = linkId;
  els.detailTitleInput.value = link.title || "";
  els.detailDescriptionInput.value = link.description || "";
  els.detailCategorySelect.value = link.categoryId || "";
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
  els.detailDeleteButton.innerHTML = link.archived
    ? `${icon("trash")} Eliminar`
    : `${icon("trash")} Borrar`;
  els.detailDeleteButton.classList.toggle("danger-button", true);
  els.detailDeleteButton.classList.toggle("restore-button", false);
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

async function deleteCurrentDetailLink() {
  const link = state.db.links.find((item) => item.id === state.detailLinkId);
  if (!link) return;
  await deleteLink(link.id, { permanent: Boolean(link.archived), closeDetail: true });
}

async function deleteLink(linkId, options = {}) {
  const link = state.db.links.find((item) => item.id === linkId);
  if (!link) return;
  const permanent = Boolean(options.permanent);
  const data = await api(`/api/links/${link.id}${permanent ? "?permanent=1" : ""}`, {
    method: "DELETE"
  });
  if (data.deleted) {
    state.db.links = state.db.links.filter((item) => item.id !== link.id);
  } else if (data.link) {
    const index = state.db.links.findIndex((item) => item.id === data.link.id);
    if (index >= 0) state.db.links[index] = data.link;
  }
  if (options.closeDetail) state.detailLinkId = null;
  if (els.detailDialog.open) els.detailDialog.close();
  render();
  toast(permanent ? "Enlace eliminado" : "Enlace enviado a Papelera");
}

async function deleteSelectedLinks() {
  const ids = [...state.selectedLinkIds];
  if (ids.length === 0) return;
  const deletingFromTrash = state.activeCategoryId === "trash";
  els.bulkDeleteButton.disabled = true;
  try {
    const data = await api("/api/links", {
      method: "DELETE",
      body: JSON.stringify({ ids })
    });
    const deletedIds = new Set(data.deletedIds || []);
    const archivedLinks = new Map((data.archivedLinks || []).map((link) => [link.id, link]));
    state.db.links = state.db.links
      .filter((link) => !deletedIds.has(link.id))
      .map((link) => archivedLinks.get(link.id) || link);
    clearLinkSelection();
    render();
    toast(deletingFromTrash
      ? `${ids.length} enlace(s) eliminado(s)`
      : `${ids.length} enlace(s) enviado(s) a Papelera`);
  } finally {
    els.bulkDeleteButton.disabled = false;
  }
}

async function emptyTrash() {
  const archivedLinkCount = state.db.links.filter((link) => link.archived).length;
  if (archivedLinkCount === 0) return;
  els.emptyTrashButton.disabled = true;
  try {
    const data = await api("/api/trash/links", { method: "DELETE" });
    const deletedIds = new Set(data.deletedIds || []);
    state.db.links = state.db.links.filter((link) => !deletedIds.has(link.id));
    clearLinkSelection();
    render();
    toast(`${data.deleted || 0} enlace(s) eliminado(s) de Papelera`);
  } finally {
    els.emptyTrashButton.disabled = state.db.links.every((link) => !link.archived);
  }
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

function renderCategoryGroupOptions() {
  els.categoryGroupInput.innerHTML = `
    <option value="">Sin grupo</option>
    ${sortedGroups().map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join("")}
  `;
}

function openCategoryDialog(categoryId = null) {
  const category = categoryId ? state.db.categories.find((item) => item.id === categoryId) : null;
  state.editingCategoryId = category?.id || null;
  renderCategoryGroupOptions();
  els.categoryDialogTitle.textContent = category ? "Editar carpeta" : "Nueva carpeta";
  els.confirmCategoryLabel.textContent = category ? "Guardar" : "Crear";
  els.categoryNameInput.value = category?.name || "";
  els.categoryGroupInput.value = category?.groupId || "";
  if (!els.categoryDialog.open) els.categoryDialog.showModal();
  els.categoryNameInput.focus();
}

async function saveCategory() {
  const name = els.categoryNameInput.value.trim();
  if (!name) return;
  const categoryId = state.editingCategoryId;
  const data = await api(categoryId ? `/api/categories/${categoryId}` : "/api/categories", {
    method: categoryId ? "PATCH" : "POST",
    body: JSON.stringify({ name, groupId: els.categoryGroupInput.value || null })
  });
  const existing = state.db.categories.findIndex((category) => category.id === data.category.id);
  if (existing >= 0) state.db.categories[existing] = data.category;
  else state.db.categories.push(data.category);
  els.categoryNameInput.value = "";
  els.categoryDialog.close();
  state.editingCategoryId = null;
  render();
  toast(categoryId ? "Carpeta actualizada" : "Carpeta creada");
}

function openGroupDialog(groupId = null) {
  const group = groupId ? state.db.groups.find((item) => item.id === groupId) : null;
  state.editingGroupId = group?.id || null;
  els.groupDialogTitle.textContent = group ? "Editar grupo" : "Nuevo grupo";
  els.confirmGroupLabel.textContent = group ? "Guardar" : "Crear";
  els.groupNameInput.value = group?.name || "";
  if (!els.groupDialog.open) els.groupDialog.showModal();
  els.groupNameInput.focus();
}

async function saveGroup() {
  const name = els.groupNameInput.value.trim();
  if (!name) return;
  const groupId = state.editingGroupId;
  const data = await api(groupId ? `/api/groups/${groupId}` : "/api/groups", {
    method: groupId ? "PATCH" : "POST",
    body: JSON.stringify({ name })
  });
  const existing = state.db.groups.findIndex((group) => group.id === data.group.id);
  if (existing >= 0) state.db.groups[existing] = data.group;
  else state.db.groups.push(data.group);
  els.groupNameInput.value = "";
  els.groupDialog.close();
  state.editingGroupId = null;
  render();
  toast(groupId ? "Grupo actualizado" : "Grupo creado");
}

async function deleteGroup(groupId, options = {}) {
  const group = state.db.groups.find((item) => item.id === groupId);
  if (!group) return;
  const permanent = Boolean(options.permanent);
  const categories = state.db.categories.filter((category) => category.groupId === groupId);
  const categoryIds = new Set(categories.map((category) => category.id));
  const linkCount = state.db.links.filter((link) => categoryIds.has(link.categoryId)).length;
  const message = permanent
    ? `¿Eliminar definitivamente el grupo "${group.name}", sus ${categories.length} carpeta(s) y ${linkCount} enlace(s)? Esta acción no se puede deshacer.`
    : `¿Enviar a la Papelera el grupo "${group.name}", sus ${categories.length} carpeta(s) y ${linkCount} enlace(s)?`;
  if (!window.confirm(message)) return;
  await api(`/api/groups/${groupId}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" });
  state.collapsedGroupIds.delete(groupId);
  persistCollapsedGroups();
  await load();
  toast(permanent ? "Grupo eliminado definitivamente" : "Grupo completo enviado a la Papelera");
}

async function restoreGroup(groupId) {
  await api(`/api/groups/${groupId}/restore`, { method: "POST" });
  await load();
  toast("Grupo, carpetas y enlaces restaurados");
}

async function deleteCategory(categoryId, options = {}) {
  const category = state.db.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const activeCount = state.db.links.filter((link) => link.categoryId === categoryId && !link.archived).length;
  const permanent = Boolean(options.permanent);
  const totalCount = state.db.links.filter((link) => link.categoryId === categoryId).length;
  const message = permanent
    ? `¿Eliminar definitivamente la carpeta "${category.name}" y sus ${totalCount} enlace(s)? Esta acción no se puede deshacer.`
    : activeCount > 0
    ? `¿Enviar la carpeta "${category.name}" y sus ${activeCount} enlace(s) a la Papelera?`
    : `¿Enviar la carpeta "${category.name}" a la Papelera?`;
  if (!window.confirm(message)) return;
  await api(`/api/categories/${categoryId}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" });
  if (state.activeCategoryId === categoryId) state.activeCategoryId = "all";
  await load();
  toast(permanent ? "Carpeta eliminada definitivamente" : "Carpeta enviada a la Papelera");
}

async function restoreCategory(categoryId) {
  await api(`/api/categories/${categoryId}/restore`, { method: "POST" });
  await load();
  toast("Carpeta y enlaces restaurados");
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
  els.dataFormatInput.value = state.db.settings?.storage?.format || "json";
  els.localVersion.textContent = state.appVersion || "1.0.3";
}

function openSettingsDialog() {
  if (!els.settingsDialog.open) els.settingsDialog.showModal();
  try {
    fillSettings();
  } catch (error) {
    toast(`No se pudo cargar una opción: ${error.message}`);
  }
}

async function saveSettings() {
  const settings = { storage: { format: els.dataFormatInput.value } };
  const data = await api("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(settings)
  });
  state.db.settings = data.settings;
  toast("Configuración guardada");
}

function downloadData() {
  const format = els.dataFormatInput.value || "json";
  window.open(`/api/export/${format}`, "_blank", "noopener");
}

async function importData(file) {
  const format = els.dataFormatInput.value || "json";
  const result = await api("/api/import", {
    method: "POST",
    body: JSON.stringify({
      format,
      content: await file.text()
    })
  });
  await load();
  toast(`Importación lista: ${result.imported} enlace(s)`);
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
  try {
    const [database, version] = await Promise.all([api("/api/library"), api("/api/version")]);
    state.db = database;
    state.appVersion = version.version;
    render();
    await processQueuedSharedLinks();
  } catch (error) {
    els.libraryStats.textContent = "No se pudo iniciar Linkoteca local";
    throw error;
  }
}

els.allLinksButton.addEventListener("click", () => {
  activateView("all");
});

els.duplicatesButton.addEventListener("click", () => {
  activateView("duplicates");
});

els.trashButton.addEventListener("click", () => {
  activateView("trash");
});

els.sidebarToggleButton.addEventListener("click", () => {
  toggleSidebar();
});

els.selectLinksButton.addEventListener("click", () => {
  toggleSelectionMode();
});

els.bulkDeleteButton.addEventListener("click", () => {
  deleteSelectedLinks().catch((error) => toast(error.message));
});

els.emptyTrashButton.addEventListener("click", () => {
  emptyTrash().catch((error) => toast(error.message));
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderGallery();
});

els.allDateFilter.addEventListener("change", (event) => {
  state.allDateFilter = event.target.value;
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

els.detailSaveButton.addEventListener("click", () => {
  saveDetail().catch((error) => toast(error.message));
});

els.detailDeleteButton.addEventListener("click", () => {
  deleteCurrentDetailLink().catch((error) => toast(error.message));
});

els.detailDialog.addEventListener("close", () => {
  els.detailPreview.innerHTML = "";
  state.detailLinkId = null;
});

els.newCategoryButton.addEventListener("click", () => {
  openCategoryDialog();
});

els.confirmCategoryButton.addEventListener("click", () => {
  saveCategory().catch((error) => toast(error.message));
});

els.categoryDialog.addEventListener("close", () => {
  state.editingCategoryId = null;
});

els.newGroupButton.addEventListener("click", () => {
  openGroupDialog();
});

els.confirmGroupButton.addEventListener("click", () => {
  saveGroup().catch((error) => toast(error.message));
});

els.groupDialog.addEventListener("close", () => {
  state.editingGroupId = null;
});

els.settingsButton.addEventListener("click", () => {
  openSettingsDialog();
});

els.saveSettingsButton.addEventListener("click", () => {
  saveSettings().catch((error) => toast(error.message));
});

els.exportDataButton.addEventListener("click", () => {
  downloadData();
});

els.importDataButton.addEventListener("click", () => {
  const extensions = { json: ".json", csv: ".csv", txt: ".txt", xls: ".xls" };
  els.importFileInput.accept = extensions[els.dataFormatInput.value] || ".json";
  els.importFileInput.click();
});

els.importFileInput.addEventListener("change", () => {
  const [file] = els.importFileInput.files;
  if (file) importData(file).catch((error) => toast(error.message));
  els.importFileInput.value = "";
});

els.folderSearchInput.addEventListener("input", (event) => {
  state.folderSearch = event.target.value;
  renderCategories();
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

initializeLocalSession().then(load).catch((error) => {
  els.libraryStats.textContent = error.message;
});
