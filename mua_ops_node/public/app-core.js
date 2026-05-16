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
