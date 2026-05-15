const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const initSqlJs = require("sql.js");

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
const ACTOR = "local_user";
const DEFAULT_SETTINGS = {
  company_name: "Mua Ops",
  currency: "EUR",
  dashboard_monthly_view: "total",
  low_stock_default: "5",
  default_invoice_status: "draft",
  default_invoice_category: "materiales",
  dashboard_color_total: "#166b5e",
  dashboard_color_materiales: "#9f7234",
  dashboard_color_marketing: "#b85d72",
  dashboard_color_envios: "#4f6d93"
};

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
  } else {
    db = new SQL.Database();
  }
  migrate();
  backfillMaterialHierarchy();
  seedSuppliers();
  seedSettings();
  if (fs.existsSync(PRODUCTS_CSV)) {
    importShopify(PRODUCTS_CSV, INVENTORY_CSV);
  }
  if (fs.existsSync(LEGACY_JSON) && tableCount("invoices") === 0 && tableCount("materials") === 0) {
    migrateLegacyJson();
  }
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function backfillMaterialHierarchy() {
  for (const material of query("SELECT * FROM materials")) {
    const inferred = inferMaterialHierarchy(material.name, material.category);
    const patch = {};
    for (const key of ["usage_type", "family", "subfamily", "variant", "base_material", "finish"]) {
      if (!String(material[key] || "").trim() && String(inferred[key] || "").trim()) patch[key] = inferred[key];
    }
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
    usage_type: row.usage_type || "",
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

function migrate() {
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
  ensureColumn("materials", "image_url_override", "TEXT DEFAULT ''");
  ensureColumn("materials", "usage_type", "TEXT DEFAULT ''");
  ensureColumn("materials", "family", "TEXT DEFAULT ''");
  ensureColumn("materials", "subfamily", "TEXT DEFAULT ''");
  ensureColumn("materials", "variant", "TEXT DEFAULT ''");
  ensureColumn("materials", "base_material", "TEXT DEFAULT ''");
  ensureColumn("materials", "finish", "TEXT DEFAULT ''");
  ensureColumn("kit_recipes", "is_complete", "INTEGER NOT NULL DEFAULT 0");
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

function ensureColumn(table, column, definition) {
  const columns = query(`PRAGMA table_info(${table})`).map((row) => row.name);
  if (columns.includes(column)) return;
  exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function nowPatch(table, fields) {
  return `${fields.map((field) => `${field} = $${field}`).join(", ")}, updated_at = CURRENT_TIMESTAMP`;
}

function audit(entityType, entityId, action, beforeRow, afterRow) {
  insert(
    `INSERT INTO audit_log (entity_type, entity_id, action, actor, before_json, after_json)
     VALUES ($entityType, $entityId, $action, $actor, $before, $after)`,
    {
      entityType,
      entityId,
      action,
      actor: ACTOR,
      before: beforeRow ? JSON.stringify(beforeRow) : null,
      after: afterRow ? JSON.stringify(afterRow) : null
    }
  );
}

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

  if (["joya", "cadena", "topping", "material", "consumible"].includes(category)) out.usage_type = "material_kit";
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

function materialCosts() {
  return query(`
    WITH active_lines AS (
      SELECT l.*
      FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id
      WHERE l.is_deleted = 0
        AND i.is_deleted = 0
        AND i.status != 'archived'
    )
    SELECT
      m.id AS material_id,
      m.name,
      m.category,
      m.unit_label,
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
          AND i2.is_deleted = 0
          AND i2.status != 'archived'
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
          AND i3.is_deleted = 0
          AND i3.status != 'archived'
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

function dashboardFinance() {
  const invoices = activeInvoicesWithMeta();
  const costs = materialCosts();
  const kits = kitRecipes();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const trackedCategories = ["materiales", "marketing", "envios", "servicios", "software", "otros"];

  const totalExpense = invoices.reduce((sum, invoice) => sum + n(invoice.total), 0);
  const currentMonthExpense = invoices
    .filter((invoice) => String(invoice.invoice_date || "").slice(0, 7) === currentMonth)
    .reduce((sum, invoice) => sum + n(invoice.total), 0);
  const draftInvoices = invoices.filter((invoice) => invoice.status === "draft");

  const categorySpend = trackedCategories.map((category) => {
    const rows = invoices.filter((invoice) => invoice.category === category);
    return {
      category,
      total: rows.reduce((sum, invoice) => sum + n(invoice.total), 0),
      count: rows.length
    };
  });

  const monthlyMap = new Map();
  const monthlyBreakdownMap = new Map();
  for (const invoice of invoices) {
    const key = String(invoice.invoice_date || "").slice(0, 7);
    if (!key) continue;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + n(invoice.total));
    const bucket = monthlyBreakdownMap.get(key) || { total: 0 };
    bucket.total += n(invoice.total);
    bucket[invoice.category] = (bucket[invoice.category] || 0) + n(invoice.total);
    monthlyBreakdownMap.set(key, bucket);
  }
  const monthlySpend = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, total]) => ({ month, total }));
  const monthlySpendMonths = monthlySpend.map((row) => row.month);
  const monthlyBreakdown = {
    months: monthlySpendMonths,
    series: {
      total: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.total)),
      materiales: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.materiales)),
      marketing: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.marketing)),
      envios: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.envios)),
      servicios: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.servicios)),
      software: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.software)),
      otros: monthlySpendMonths.map((month) => n(monthlyBreakdownMap.get(month)?.otros))
    }
  };

  const supplierSpend = query(
    `SELECT COALESCE(s.name, 'Sin proveedor') AS supplier_name,
            i.supplier_id,
            COUNT(*) AS invoice_count,
            SUM(i.total) AS total_spend
     FROM invoices i
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     WHERE i.is_deleted = 0
     GROUP BY i.supplier_id, supplier_name
     ORDER BY total_spend DESC, supplier_name
     LIMIT 8`
  ).map((row) => ({
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    invoice_count: Number(row.invoice_count),
    total_spend: n(row.total_spend)
  }));

  const topMaterials = costs
    .filter((row) => n(row.total_spend) > 0)
    .sort((a, b) => n(b.total_spend) - n(a.total_spend))
    .slice(0, 8)
    .map((row) => ({
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

  return {
    kpis: {
      total_expense: totalExpense,
      current_month_expense: currentMonthExpense,
      draft_invoice_count: draftInvoices.length,
      materials_expense: n(categorySpend.find((row) => row.category === "materiales")?.total),
      marketing_expense: n(categorySpend.find((row) => row.category === "marketing")?.total),
      shipping_expense: n(categorySpend.find((row) => row.category === "envios")?.total),
      invoice_count: invoices.length
    },
    monthly_spend: monthlySpend,
    monthly_breakdown: monthlyBreakdown,
    category_spend: categorySpend.filter((row) => row.total > 0 || row.count > 0),
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
      draft_invoices: draftInvoices.map((invoice) => ({
        id: invoice.id,
        supplier_name: invoice.supplier_name,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        total: n(invoice.total)
      })),
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

  app.get("/api/summary", (req, res) => {
    res.json({
      materials: tableCount("materials"),
      shopify_products: tableCount("shopify_products"),
      suppliers: query("SELECT COUNT(*) AS c FROM suppliers WHERE is_deleted=0")[0].c,
      invoices: query("SELECT COUNT(*) AS c FROM invoices WHERE is_deleted=0")[0].c,
      documents: query("SELECT COUNT(*) AS c FROM documents WHERE is_deleted=0")[0].c,
      db_path: DB_FILE
    });
  });

  app.get("/api/settings", (req, res) => {
    res.json(settingsObject());
  });

  app.patch("/api/settings", (req, res) => {
    res.json(updateSettings(req.body || {}));
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
      `INSERT INTO materials (name, category, unit_label, preferred_supplier_id, manual_stock, reorder_point, target_stock, image_url_override, usage_type, family, subfamily, variant, base_material, finish, notes)
       VALUES ($name, $category, $unit, $supplier, $stock, $reorder, $target, $imageUrl, $usage_type, $family, $subfamily, $variant, $base_material, $finish, $notes)`,
      {
        name: b.name,
        category: b.category || "material",
        unit: b.unit_label || "ud",
        supplier: optionalN(b.preferred_supplier_id),
        stock: optionalN(b.manual_stock),
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
    if (!before) return res.status(404).json({ error: "Entidad no encontrada" });
    const fields = [
      "name", "category", "unit_label", "preferred_supplier_id", "manual_stock", "reorder_point", "target_stock",
      "image_url_override", "usage_type", "family", "subfamily", "variant", "base_material", "finish", "notes"
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!fields.length) return res.json(materialPayload(before));
    const params = { id: req.params.id };
    for (const field of fields) params[field] = req.body[field] === "" ? null : req.body[field];
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
    if (!before) return res.status(404).json({ error: "Producto Shopify no encontrado" });
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
      action: req.body.action || "client_event",
      message: req.body.message || "",
      context: req.body.context || {},
      created_at: new Date().toISOString()
    };
    audit("client", 0, payload.action, null, payload);
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
    if (!invoice) return res.status(404).json({ error: "Factura no encontrada" });
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
    if (!source) return res.status(404).json({ error: "Factura no encontrada" });
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
    if (!line) return res.status(404).json({ error: "Linea no encontrada" });
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
    if (!req.file) return res.status(400).json({ error: "Falta archivo" });
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
    if (recipe?.is_complete) return res.status(400).json({ error: "El kit esta marcado como completo" });
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
    if (recipe?.is_complete) return res.status(400).json({ error: "El kit esta marcado como completo" });
    updateEntity("kit_recipe_items", "kit_recipe_item", req.params.itemId, req.body, ["material_id", "quantity", "notes"], res);
  });

  app.delete("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return res.status(400).json({ error: "El kit esta marcado como completo" });
    softDelete("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });
  app.post("/api/kit-recipes/:recipeId/items/:itemId/restore", (req, res) => restore("kit_recipe_items", "kit_recipe_item", req.params.itemId, res));

  app.get("/api/costs/materials", (req, res) => res.json(materialCosts()));
  app.get("/api/dashboard/finance", (req, res) => res.json(dashboardFinance()));

  app.get("/api/audit-log", (req, res) => {
    const entity = req.query.entity || "";
    const id = optionalN(req.query.id);
    res.json(query(
      `SELECT * FROM audit_log
       WHERE ($entity = '' OR entity_type = $entity)
         AND ($id IS NULL OR entity_id = $id)
       ORDER BY id DESC
       LIMIT 500`,
      { entity, id }
    ));
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
  if (!before) return res.status(404).json({ error: "Entidad no encontrada" });
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
  if (!before) return res.status(404).json({ error: "Entidad no encontrada" });
  exec(`UPDATE ${table} SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, { id });
  const after = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  audit(entityType, Number(id), "archive", before, after);
  saveDb();
  res.json(after);
}

function restore(table, entityType, id, res) {
  const before = one(`SELECT * FROM ${table} WHERE id=$id`, { id });
  if (!before) return res.status(404).json({ error: "Entidad no encontrada" });
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
