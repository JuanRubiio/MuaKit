const ORDER_TYPES = Object.freeze([
  { code: "maternity", label: "Recuerdos de maternidad", shortLabel: "Maternidad", icon: "icon-heart" },
  { code: "pet", label: "Recuerdos de mascota", shortLabel: "Mascota", icon: "icon-paw" },
  { code: "couple", label: "Flores y recuerdos de pareja", shortLabel: "Pareja y flores", icon: "icon-sparkles" },
  { code: "travel", label: "Lugares y viajes", shortLabel: "Lugares y viajes", icon: "icon-map" },
  { code: "memorial", label: "Memorial", shortLabel: "Memorial", icon: "icon-flame" },
  { code: "omoi", label: "Omoi", shortLabel: "Omoi", icon: "icon-gem" },
  { code: "extra_jewel", label: "Joya extra sin kit", shortLabel: "Joya extra", icon: "icon-gem" }
]);

const TYPE_BY_CODE = new Map(ORDER_TYPES.map((type) => [type.code, type]));

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RULES = [
  { code: "extra_jewel", score: 100, patterns: [/\bjoya extra\b/, /\bsin kit\b/, /\bextra jewel\b/] },
  { code: "omoi", score: 100, patterns: [/\bomoi\b/] },
  { code: "maternity", score: 95, patterns: [/\bmaternidad\b/, /\bmaternal\b/, /\bleche materna\b/, /\blactancia\b/, /\bembarazo\b/] },
  { code: "pet", score: 95, patterns: [/\bmascotas?\b/, /\banimales?\b/, /\brecuerdo.*huella\b/] },
  { code: "couple", score: 90, patterns: [/\bpareja\b/, /\bflores?\b/, /\bramo\b/, /\bboda\b/] },
  { code: "travel", score: 90, patterns: [/\blugares?\b/, /\bviajes?\b/, /\bcoordenadas?\b/, /\bmapa\b/] },
  { code: "memorial", score: 90, patterns: [/\bmemorial\b/, /\bcenizas?\b/, /\bin memoriam\b/] }
];

function isOrderTypeMarkerTitle(title = "") {
  const value = normalize(title);
  if (!value) return false;
  const conceptualPrefix = /^(kit|recuerdos?|omoi|joya extra|mua kit|kit mua)\b/.test(value);
  const containsExplicitType = RULES.some((rule) => rule.patterns.some((pattern) => pattern.test(value)));
  return conceptualPrefix && containsExplicitType;
}

function detectOrderType(lines = []) {
  const candidates = [];
  for (const line of lines || []) {
    const value = normalize(line?.title || line?.name || "");
    if (!value) continue;
    for (const rule of RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(value))) continue;
      const marker = isOrderTypeMarkerTitle(value);
      candidates.push({
        code: rule.code,
        score: Math.min(100, rule.score + (marker ? 5 : 0)),
        marker,
        lineId: line?.id ?? line?.external_id ?? null,
        evidence: String(line?.title || line?.name || "")
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || Number(b.marker) - Number(a.marker));
  const winner = candidates[0];
  if (!winner) return { code: "", confidence: 0, source: "unclassified", evidence: "", markerIds: [] };
  return {
    code: winner.code,
    confidence: winner.score / 100,
    source: "automatic",
    evidence: winner.evidence,
    markerIds: candidates.filter((item) => item.marker && item.code === winner.code).map((item) => item.lineId).filter(Boolean)
  };
}

function inferRecipeOrderType(recipe = {}) {
  const value = normalize(`${recipe.name || ""} ${recipe.version || ""} ${recipe.notes || ""}`);
  if (!value) return "";
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(value))) return rule.code;
  }
  return "";
}

function orderTypeMeta(code) {
  return TYPE_BY_CODE.get(String(code || "")) || {
    code: "",
    label: "Sin clasificar",
    shortLabel: "Sin clasificar",
    icon: "icon-alert"
  };
}

function isValidOrderType(code) {
  return !code || TYPE_BY_CODE.has(String(code));
}

module.exports = {
  ORDER_TYPES,
  detectOrderType,
  inferRecipeOrderType,
  isOrderTypeMarkerTitle,
  isValidOrderType,
  orderTypeMeta
};
