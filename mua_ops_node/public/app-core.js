const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.code = body.code || "";
    error.details = body.details;
    throw error;
  }
  return response.json();
}

function clientLog(action, context = {}, level = "info") {
  if (["app_init_success", "line_submit_start", "line_submit_success"].includes(String(action || ""))) return;
  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, context, level })
  }).catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value, fallback = "") {
  const raw = value ?? fallback;
  return escapeHtml(raw === "" ? fallback : raw);
}

function documentViewerMarkup(document = {}, options = {}) {
  const storedName = String(document.stored_name || document.document_stored_name || "");
  if (!storedName) return "";
  const originalName = String(document.original_name || document.document_name || storedName);
  const mimeType = String(document.mime_type || "");
  const extension = originalName.includes(".") ? originalName.split(".").pop().toLowerCase() : "";
  const isPdf = mimeType === "application/pdf" || extension === "pdf";
  const isImage = mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension);
  const source = `/uploads/${encodeURIComponent(storedName)}`;
  const label = isPdf ? "PDF" : isImage ? "Imagen" : "Documento";
  const context = options.context ? ` ${text(options.context)}` : "";
  const preview = isPdf
    ? `<iframe data-document-preview data-document-source="${source}" src="${source}#view=FitH" title="Vista previa de ${text(originalName)}"></iframe>`
    : isImage
      ? `<img data-document-preview data-document-source="${source}" src="${source}" alt="Vista previa de ${text(originalName)}">`
      : `<div class="document-viewer-unsupported"><strong>Vista previa no disponible</strong><span>Abre el archivo original para consultarlo.</span></div>`;
  return `<details class="document-viewer"${options.open ? " open" : ""}>
    <summary>
      <span class="document-viewer-icon"><svg><use href="#icon-eye"></use></svg></span>
      <span><strong>Ver documento${context}</strong><small>${text(originalName)} · ${label}</small></span>
      <span class="document-viewer-toggle">Mostrar</span>
    </summary>
    <div class="document-viewer-body">
      <div class="document-viewer-toolbar">
        <span>Referencia visual para contrastar los datos extraídos.</span>
        <a class="ghost document-viewer-link" href="${source}" target="_blank" rel="noreferrer">Abrir original</a>
      </div>
      <div class="document-viewer-evidence hidden" data-document-viewer-evidence></div>
      <div class="document-viewer-frame">${preview}</div>
    </div>
  </details>`;
}

function lower(value) {
  return String(value ?? "").toLocaleLowerCase("es");
}

function number(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  setTimeout(() => node.classList.remove("visible"), 2400);
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setForm(form, data) {
  for (const element of Array.from(form.elements)) {
    if (!element.name) continue;
    if (element.type === "checkbox") {
      element.checked = Boolean(data[element.name]);
    } else {
      element.value = data[element.name] ?? "";
    }
  }
}
