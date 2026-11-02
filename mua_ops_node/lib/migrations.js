function tableExists(query, table) {
  const row = query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=$table",
    { table }
  )[0];
  return Boolean(row);
}

function ensureSchemaMigrations(exec) {
  exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function hasPendingMigrations({ query, migrations }) {
  if (!tableExists(query, "schema_migrations")) return migrations.length > 0;
  const applied = new Set(query("SELECT id FROM schema_migrations").map((row) => row.id));
  return migrations.some((migration) => !applied.has(migration.id));
}

function ensureColumn({ query, exec }, table, column, definition) {
  const columns = query(`PRAGMA table_info(${table})`).map((row) => row.name);
  if (columns.includes(column)) return false;
  exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

function applyMigrations({ exec, query, migrations }) {
  ensureSchemaMigrations(exec);
  const applied = new Set(query("SELECT id FROM schema_migrations").map((row) => row.id));
  const appliedNow = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    migration.up({ exec, query, ensureColumn: (table, column, definition) => ensureColumn({ query, exec }, table, column, definition) });
    exec(
      "INSERT INTO schema_migrations (id, name) VALUES ($id, $name)",
      { id: migration.id, name: migration.name }
    );
    appliedNow.push(migration.id);
  }
  return appliedNow;
}

module.exports = {
  applyMigrations,
  ensureColumn,
  hasPendingMigrations
};
