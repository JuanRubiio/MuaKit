const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const initSqlJs = require("sql.js");
const { applyMigrations, hasPendingMigrations } = require("./lib/migrations");
const { apiError, badRequest, notFound } = require("./lib/http");
const { createDbBackup, redactSensitive, systemHealth } = require("./lib/system");
const { registerSystemRoutes } = require("./lib/routes/system");
const { registerIncomeRoutes } = require("./lib/routes/income");
const packageInfo = require("../package.json");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.MUA_OPS_DATA_DIR || path.join(ROOT, "data", "mua_ops");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = process.env.MUA_OPS_DB_FILE || path.join(DATA_DIR, "mua_ops.sqlite");
const LEGACY_JSON = process.env.MUA_OPS_LEGACY_JSON || path.join(DATA_DIR, "mua_ops.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const WORKSPACE_PRODUCTS_CSV = path.join(ROOT, "shopify", "inventario", "products_export_1.csv");
const DOWNLOAD_PRODUCTS_CSV = "C:\\Users\\Portatil\\Downloads\\products_export_1.csv";
const PRODUCTS_CSV = process.env.MUA_OPS_PRODUCTS_CSV || (fs.existsSync(WORKSPACE_PRODUCTS_CSV) ? WORKSPACE_PRODUCTS_CSV : DOWNLOAD_PRODUCTS_CSV);
const INVENTORY_CSV = process.env.MUA_OPS_INVENTORY_CSV || path.join(ROOT, "shopify", "inventario", "inventory_export_1.csv");
const SHOPIFY_PAYOUTS_CSV = process.env.MUA_OPS_SHOPIFY_PAYOUTS_CSV || path.join(ROOT, "shopify", "pagos", "payouts_export_1.csv");
const ETSY_PAYOUTS_DIR = process.env.MUA_OPS_ETSY_PAYOUTS_DIR || path.join(ROOT, "etsy", "pagos");
const DEFAULT_SHOPIFY_API_VERSION = "2026-01";
const ACTOR = "local_user";
const DEFAULT_SETTINGS = {
  company_name: "Mua Ops",
  currency: "EUR",
  dashboard_monthly_view: "total",
  dashboard_income_monthly_view: "cobros",
  low_stock_default: "5",
  default_invoice_status: "draft",
  default_invoice_category: "materiales",
  default_payout_channel: "shopify",
  default_payout_status: "paid",
  dashboard_color_total: "#166b5e",
  dashboard_color_materiales: "#9f7234",
  dashboard_color_marketing: "#b85d72",
  dashboard_color_envios: "#4f6d93",
  dashboard_color_cobros: "#166b5e",
  dashboard_color_fees: "#b85d72",
  dashboard_color_shopify: "#166b5e",
  dashboard_color_etsy: "#9f7234",
  dashboard_color_bizum: "#c18a3a",
  reorder_alert_multiplier: "1.25"
};

let shopifySyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastResult: null
};
const shopifyAccessTokenCache = new Map();

let SQL;
let db;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function openDb() {
  ensureDirs();
  SQL = await initSqlJs({
    locateFile: (file) => path.join(ROOT, "node_modules", "sql.js", "dist", file)
  });
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
    if (hasPendingMigrations({ query, migrations: SCHEMA_MIGRATIONS })) {
      createDbBackup({ dbFile: DB_FILE, dataDir: DATA_DIR, reason: "pre-migration" });
    }
  } else {
    db = new SQL.Database();
  }
  migrate();
  backfillMaterialHierarchy();
  seedSuppliers();
  seedSalesChannels();
  seedSettings();
  seedShopifyConnection();
  if (fs.existsSync(LEGACY_JSON) && tableCount("invoices") === 0 && tableCount("materials") === 0) {
    migrateLegacyJson();
  }
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function normalizeUsageType(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "material_kit") return "material kit";
  return raw;
}

function backfillMaterialHierarchy() {
  for (const material of query("SELECT * FROM materials")) {
    const inferred = inferMaterialHierarchy(material.name, material.category);
    const patch = {};
    for (const key of ["usage_type", "family", "subfamily", "variant", "base_material", "finish"]) {
      if (!String(material[key] || "").trim() && String(inferred[key] || "").trim()) patch[key] = inferred[key];
    }
    if (normalizeUsageType(material.usage_type) !== String(material.usage_type || "")) {
      patch.usage_type = normalizeUsageType(material.usage_type);
    }
    if (!Number(material.is_outlet || 0) && /\boutlet\b/i.test(String(material.name || ""))) patch.is_outlet = 1;
    if (!Object.keys(patch).length) continue;
    exec(
      `UPDATE materials
       SET ${Object.keys(patch).map((key) => `${key}=$${key}`).join(", ")}, updated_at=CURRENT_TIMESTAMP
       WHERE id=$id`,
      { id: material.id, ...patch }
    );
  }
}

function materialPayload(row) {
  return {
    ...row,
    image_url_override: row.image_url_override || "",
    shopify_inventory_qty: optionalN(row.shopify_inventory_qty),
    shopify_available_qty: optionalN(row.shopify_available_qty),
    effective_stock_qty: optionalN(row.effective_stock_qty),
    is_outlet: Boolean(Number(row.is_outlet || 0)),
    usage_type: normalizeUsageType(row.usage_type),
    family: row.family || "",
    subfamily: row.subfamily || "",
    variant: row.variant || "",
    base_material: row.base_material || "",
    finish: row.finish || "",
    notes: row.notes || ""
  };
}

function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    exec(
      `INSERT OR IGNORE INTO app_settings (key, value) VALUES ($key, $value)`,
      { key, value: String(value) }
    );
  }
}

function seedShopifyConnection() {
  exec(
    `INSERT OR IGNORE INTO shopify_connection (
      id, store_domain, admin_token, client_id, client_secret, api_version, sync_enabled, sync_interval_minutes,
      pull_products, pull_inventory, pull_orders, pull_payouts
    ) VALUES (1, '', '', '', '', $apiVersion, 0, 60, 1, 1, 1, 1)`,
    { apiVersion: DEFAULT_SHOPIFY_API_VERSION }
  );
}

function settingsObject() {
  const rows = query(`SELECT key, value FROM app_settings ORDER BY key`);
  const values = { ...DEFAULT_SETTINGS };
  for (const row of rows) values[row.key] = row.value;
  return values;
}

function updateSettings(payload = {}) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const before = settingsObject();
  const next = { ...before };
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    next[key] = String(payload[key] ?? DEFAULT_SETTINGS[key] ?? "");
    exec(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($key, $value, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=$value, updated_at=CURRENT_TIMESTAMP`,
      { key, value: next[key] }
    );
  }
  audit("app_settings", 1, "update", before, next);
  saveDb();
  return next;
}

function shopifyConnectionRow() {
  const row = one("SELECT * FROM shopify_connection WHERE id=1");
  if (row) return row;
  seedShopifyConnection();
  return one("SELECT * FROM shopify_connection WHERE id=1");
}

function maskToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  const tail = raw.slice(-4);
  return `••••${tail}`;
}

function shopifyConnectionPayload(row = shopifyConnectionRow()) {
  const summaryText = String(row?.last_sync_summary || "").trim();
  let parsedSummary = null;
  if (summaryText) {
    try {
      parsedSummary = JSON.parse(summaryText);
    } catch {
      parsedSummary = summaryText;
    }
  }
  return {
    store_domain: row?.store_domain || "",
    api_version: row?.api_version || DEFAULT_SHOPIFY_API_VERSION,
    sync_enabled: Boolean(Number(row?.sync_enabled || 0)),
    sync_interval_minutes: Number(row?.sync_interval_minutes || 60),
    pull_products: Boolean(Number(row?.pull_products || 0)),
    pull_inventory: Boolean(Number(row?.pull_inventory || 0)),
    pull_orders: Boolean(Number(row?.pull_orders || 0)),
    pull_payouts: Boolean(Number(row?.pull_payouts || 0)),
    last_sync_at: row?.last_sync_at || "",
    last_sync_status: row?.last_sync_status || "",
    last_sync_summary: parsedSummary,
    last_products_sync_at: row?.last_products_sync_at || "",
    last_inventory_sync_at: row?.last_inventory_sync_at || "",
    last_orders_sync_at: row?.last_orders_sync_at || "",
    last_payouts_sync_at: row?.last_payouts_sync_at || "",
    auth_mode: String(row?.client_id || "").trim() ? "client_credentials" : (String(row?.admin_token || "").trim() ? "admin_token" : "none"),
    token_configured: Boolean(String(row?.admin_token || "").trim()),
    credentials_configured: Boolean(String(row?.client_id || "").trim() && String(row?.client_secret || "").trim()),
    admin_token_masked: maskToken(row?.admin_token),
    client_id_masked: maskToken(row?.client_id),
    client_secret_masked: maskToken(row?.client_secret)
  };
}

function shopifyConnectionForUse(row = shopifyConnectionRow()) {
  return {
    store_domain: String(row?.store_domain || "").trim(),
    admin_token: String(row?.admin_token || "").trim(),
    client_id: String(row?.client_id || "").trim(),
    client_secret: String(row?.client_secret || "").trim(),
    api_version: String(row?.api_version || DEFAULT_SHOPIFY_API_VERSION).trim() || DEFAULT_SHOPIFY_API_VERSION,
    sync_enabled: Boolean(Number(row?.sync_enabled || 0)),
    sync_interval_minutes: Math.max(5, Number(row?.sync_interval_minutes || 60)),
    pull_products: Boolean(Number(row?.pull_products || 0)),
    pull_inventory: Boolean(Number(row?.pull_inventory || 0)),
    pull_orders: Boolean(Number(row?.pull_orders || 0)),
    pull_payouts: Boolean(Number(row?.pull_payouts || 0)),
    last_sync_at: row?.last_sync_at || "",
    last_sync_status: row?.last_sync_status || "",
    last_sync_summary: row?.last_sync_summary || "",
    last_products_sync_at: row?.last_products_sync_at || "",
    last_inventory_sync_at: row?.last_inventory_sync_at || "",
    last_orders_sync_at: row?.last_orders_sync_at || "",
    last_payouts_sync_at: row?.last_payouts_sync_at || ""
  };
}

function validateShopifyConnectionConfig(config) {
  if (!String(config.store_domain || "").trim()) throw new Error("Falta el dominio de Shopify");
  const hasToken = Boolean(String(config.admin_token || "").trim());
  const hasClientCredentials = Boolean(String(config.client_id || "").trim() && String(config.client_secret || "").trim());
  if (!hasToken && !hasClientCredentials) {
    throw new Error("Falta el token o las credenciales de Shopify");
  }
}

function updateShopifyConnection(payload = {}) {
  const before = shopifyConnectionRow();
  const current = shopifyConnectionForUse(before);
  const oldCacheKeys = [
    `${String(current.store_domain || "").trim()}::${String(current.client_id || "").trim()}`,
    `${String(payload.store_domain || current.store_domain || "").trim()}::${String(payload.client_id || current.client_id || "").trim()}`
  ];
  const next = {
    ...current,
    store_domain: Object.prototype.hasOwnProperty.call(payload, "store_domain") ? String(payload.store_domain || "").trim() : current.store_domain,
    api_version: Object.prototype.hasOwnProperty.call(payload, "api_version") ? String(payload.api_version || DEFAULT_SHOPIFY_API_VERSION).trim() || DEFAULT_SHOPIFY_API_VERSION : current.api_version,
    sync_enabled: Object.prototype.hasOwnProperty.call(payload, "sync_enabled") ? (payload.sync_enabled ? 1 : 0) : (current.sync_enabled ? 1 : 0),
    sync_interval_minutes: Object.prototype.hasOwnProperty.call(payload, "sync_interval_minutes") ? Math.max(5, n(payload.sync_interval_minutes, 60)) : current.sync_interval_minutes,
    pull_products: Object.prototype.hasOwnProperty.call(payload, "pull_products") ? (payload.pull_products ? 1 : 0) : (current.pull_products ? 1 : 0),
    pull_inventory: Object.prototype.hasOwnProperty.call(payload, "pull_inventory") ? (payload.pull_inventory ? 1 : 0) : (current.pull_inventory ? 1 : 0),
    pull_orders: Object.prototype.hasOwnProperty.call(payload, "pull_orders") ? (payload.pull_orders ? 1 : 0) : (current.pull_orders ? 1 : 0),
    pull_payouts: Object.prototype.hasOwnProperty.call(payload, "pull_payouts") ? (payload.pull_payouts ? 1 : 0) : (current.pull_payouts ? 1 : 0)
  };
  if (Object.prototype.hasOwnProperty.call(payload, "admin_token")) {
    const incoming = String(payload.admin_token || "").trim();
    next.admin_token = incoming ? incoming : current.admin_token;
  } else {
    next.admin_token = current.admin_token;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "client_id")) {
    const incoming = String(payload.client_id || "").trim();
    next.client_id = incoming ? incoming : current.client_id;
  } else {
    next.client_id = current.client_id;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "client_secret")) {
    const incoming = String(payload.client_secret || "").trim();
    next.client_secret = incoming ? incoming : current.client_secret;
  } else {
    next.client_secret = current.client_secret;
  }
  exec(
    `UPDATE shopify_connection
     SET store_domain=$store_domain, admin_token=$admin_token, client_id=$client_id, client_secret=$client_secret, api_version=$api_version,
         sync_enabled=$sync_enabled, sync_interval_minutes=$sync_interval_minutes,
         pull_products=$pull_products, pull_inventory=$pull_inventory,
         pull_orders=$pull_orders, pull_payouts=$pull_payouts,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=1`,
    next
  );
  oldCacheKeys.forEach((key) => {
    if (key && key !== "::") shopifyAccessTokenCache.delete(key);
  });
  const after = shopifyConnectionRow();
  audit(
    "shopify_connection",
    1,
    "update",
    {
      ...before,
      admin_token: before.admin_token ? "***" : "",
      client_id: before.client_id ? "***" : "",
      client_secret: before.client_secret ? "***" : ""
    },
    {
      ...after,
      admin_token: after.admin_token ? "***" : "",
      client_id: after.client_id ? "***" : "",
      client_secret: after.client_secret ? "***" : ""
    }
  );
  saveDb();
  return shopifyConnectionPayload(after);
}

const SCHEMA_MIGRATIONS = [
  {
    id: "001_current_mvp_schema",
    name: "Create current MVP schema",
    up: ({ exec }) => {
      exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT '',
      website TEXT DEFAULT '',
      lead_time_days INTEGER,
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'material',
      unit_label TEXT NOT NULL DEFAULT 'ud',
      preferred_supplier_id INTEGER REFERENCES suppliers(id),
      manual_stock REAL,
      is_outlet INTEGER NOT NULL DEFAULT 0,
      reorder_point REAL,
      target_stock REAL,
      image_url_override TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopify_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      shopify_inventory_qty REAL DEFAULT 0,
      shopify_available_qty REAL DEFAULT 0,
      material_id INTEGER REFERENCES materials(id),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_product_id INTEGER NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      UNIQUE(shopify_product_id, image_url)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      related_entity TEXT DEFAULT '',
      related_id INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      document_id INTEGER REFERENCES documents(id),
      invoice_number TEXT DEFAULT '',
      invoice_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'materiales',
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      shipping REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materials(id),
      description TEXT NOT NULL,
      package_count REAL NOT NULL DEFAULT 1,
      units_per_package REAL NOT NULL DEFAULT 1,
      total_units REAL NOT NULL DEFAULT 1,
      price_per_package REAL,
      unit_price REAL,
      line_total REAL NOT NULL DEFAULT 0,
      allocate_shipping REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      affects_stock INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'local_user',
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_channels (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channel_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL REFERENCES sales_channels(code),
      external_id TEXT NOT NULL,
      payout_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      currency TEXT NOT NULL DEFAULT 'EUR',
      gross_amount REAL NOT NULL DEFAULT 0,
      refunds_amount REAL NOT NULL DEFAULT 0,
      adjustments_amount REAL NOT NULL DEFAULT 0,
      advances_amount REAL NOT NULL DEFAULT 0,
      reserves_amount REAL NOT NULL DEFAULT 0,
      fees_amount REAL NOT NULL DEFAULT 0,
      tax_withheld_amount REAL NOT NULL DEFAULT 0,
      retried_amount REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      bank_reference TEXT DEFAULT '',
      bank_account_hint TEXT DEFAULT '',
      raw_source_file TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel, external_id)
    );

    CREATE TABLE IF NOT EXISTS channel_payout_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL REFERENCES sales_channels(code),
      source_file TEXT NOT NULL,
      rows_total INTEGER NOT NULL DEFAULT 0,
      rows_created INTEGER NOT NULL DEFAULT 0,
      rows_updated INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopify_connection (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_domain TEXT DEFAULT '',
      admin_token TEXT DEFAULT '',
      client_id TEXT DEFAULT '',
      client_secret TEXT DEFAULT '',
      api_version TEXT NOT NULL DEFAULT '2026-01',
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
      pull_products INTEGER NOT NULL DEFAULT 1,
      pull_inventory INTEGER NOT NULL DEFAULT 1,
      pull_orders INTEGER NOT NULL DEFAULT 1,
      pull_payouts INTEGER NOT NULL DEFAULT 1,
      last_sync_at TEXT,
      last_sync_status TEXT DEFAULT '',
      last_sync_summary TEXT DEFAULT '',
      last_products_sync_at TEXT,
      last_inventory_sync_at TEXT,
      last_orders_sync_at TEXT,
      last_payouts_sync_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL REFERENCES sales_channels(code),
      external_id TEXT NOT NULL,
      order_number TEXT DEFAULT '',
      order_date TEXT NOT NULL,
      updated_at_source TEXT DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'EUR',
      gross_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      shipping_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      financial_status TEXT DEFAULT '',
      fulfillment_status TEXT DEFAULT '',
      raw_source TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel, external_id)
    );

    CREATE TABLE IF NOT EXISTS kit_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT DEFAULT '',
      is_complete INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kit_recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES kit_recipes(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materials(id),
      quantity REAL NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
      `);
    }
  },
  {
    id: "002_mvp_operational_columns",
    name: "Ensure MVP operational columns",
    up: ({ ensureColumn }) => {
      ensureColumn("materials", "image_url_override", "TEXT DEFAULT ''");
      ensureColumn("materials", "is_outlet", "INTEGER NOT NULL DEFAULT 0");
      ensureColumn("materials", "usage_type", "TEXT DEFAULT ''");
      ensureColumn("materials", "family", "TEXT DEFAULT ''");
      ensureColumn("materials", "subfamily", "TEXT DEFAULT ''");
      ensureColumn("materials", "variant", "TEXT DEFAULT ''");
      ensureColumn("materials", "base_material", "TEXT DEFAULT ''");
      ensureColumn("materials", "finish", "TEXT DEFAULT ''");
      ensureColumn("kit_recipes", "is_complete", "INTEGER NOT NULL DEFAULT 0");
      ensureColumn("channel_payouts", "advances_amount", "REAL NOT NULL DEFAULT 0");
      ensureColumn("channel_payouts", "reserves_amount", "REAL NOT NULL DEFAULT 0");
      ensureColumn("channel_payouts", "retried_amount", "REAL NOT NULL DEFAULT 0");
      ensureColumn("channel_payouts", "bank_account_hint", "TEXT DEFAULT ''");
      ensureColumn("shopify_connection", "client_id", "TEXT DEFAULT ''");
      ensureColumn("shopify_connection", "client_secret", "TEXT DEFAULT ''");
    }
  }
];

function migrate() {
  exec("PRAGMA foreign_keys = ON");
  return applyMigrations({ exec, query, migrations: SCHEMA_MIGRATIONS });
}

function exec(sql, params = {}) {
  if (!Object.keys(params).length && sql.includes(";")) {
    db.exec(sql);
    return;
  }
  db.run(sql, bindParams(params));
}

function query(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(bindParams(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = {}) {
  return query(sql, params)[0] || null;
}

function insert(sql, params = {}) {
  exec(sql, params);
  return Number(one("SELECT last_insert_rowid() AS id").id);
}

function bindParams(params) {
  if (Array.isArray(params)) return params;
  const out = {};
  for (const [key, value] of Object.entries(params)) out[`$${key}`] = value === undefined ? null : value;
  return out;
}

function tableCount(table) {
  return Number(one(`SELECT COUNT(*) AS c FROM ${table}`).c);
}

function nowPatch(table, fields) {
  return `${fields.map((field) => `${field} = $${field}`).join(", ")}, updated_at = CURRENT_TIMESTAMP`;
}

function audit(entityType, entityId, action, beforeRow, afterRow) {
  const safeBefore = beforeRow ? redactSensitive(beforeRow) : null;
  const safeAfter = afterRow ? redactSensitive(afterRow) : null;
  insert(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor, before_json, after_json)
     VALUES ($entityType, $entityId, $action, $actor, $before, $after)`,
    {
      entityType,
      entityId,
      action,
      actor: ACTOR,
      before: safeBefore ? JSON.stringify(safeBefore) : null,
      after: safeAfter ? JSON.stringify(safeAfter) : null
    }
  );
}

function normalizeAuditAction(value, fallback = "client_event") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .slice(0, 80);
  return normalized || fallback;
}

const ROUTINE_CLIENT_AUDIT_ACTIONS = new Set(["app_init_success", "line_submit_start", "line_submit_success"]);

function seedSuppliers() {
  const defaults = [
    ["AliExpress", "materiales"],
    ["SHEIN", "materiales"],
    ["Etsy", "joyas/plata"],
    ["MalagaPack", "packaging"],
    ["Correos", "envios"],
    ["Meta", "marketing"],
    ["Shopify", "software"],
    ["LikinAgency", "servicios"],
    ["Canva", "software"],
    ["CapCut", "software"],
    ["Vodafone", "telecom"],
    ["Otro", "otros"]
  ];
  for (const [name, category] of defaults) {
    exec(
      `INSERT OR IGNORE INTO suppliers (name, category) VALUES ($name, $category)`,
      { name, category }
    );
  }
}

function seedSalesChannels() {
  const defaults = [
    ["shopify", "Shopify"],
    ["etsy", "Etsy"],
    ["bizum", "Bizum"]
  ];
  for (const [code, label] of defaults) {
    exec(
      `INSERT OR IGNORE INTO sales_channels (code, label, is_active) VALUES ($code, $label, 1)`,
      { code, label }
    );
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        value += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (ch !== "\r") {
      value += ch;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.some((v) => String(v).trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i] || ""])));
}

function n(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalN(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return n(value);
}

function parseEnglishDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isoTimestampDaysAgo(days = 0) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function timestampWithOverlap(value, overlapHours = 6, fallbackDays = 365) {
  if (!value) return isoTimestampDaysAgo(fallbackDays);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return isoTimestampDaysAgo(fallbackDays);
  return new Date(parsed.getTime() - overlapHours * 60 * 60 * 1000).toISOString();
}

function shopifyGraphqlUrl(config) {
  const domain = String(config.store_domain || "").trim();
  if (/^https?:\/\//i.test(domain)) {
    return `${domain.replace(/\/+$/, "")}/admin/api/${config.api_version}/graphql.json`;
  }
  return `https://${domain.replace(/\/+$/, "")}/admin/api/${config.api_version}/graphql.json`;
}

function shopifyTokenUrl(config) {
  const domain = String(config.store_domain || "").trim();
  if (/^https?:\/\//i.test(domain)) {
    return `${domain.replace(/\/+$/, "")}/admin/oauth/access_token`;
  }
  return `https://${domain.replace(/\/+$/, "")}/admin/oauth/access_token`;
}

function shopifyRestUrl(config, resourcePath, query = null) {
  const domain = String(config.store_domain || "").trim().replace(/\/+$/, "");
  const base = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const url = new URL(`${base}/admin/api/${config.api_version}/${resourcePath.replace(/^\/+/, "")}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function acquireShopifyAccessToken(config) {
  validateShopifyConnectionConfig(config);
  if (String(config.admin_token || "").trim()) return String(config.admin_token).trim();

  const clientId = String(config.client_id || "").trim();
  const clientSecret = String(config.client_secret || "").trim();
  if (!clientId || !clientSecret) throw new Error("Faltan Client ID o Client secret de Shopify");

  const cacheKey = `${String(config.store_domain || "").trim()}::${clientId}`;
  const cached = shopifyAccessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const response = await fetch(shopifyTokenUrl(config), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "No se pudo obtener el access token de Shopify");
  }
  const expiresIn = Number(payload.expires_in || 86400);
  shopifyAccessTokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, expiresIn - 300) * 1000
  });
  return payload.access_token;
}

async function shopifyRest(config, resourcePath, query = null) {
  validateShopifyConnectionConfig(config);
  const accessToken = await acquireShopifyAccessToken(config);
  const response = await fetch(shopifyRestUrl(config, resourcePath, query), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawMessage = payload.errors || payload.error || payload.error_description || `Shopify HTTP ${response.status}`;
    const message = String(rawMessage || "");
    if (/scope|access denied|forbidden|unauthorized/i.test(message) && resourcePath.includes("shopify_payments/payouts")) {
      throw new Error("La app necesita acceso a payouts de Shopify Payments. Revisa que tenga el scope read_shopify_payments_payouts y vuelve a instalarla en la tienda.");
    }
    throw new Error(message);
  }
  return payload;
}

async function shopifyGraphql(config, queryText, variables = {}) {
  validateShopifyConnectionConfig(config);
  const accessToken = await acquireShopifyAccessToken(config);
  const response = await fetch(shopifyGraphqlUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query: queryText, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.errors?.[0]?.message || `Shopify HTTP ${response.status}`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || "Error de Shopify GraphQL");
  }
  return payload.data || {};
}

function firstAvailableImage(product) {
  if (product?.featuredImage?.url) return product.featuredImage.url;
  const edge = product?.images?.edges?.find((item) => item?.node?.url);
  return edge?.node?.url || "";
}

function productInventorySummary(product) {
  const variants = product?.variants?.edges || [];
  const qty = variants.reduce((sum, edge) => sum + n(edge?.node?.inventoryQuantity), 0);
  return {
    sku: variants.map((edge) => String(edge?.node?.sku || "").trim()).find(Boolean) || "",
    quantity: qty,
    available: qty
  };
}

function upsertShopifyProductFromApi(product, mode = "full") {
  const handle = String(product.handle || "").trim();
  if (!handle) return { processed: false, created: false, updated: false };
  const existing = one("SELECT * FROM shopify_products WHERE handle=$handle", { handle });
  const summary = productInventorySummary(product);
  const imageUrl = firstAvailableImage(product);
  let productId = existing?.id || null;
  let created = false;
  let updated = false;
  if (!existing) {
    productId = insert(
      `INSERT INTO shopify_products (handle, title, status, sku, image_url, shopify_inventory_qty, shopify_available_qty)
       VALUES ($handle, $title, $status, $sku, $image_url, $qty, $available)`,
      {
        handle,
        title: product.title || handle,
        status: String(product.status || ""),
        sku: summary.sku,
        image_url: imageUrl,
        qty: summary.quantity,
        available: summary.available
      }
    );
    audit("shopify_product", productId, "shopify_api_create", null, one("SELECT * FROM shopify_products WHERE id=$id", { id: productId }));
    created = true;
  } else {
    const next = {
      id: existing.id,
      title: product.title || existing.title,
      status: String(product.status || existing.status || ""),
      sku: mode === "inventory" ? (summary.sku || existing.sku || "") : summary.sku,
      image_url: mode === "inventory" ? (existing.image_url || "") : (imageUrl || existing.image_url || ""),
      qty: summary.quantity,
      available: summary.available
    };
    const changed = mode === "inventory"
      ? n(existing.shopify_inventory_qty) !== n(next.qty)
        || n(existing.shopify_available_qty) !== n(next.available)
        || String(existing.sku || "") !== String(next.sku || "")
      : String(existing.title || "") !== String(next.title || "")
        || String(existing.status || "") !== String(next.status || "")
        || String(existing.sku || "") !== String(next.sku || "")
        || String(existing.image_url || "") !== String(next.image_url || "")
        || n(existing.shopify_inventory_qty) !== n(next.qty)
        || n(existing.shopify_available_qty) !== n(next.available);
    if (changed) {
      const fields = mode === "inventory"
        ? `shopify_inventory_qty=$qty, shopify_available_qty=$available, sku=$sku, updated_at=CURRENT_TIMESTAMP`
        : `title=$title, status=$status, sku=$sku, image_url=$image_url, shopify_inventory_qty=$qty, shopify_available_qty=$available, updated_at=CURRENT_TIMESTAMP`;
      exec(`UPDATE shopify_products SET ${fields} WHERE id=$id`, next);
      audit("shopify_product", existing.id, mode === "inventory" ? "shopify_api_inventory" : "shopify_api_update", existing, one("SELECT * FROM shopify_products WHERE id=$id", { id: existing.id }));
      updated = true;
    }
  }
  if (productId) {
    const images = [];
    if (mode !== "inventory") {
      if (product?.featuredImage?.url) images.push(product.featuredImage.url);
      for (const edge of product?.images?.edges || []) {
        if (edge?.node?.url && !images.includes(edge.node.url)) images.push(edge.node.url);
      }
      images.forEach((url, index) => {
        exec(
          `INSERT OR IGNORE INTO product_images (shopify_product_id, image_url, position)
           VALUES ($productId, $url, $position)`,
          { productId, url, position: index + 1 }
        );
      });
    }
    const stored = one("SELECT * FROM shopify_products WHERE id=$id", { id: productId });
    if (stored) ensureMaterialForShopifyProduct(stored);
  }
  return { processed: true, created, updated };
}

function upsertSalesOrder(payload, source = "shopify_sync") {
  const existing = one("SELECT * FROM sales_orders WHERE channel=$channel AND external_id=$external_id", payload);
  if (!existing) {
    const id = insert(
      `INSERT INTO sales_orders (
        channel, external_id, order_number, order_date, updated_at_source, currency,
        gross_amount, discount_amount, shipping_amount, tax_amount, net_amount,
        financial_status, fulfillment_status, raw_source, notes
      ) VALUES (
        $channel, $external_id, $order_number, $order_date, $updated_at_source, $currency,
        $gross_amount, $discount_amount, $shipping_amount, $tax_amount, $net_amount,
        $financial_status, $fulfillment_status, $raw_source, $notes
      )`,
      payload
    );
    const after = one("SELECT * FROM sales_orders WHERE id=$id", { id });
    audit("sales_order", id, source === "manual" ? "create" : "shopify_sync_create", null, after);
    return { created: true, updated: false, row: after };
  }
  const fields = [
    "order_number", "order_date", "updated_at_source", "currency", "gross_amount",
    "discount_amount", "shipping_amount", "tax_amount", "net_amount",
    "financial_status", "fulfillment_status", "raw_source", "notes"
  ];
  const same = fields.every((field) => String(existing[field] ?? "") === String(payload[field] ?? ""));
  if (same) return { created: false, updated: false, row: existing };
  exec(`UPDATE sales_orders SET ${nowPatch("sales_orders", fields)} WHERE id=$id`, { id: existing.id, ...payload });
  const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: existing.id });
  audit("sales_order", existing.id, source === "manual" ? "update" : "shopify_sync_update", existing, after);
  return { created: false, updated: true, row: after };
}

async function testShopifyConnection(configInput = null) {
  const config = configInput || shopifyConnectionForUse();
  validateShopifyConnectionConfig(config);
  const data = await shopifyGraphql(config, `
    query {
      shop {
        name
        myshopifyDomain
      }
    }
  `);
  return {
    ok: true,
    shop_name: data.shop?.name || "",
    myshopify_domain: data.shop?.myshopifyDomain || ""
  };
}

async function syncShopifyProducts(configInput = null) {
  const config = configInput || shopifyConnectionForUse();
  const updatedAfter = timestampWithOverlap(config.last_products_sync_at, 6, 365);
  let cursor = null;
  let rows = 0;
  let created = 0;
  let updated = 0;
  do {
    const data = await shopifyGraphql(config, `
      query ShopifyProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
          edges {
            cursor
            node {
              id
              handle
              title
              status
              updatedAt
              featuredImage { url }
              images(first: 20) { edges { node { url } } }
              variants(first: 50) { edges { node { sku inventoryQuantity } } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, {
      first: 100,
      after: cursor,
      query: `updated_at:>=${updatedAfter}`
    });
    const edges = data.products?.edges || [];
    for (const edge of edges) {
      const result = upsertShopifyProductFromApi(edge.node, "full");
      if (result.processed) {
        rows += 1;
        if (result.created) created += 1;
        else if (result.updated) updated += 1;
      }
    }
    cursor = data.products?.pageInfo?.hasNextPage ? data.products?.pageInfo?.endCursor : null;
  } while (cursor);
  exec("UPDATE shopify_connection SET last_products_sync_at=$now, updated_at=CURRENT_TIMESTAMP WHERE id=1", { now: new Date().toISOString() });
  return { rows, created, updated, skipped: 0 };
}

async function syncShopifyInventory(configInput = null) {
  const config = configInput || shopifyConnectionForUse();
  const updatedAfter = timestampWithOverlap(config.last_inventory_sync_at, 2, 30);
  let cursor = null;
  let rows = 0;
  let updated = 0;
  do {
    const data = await shopifyGraphql(config, `
      query ShopifyInventory($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
          edges {
            cursor
            node {
              handle
              title
              status
              variants(first: 50) { edges { node { sku inventoryQuantity } } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, {
      first: 100,
      after: cursor,
      query: `updated_at:>=${updatedAfter}`
    });
    const edges = data.products?.edges || [];
    for (const edge of edges) {
      const result = upsertShopifyProductFromApi(edge.node, "inventory");
      if (result.processed) {
        rows += 1;
        if (result.updated) updated += 1;
      }
    }
    cursor = data.products?.pageInfo?.hasNextPage ? data.products?.pageInfo?.endCursor : null;
  } while (cursor);
  exec("UPDATE shopify_connection SET last_inventory_sync_at=$now, updated_at=CURRENT_TIMESTAMP WHERE id=1", { now: new Date().toISOString() });
  return { rows, created: 0, updated, skipped: rows - updated };
}

function moneyAmount(node) {
  return n(node?.shopMoney?.amount ?? node?.presentmentMoney?.amount ?? node?.amount ?? 0);
}

async function syncShopifyOrders(configInput = null) {
  const config = configInput || shopifyConnectionForUse();
  const updatedAfter = timestampWithOverlap(config.last_orders_sync_at, 6, 365);
  let cursor = null;
  let rows = 0;
  let created = 0;
  let updated = 0;
  do {
    const data = await shopifyGraphql(config, `
      query ShopifyOrders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
          edges {
            cursor
            node {
              id
              name
              createdAt
              updatedAt
              displayFinancialStatus
              displayFulfillmentStatus
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              currentSubtotalPriceSet { shopMoney { amount currencyCode } }
              currentTotalDiscountsSet { shopMoney { amount currencyCode } }
              totalShippingPriceSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, {
      first: 100,
      after: cursor,
      query: `updated_at:>=${updatedAfter}`
    });
    const edges = data.orders?.edges || [];
    for (const edge of edges) {
      const order = edge.node;
      const payload = {
        channel: "shopify",
        external_id: order.id,
        order_number: order.name || "",
        order_date: String(order.createdAt || "").slice(0, 10),
        updated_at_source: order.updatedAt || "",
        currency: order.currentTotalPriceSet?.shopMoney?.currencyCode || "EUR",
        gross_amount: moneyAmount(order.currentSubtotalPriceSet),
        discount_amount: moneyAmount(order.currentTotalDiscountsSet),
        shipping_amount: moneyAmount(order.totalShippingPriceSet),
        tax_amount: moneyAmount(order.totalTaxSet),
        net_amount: moneyAmount(order.currentTotalPriceSet),
        financial_status: String(order.displayFinancialStatus || ""),
        fulfillment_status: String(order.displayFulfillmentStatus || ""),
        raw_source: "shopify_api",
        notes: ""
      };
      const result = upsertSalesOrder(payload);
      rows += 1;
      if (result.created) created += 1;
      else if (result.updated) updated += 1;
    }
    cursor = data.orders?.pageInfo?.hasNextPage ? data.orders?.pageInfo?.endCursor : null;
  } while (cursor);
  exec("UPDATE shopify_connection SET last_orders_sync_at=$now, updated_at=CURRENT_TIMESTAMP WHERE id=1", { now: new Date().toISOString() });
  return { rows, created, updated, skipped: rows - created - updated };
}

async function syncShopifyPayouts(configInput = null) {
  const config = configInput || shopifyConnectionForUse();
  let rows = 0;
  let created = 0;
  let updated = 0;
  const data = await shopifyRest(config, "shopify_payments/payouts.json", { limit: 250 });
  const payouts = Array.isArray(data?.payouts) ? data.payouts : [];
  for (const payout of payouts) {
    const result = upsertChannelPayout({
      channel: "shopify",
      external_id: payout.id ? `shopify_payout:${payout.id}` : `shopify_rest|${payout.date}|${payout.amount}`,
      payout_date: String(payout.date || payout.issued_at || payout.issuedAt || "").slice(0, 10),
      status: normalizePayoutStatus(payout.status || "paid"),
      currency: payout.currency || payout.currency_code || "EUR",
      gross_amount: n(
        payout.summary?.charges_gross_amount
        || payout.summary?.gross
        || payout.amount
      ),
      fees_amount: n(
        payout.summary?.charges_fee_amount
        || payout.summary?.fees
        || 0
      ),
      net_amount: n(payout.amount || payout.net?.amount),
      bank_reference: String(payout.bank_reference || payout.external_trace_id || "").trim(),
      notes: payout.type ? `Shopify payout ${String(payout.type).toLowerCase()}` : "",
      raw_source_file: "shopify_api_rest"
    }, "import");
    rows += 1;
    if (result.created) created += 1;
    else if (result.updated) updated += 1;
  }
  exec("UPDATE shopify_connection SET last_payouts_sync_at=$now, updated_at=CURRENT_TIMESTAMP WHERE id=1", { now: new Date().toISOString() });
  return { rows, created, updated, skipped: rows - created - updated };
}

function shopifySyncStatus() {
  const row = shopifyConnectionRow();
  const config = shopifyConnectionPayload(row);
  const interval = Math.max(5, Number(row.sync_interval_minutes || 60));
  const lastSyncAt = row.last_sync_at ? new Date(row.last_sync_at) : null;
  const nextSyncAt = lastSyncAt && !Number.isNaN(lastSyncAt.getTime())
    ? new Date(lastSyncAt.getTime() + interval * 60 * 1000).toISOString()
    : "";
  const due = Boolean(config.sync_enabled) && !shopifySyncState.running && (!nextSyncAt || new Date(nextSyncAt) <= new Date());
  return {
    ...config,
    running: shopifySyncState.running,
    started_at: shopifySyncState.startedAt || "",
    finished_at: shopifySyncState.finishedAt || "",
    next_sync_at: nextSyncAt,
    due
  };
}

async function runShopifySyncStep(summary, name, fn) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const result = await fn();
    summary[name] = {
      ...result,
      status: "ok",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedMs
    };
    return summary[name];
  } catch (error) {
    summary[name] = {
      status: "error",
      error: redactSensitive(error.message),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedMs
    };
    throw error;
  }
}

async function runShopifySync(mode = "all") {
  if (shopifySyncState.running) throw new Error("Ya hay una sincronización Shopify en curso");
  const row = shopifyConnectionRow();
  const config = shopifyConnectionForUse(row);
  validateShopifyConnectionConfig(config);
  const tasks = {
    products: mode === "products" || (mode === "all" && config.pull_products),
    inventory: mode === "inventory" || (mode === "all" && config.pull_inventory),
    orders: mode === "orders" || (mode === "all" && config.pull_orders),
    payouts: mode === "payouts" || (mode === "all" && config.pull_payouts)
  };
  const summary = {
    products: null,
    inventory: null,
    orders: null,
    payouts: null,
    started_at: new Date().toISOString(),
    finished_at: "",
    status: "ok"
  };
  shopifySyncState = { running: true, startedAt: summary.started_at, finishedAt: null, lastResult: null };
  exec("UPDATE shopify_connection SET last_sync_status='running', updated_at=CURRENT_TIMESTAMP WHERE id=1");
  saveDb();
  try {
    if (tasks.products) await runShopifySyncStep(summary, "products", () => syncShopifyProducts(config));
    if (tasks.inventory) await runShopifySyncStep(summary, "inventory", () => syncShopifyInventory(config));
    if (tasks.orders) await runShopifySyncStep(summary, "orders", () => syncShopifyOrders(config));
    if (tasks.payouts) await runShopifySyncStep(summary, "payouts", () => syncShopifyPayouts(config));
  } catch (error) {
    summary.status = "error";
    summary.error = redactSensitive(error.message);
    throw error;
  } finally {
    summary.finished_at = new Date().toISOString();
    const effectiveStatus = summary.error ? "error" : "ok";
    exec(
      `UPDATE shopify_connection
       SET last_sync_at=$last_sync_at, last_sync_status=$status, last_sync_summary=$summary, updated_at=CURRENT_TIMESTAMP
       WHERE id=1`,
      {
        last_sync_at: summary.finished_at,
        status: effectiveStatus,
        summary: JSON.stringify(summary)
      }
    );
    saveDb();
    shopifySyncState = {
      running: false,
      startedAt: summary.started_at,
      finishedAt: summary.finished_at,
      lastResult: summary
    };
  }
  return summary;
}

function payoutPayload(row) {
  return {
    ...row,
    bank_reference: row.bank_reference || "",
    bank_account_hint: row.bank_account_hint || "",
    raw_source_file: row.raw_source_file || "",
    notes: row.notes || ""
  };
}

function payoutStatusLabel(value) {
  const labels = {
    pending: "Pendiente",
    paid: "Pagado",
    executed: "Ejecutado",
    in_transit: "En tránsito",
    failed: "Fallido",
    canceled: "Cancelado"
  };
  return labels[value] || value;
}

function normalizePayoutStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["in_transit", "paid", "executed"].includes(normalized)) return normalized;
  if (normalized === "completed") return "executed";
  if (!normalized) return "paid";
  return "paid";
}

function guessCategory(title) {
  const s = title.toLowerCase();
  if (s.includes("kit müa") || s.includes("kit mua") || s.includes("kit m")) return "kit";
  if (s.includes("cadena")) return "cadena";
  if (["flor", "letras", "brillo", "nácar", "nacar", "lazito", "pigmento"].some((x) => s.includes(x))) return "topping";
  if (["colgante", "anillo", "pulsera", "charm", "pendientes", "llavero"].some((x) => s.includes(x))) return "joya";
  return "material";
}

function inferMaterialHierarchy(title, category = "") {
  const s = normalizeName(title);
  const out = {
    usage_type: "",
    family: "",
    subfamily: "",
    variant: "",
    base_material: "",
    finish: ""
  };

  if (["joya", "cadena", "topping", "material", "consumible"].includes(category)) out.usage_type = "material kit";
  else if (category === "packaging") out.usage_type = "packaging";
  else if (category === "kit") out.usage_type = "kit";

  if (s.includes("anillo")) {
    out.family = "joya";
    out.subfamily = "anillo";
  } else if (s.includes("colgante")) {
    out.family = "joya";
    out.subfamily = "colgante";
  } else if (s.includes("pulsera")) {
    out.family = "joya";
    out.subfamily = "pulsera";
  } else if (s.includes("pendiente")) {
    out.family = "joya";
    out.subfamily = "pendientes";
  } else if (s.includes("llavero")) {
    out.family = "joya";
    out.subfamily = "llavero";
  } else if (s.includes("cadena")) {
    out.family = "cadena";
  } else if (s.includes("caja") || s.includes("tarjeta") || s.includes("pegatina") || s.includes("tisu") || s.includes("tisú")) {
    out.family = "packaging";
  } else if (s.includes("lampara") || s.includes("lámpara") || s.includes("pinza") || s.includes("pipeta")) {
    out.family = "herramienta";
  } else if (s.includes("resina") || s.includes("pigmento") || s.includes("topping")) {
    out.family = "consumible";
  } else if (category) {
    out.family = category;
  }

  if (s.includes("corazon") || s.includes("corazón")) out.variant = "corazon";
  else if (s.includes("circular") || s.includes("circulo") || s.includes("círculo")) out.variant = "circular";
  else if (s.includes("gota")) out.variant = "gota";
  else if (s.includes("oval")) out.variant = "oval";
  else if (s.includes("mariposa")) out.variant = "mariposa";
  else if (s.includes("latido")) out.variant = "latido";
  else if (s.includes("eclipse")) out.variant = "eclipse";
  else if (s.includes("raiz") || s.includes("raíz")) out.variant = "raiz";
  else if (s.includes("esencia")) out.variant = "esencia";
  else if (s.includes("recuerdo")) out.variant = "recuerdo";

  if (s.includes("acero")) out.base_material = "acero";
  else if (s.includes("plata")) out.base_material = "plata";
  else if (s.includes("carton") || s.includes("cartón")) out.base_material = "carton";
  else if (s.includes("resina")) out.base_material = "resina";
  else if (s.includes("vidrio")) out.base_material = "vidrio";

  if (s.includes("banada en oro") || s.includes("bañada en oro")) out.finish = "banada_en_oro";
  else if (s.includes("dorado")) out.finish = "dorado";
  else if (s.includes("plateado")) out.finish = "plateado";
  else if (s.includes("rosa")) out.finish = "rosa";
  else if (s.includes("blanco")) out.finish = "blanco";
  else if (s.includes("negro")) out.finish = "negro";

  return out;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeOutletComparableName(value) {
  return normalizeName(value)
    .replace(/\boutlet\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialCostInvoicePredicate(alias) {
  return `(
    (${alias}.is_deleted = 0 OR LOWER(COALESCE(${alias}.category, '')) = 'materiales')
    AND (${alias}.status != 'archived' OR LOWER(COALESCE(${alias}.category, '')) = 'materiales')
  )`;
}

function materialEquivalenceKey(material = {}) {
  return [
    normalizeOutletComparableName(material.name),
    String(material.category || "").trim().toLowerCase(),
    String(material.usage_type || "").trim().toLowerCase(),
    String(material.family || "").trim().toLowerCase(),
    String(material.subfamily || "").trim().toLowerCase(),
    String(material.variant || "").trim().toLowerCase(),
    String(material.base_material || "").trim().toLowerCase(),
    String(material.finish || "").trim().toLowerCase()
  ].join("|");
}

function findMaterialByNormalizedName(name) {
  const target = normalizeName(name);
  return query("SELECT * FROM materials WHERE is_deleted=0").find((material) => normalizeName(material.name) === target) || null;
}

function ensureMaterialForShopifyProduct(product) {
  const exact = findMaterialByNormalizedName(product.title);
  const current = product.material_id ? one("SELECT * FROM materials WHERE id=$id", { id: product.material_id }) : null;
  const currentMatches = current && normalizeName(current.name) === normalizeName(product.title);
  if (currentMatches) return current.id;
  if (exact) {
    exec("UPDATE shopify_products SET material_id=$material, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: product.id, material: exact.id });
    return exact.id;
  }
  const inferredCategory = guessCategory(product.title);
  const id = insert(
    `INSERT INTO materials (name, category, unit_label, usage_type, family, subfamily, variant, base_material, finish, notes)
     VALUES ($name, $category, 'ud', $usage_type, $family, $subfamily, $variant, $base_material, $finish, $notes)`,
    {
      name: product.title,
      category: inferredCategory,
      ...inferMaterialHierarchy(product.title, inferredCategory),
      notes: `Creado automaticamente desde Shopify (${product.handle})`
    }
  );
  audit("material", id, "shopify_auto_create", null, one("SELECT * FROM materials WHERE id=$id", { id }));
  exec("UPDATE shopify_products SET material_id=$material, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: product.id, material: id });
  return id;
}

function importShopify(productsCsv, inventoryCsv) {
  const inventory = new Map();
  if (fs.existsSync(inventoryCsv)) {
    for (const row of parseCsv(fs.readFileSync(inventoryCsv, "utf8"))) {
      if (!row.Handle) continue;
      inventory.set(row.Handle, {
        available: n(row["Available (not editable)"]),
        onHand: n(row["On hand (current)"])
      });
    }
  }

  const grouped = new Map();
  for (const row of parseCsv(fs.readFileSync(productsCsv, "utf8"))) {
    const handle = (row.Handle || "").trim();
    if (!handle) continue;
    if (!grouped.has(handle)) {
      grouped.set(handle, { handle, title: "", status: "", sku: "", qty: 0, images: [] });
    }
    const p = grouped.get(handle);
    if ((row.Title || "").trim()) {
      p.title = row.Title.trim();
      p.status = row.Status || "";
      p.sku = row["Variant SKU"] || "";
      p.qty = n(row["Variant Inventory Qty"]);
    }
    if ((row["Image Src"] || "").trim()) {
      p.images.push({ position: n(row["Image Position"], 9999), url: row["Image Src"].trim() });
    }
  }

  let imported = 0;
  for (const p of grouped.values()) {
    if (!p.title) continue;
    const inv = inventory.get(p.handle) || {};
    p.images.sort((a, b) => a.position - b.position);
    const imageUrl = p.images[0]?.url || "";
    const existing = one("SELECT * FROM shopify_products WHERE handle = $handle", { handle: p.handle });
    if (existing) {
      const before = existing;
      exec(
        `UPDATE shopify_products SET
          title=$title, status=$status, sku=$sku, image_url=COALESCE(NULLIF($imageUrl, ''), image_url),
          shopify_inventory_qty=$qty, shopify_available_qty=$available, updated_at=CURRENT_TIMESTAMP
         WHERE handle=$handle`,
        {
          handle: p.handle,
          title: p.title,
          status: p.status,
          sku: p.sku,
          imageUrl,
          qty: p.qty,
          available: inv.available ?? p.qty
        }
      );
      audit("shopify_product", existing.id, "import_update", before, one("SELECT * FROM shopify_products WHERE id=$id", { id: existing.id }));
    } else {
      const id = insert(
        `INSERT INTO shopify_products (handle, title, status, sku, image_url, shopify_inventory_qty, shopify_available_qty)
         VALUES ($handle, $title, $status, $sku, $imageUrl, $qty, $available)`,
        {
          handle: p.handle,
          title: p.title,
          status: p.status,
          sku: p.sku,
          imageUrl,
          qty: p.qty,
          available: inv.available ?? p.qty
        }
      );
      audit("shopify_product", id, "import_create", null, one("SELECT * FROM shopify_products WHERE id=$id", { id }));
    }
    const product = one("SELECT * FROM shopify_products WHERE handle=$handle", { handle: p.handle });
    ensureMaterialForShopifyProduct(product);
    for (const image of p.images) {
      exec(
        `INSERT OR IGNORE INTO product_images (shopify_product_id, image_url, position)
         VALUES ($productId, $url, $position)`,
        { productId: product.id, url: image.url, position: image.position }
      );
    }
    imported++;
  }
  saveDb();
  return { products: imported, inventory_matches: inventory.size };
}

function migrateLegacyJson() {
  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf8"));
  } catch {
    return;
  }
  const supplierMap = new Map();
  for (const supplier of legacy.suppliers || []) {
    exec(
      `INSERT OR IGNORE INTO suppliers (name, category, website, lead_time_days, notes)
       VALUES ($name, $category, $website, $lead, $notes)`,
      {
        name: supplier.name,
        category: supplier.category || "",
        website: supplier.website || "",
        lead: optionalN(supplier.lead_time_days),
        notes: supplier.notes || ""
      }
    );
    supplierMap.set(supplier.id, one("SELECT id FROM suppliers WHERE name=$name", { name: supplier.name }).id);
  }

  const productMaterialMap = new Map();
  for (const product of legacy.products || []) {
    const inferredCategory = product.material_type || guessCategory(product.title);
    const materialId = insert(
      `INSERT INTO materials (name, category, unit_label, preferred_supplier_id, manual_stock, reorder_point, target_stock, image_url_override, usage_type, family, subfamily, variant, base_material, finish, notes)
       VALUES ($name, $category, $unit, $supplier, $stock, $reorder, $target, $imageUrl, $usage_type, $family, $subfamily, $variant, $base_material, $finish, $notes)`,
      {
        ...inferMaterialHierarchy(product.title, inferredCategory),
        name: product.title,
        category: inferredCategory,
        unit: product.unit_label || "ud",
        supplier: supplierMap.get(product.preferred_supplier_id) || null,
        stock: optionalN(product.manual_stock),
        reorder: optionalN(product.reorder_point),
        target: optionalN(product.target_stock),
        imageUrl: product.image_url || "",
        notes: product.notes || ""
      }
    );
    productMaterialMap.set(product.id, materialId);
    exec(
      `INSERT OR IGNORE INTO shopify_products
       (handle, title, status, sku, image_url, shopify_inventory_qty, shopify_available_qty, material_id)
       VALUES ($handle, $title, $status, $sku, $imageUrl, $qty, $available, $materialId)`,
      {
        handle: product.handle,
        title: product.title,
        status: product.status || "",
        sku: product.sku || "",
        imageUrl: product.image_url || "",
        qty: n(product.shopify_inventory_qty),
        available: n(product.shopify_available_qty),
        materialId
      }
    );
    exec(
      `UPDATE shopify_products
       SET material_id = COALESCE(material_id, $materialId),
           updated_at = CURRENT_TIMESTAMP
       WHERE handle = $handle`,
      { materialId, handle: product.handle }
    );
    audit("material", materialId, "legacy_import", null, one("SELECT * FROM materials WHERE id=$id", { id: materialId }));
  }

  for (const image of legacy.productImages || []) {
    const sourceProduct = (legacy.products || []).find((p) => p.id === image.product_id);
    const product = sourceProduct ? one("SELECT id FROM shopify_products WHERE handle=$handle", { handle: sourceProduct.handle }) : null;
    if (!product) continue;
    exec(
      `INSERT OR IGNORE INTO product_images (shopify_product_id, image_url, position)
       VALUES ($productId, $url, $position)`,
      { productId: product.id, url: image.image_url, position: image.position || 0 }
    );
  }

  for (const invoice of legacy.invoices || []) {
    const id = insert(
      `INSERT INTO invoices (supplier_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, notes)
       VALUES ($supplier, $number, $date, $category, $subtotal, $discount, $shipping, $tax, $total, $currency, $notes)`,
      {
        supplier: supplierMap.get(invoice.supplier_id) || null,
        number: invoice.invoice_number || "",
        date: invoice.invoice_date || new Date().toISOString().slice(0, 10),
        category: invoice.category || "materiales",
        subtotal: n(invoice.subtotal),
        discount: n(invoice.discount),
        shipping: n(invoice.shipping),
        tax: n(invoice.tax),
        total: n(invoice.total),
        currency: invoice.currency || "EUR",
        notes: invoice.notes || ""
      }
    );
    audit("invoice", id, "legacy_import", null, one("SELECT * FROM invoices WHERE id=$id", { id }));
  }
}

function rawMaterialCosts() {
  const invoiceScope = materialCostInvoicePredicate("i");
  const invoiceScope2 = materialCostInvoicePredicate("i2");
  const invoiceScope3 = materialCostInvoicePredicate("i3");
  return query(`
    WITH active_lines AS (
      SELECT l.*
      FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id
      WHERE l.is_deleted = 0
        AND ${invoiceScope}
    )
    SELECT
      m.id AS material_id,
      m.name,
      m.category,
      m.unit_label,
      m.is_outlet,
      m.usage_type,
      m.family,
      m.subfamily,
      m.variant,
      m.base_material,
      m.finish,
      s.name AS preferred_supplier_name,
      COUNT(l.id) AS purchase_lots,
      COALESCE(SUM(l.total_units), 0) AS total_units_purchased,
      COALESCE(SUM(l.line_total), 0) AS total_spend,
      CASE
        WHEN SUM(l.total_units) > 0 THEN SUM(l.line_total) / SUM(l.total_units)
        ELSE NULL
      END AS weighted_avg_unit_cost_inc_vat,
      (
        SELECT
          CASE
            WHEN l2.total_units > 0 THEN l2.line_total / l2.total_units
            ELSE NULL
          END
        FROM invoice_lines l2
        JOIN invoices i2 ON i2.id = l2.invoice_id
        WHERE l2.material_id = m.id
          AND l2.is_deleted = 0
          AND ${invoiceScope2}
        ORDER BY i2.invoice_date DESC, l2.id DESC
        LIMIT 1
      ) AS last_unit_cost_inc_vat,
      (
        SELECT s2.name
        FROM invoice_lines l3
        JOIN invoices i3 ON i3.id = l3.invoice_id
        LEFT JOIN suppliers s2 ON s2.id = i3.supplier_id
        WHERE l3.material_id = m.id
          AND l3.is_deleted = 0
          AND ${invoiceScope3}
        GROUP BY s2.id
        ORDER BY SUM(l3.line_total) DESC
        LIMIT 1
      ) AS main_supplier_name
    FROM materials m
    LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
    LEFT JOIN active_lines l ON l.material_id = m.id
    WHERE m.is_deleted = 0
    GROUP BY m.id
    ORDER BY m.category, m.name
  `);
}

function materialCosts() {
  const rows = rawMaterialCosts();
  const byKey = new Map();
  for (const row of rows) {
    if (row.is_outlet) continue;
    if (row.weighted_avg_unit_cost_inc_vat == null && row.last_unit_cost_inc_vat == null) continue;
    const key = materialEquivalenceKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return rows.map((row) => {
    if (!row.is_outlet) {
      return {
        ...row,
        cost_reference_material_id: row.material_id,
        cost_reference_material_name: row.name,
        inherited_cost: 0
      };
    }
    const base = byKey.get(materialEquivalenceKey(row));
    if (!base || Number(base.material_id) === Number(row.material_id)) {
      return {
        ...row,
        cost_reference_material_id: row.material_id,
        cost_reference_material_name: row.name,
        inherited_cost: 0
      };
    }
    return {
      ...row,
      weighted_avg_unit_cost_inc_vat: base.weighted_avg_unit_cost_inc_vat,
      last_unit_cost_inc_vat: base.last_unit_cost_inc_vat,
      main_supplier_name: base.main_supplier_name || row.main_supplier_name,
      cost_reference_material_id: base.material_id,
      cost_reference_material_name: base.name,
      inherited_cost: 1
    };
  });
}

function materialCostDetail(materialId) {
  const summary = materialCosts().find((row) => Number(row.material_id) === Number(materialId));
  if (!summary) return null;
  const sourceMaterialId = Number(summary.cost_reference_material_id || summary.material_id);
  const invoiceScope = materialCostInvoicePredicate("i");
  const lots = query(
    `SELECT l.id AS line_id, l.description, l.package_count, l.units_per_package, l.total_units,
            l.price_per_package, l.line_total, l.notes,
            i.id AS invoice_id, i.invoice_number, i.invoice_date, i.status, i.category,
            s.name AS supplier_name
     FROM invoice_lines l
     JOIN invoices i ON i.id = l.invoice_id
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE l.material_id = $id
       AND l.is_deleted = 0
       AND ${invoiceScope}
     ORDER BY i.invoice_date ASC, l.id ASC`,
    { id: sourceMaterialId }
  ).map((row) => ({
    ...row,
    unit_cost: n(row.total_units) > 0 ? n(row.line_total) / n(row.total_units) : null
  }));
  return { summary, lots };
}

function kitRecipes() {
  const costs = new Map(materialCosts().map((row) => [row.material_id, row]));
  const recipes = query("SELECT * FROM kit_recipes WHERE is_deleted=0 ORDER BY name, version");
  return recipes.map((recipe) => {
    const items = query(
      `SELECT kri.*, m.name AS material_name, m.category AS material_category,
              m.usage_type AS material_usage_type, m.family AS material_family, m.subfamily AS material_subfamily,
              m.variant AS material_variant, m.base_material AS material_base_material, m.finish AS material_finish,
              COALESCE(NULLIF(m.image_url_override, ''), (
                SELECT sp.image_url
                FROM shopify_products sp
                WHERE sp.material_id = m.id AND sp.image_url != ''
                ORDER BY sp.shopify_available_qty DESC, sp.id
                LIMIT 1
              )) AS material_image_url
       FROM kit_recipe_items kri
       LEFT JOIN materials m ON m.id = kri.material_id
       WHERE kri.recipe_id=$id AND kri.is_deleted=0
       ORDER BY kri.id`,
      { id: recipe.id }
    ).map((item) => {
      const cost = costs.get(item.material_id);
      const unitCost = cost?.weighted_avg_unit_cost_inc_vat ?? null;
      return {
        ...item,
        unit_cost: unitCost,
        total_cost: unitCost == null ? null : unitCost * n(item.quantity)
      };
    });
    const knownCost = items.reduce((sum, item) => sum + (item.total_cost ?? 0), 0);
    const missing_cost_items = items.filter((item) => item.unit_cost == null).length;
    return {
      ...recipe,
      items,
      item_count: items.length,
      known_cost: knownCost,
      missing_cost_items
    };
  });
}

function activeInvoicesWithMeta() {
  return query(
    `SELECT i.*, s.name AS supplier_name, d.original_name AS document_name, d.stored_name AS document_stored_name,
            COUNT(l.id) AS line_count
     FROM invoices i
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     LEFT JOIN documents d ON d.id = i.document_id
     LEFT JOIN invoice_lines l ON l.invoice_id = i.id AND l.is_deleted = 0
     WHERE i.is_deleted = 0
     GROUP BY i.id
     ORDER BY i.invoice_date DESC, i.id DESC`
  );
}

function activePayouts() {
  return query(
    `SELECT p.*, c.label AS channel_label
     FROM channel_payouts p
     LEFT JOIN sales_channels c ON c.code = p.channel
     WHERE p.is_deleted = 0
     ORDER BY p.payout_date DESC, p.id DESC`
  ).map(payoutPayload);
}

function payoutImportHistory() {
  return query(
    `SELECT i.*, c.label AS channel_label
     FROM channel_payout_imports i
     LEFT JOIN sales_channels c ON c.code = i.channel
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT 20`
  );
}

function incomeSummary(rows = activePayouts()) {
  const payouts = rows;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthRows = payouts.filter((row) => String(row.payout_date || "").slice(0, 7) === currentMonth);
  return {
    payout_count: payouts.length,
    total_net_amount: payouts.reduce((sum, row) => sum + n(row.net_amount), 0),
    total_gross_amount: payouts.reduce((sum, row) => sum + n(row.gross_amount), 0),
    total_fees_amount: payouts.reduce((sum, row) => sum + n(row.fees_amount), 0),
    current_month_net_amount: monthRows.reduce((sum, row) => sum + n(row.net_amount), 0),
    current_month_fees_amount: monthRows.reduce((sum, row) => sum + n(row.fees_amount), 0),
    pending_count: payouts.filter((row) => !["paid", "executed"].includes(String(row.status || ""))).length,
    last_payout_date: payouts[0]?.payout_date || null,
    channels: Array.from(
      payouts.reduce((map, row) => {
        const key = row.channel;
        const bucket = map.get(key) || { channel: key, net_amount: 0, gross_amount: 0, fees_amount: 0, payout_count: 0 };
        bucket.net_amount += n(row.net_amount);
        bucket.gross_amount += n(row.gross_amount);
        bucket.fees_amount += n(row.fees_amount);
        bucket.payout_count += 1;
        map.set(key, bucket);
        return map;
      }, new Map()).values()
    )
  };
}

function isoMonth(date) {
  return String(date || "").slice(0, 7);
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatIsoDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMonths(date, delta) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function dateInRange(value, from, to) {
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function normalizeDashboardWindow(query = {}) {
  const today = new Date();
  const preset = String(query.preset || "all").trim() || "all";
  let from = String(query.from || "").trim();
  let to = String(query.to || "").trim();
  let label = "Todo el periodo";

  if (preset === "this_month") {
    const start = startOfMonth(today);
    from = formatIsoDate(start);
    to = formatIsoDate(today);
    label = "Este mes";
  } else if (preset === "last_3_months") {
    const start = startOfMonth(shiftMonths(today, -2));
    from = formatIsoDate(start);
    to = formatIsoDate(today);
    label = "Últimos 3 meses";
  } else if (preset === "last_6_months") {
    const start = startOfMonth(shiftMonths(today, -5));
    from = formatIsoDate(start);
    to = formatIsoDate(today);
    label = "Últimos 6 meses";
  } else if (preset === "this_year") {
    from = `${today.getFullYear()}-01-01`;
    to = formatIsoDate(today);
    label = String(today.getFullYear());
  } else if (preset === "custom") {
    label = from || to ? "Ventana personalizada" : "Todo el periodo";
  } else {
    from = "";
    to = "";
  }

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return { preset, from, to, label };
}

function monthSpan(from, to, fallbackMonths = []) {
  if (!from || !to) return fallbackMonths;
  const months = [];
  let cursor = startOfMonth(from);
  const limit = startOfMonth(to);
  while (cursor <= limit) {
    months.push(formatIsoDate(cursor).slice(0, 7));
    cursor = shiftMonths(cursor, 1);
  }
  return months;
}

function daySpan(from, to, fallbackDays = []) {
  if (!from || !to) return fallbackDays;
  const days = [];
  let cursor = new Date(from);
  const limit = new Date(to);
  cursor.setHours(0, 0, 0, 0);
  limit.setHours(0, 0, 0, 0);
  while (cursor <= limit) {
    days.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000) + 1;
}

function normalizeTrendGranularity(options = {}, window = {}) {
  const requested = String(options.granularity || "auto").trim() || "auto";
  if (requested === "day") return "day";
  if (requested === "month") return "month";
  if (window.from && window.to) {
    const span = daysBetween(window.from, window.to);
    if (span && span <= 45) return "day";
  }
  return "month";
}

function normalizePayoutBody(body = {}) {
  const channel = String(body.channel || "shopify").trim().toLowerCase();
  const grossAmount = n(body.gross_amount);
  const netAmount = n(body.net_amount);
  return {
    channel,
    external_id: String(body.external_id || "").trim(),
    payout_date: String(body.payout_date || "").trim(),
    status: normalizePayoutStatus(body.status || "paid"),
    currency: String(body.currency || "EUR").trim().toUpperCase(),
    gross_amount: grossAmount || (channel === "bizum" ? netAmount : 0),
    refunds_amount: n(body.refunds_amount),
    adjustments_amount: n(body.adjustments_amount),
    advances_amount: n(body.advances_amount),
    reserves_amount: n(body.reserves_amount),
    fees_amount: n(body.fees_amount),
    tax_withheld_amount: n(body.tax_withheld_amount),
    retried_amount: n(body.retried_amount),
    net_amount: netAmount || grossAmount,
    bank_reference: String(body.bank_reference || "").trim(),
    bank_account_hint: String(body.bank_account_hint || "").trim(),
    raw_source_file: String(body.raw_source_file || "").trim(),
    notes: String(body.notes || "").trim()
  };
}

function sameMoney(a, b, epsilon = 0.005) {
  return Math.abs(n(a) - n(b)) <= epsilon;
}

function payoutExternalIdPriority(value) {
  const id = String(value || "").trim();
  if (!id) return 0;
  if (id.startsWith("gid://shopify/ShopifyPaymentsPayout/")) return 3;
  if (id.startsWith("shopify_payout:")) return 3;
  if (id.startsWith("shopify|")) return 2;
  if (id.startsWith("manual|")) return 1;
  return 1;
}

function findSimilarPayout(normalized) {
  if (!normalized?.channel || !normalized?.payout_date) return null;
  const candidates = query(
    `SELECT * FROM channel_payouts
     WHERE channel=$channel
       AND payout_date=$payout_date
       AND is_deleted=0`,
    { channel: normalized.channel, payout_date: normalized.payout_date }
  );
  return candidates.find((row) =>
    sameMoney(row.net_amount, normalized.net_amount)
    && sameMoney(row.gross_amount, normalized.gross_amount)
    && sameMoney(row.fees_amount, normalized.fees_amount)
  ) || null;
}

function upsertChannelPayout(payload, source = "manual") {
  const normalized = normalizePayoutBody(payload);
  const exact = one(
    `SELECT * FROM channel_payouts WHERE channel=$channel AND external_id=$external_id`,
    { channel: normalized.channel, external_id: normalized.external_id }
  );
  const existing = exact || findSimilarPayout(normalized);
  const nextValues = existing ? {
    ...normalized,
    external_id: payoutExternalIdPriority(normalized.external_id) >= payoutExternalIdPriority(existing.external_id)
      ? normalized.external_id
      : existing.external_id,
    bank_reference: normalized.bank_reference || existing.bank_reference || "",
    bank_account_hint: normalized.bank_account_hint || existing.bank_account_hint || "",
    raw_source_file: normalized.raw_source_file || existing.raw_source_file || ""
  } : normalized;
  if (!existing) {
    const id = insert(
      `INSERT INTO channel_payouts (
        channel, external_id, payout_date, status, currency,
        gross_amount, refunds_amount, adjustments_amount, advances_amount, reserves_amount,
        fees_amount, tax_withheld_amount, retried_amount, net_amount,
        bank_reference, bank_account_hint, raw_source_file, notes
      ) VALUES (
        $channel, $external_id, $payout_date, $status, $currency,
        $gross_amount, $refunds_amount, $adjustments_amount, $advances_amount, $reserves_amount,
        $fees_amount, $tax_withheld_amount, $retried_amount, $net_amount,
        $bank_reference, $bank_account_hint, $raw_source_file, $notes
      )`,
      nextValues
    );
    const after = payoutPayload(one("SELECT * FROM channel_payouts WHERE id=$id", { id }));
    audit("channel_payout", id, source === "manual" ? "create" : "import_create", null, after);
    return { row: after, created: true, updated: false, skipped: false };
  }

  const same = [
    "external_id", "payout_date", "status", "currency", "gross_amount", "refunds_amount", "adjustments_amount",
    "advances_amount", "reserves_amount", "fees_amount", "tax_withheld_amount", "retried_amount",
    "net_amount", "bank_reference", "bank_account_hint", "raw_source_file", "notes"
  ].every((key) => String(existing[key] ?? "") === String(nextValues[key] ?? ""));
  if (same) return { row: payoutPayload(existing), created: false, updated: false, skipped: true };

  exec(
    `UPDATE channel_payouts SET ${nowPatch("channel_payouts", [
      "external_id", "payout_date", "status", "currency", "gross_amount", "refunds_amount", "adjustments_amount",
      "advances_amount", "reserves_amount", "fees_amount", "tax_withheld_amount", "retried_amount",
      "net_amount", "bank_reference", "bank_account_hint", "raw_source_file", "notes"
    ])} WHERE id=$id`,
    { id: existing.id, ...nextValues }
  );
  const after = payoutPayload(one("SELECT * FROM channel_payouts WHERE id=$id", { id: existing.id }));
  audit("channel_payout", existing.id, source === "manual" ? "update" : "import_update", existing, after);
  return { row: after, created: false, updated: true, skipped: false };
}

function recordPayoutImport(channel, sourceFile, stats, notes = "") {
  insert(
    `INSERT INTO channel_payout_imports (channel, source_file, rows_total, rows_created, rows_updated, rows_skipped, status, notes)
     VALUES ($channel, $source_file, $rows_total, $rows_created, $rows_updated, $rows_skipped, $status, $notes)`,
    {
      channel,
      source_file: sourceFile,
      rows_total: stats.rows_total || 0,
      rows_created: stats.rows_created || 0,
      rows_updated: stats.rows_updated || 0,
      rows_skipped: stats.rows_skipped || 0,
      status: stats.status || "completed",
      notes
    }
  );
}

function importShopifyPayouts(filePath = SHOPIFY_PAYOUTS_CSV) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe el CSV de payouts de Shopify: ${filePath}`);
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const stats = { rows_total: rows.length, rows_created: 0, rows_updated: 0, rows_skipped: 0, status: "completed" };
  for (const row of rows) {
    const payload = {
      channel: "shopify",
      external_id: `shopify|${row["Payout Date"]}|${row.Total}|${row["Bank Reference"] || "sin-referencia"}`,
      payout_date: row["Payout Date"],
      status: normalizePayoutStatus(row.Status || "paid"),
      currency: row.Currency || "EUR",
      gross_amount: n(row.Charges),
      refunds_amount: n(row.Refunds),
      adjustments_amount: n(row.Adjustments),
      advances_amount: n(row.Advances),
      reserves_amount: n(row["Reserved Funds"]),
      fees_amount: n(row.Fees),
      tax_withheld_amount: n(row["Marketplace Sales Tax"]),
      retried_amount: n(row["Retried Amount"]),
      net_amount: n(row.Total),
      bank_reference: row["Bank Reference"] || "",
      raw_source_file: path.relative(ROOT, filePath)
    };
    const result = upsertChannelPayout(payload, "import");
    if (result.created) stats.rows_created += 1;
    else if (result.updated) stats.rows_updated += 1;
    else stats.rows_skipped += 1;
  }
  recordPayoutImport("shopify", path.relative(ROOT, filePath), stats);
  saveDb();
  return stats;
}

function importEtsyPayouts(directory = ETSY_PAYOUTS_DIR) {
  if (!fs.existsSync(directory)) throw new Error(`No existe la carpeta de depósitos de Etsy: ${directory}`);
  const files = fs.readdirSync(directory).filter((name) => /^EtsyDeposits.*\.csv$/i.test(name)).sort();
  const stats = { rows_total: 0, rows_created: 0, rows_updated: 0, rows_skipped: 0, status: "completed" };
  for (const file of files) {
    const fullPath = path.join(directory, file);
    const rows = parseCsv(fs.readFileSync(fullPath, "utf8"));
    stats.rows_total += rows.length;
    for (const row of rows) {
      const payoutDate = parseEnglishDate(row.Date);
      const payload = {
        channel: "etsy",
        external_id: `etsy|${payoutDate}|${row.Amount}|${row["Bank Account Ending Digits"] || ""}`,
        payout_date: payoutDate,
        status: normalizePayoutStatus(row.Status || "executed"),
        currency: row.Currency || "EUR",
        gross_amount: n(row.Amount),
        refunds_amount: 0,
        adjustments_amount: 0,
        advances_amount: 0,
        reserves_amount: 0,
        fees_amount: 0,
        tax_withheld_amount: 0,
        retried_amount: 0,
        net_amount: n(row.Amount),
        bank_reference: "",
        bank_account_hint: String(row["Bank Account Ending Digits"] || "").trim(),
        raw_source_file: path.relative(ROOT, fullPath)
      };
      const result = upsertChannelPayout(payload, "import");
      if (result.created) stats.rows_created += 1;
      else if (result.updated) stats.rows_updated += 1;
      else stats.rows_skipped += 1;
    }
  }
  recordPayoutImport("etsy", path.relative(ROOT, directory), stats, `${files.length} ficheros procesados`);
  saveDb();
  return { ...stats, files_processed: files.length };
}

function dashboardFinance(options = {}) {
  const window = normalizeDashboardWindow(options);
  const granularity = normalizeTrendGranularity(options, window);
  const allInvoices = activeInvoicesWithMeta();
  const allPayouts = activePayouts();
  const invoices = allInvoices.filter((invoice) => dateInRange(invoice.invoice_date, window.from, window.to));
  const payouts = allPayouts.filter((payout) => dateInRange(payout.payout_date, window.from, window.to));
  const income = incomeSummary(payouts);
  const payoutImports = payoutImportHistory();
  const costs = materialCosts();
  const kits = kitRecipes();
  const trackedCategories = ["materiales", "marketing", "envios", "servicios", "software", "otros"];

  const totalExpense = invoices.reduce((sum, invoice) => sum + n(invoice.total), 0);
  const totalNetReceived = payouts.reduce((sum, payout) => sum + n(payout.net_amount), 0);
  const totalFeesReceived = payouts.reduce((sum, payout) => sum + n(payout.fees_amount), 0);
  const draftInvoices = allInvoices.filter((invoice) => invoice.status === "draft");

  const categorySpend = trackedCategories.map((category) => {
    const rows = invoices.filter((invoice) => invoice.category === category);
    return {
      category,
      total: rows.reduce((sum, invoice) => sum + n(invoice.total), 0),
      count: rows.length
    };
  });

  const trendTotalMap = new Map();
  const trendBreakdownMap = new Map();
  const bucketKey = (date) => granularity === "day" ? String(date || "").slice(0, 10) : String(date || "").slice(0, 7);
  for (const invoice of invoices) {
    const key = bucketKey(invoice.invoice_date);
    if (!key) continue;
    trendTotalMap.set(key, (trendTotalMap.get(key) || 0) + n(invoice.total));
    const bucket = trendBreakdownMap.get(key) || { total: 0 };
    bucket.total += n(invoice.total);
    bucket[invoice.category] = (bucket[invoice.category] || 0) + n(invoice.total);
    trendBreakdownMap.set(key, bucket);
  }
  for (const payout of payouts) {
    const key = bucketKey(payout.payout_date);
    if (!key) continue;
    const bucket = trendBreakdownMap.get(key) || { total: 0 };
    bucket.cobros = (bucket.cobros || 0) + n(payout.net_amount);
    bucket.fees = (bucket.fees || 0) + n(payout.fees_amount);
    bucket[`channel_${payout.channel}`] = (bucket[`channel_${payout.channel}`] || 0) + n(payout.net_amount);
    trendBreakdownMap.set(key, bucket);
  }
  const baseKeys = Array.from(trendBreakdownMap.keys()).sort((a, b) => a.localeCompare(b));
  const keysFromWindow = granularity === "day"
    ? daySpan(window.from, window.to, baseKeys)
    : monthSpan(window.from, window.to, baseKeys);
  const trendKeys = (keysFromWindow.length ? keysFromWindow : baseKeys)
    .slice(-12)
    .map((key) => ({ key, total: n(trendTotalMap.get(key)) }));
  const trendLabelKeys = trendKeys.map((row) => row.key);
  const trend = {
    mode: granularity,
    keys: trendLabelKeys,
    series: {
      total: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.total)),
      materiales: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.materiales)),
      marketing: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.marketing)),
      envios: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.envios)),
      cobros: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.cobros)),
      fees: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.fees)),
      balance: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.cobros) - n(trendBreakdownMap.get(key)?.total)),
      servicios: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.servicios)),
      software: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.software)),
      otros: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.otros)),
      channel_shopify: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.channel_shopify)),
      channel_etsy: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.channel_etsy)),
      channel_bizum: trendLabelKeys.map((key) => n(trendBreakdownMap.get(key)?.channel_bizum))
    }
  };

  const supplierSpend = Array.from(
    invoices.reduce((map, invoice) => {
      const key = String(invoice.supplier_id || "none");
      const bucket = map.get(key) || {
        supplier_id: invoice.supplier_id,
        supplier_name: invoice.supplier_name || "Sin proveedor",
        invoice_count: 0,
        total_spend: 0
      };
      bucket.invoice_count += 1;
      bucket.total_spend += n(invoice.total);
      map.set(key, bucket);
      return map;
    }, new Map()).values()
  )
    .sort((a, b) => b.total_spend - a.total_spend || a.supplier_name.localeCompare(b.supplier_name, "es"))
    .slice(0, 8);

  const topMaterials = query(
    `SELECT m.id AS material_id, m.name, m.category,
            COUNT(l.id) AS purchase_lots,
            SUM(l.line_total) AS total_spend,
            CASE WHEN SUM(l.total_units) > 0 THEN SUM(l.line_total) / SUM(l.total_units) ELSE NULL END AS weighted_avg_unit_cost_inc_vat
     FROM materials m
     JOIN invoice_lines l ON l.material_id = m.id AND l.is_deleted = 0
     JOIN invoices i ON i.id = l.invoice_id
     WHERE m.is_deleted = 0
       AND i.is_deleted = 0
       AND i.status != 'archived'
       AND ($from = '' OR i.invoice_date >= $from)
       AND ($to = '' OR i.invoice_date <= $to)
     GROUP BY m.id
     HAVING SUM(l.line_total) > 0
     ORDER BY total_spend DESC, m.name
     LIMIT 8`,
    { from: window.from || "", to: window.to || "" }
  ).map((row) => ({
    material_id: row.material_id,
    name: row.name,
    category: row.category,
    purchase_lots: Number(row.purchase_lots || 0),
    total_spend: n(row.total_spend),
    weighted_avg_unit_cost_inc_vat: row.weighted_avg_unit_cost_inc_vat == null ? null : n(row.weighted_avg_unit_cost_inc_vat)
  }));

  const materialsWithoutImage = query(
    `SELECT m.id, m.name, m.category
     FROM materials m
     WHERE m.is_deleted = 0
       AND COALESCE(NULLIF(m.image_url_override, ''), (
         SELECT sp.image_url
         FROM shopify_products sp
         WHERE sp.material_id = m.id AND sp.image_url != ''
         ORDER BY sp.shopify_available_qty DESC, sp.id
         LIMIT 1
       ), '') = ''
     ORDER BY m.category, m.name`
  );

  const materialsWithoutCost = costs
    .filter((row) => row.weighted_avg_unit_cost_inc_vat == null)
    .map((row) => ({
      material_id: row.material_id,
      name: row.name,
      category: row.category,
      purchase_lots: Number(row.purchase_lots || 0)
    }));

  const incompleteKits = kits
    .filter((kit) => !kit.is_complete && (Number(kit.missing_cost_items || 0) > 0 || Number(kit.item_count || 0) === 0))
    .map((kit) => ({
      id: kit.id,
      name: kit.name,
      version: kit.version,
      item_count: Number(kit.item_count || 0),
      missing_cost_items: Number(kit.missing_cost_items || 0),
      known_cost: n(kit.known_cost)
    }));

  const settings = settingsObject();
  const reorderAlertMultiplier = Math.max(1, n(settings.reorder_alert_multiplier || 1.25) || 1.25);

  const reorderMaterials = query(
    `SELECT m.id, m.name, m.category, m.reorder_point,
            COALESCE((
              SELECT SUM(COALESCE(sp.shopify_available_qty, 0))
              FROM shopify_products sp
              WHERE sp.material_id = m.id
            ), 0) AS effective_stock_qty
     FROM materials m
     WHERE m.is_deleted = 0
       AND COALESCE(m.reorder_point, 0) > 0
     ORDER BY effective_stock_qty ASC, m.reorder_point ASC, m.name`
  )
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      reorder_point: n(row.reorder_point),
      effective_stock_qty: n(row.effective_stock_qty),
      reorder_alert_threshold: n(row.reorder_point) * reorderAlertMultiplier
    }))
    .filter((row) => row.effective_stock_qty <= row.reorder_alert_threshold)
    .sort((a, b) => {
      const aUrgent = a.effective_stock_qty <= a.reorder_point ? 0 : 1;
      const bUrgent = b.effective_stock_qty <= b.reorder_point ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      const aGap = a.effective_stock_qty - a.reorder_alert_threshold;
      const bGap = b.effective_stock_qty - b.reorder_alert_threshold;
      if (aGap !== bGap) return aGap - bGap;
      return a.name.localeCompare(b.name, "es");
    });

  const incomeChannels = income.channels
    .map((row) => ({
      channel: row.channel,
      net_amount: n(row.net_amount),
      gross_amount: n(row.gross_amount),
      fees_amount: n(row.fees_amount),
      payout_count: Number(row.payout_count || 0)
    }))
    .sort((a, b) => b.net_amount - a.net_amount);

  return {
    window,
    granularity,
    kpis: {
      period_expense: totalExpense,
      draft_invoice_count: draftInvoices.length,
      materials_expense: n(categorySpend.find((row) => row.category === "materiales")?.total),
      marketing_expense: n(categorySpend.find((row) => row.category === "marketing")?.total),
      shipping_expense: n(categorySpend.find((row) => row.category === "envios")?.total),
      invoice_count: invoices.length,
      period_net_received: totalNetReceived,
      period_fees_received: totalFeesReceived,
      payout_count: Number(income.payout_count || 0),
      pending_payout_count: Number(income.pending_count || 0),
      period_balance: totalNetReceived - totalExpense
    },
    monthly_spend: trendKeys,
    monthly_breakdown: { months: trendLabelKeys, series: trend.series },
    trend,
    category_spend: categorySpend.filter((row) => row.total > 0 || row.count > 0),
    income,
    income_channels: incomeChannels,
    latest_invoices: invoices.slice(0, 6).map((invoice) => ({
      id: invoice.id,
      supplier_name: invoice.supplier_name,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      status: invoice.status,
      total: n(invoice.total)
    })),
    top_suppliers: supplierSpend,
    top_materials: topMaterials,
    operational: {
      reorder_alert_multiplier: reorderAlertMultiplier,
      draft_invoices: draftInvoices.map((invoice) => ({
        id: invoice.id,
        supplier_name: invoice.supplier_name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        total: n(invoice.total)
      })),
      pending_payouts: payouts
        .filter((row) => !["paid", "executed"].includes(String(row.status || "")))
        .slice(0, 6)
        .map((row) => ({
          id: row.id,
          channel: row.channel,
          payout_date: row.payout_date,
          status: row.status,
          net_amount: n(row.net_amount)
        })),
      reorder_materials: reorderMaterials,
      materials_without_image: materialsWithoutImage,
      materials_without_cost: materialsWithoutCost,
      incomplete_kits: incompleteKits
    }
  };
}

function createApp() {
  const app = express();
  const upload = multer({ dest: UPLOAD_DIR });
  app.use(express.json({ limit: "10mb" }));
  app.use("/img", express.static(path.join(ROOT, "img")));
  app.use("/uploads", express.static(UPLOAD_DIR));
  app.use("/vendor/echarts", express.static(path.join(ROOT, "node_modules", "echarts", "dist")));
  app.use(express.static(PUBLIC_DIR));

  registerSystemRoutes(app, {
    DB_FILE,
    DATA_DIR,
    UPLOAD_DIR,
    query,
    tableCount,
    SCHEMA_MIGRATIONS,
    packageInfo,
    systemHealth,
    shopifyConnectionPayload,
    createDbBackup,
    audit,
    saveDb,
    settingsObject,
    updateSettings,
    shopifyConnectionForUse,
    DEFAULT_SHOPIFY_API_VERSION,
    updateShopifyConnection,
    testShopifyConnection,
    shopifySyncStatus,
    runShopifySync,
    badRequest
  });

  registerIncomeRoutes(app, {
    query,
    one,
    n,
    optionalN,
    saveDb,
    audit,
    badRequest,
    notFound,
    incomeSummary,
    payoutImportHistory,
    payoutPayload,
    normalizePayoutBody,
    upsertChannelPayout,
    nowPatch,
    exec,
    softDelete,
    restore,
    importShopifyPayouts,
    importEtsyPayouts
  });

  app.get("/api/materials", (req, res) => {
    const q = `%${req.query.q || ""}%`;
    const includeDeleted = req.query.include_deleted === "1";
    const rows = query(
      `SELECT m.*, s.name AS preferred_supplier_name,
              COALESCE(NULLIF(m.image_url_override, ''), (
                SELECT sp.image_url
                FROM shopify_products sp
                WHERE sp.material_id = m.id AND sp.image_url != ''
                ORDER BY sp.shopify_available_qty DESC, sp.id
                LIMIT 1
              )) AS image_url,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_inventory_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS shopify_inventory_qty,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_available_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS shopify_available_qty,
              COALESCE((
                SELECT SUM(COALESCE(sp.shopify_available_qty, 0))
                FROM shopify_products sp
                WHERE sp.material_id = m.id
              ), 0) AS effective_stock_qty,
              (
                SELECT COUNT(*)
                FROM shopify_products sp2
                WHERE sp2.material_id = m.id
              ) AS linked_product_count
       FROM materials m
       LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
       WHERE ($includeDeleted = 1 OR m.is_deleted = 0)
         AND (
           m.name LIKE $q OR m.category LIKE $q OR m.notes LIKE $q OR
           m.usage_type LIKE $q OR m.family LIKE $q OR m.subfamily LIKE $q OR
           m.variant LIKE $q OR m.base_material LIKE $q OR m.finish LIKE $q
         )
       ORDER BY m.is_deleted, m.category, m.name`,
      { q, includeDeleted: includeDeleted ? 1 : 0 }
    );
    res.json(rows.map(materialPayload));
  });

  app.post("/api/materials", (req, res) => {
    const b = req.body;
    const inferred = inferMaterialHierarchy(b.name, b.category || "material");
    const id = insert(
      `INSERT INTO materials (name, category, unit_label, preferred_supplier_id, manual_stock, is_outlet, reorder_point, target_stock, image_url_override, usage_type, family, subfamily, variant, base_material, finish, notes)
       VALUES ($name, $category, $unit, $supplier, $stock, $is_outlet, $reorder, $target, $imageUrl, $usage_type, $family, $subfamily, $variant, $base_material, $finish, $notes)`,
      {
        name: b.name,
        category: b.category || "material",
        unit: b.unit_label || "ud",
        supplier: optionalN(b.preferred_supplier_id),
        stock: optionalN(b.manual_stock),
        is_outlet: b.is_outlet ? 1 : 0,
        reorder: optionalN(b.reorder_point),
        target: optionalN(b.target_stock),
        imageUrl: b.image_url_override || "",
        usage_type: b.usage_type || inferred.usage_type || "",
        family: b.family || inferred.family || "",
        subfamily: b.subfamily || inferred.subfamily || "",
        variant: b.variant || inferred.variant || "",
        base_material: b.base_material || inferred.base_material || "",
        finish: b.finish || inferred.finish || "",
        notes: b.notes || ""
      }
    );
    const after = materialPayload(one("SELECT * FROM materials WHERE id=$id", { id }));
    audit("material", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/materials/:id", (req, res) => {
    const before = one("SELECT * FROM materials WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res);
    const fields = [
      "name", "category", "unit_label", "preferred_supplier_id", "manual_stock", "is_outlet", "reorder_point", "target_stock",
      "image_url_override", "usage_type", "family", "subfamily", "variant", "base_material", "finish", "notes"
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!fields.length) return res.json(materialPayload(before));
    const params = { id: req.params.id };
    for (const field of fields) {
      if (field === "is_outlet") params[field] = req.body[field] ? 1 : 0;
      else params[field] = req.body[field] === "" ? null : req.body[field];
    }
    exec(`UPDATE materials SET ${nowPatch("materials", fields)} WHERE id=$id`, params);
    const after = materialPayload(one("SELECT * FROM materials WHERE id=$id", { id: req.params.id }));
    audit("material", Number(req.params.id), "update", before, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/materials/:id", (req, res) => softDelete("materials", "material", req.params.id, res));
  app.post("/api/materials/:id/restore", (req, res) => restore("materials", "material", req.params.id, res));

  app.get("/api/shopify-products", (req, res) => {
    const q = `%${req.query.q || ""}%`;
    res.json(query(
      `SELECT sp.*, m.name AS material_name
       FROM shopify_products sp
       LEFT JOIN materials m ON m.id = sp.material_id
       WHERE sp.title LIKE $q OR sp.handle LIKE $q OR sp.sku LIKE $q
       ORDER BY sp.title
       LIMIT 500`,
      { q }
    ));
  });

  app.patch("/api/shopify-products/:id", (req, res) => {
    const before = one("SELECT * FROM shopify_products WHERE id=$id", { id: req.params.id });
    if (!before) return notFound(res, "Producto Shopify no encontrado", "SHOPIFY_PRODUCT_NOT_FOUND");
    exec(
      `UPDATE shopify_products SET material_id=$material, notes=$notes, updated_at=CURRENT_TIMESTAMP WHERE id=$id`,
      { id: req.params.id, material: optionalN(req.body.material_id), notes: req.body.notes ?? before.notes }
    );
    const after = one("SELECT * FROM shopify_products WHERE id=$id", { id: req.params.id });
    audit("shopify_product", Number(req.params.id), "update", before, after);
    saveDb();
    res.json(after);
  });

  app.post("/api/import/shopify", (req, res) => res.json(importShopify(PRODUCTS_CSV, INVENTORY_CSV)));

  app.post("/api/client-log", (req, res) => {
    const payload = {
      level: req.body.level || "info",
      action: normalizeAuditAction(req.body.action || "client_event"),
      message: req.body.message || "",
      context: redactSensitive(req.body.context || {}),
      created_at: new Date().toISOString()
    };
    if (!ROUTINE_CLIENT_AUDIT_ACTIONS.has(payload.action)) {
      audit("client", 0, payload.action, null, payload);
    }
    saveDb();
    res.json({ ok: true });
  });

  app.get("/api/suppliers", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    res.json(query(
      `SELECT * FROM suppliers WHERE ($includeDeleted=1 OR is_deleted=0) ORDER BY is_deleted, name`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    ));
  });

  app.post("/api/suppliers", (req, res) => {
    const b = req.body;
    const id = insert(
      `INSERT INTO suppliers (name, category, website, lead_time_days, notes)
       VALUES ($name, $category, $website, $lead, $notes)`,
      { name: b.name, category: b.category || "", website: b.website || "", lead: optionalN(b.lead_time_days), notes: b.notes || "" }
    );
    const after = one("SELECT * FROM suppliers WHERE id=$id", { id });
    audit("supplier", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/suppliers/:id", (req, res) => {
    updateEntity("suppliers", "supplier", req.params.id, req.body, ["name", "category", "website", "lead_time_days", "notes"], res);
  });

  app.delete("/api/suppliers/:id", (req, res) => softDelete("suppliers", "supplier", req.params.id, res));
  app.post("/api/suppliers/:id/restore", (req, res) => restore("suppliers", "supplier", req.params.id, res));

  app.get("/api/invoices", (req, res) => {
    const includeDeleted = req.query.include_deleted === "1";
    res.json(query(
      `SELECT i.*, s.name AS supplier_name, d.original_name AS document_name, d.stored_name AS document_stored_name,
              COUNT(l.id) AS line_count
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN documents d ON d.id = i.document_id
       LEFT JOIN invoice_lines l ON l.invoice_id = i.id AND l.is_deleted = 0
       WHERE ($includeDeleted=1 OR i.is_deleted=0)
       GROUP BY i.id
       ORDER BY i.is_deleted, i.invoice_date DESC, i.id DESC`,
      { includeDeleted: includeDeleted ? 1 : 0 }
    ));
  });

  app.post("/api/invoices", (req, res) => {
    const b = req.body;
    const id = insert(
      `INSERT INTO invoices (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, status, notes)
       VALUES ($supplier, $document, $number, $date, $category, $subtotal, $discount, $shipping, $tax, $total, $currency, $status, $notes)`,
      invoiceParams(b)
    );
    const after = one("SELECT * FROM invoices WHERE id=$id", { id });
    audit("invoice", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.get("/api/invoices/:id", (req, res) => {
    const invoice = one(
      `SELECT i.*, s.name AS supplier_name, d.original_name AS document_name, d.stored_name AS document_stored_name, d.stored_path AS document_path
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN documents d ON d.id = i.document_id
       WHERE i.id=$id`,
      { id: req.params.id }
    );
    if (!invoice) return notFound(res, "Factura no encontrada", "INVOICE_NOT_FOUND");
    const lines = query(
      `SELECT l.*, m.name AS material_name, m.category AS material_category,
              m.usage_type AS material_usage_type, m.family AS material_family, m.subfamily AS material_subfamily,
              m.variant AS material_variant, m.base_material AS material_base_material, m.finish AS material_finish,
              COALESCE(NULLIF(m.image_url_override, ''), (
                SELECT sp.image_url
                FROM shopify_products sp
                WHERE sp.material_id = m.id AND sp.image_url != ''
                ORDER BY sp.shopify_available_qty DESC, sp.id
                LIMIT 1
              )) AS material_image_url
       FROM invoice_lines l
       LEFT JOIN materials m ON m.id = l.material_id
       WHERE l.invoice_id=$id
       ORDER BY l.is_deleted, l.id`,
      { id: req.params.id }
    );
    res.json({ invoice, lines });
  });

  app.patch("/api/invoices/:id", (req, res) => {
    updateEntity("invoices", "invoice", req.params.id, req.body, [
      "supplier_id", "document_id", "invoice_number", "invoice_date", "category", "subtotal", "discount", "shipping", "tax", "total", "currency", "status", "notes"
    ], res);
  });

  app.post("/api/invoices/:id/duplicate", (req, res) => {
    const source = one("SELECT * FROM invoices WHERE id=$id", { id: req.params.id });
    if (!source) return notFound(res, "Factura no encontrada", "INVOICE_NOT_FOUND");
    const id = insert(
      `INSERT INTO invoices (supplier_id, document_id, invoice_number, invoice_date, category, subtotal, discount, shipping, tax, total, currency, status, notes)
       VALUES ($supplier_id, $document_id, $invoice_number, $invoice_date, $category, $subtotal, $discount, $shipping, $tax, $total, $currency, 'draft', $notes)`,
      { ...source, invoice_number: `${source.invoice_number || "sin-numero"} copia` }
    );
    for (const line of query("SELECT * FROM invoice_lines WHERE invoice_id=$id AND is_deleted=0", { id: req.params.id })) {
      insert(
        `INSERT INTO invoice_lines (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, allocate_shipping, tax, affects_stock, notes)
         VALUES ($invoice, $material, $description, $packages, $unitsPackage, $totalUnits, $pricePackage, $unitPrice, $lineTotal, $shipping, $tax, $stock, $notes)`,
        {
          invoice: id,
          material: line.material_id,
          description: line.description,
          packages: line.package_count,
          unitsPackage: line.units_per_package,
          totalUnits: line.total_units,
          pricePackage: line.price_per_package,
          unitPrice: line.unit_price,
          lineTotal: line.line_total,
          shipping: line.allocate_shipping,
          tax: line.tax,
          stock: line.affects_stock,
          notes: line.notes
        }
      );
    }
    const after = one("SELECT * FROM invoices WHERE id=$id", { id });
    audit("invoice", id, "duplicate", source, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/invoices/:id", (req, res) => softDelete("invoices", "invoice", req.params.id, res));
  app.post("/api/invoices/:id/restore", (req, res) => restore("invoices", "invoice", req.params.id, res));

  app.post("/api/invoices/:id/lines", (req, res) => {
    const id = createInvoiceLine(req.params.id, req.body);
    const after = one("SELECT * FROM invoice_lines WHERE id=$id", { id });
    audit("invoice_line", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/invoices/:invoiceId/lines/:lineId", (req, res) => {
    const b = normalizeLine(req.body);
    updateEntity("invoice_lines", "invoice_line", req.params.lineId, b, [
      "material_id", "description", "package_count", "units_per_package", "total_units", "price_per_package", "unit_price", "line_total", "allocate_shipping", "tax", "affects_stock", "notes"
    ], res);
  });

  app.post("/api/invoices/:invoiceId/lines/:lineId/duplicate", (req, res) => {
    const line = one("SELECT * FROM invoice_lines WHERE id=$id AND invoice_id=$invoice", { id: req.params.lineId, invoice: req.params.invoiceId });
    if (!line) return notFound(res, "Linea no encontrada", "INVOICE_LINE_NOT_FOUND");
    const id = insert(
      `INSERT INTO invoice_lines (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, allocate_shipping, tax, affects_stock, notes)
       VALUES ($invoice, $material, $description, $packages, $unitsPackage, $totalUnits, $pricePackage, $unitPrice, $lineTotal, $shipping, $tax, $stock, $notes)`,
        {
          invoice: req.params.invoiceId,
          material: line.material_id,
          description: line.description,
          packages: line.package_count,
          unitsPackage: line.units_per_package,
          totalUnits: line.total_units,
          pricePackage: line.price_per_package,
          unitPrice: n(line.total_units) > 0 ? n(line.line_total) / n(line.total_units) : null,
          lineTotal: line.line_total,
          shipping: 0,
          tax: 0,
          stock: line.affects_stock,
          notes: line.notes
        }
    );
    const after = one("SELECT * FROM invoice_lines WHERE id=$id", { id });
    audit("invoice_line", id, "duplicate", line, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/invoices/:invoiceId/lines/:lineId", (req, res) => softDelete("invoice_lines", "invoice_line", req.params.lineId, res));
  app.post("/api/invoices/:invoiceId/lines/:lineId/restore", (req, res) => restore("invoice_lines", "invoice_line", req.params.lineId, res));

  app.post("/api/documents", upload.single("document"), (req, res) => {
    if (!req.file) return badRequest(res, "Falta archivo", "DOCUMENT_REQUIRED");
    const ext = path.extname(req.file.originalname);
    const storedName = `${Date.now()}-${req.file.filename}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, storedName);
    fs.renameSync(req.file.path, finalPath);
    const id = insert(
      `INSERT INTO documents (original_name, stored_name, stored_path, mime_type, size, related_entity, related_id)
       VALUES ($original, $stored, $path, $mime, $size, $entity, $relatedId)`,
      {
        original: req.file.originalname,
        stored: storedName,
        path: finalPath,
        mime: req.file.mimetype,
        size: req.file.size,
        entity: req.body.related_entity || "",
        relatedId: optionalN(req.body.related_id)
      }
    );
    const after = one("SELECT * FROM documents WHERE id=$id", { id });
    audit("document", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.get("/api/kit-recipes", (req, res) => res.json(kitRecipes()));

  app.post("/api/kit-recipes", (req, res) => {
    const id = insert(
      `INSERT INTO kit_recipes (name, version, is_complete, notes)
       VALUES ($name, $version, $isComplete, $notes)`,
      {
        name: req.body.name,
        version: req.body.version || "",
        isComplete: req.body.is_complete ? 1 : 0,
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipes WHERE id=$id", { id });
    audit("kit_recipe", id, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:id", (req, res) => {
    const payload = {
      ...req.body,
      is_complete: req.body.is_complete === undefined ? undefined : (req.body.is_complete ? 1 : 0)
    };
    updateEntity("kit_recipes", "kit_recipe", req.params.id, payload, ["name", "version", "is_complete", "notes"], res);
  });

  app.delete("/api/kit-recipes/:id", (req, res) => softDelete("kit_recipes", "kit_recipe", req.params.id, res));
  app.post("/api/kit-recipes/:id/restore", (req, res) => restore("kit_recipes", "kit_recipe", req.params.id, res));

  app.post("/api/kit-recipes/:id/items", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const itemId = insert(
      `INSERT INTO kit_recipe_items (recipe_id, material_id, quantity, notes)
       VALUES ($recipe, $material, $quantity, $notes)`,
      {
        recipe: req.params.id,
        material: optionalN(req.body.material_id),
        quantity: n(req.body.quantity, 1),
        notes: req.body.notes || ""
      }
    );
    const after = one("SELECT * FROM kit_recipe_items WHERE id=$id", { id: itemId });
    audit("kit_recipe_item", itemId, "create", null, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    updateEntity("kit_recipe_items", "kit_recipe_item", req.params.itemId, req.body, ["material_id", "quantity", "notes"], res);
  });

  app.delete("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    softDelete("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });
  app.post("/api/kit-recipes/:recipeId/items/:itemId/restore", (req, res) => restore("kit_recipe_items", "kit_recipe_item", req.params.itemId, res));

  app.get("/api/costs/materials", (req, res) => res.json(materialCosts()));
  app.get("/api/costs/materials/:id", (req, res) => {
    const detail = materialCostDetail(req.params.id);
    if (!detail) return notFound(res, "Material no encontrado", "MATERIAL_NOT_FOUND");
    res.json(detail);
  });
  app.get("/api/dashboard/finance", (req, res) => res.json(dashboardFinance(req.query || {})));

  app.get("/api/audit-log", (req, res) => {
    const entity = req.query.entity || "";
    const action = req.query.action || "";
    const id = optionalN(req.query.id);
    const q = `%${String(req.query.q || "").trim().toLowerCase()}%`;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const scope = String(req.query.scope || "business").trim();
    const limit = Math.min(Math.max(optionalN(req.query.limit) || 200, 1), 500);
    res.json(query(
      `SELECT * FROM audit_log
       WHERE ($entity = '' OR entity_type = $entity)
         AND ($action = '' OR action = $action)
         AND ($id IS NULL OR entity_id = $id)
         AND ($from = '' OR date(created_at) >= date($from))
         AND ($to = '' OR date(created_at) <= date($to))
         AND ($q = '%%' OR lower(
           coalesce(entity_type, '') || ' ' ||
           coalesce(action, '') || ' ' ||
           coalesce(actor, '') || ' ' ||
           coalesce(before_json, '') || ' ' ||
           coalesce(after_json, '')
         ) LIKE $q)
         AND (
           ($scope = 'technical' AND entity_type IN ('client', 'shopify_product', 'system'))
           OR ($scope = 'business' AND entity_type NOT IN ('client', 'shopify_product', 'system'))
           OR ($scope = 'all')
         )
       ORDER BY id DESC
       LIMIT $limit`,
      { entity, action, id, q, from, to, scope, limit }
    ));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    apiError(res, 500, "INTERNAL_ERROR", error);
  });

  return app;
}

function invoiceParams(b) {
  return {
    supplier: optionalN(b.supplier_id),
    document: optionalN(b.document_id),
    number: b.invoice_number || "",
    date: b.invoice_date || new Date().toISOString().slice(0, 10),
    category: b.category || "materiales",
    subtotal: n(b.subtotal),
    discount: n(b.discount),
    shipping: n(b.shipping),
    tax: n(b.tax),
    total: n(b.total),
    currency: b.currency || "EUR",
    status: b.status || "draft",
    notes: b.notes || ""
  };
}

function normalizeLine(b) {
  const packageCount = n(b.package_count, 1);
  const unitsPerPackage = n(b.units_per_package, 1);
  const totalUnits = packageCount * unitsPerPackage;
  const pricePerPackage = optionalN(b.price_per_package);
  const lineTotal = pricePerPackage !== null ? pricePerPackage * packageCount : 0;
  const unitPrice = totalUnits ? lineTotal / totalUnits : null;
  return {
    material_id: optionalN(b.material_id),
    description: b.description || "",
    package_count: packageCount,
    units_per_package: unitsPerPackage,
    total_units: totalUnits,
    price_per_package: pricePerPackage,
    unit_price: unitPrice,
    line_total: lineTotal,
    allocate_shipping: 0,
    tax: 0,
    affects_stock: b.affects_stock === false || b.affects_stock === 0 ? 0 : 1,
    notes: b.notes || ""
  };
}

function createInvoiceLine(invoiceId, body) {
  const b = normalizeLine(body);
  return insert(
    `INSERT INTO invoice_lines (invoice_id, material_id, description, package_count, units_per_package, total_units, price_per_package, unit_price, line_total, allocate_shipping, tax, affects_stock, notes)
     VALUES ($invoice, $material_id, $description, $package_count, $units_per_package, $total_units, $price_per_package, $unit_price, $line_total, $allocate_shipping, $tax, $affects_stock, $notes)`,
    { invoice: invoiceId, ...b }
  );
}

function updateEntity(table, entityType, id, body, allowedFields, res) {
  const before = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  if (!before) return notFound(res);
  const fields = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (!fields.length) return res.json(before);
  const params = { id };
  for (const field of fields) params[field] = body[field] === "" ? null : body[field];
  exec(`UPDATE ${table} SET ${nowPatch(table, fields)} WHERE id=$id`, params);
  const after = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  audit(entityType, Number(id), "update", before, after);
  saveDb();
  res.json(after);
}

function softDelete(table, entityType, id, res) {
  const before = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  if (!before) return notFound(res);
  exec(`UPDATE ${table} SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, { id });
  const after = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  audit(entityType, Number(id), "archive", before, after);
  saveDb();
  res.json(after);
}

function restore(table, entityType, id, res) {
  const before = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  if (!before) return notFound(res);
  exec(`UPDATE ${table} SET is_deleted=0, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, { id });
  const after = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  audit(entityType, Number(id), "restore", before, after);
  saveDb();
  res.json(after);
}

async function start() {
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 5055;
  await openDb();
  const app = createApp();
  app.listen(port, "127.0.0.1", () => {
    console.log(`Mua Ops running at http://127.0.0.1:${port}`);
    console.log(`SQLite data: ${DB_FILE}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
