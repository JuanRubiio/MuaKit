const fs = require("fs");
const path = require("path");

const SENSITIVE_KEY_RE = /(token|secret|password|authorization|credential|client_secret|admin_token|access_token)/i;
const SENSITIVE_VALUE_RE = /(shpat_[A-Za-z0-9_]+|shpss_[A-Za-z0-9_]+|shpui_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/g;

function isoFileStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function backupDir(dataDir) {
  return path.join(dataDir, "backups");
}

function latestBackup(dataDir) {
  const dir = backupDir(dataDir);
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      return {
        file,
        name,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return entries[0] || null;
}

function createDbBackup({ dbFile, dataDir, reason = "manual" }) {
  if (!fs.existsSync(dbFile)) {
    return {
      created: false,
      reason: "missing_db",
      message: "No existe todavia una base de datos que copiar"
    };
  }
  const dir = backupDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const safeReason = String(reason || "manual").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase().slice(0, 40) || "manual";
  const file = path.join(dir, `mua_ops-${isoFileStamp()}-${safeReason}.sqlite`);
  fs.copyFileSync(dbFile, file);
  const stat = fs.statSync(file);
  return {
    created: true,
    reason: safeReason,
    file,
    size_bytes: stat.size,
    created_at: stat.mtime.toISOString()
  };
}

function redactSensitive(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.replace(SENSITIVE_VALUE_RE, (match) => {
      const tail = match.slice(-4);
      return `***${tail}`;
    });
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SENSITIVE_KEY_RE.test(key)) return [key, item ? "***" : item];
    return [key, redactSensitive(item)];
  }));
}

function dbIntegrity(query) {
  try {
    const row = query("PRAGMA integrity_check")[0];
    const value = Object.values(row || {})[0] || "unknown";
    return { ok: value === "ok", result: value };
  } catch (error) {
    return { ok: false, result: error.message };
  }
}

function systemHealth({ dbFile, dataDir, uploadDir, query, expectedMigrations = [], packageInfo = {}, shopifyConnectionPayload = null }) {
  const dbExists = fs.existsSync(dbFile);
  const dbStat = dbExists ? fs.statSync(dbFile) : null;
  const migrations = (() => {
    try {
      return query("SELECT id, name, applied_at FROM schema_migrations ORDER BY id");
    } catch {
      return [];
    }
  })();
  const appliedIds = new Set(migrations.map((row) => row.id));
  const pending = expectedMigrations.filter((migration) => !appliedIds.has(migration.id)).map((migration) => migration.id);
  const integrity = dbIntegrity(query);
  const shopify = typeof shopifyConnectionPayload === "function" ? redactSensitive(shopifyConnectionPayload()) : null;
  return {
    ok: Boolean(dbExists && integrity.ok && pending.length === 0),
    app: {
      name: packageInfo.name || "muakit",
      version: packageInfo.version || "0.0.0"
    },
    database: {
      path: dbFile,
      exists: dbExists,
      size_bytes: dbStat ? dbStat.size : 0,
      updated_at: dbStat ? dbStat.mtime.toISOString() : "",
      integrity: integrity.result
    },
    backups: {
      directory: backupDir(dataDir),
      latest: latestBackup(dataDir)
    },
    schema: {
      expected_migrations: expectedMigrations.map((migration) => migration.id),
      applied_migrations: migrations,
      pending_migrations: pending
    },
    uploads: {
      path: uploadDir,
      exists: fs.existsSync(uploadDir)
    },
    shopify
  };
}

module.exports = {
  backupDir,
  createDbBackup,
  latestBackup,
  redactSensitive,
  systemHealth
};
