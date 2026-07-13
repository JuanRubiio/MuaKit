const { ORDER_TYPES, isValidOrderType, orderTypeMeta } = require("../services/order-typologies");
const path = require("path");

let canvasTools = null;
try {
  canvasTools = require("@napi-rs/canvas");
} catch (_) {
  canvasTools = null;
}

const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "public");

function normalizeOrderMaterial(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function orderLineIsSilver(line = {}) {
  const category = normalizeOrderMaterial(line.material_category || "");
  const baseMaterial = normalizeOrderMaterial(line.material_base_material || "");
  const source = normalizeOrderMaterial(`${line.material_name || ""} ${line.title || ""}`);
  const jewelryLike = ["joya", "cadena", "topping"].includes(category);
  if (baseMaterial === "plata") return true;
  if (!jewelryLike) return false;
  if (/\b925\b|\bsterling\b|\bsilver\b/.test(source)) return true;
  if (/\bplata\b/.test(source) && !/\bplatead[oa]s?\b/.test(source)) return true;
  return false;
}

function normalizedText(value = "") {
  return normalizeOrderMaterial(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function shopifyOrderIsPrepared(order = {}) {
  const status = normalizedText(order.fulfillment_status || "");
  if (!status) return false;
  const preparedStatuses = new Set([
    "fulfilled",
    "preparado",
    "preparada",
    "completed",
    "complete",
    "shipped",
    "enviado",
    "entregado"
  ]);
  return preparedStatuses.has(status);
}

function orderPreparationStatus(order = {}) {
  if (shopifyOrderIsPrepared(order)) return "prepared";
  if (order.preparation_sheet_generated_at || order.preparation_sheet_batch_id) return "sheet_generated";
  return "not_prepared";
}

function orderLineIsPreparationCandidate(line = {}) {
  if (Number(line.is_type_marker || 0)) return false;
  if (Number(line.quantity || 0) <= 0) return false;
  const titleText = normalizedText([line.title, line.material_name].join(" "));
  const contextText = normalizedText([
    line.title,
    line.sku,
    line.material_name,
    line.material_category,
    line.material_usage_type,
    line.material_family,
    line.material_subfamily
  ].join(" "));
  if (!contextText) return false;
  const titleBlockers = [
    "te gustaria anadir",
    "topping para tu joya",
    "toping para tu joya",
    "material de la joya",
    "material joya",
    "material para la joya",
    "segundo toping",
    "segundo topping",
    "tercer toping",
    "tercer topping",
    "pigmento",
    "elige",
    "selecciona",
    "opcion",
    "option",
    "personalizacion",
    "personalization",
    "product options",
    "pack premium",
    "pack compartido",
    "kit mua"
  ];
  if (titleBlockers.some((token) => titleText.includes(normalizedText(token)))) return false;
  const contextBlockers = [
    "kit mua",
    "recuerdos de maternidad",
    "recuerdos de mascota",
    "flores y recuerdos de pareja",
    "lugares y viajes",
    "memorial",
    "omoi",
    "joya extra sin kit",
    "caja",
    "pipeta",
    "lampara",
    "papel tisu",
    "nacar",
    "bolsa",
    "recipiente",
    "palo para manipulacion",
    "pinzas",
    "set fijo"
  ];
  if (contextBlockers.some((token) => contextText.includes(token))) return false;
  const positive = [
    "cadena",
    "colgante",
    "anillo",
    "charm",
    "letra",
    "flor",
    "topping",
    "extra",
    "pulsera",
    "pendiente",
    "llavero"
  ];
  if (positive.some((token) => titleText.includes(token))) return true;
  const category = normalizedText(line.material_category || "");
  const usageType = normalizedText(line.material_usage_type || "");
  return Boolean(line.material_id && ["joya", "topping", "extra"].includes(category) && !["packaging", "servicio", "software"].includes(usageType));
}

function orderLineImageUrl(line = {}) {
  return line.material_image_url || line.image_url || line.product_image_url || line.shopify_image_url || "";
}

function resolvePdfImageSource(source = "") {
  const value = String(source || "").trim();
  if (!value) return "";
  if (/^(https?:|data:)/i.test(value)) return value;
  if (path.isAbsolute(value)) return value;
  if (value.startsWith("/")) return path.join(PUBLIC_DIR, value.replace(/^\/+/, ""));
  return path.resolve(PUBLIC_DIR, value);
}

async function loadPdfImage(source = "") {
  if (!canvasTools?.loadImage || !canvasTools?.createCanvas) return null;
  try {
    const image = await canvasTools.loadImage(resolvePdfImageSource(source));
    const maxSide = 96;
    const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
    const width = Math.max(1, Math.round((image.width || 1) * scale));
    const height = Math.max(1, Math.round((image.height || 1) * scale));
    const canvas = canvasTools.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return { width, height, data: canvas.toBuffer("image/jpeg") };
  } catch (_) {
    return null;
  }
}

function preparationStatusMeta(status) {
  if (status === "prepared") return { label: "Preparado", tone: "ok" };
  if (status === "sheet_generated") return { label: "Hoja generada", tone: "warn" };
  return { label: "No preparado", tone: "danger" };
}

function pdfEscape(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

async function createSimplePdf({ title = "Hoja de preparacion", batches = [] }) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const bottom = 38;
  const contentWidth = pageWidth - margin * 2;
  const pageContents = [];
  let content = "";
  let y = pageHeight - margin;
  let pageNumber = 0;
  const generatedAt = new Date().toLocaleString("es-ES");
  const totalOrders = batches.length;
  const totalItems = batches.reduce((sum, order) => sum + (order.items || []).length, 0);
  const totalUnits = batches.reduce((sum, order) => sum + (order.items || []).reduce((inner, item) => inner + Number(item.quantity || 1), 0), 0);
  const color = {
    ink: "0.09 0.08 0.07",
    muted: "0.42 0.39 0.35",
    border: "0.83 0.79 0.73",
    accent: "0.05 0.50 0.43",
    accentSoft: "0.89 0.97 0.95",
    rose: "0.75 0.22 0.36",
    paper: "0.99 0.98 0.96",
    gold: "0.74 0.50 0.16"
  };
  const truncate = (value, max = 84) => {
    const str = String(value || "");
    return str.length > max ? `${str.slice(0, Math.max(0, max - 3))}...` : str;
  };
  const pdfImages = [];
  const pdfImageCache = new Map();
  const getPdfImage = async (source = "") => {
    const value = String(source || "").trim();
    if (!value) return null;
    if (pdfImageCache.has(value)) return pdfImageCache.get(value);
    const image = await loadPdfImage(value);
    if (image) {
      image.name = `Im${pdfImages.length + 1}`;
      pdfImages.push(image);
    }
    pdfImageCache.set(value, image);
    return image;
  };
  const rect = (x, yy, width, height, fill = null, stroke = null, lineWidth = 0.8) => {
    if (fill) content += `q ${fill} rg ${x} ${yy} ${width} ${height} re f Q\n`;
    if (stroke) content += `q ${stroke} RG ${lineWidth} w ${x} ${yy} ${width} ${height} re S Q\n`;
  };
  const drawImage = (image, x, yy, width, height) => {
    if (!image?.name) return;
    content += `q ${width} 0 0 ${height} ${x} ${yy} cm /${image.name} Do Q\n`;
  };
  const textAt = (value, x, yy, size = 10, bold = false, fill = color.ink) => {
    content += `BT /${bold ? "F2" : "F1"} ${size} Tf ${fill} rg ${x} ${yy} Td (${pdfEscape(value)}) Tj ET\n`;
  };
  const finishPage = () => {
    if (content) pageContents.push(content);
  };
  const newPage = () => {
    finishPage();
    pageNumber += 1;
    content = "";
    y = pageHeight - margin;
    rect(0, pageHeight - 78, pageWidth, 78, "0.99 0.98 0.96");
    rect(margin, pageHeight - 66, 5, 36, color.rose);
    textAt("Mua Ops", margin + 16, pageHeight - 42, 16, true);
    textAt(title, margin + 16, pageHeight - 58, 9, false, color.muted);
    textAt(`Pagina ${pageNumber}`, pageWidth - margin - 55, pageHeight - 45, 9, false, color.muted);
    y = pageHeight - 98;
  };
  const ensure = (height) => {
    if (y - height < bottom) newPage();
  };
  const statCard = (x, yy, width, label, value, hint) => {
    rect(x, yy, width, 50, "1 1 1", color.border);
    textAt(label, x + 10, yy + 31, 8, false, color.muted);
    textAt(value, x + 10, yy + 15, 15, true);
    if (hint) textAt(hint, x + 10, yy + 5, 7, false, color.muted);
  };

  newPage();
  textAt("Hoja de preparacion de pedidos", margin, y, 22, true);
  y -= 18;
  textAt(`Generada: ${generatedAt}`, margin, y, 9, false, color.muted);
  y -= 22;
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  statCard(margin, y - 50, cardWidth, "Pedidos", String(totalOrders), "solo no preparados");
  statCard(margin + cardWidth + cardGap, y - 50, cardWidth, "Lineas", String(totalItems), "joyas y extras");
  statCard(margin + (cardWidth + cardGap) * 2, y - 50, cardWidth, "Unidades", String(totalUnits), "a comprobar");
  y -= 74;
  rect(margin, y - 36, contentWidth, 36, color.accentSoft, "0.72 0.89 0.85");
  textAt("Uso recomendado", margin + 12, y - 15, 10, true, color.accent);
  textAt("Marca cada casilla al preparar el paquete. El set fijo no aparece aqui.", margin + 118, y - 15, 9, false, color.ink);
  y -= 56;

  for (const order of batches) {
    const items = order.items || [];
    const orderTitle = order.order_number || `Pedido #${order.order_id}`;
    const orderHeight = 70 + Math.max(items.length, 1) * 39 + 22;
    ensure(Math.min(orderHeight, 230));
    rect(margin, y - 42, contentWidth, 42, color.paper, color.border);
    textAt(truncate(orderTitle, 44), margin + 12, y - 17, 14, true);
    textAt(`Fecha: ${order.order_date || "-"}`, margin + 12, y - 32, 8, false, color.muted);
    textAt(`Tipologia: ${truncate(order.order_type || "Sin clasificar", 34)}`, margin + 154, y - 32, 8, false, color.muted);
    textAt(`${items.length} elementos`, pageWidth - margin - 92, y - 23, 11, true, color.accent);
    y -= 52;

    if (!items.length) {
      rect(margin + 10, y - 30, contentWidth - 20, 30, "1 1 1", color.border);
      textAt("Sin elementos preparables detectados.", margin + 22, y - 18, 9, false, color.muted);
      y -= 42;
    } else {
      for (const item of items) {
        ensure(66);
        const qty = Number(item.quantity || 1);
        const titleText = truncate(item.material_name || item.title || "Elemento", 54);
        const detail = truncate([item.title && item.material_name ? item.title : "", item.sku ? `SKU ${item.sku}` : ""].filter(Boolean).join(" - "), 62);
        const image = await getPdfImage(item.image_url || item.material_image_url || item.product_image_url);
        rect(margin + 10, y - 39, contentWidth - 20, 40, "1 1 1", color.border);
        rect(margin + 22, y - 25, 13, 13, null, color.accent, 1.2);
        rect(margin + 46, y - 33, 28, 28, "0.98 0.96 0.93", "0.88 0.84 0.78");
        if (image) {
          const scale = Math.min(24 / image.width, 24 / image.height);
          const imageWidth = image.width * scale;
          const imageHeight = image.height * scale;
          drawImage(image, margin + 48 + (24 - imageWidth) / 2, y - 31 + (24 - imageHeight) / 2, imageWidth, imageHeight);
        }
        textAt(`${qty}x`, margin + 86, y - 17, 12, true, color.accent);
        textAt(titleText, margin + 124, y - 15, 10, true);
        if (detail) textAt(detail, margin + 124, y - 28, 7, false, color.muted);
        y -= 46;
      }
    }
    rect(margin + 10, y - 30, contentWidth - 20, 30, "1 1 1", "0.88 0.84 0.78");
    textAt("Notas de preparacion:", margin + 22, y - 18, 8, false, color.muted);
    y -= 48;
  }

  if (!batches.length) {
    rect(margin, y - 54, contentWidth, 54, "1 1 1", color.border);
    textAt("No hay pedidos seleccionados para esta hoja.", margin + 18, y - 24, 11, true, color.muted);
    y -= 68;
  }
  finishPage();

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  for (const image of pdfImages) {
    image.objectId = add(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n${image.data.toString("latin1")}\nendstream`);
  }
  const imageResources = pdfImages.length
    ? `/XObject << ${pdfImages.map((image) => `/${image.name} ${image.objectId} 0 R`).join(" ")} >>`
    : "";
  const pageIds = [];
  const contentIds = [];
  for (const page of pageContents) {
    const contentId = add(`<< /Length ${Buffer.byteLength(page, "latin1")} >>\nstream\n${page}endstream`);
    contentIds.push(contentId);
    pageIds.push(null);
  }
  const pagesIdPlaceholder = objects.length + pageContents.length + 1;
  for (let index = 0; index < pageContents.length; index += 1) {
    const pageId = add(`<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> ${imageResources} >> /Contents ${contentIds[index]} 0 R >>`);
    pageIds[index] = pageId;
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function registerKitRoutes(app, ctx) {
  const {
    query,
    exec,
    one,
    n,
    optionalN,
    insert,
    saveDb,
    audit,
    badRequest,
    updateEntity,
    softDelete,
    restore,
    kitRecipes,
    materialCosts
  } = ctx;

  function orderLineHasKnownCost(costMap, materialId) {
    if (!materialId) return true;
    const cost = costMap.get(Number(materialId));
    return Boolean(cost && cost.weighted_avg_unit_cost_inc_vat != null);
  }

  function normalizeOrderLineInclusion(line, costMap) {
    const hasKnownCost = orderLineHasKnownCost(costMap, line.material_id);
    return hasKnownCost ? Number(line.include_in_cost ?? 1) !== 0 : false;
  }

  function normalizeHistoricalOrderLines(costMap) {
    const linesToExclude = query(
      `SELECT id, material_id
       FROM sales_order_lines
       WHERE is_deleted=0
         AND material_id IS NOT NULL
         AND COALESCE(include_in_cost, 1) != 0`
    ).filter((line) => !orderLineHasKnownCost(costMap, line.material_id));
    for (const line of linesToExclude) {
      exec(
        "UPDATE sales_order_lines SET include_in_cost=0, updated_at=CURRENT_TIMESTAMP WHERE id=$id",
        { id: line.id }
      );
    }
  }

  function profitabilityStatus({ hasLines, missingMaterials, missingLineCosts, orderSet, marginPercent, missingTypeDefault, setTypeMismatch }) {
    if (!hasLines) return "missing_lines";
    if (missingTypeDefault || setTypeMismatch || !orderSet) return "missing_set";
    if (missingMaterials) return "missing_materials";
    if (missingLineCosts || orderSet?.missing_cost_items) return "missing_costs";
    if (marginPercent != null && marginPercent < 55) return "low_margin";
    return "complete";
  }

  app.get("/api/kit-recipes", (req, res) => res.json(kitRecipes()));

  app.get("/api/orders/profitability", (req, res) => {
    const fixedSets = kitRecipes();
    const activeSet = fixedSets.find((set) => Number(set.is_default || 0)) || fixedSets[0] || null;
    const costMap = new Map((materialCosts ? materialCosts() : []).map((row) => [Number(row.material_id), row]));
    const fixedSetById = new Map(fixedSets.map((set) => [Number(set.id), set]));
    const typeDefaults = new Map(
      fixedSets
        .filter((set) => set.order_type && Number(set.is_type_default || 0))
        .map((set) => [set.order_type, set])
    );
    normalizeHistoricalOrderLines(costMap);
    const orders = query(
      `SELECT o.*, kr.name AS selected_fixed_set_name, kr.version AS selected_fixed_set_version, COUNT(l.id) AS line_count
       FROM sales_orders o
       LEFT JOIN sales_order_lines l ON l.order_id=o.id AND l.is_deleted=0
       LEFT JOIN kit_recipes kr ON kr.id=o.kit_recipe_id
       WHERE o.is_deleted=0
       GROUP BY o.id
       ORDER BY o.order_date DESC, o.id DESC`
    ).map((order) => {
      const selectedSet = fixedSetById.get(Number(order.kit_recipe_id)) || null;
      const recommendedSet = typeDefaults.get(order.order_type) || null;
      const fallbackSet = !order.order_type ? activeSet : null;
      const orderSet = selectedSet || recommendedSet || fallbackSet;
      const missingTypeDefault = Boolean(order.order_type && !recommendedSet);
      const setTypeMismatch = Boolean(order.order_type && selectedSet?.order_type && selectedSet.order_type !== order.order_type);
      const fixedSetSource = selectedSet ? "manual" : recommendedSet ? "typology" : fallbackSet ? "global_default" : "missing";
      const fixedSetCost = n(orderSet?.known_cost);
      const allLines = query(
        `SELECT l.*, m.name AS material_name, m.category AS material_category,
                m.base_material AS material_base_material,
                m.finish AS material_finish,
                m.usage_type AS material_usage_type,
                m.family AS material_family,
                m.subfamily AS material_subfamily,
                COALESCE(NULLIF(m.image_url_override, ''), (
                  SELECT sp.image_url
                  FROM shopify_products sp
                  WHERE sp.material_id = m.id AND sp.image_url != ''
                  ORDER BY sp.shopify_available_qty DESC, sp.id
                  LIMIT 1
                )) AS material_image_url
         FROM sales_order_lines l
         LEFT JOIN materials m ON m.id=l.material_id
         WHERE l.order_id=$id AND l.is_deleted=0
         ORDER BY l.id`,
        { id: order.id }
      ).map((line) => {
        const cost = costMap.get(Number(line.material_id));
        const unitCost = cost?.weighted_avg_unit_cost_inc_vat ?? null;
        const included = normalizeOrderLineInclusion(line, costMap);
        const totalCost = !included ? 0 : (unitCost == null ? null : unitCost * n(line.quantity, 1));
        return {
          ...line,
          include_in_cost: included ? 1 : 0,
          unit_cost: unitCost,
          total_cost: totalCost,
          is_silver: orderLineIsSilver(line)
        };
      });
      const markerLines = allLines.filter((line) => Number(line.is_type_marker || 0));
      const lines = allLines.filter((line) => !Number(line.is_type_marker || 0));
      const preparationItems = lines.filter(orderLineIsPreparationCandidate);
      const preparationStatus = orderPreparationStatus(order);
      const preparationMeta = preparationStatusMeta(preparationStatus);
      const includedLines = lines.filter((line) => Number(line.include_in_cost ?? 1) !== 0);
      const silverLines = lines.filter((line) => line.is_silver);
      const silverIncludedLines = includedLines.filter((line) => line.is_silver);
      const contentCostKnown = includedLines.reduce((sum, line) => sum + (line.total_cost ?? 0), 0);
      const missingLineCosts = includedLines.filter((line) => line.material_id && line.unit_cost == null).length;
      const missingMaterials = includedLines.filter((line) => !line.material_id).length;
      const hasLines = lines.length > 0;
      const contentCost = hasLines ? contentCostKnown : null;
      const realCost = (contentCost ?? 0) + fixedSetCost;
      const profit = n(order.net_amount) - realCost;
      const marginPercent = n(order.net_amount) ? (profit / n(order.net_amount)) * 100 : null;
      const status = profitabilityStatus({ hasLines, missingMaterials, missingLineCosts, orderSet, marginPercent, missingTypeDefault, setTypeMismatch });
      return {
        ...order,
        lines,
        fixed_set: orderSet,
        recommended_fixed_set: recommendedSet,
        recommended_set: recommendedSet,
        fixed_set_source: fixedSetSource,
        default_set_missing: missingTypeDefault,
        set_type_mismatch: setTypeMismatch,
        requires_set_review: Boolean(missingTypeDefault || setTypeMismatch || (recommendedSet && selectedSet && Number(recommendedSet.id) !== Number(selectedSet.id))),
        set_matches_recommended: Boolean(recommendedSet && orderSet && Number(recommendedSet.id) === Number(orderSet.id)),
        has_manual_set_override: Boolean(selectedSet && recommendedSet && Number(selectedSet.id) !== Number(recommendedSet.id)),
        order_type_meta: orderTypeMeta(order.order_type),
        type_marker_lines: markerLines.map((line) => ({ id: line.id, title: line.title })),
        preparation_status: preparationStatus,
        preparation_status_label: preparationMeta.label,
        preparation_status_tone: preparationMeta.tone,
        preparation_items: preparationItems.map((line) => ({
          id: line.id,
          title: line.title,
          sku: line.sku,
          quantity: line.quantity,
          material_id: line.material_id,
          material_name: line.material_name,
          material_category: line.material_category,
          material_image_url: line.material_image_url,
          image_url: orderLineImageUrl(line),
          product_image_url: line.product_image_url || ""
        })),
        preparation_items_count: preparationItems.length,
        can_generate_preparation_sheet: preparationStatus === "not_prepared" && preparationItems.length > 0,
        fixed_set_options: fixedSets.map((set) => ({
          id: set.id,
          name: set.name,
          version: set.version,
          known_cost: set.known_cost,
          missing_cost_items: set.missing_cost_items,
          is_default: set.is_default,
          order_type: set.order_type,
          is_type_default: set.is_type_default
        })),
        fixed_set_cost: fixedSetCost,
        content_cost: contentCost,
        content_cost_known: contentCostKnown,
        real_cost: realCost,
        profit,
        profit_per_sale_euro: n(order.net_amount) ? profit / n(order.net_amount) : null,
        margin_percent: marginPercent,
        missing_materials: missingMaterials,
        missing_line_costs: missingLineCosts,
        excluded_lines: lines.length - includedLines.length,
        contains_silver: silverLines.length > 0,
        silver_profile: silverLines.length ? (silverLines.length === lines.length ? "silver" : "mixed") : "standard",
        silver_line_count: silverLines.length,
        silver_included_line_count: silverIncludedLines.length,
        status
      };
    });
    const completeOrders = orders.filter((order) => order.status === "complete");
    const silverOrders = orders.filter((order) => order.contains_silver);
    const standardOrders = orders.filter((order) => !order.contains_silver);
    const avg = (values) => values.length ? values.reduce((sum, value) => sum + n(value), 0) / values.length : null;
    res.json({
      active_set: activeSet,
      fixed_sets: fixedSets,
      metrics: {
        total_orders: orders.length,
        orders_with_lines: orders.filter((order) => (order.lines || []).length).length,
        incomplete_orders: orders.filter((order) => order.status !== "complete").length,
        average_ticket: avg(orders.map((order) => order.net_amount)) ?? 0,
        average_fixed_cost: avg(orders.map((order) => order.fixed_set_cost)) ?? 0,
        average_real_cost: avg(completeOrders.map((order) => order.real_cost)),
        average_margin_percent: completeOrders.length ? avg(completeOrders.map((order) => order.margin_percent)) : null,
        average_profit: completeOrders.length ? avg(completeOrders.map((order) => order.profit)) : null,
        complete_orders: completeOrders.length,
        classified_orders: orders.filter((order) => order.order_type).length,
        unclassified_orders: orders.filter((order) => !order.order_type).length,
        configured_order_type_count: typeDefaults.size,
        total_order_type_count: ORDER_TYPES.length,
        missing_type_default_orders: orders.filter((order) => order.default_set_missing).length,
        set_mismatch_orders: orders.filter((order) => order.set_type_mismatch || (order.recommended_fixed_set && !order.set_matches_recommended)).length,
        silver_orders: silverOrders.length,
        standard_orders: standardOrders.length,
        silver_average_margin_percent: avg(silverOrders.filter((order) => order.margin_percent != null).map((order) => order.margin_percent)),
        standard_average_margin_percent: avg(standardOrders.filter((order) => order.margin_percent != null).map((order) => order.margin_percent)),
        silver_average_ticket: avg(silverOrders.map((order) => order.net_amount)),
        standard_average_ticket: avg(standardOrders.map((order) => order.net_amount)),
        silver_average_profit: avg(silverOrders.filter((order) => order.profit != null).map((order) => order.profit)),
        standard_average_profit: avg(standardOrders.filter((order) => order.profit != null).map((order) => order.profit)),
        preparation_not_prepared_orders: orders.filter((order) => order.preparation_status === "not_prepared").length,
        preparation_sheet_generated_orders: orders.filter((order) => order.preparation_status === "sheet_generated").length,
        preparation_prepared_orders: orders.filter((order) => order.preparation_status === "prepared").length,
        preparation_ready_orders: orders.filter((order) => order.can_generate_preparation_sheet).length
      },
      order_types: ORDER_TYPES,
      orders
    });
  });

  app.post("/api/orders/preparation-sheets", (req, res) => {
    const ids = Array.isArray(req.body?.order_ids)
      ? Array.from(new Set(req.body.order_ids.map((id) => Number(id)).filter(Boolean)))
      : [];
    if (!ids.length) return badRequest(res, "Selecciona al menos un pedido no preparado", "ORDER_PREPARATION_EMPTY");

    const selected = [];
    for (const id of ids) {
      const order = one("SELECT * FROM sales_orders WHERE id=$id AND is_deleted=0", { id });
      if (!order) return badRequest(res, `Pedido ${id} no encontrado`, "ORDER_NOT_FOUND");
      const prepStatus = orderPreparationStatus(order);
      if (prepStatus !== "not_prepared") {
        return badRequest(res, `${order.order_number || `Pedido #${id}`} no esta en estado No preparado`, "ORDER_NOT_PREPARABLE");
      }
      const lines = query(
        `SELECT l.*, m.name AS material_name, m.category AS material_category,
                m.usage_type AS material_usage_type, m.family AS material_family, m.subfamily AS material_subfamily,
                COALESCE(NULLIF(m.image_url_override, ''), (
                  SELECT sp.image_url
                  FROM shopify_products sp
                  WHERE sp.material_id = m.id AND sp.image_url != ''
                  ORDER BY sp.shopify_available_qty DESC, sp.id
                  LIMIT 1
                )) AS material_image_url
         FROM sales_order_lines l
         LEFT JOIN materials m ON m.id=l.material_id
         WHERE l.order_id=$id AND l.is_deleted=0
         ORDER BY l.id`,
        { id }
      ).filter(orderLineIsPreparationCandidate);
      if (!lines.length) {
        return badRequest(res, `${order.order_number || `Pedido #${id}`} no tiene joyas, toppings o extras preparables`, "ORDER_PREPARATION_NO_ITEMS");
      }
      selected.push({ order, lines });
    }

    try {
      exec("BEGIN TRANSACTION");
      const reference = `PREP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
      const itemCount = selected.reduce((sum, entry) => sum + entry.lines.length, 0);
      const batchId = insert(
        `INSERT INTO order_preparation_batches (reference, order_count, item_count)
         VALUES ($reference, $orderCount, $itemCount)`,
        { reference, orderCount: selected.length, itemCount }
      );

      for (const { order, lines } of selected) {
        insert(
          `INSERT INTO order_preparation_batch_orders (batch_id, order_id, order_number, order_date, order_type)
           VALUES ($batchId, $orderId, $orderNumber, $orderDate, $orderType)`,
          {
            batchId,
            orderId: order.id,
            orderNumber: order.order_number || "",
            orderDate: order.order_date || "",
            orderType: order.order_type || ""
          }
        );
        for (const line of lines) {
          insert(
            `INSERT INTO order_preparation_batch_items (
               batch_id, order_id, order_line_id, title, material_id, material_name,
               material_category, quantity, sku, image_url, notes
             ) VALUES (
               $batchId, $orderId, $lineId, $title, $materialId, $materialName,
               $materialCategory, $quantity, $sku, $imageUrl, $notes
             )`,
            {
              batchId,
              orderId: order.id,
              lineId: line.id,
              title: line.title || "",
              materialId: line.material_id || null,
              materialName: line.material_name || "",
              materialCategory: line.material_category || "",
              quantity: n(line.quantity, 1),
              sku: line.sku || "",
              imageUrl: orderLineImageUrl(line),
              notes: ""
            }
          );
        }
        const before = { ...order };
        exec(
          `UPDATE sales_orders
           SET preparation_sheet_generated_at=CURRENT_TIMESTAMP,
               preparation_sheet_batch_id=$batchId,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$id`,
          { id: order.id, batchId }
        );
        const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: order.id });
        audit("sales_order", order.id, "preparation_sheet_generated", before, after);
      }
      const batch = one("SELECT * FROM order_preparation_batches WHERE id=$id", { id: batchId });
      audit("order_preparation_batch", batchId, "create", null, batch);
      exec("COMMIT");
      saveDb();
      return res.json({
        batch,
        pdf_url: `/api/orders/preparation-sheets/${batchId}.pdf`,
        order_ids: selected.map((entry) => entry.order.id),
        item_count: itemCount
      });
    } catch (error) {
      try { exec("ROLLBACK"); } catch (_) {}
      console.error("Error generating order preparation sheet", error);
      return res.status(500).json({ error: "No se pudo generar la hoja de preparacion" });
    }
  });

  app.get("/api/orders/preparation-sheets/:id.pdf", async (req, res) => {
    const batch = one("SELECT * FROM order_preparation_batches WHERE id=$id", { id: req.params.id });
    if (!batch) return res.status(404).json({ error: "Hoja de preparacion no encontrada" });
    const batchOrders = query(
      `SELECT *
       FROM order_preparation_batch_orders
       WHERE batch_id=$id
      ORDER BY order_date, order_number, id`,
      { id: batch.id }
    );
    const lineColumns = new Set(query("PRAGMA table_info(sales_order_lines)").map((column) => column.name));
    const materialColumns = new Set(query("PRAGMA table_info(materials)").map((column) => column.name));
    const lineImageColumns = ["material_id", "image_url", "product_image_url", "shopify_image_url", "material_image_url"]
      .filter((column) => lineColumns.has(column));
    const materialImageColumns = ["image_url_override", "image_url"].filter((column) => materialColumns.has(column));
    const rawItems = query(
      `SELECT *
       FROM order_preparation_batch_items
       WHERE batch_id=$id
       ORDER BY order_id, id`,
      { id: batch.id }
    );
    const items = rawItems.map((item) => {
      let imageUrl = orderLineImageUrl(item);
      let materialId = Number(item.material_id || 0);
      if ((!imageUrl || !materialId) && item.order_line_id && lineImageColumns.length) {
        const line = one(
          `SELECT ${lineImageColumns.join(", ")}
           FROM sales_order_lines
           WHERE id=$id`,
          { id: item.order_line_id }
        ) || {};
        imageUrl = imageUrl || orderLineImageUrl(line);
        materialId = materialId || Number(line.material_id || 0);
      }
      if (!imageUrl && materialId && materialImageColumns.length) {
        const material = one(
          `SELECT ${materialImageColumns.join(", ")}
           FROM materials
           WHERE id=$id`,
          { id: materialId }
        ) || {};
        imageUrl = material.image_url_override || material.image_url || "";
      }
      if (!imageUrl && materialId) {
        try {
          const product = one(
            `SELECT image_url
             FROM shopify_products
             WHERE material_id=$id AND NULLIF(image_url, '') IS NOT NULL
             ORDER BY shopify_available_qty DESC, id DESC
             LIMIT 1`,
            { id: materialId }
          );
          imageUrl = product?.image_url || "";
        } catch (_) {}
      }
      return { ...item, image_url: imageUrl };
    }).filter(orderLineIsPreparationCandidate);
    const itemsByOrder = new Map();
    for (const item of items) {
      const key = Number(item.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key).push(item);
    }
    const pdf = await createSimplePdf({
      title: `Hoja de preparacion ${batch.reference || `#${batch.id}`}`,
      batches: batchOrders.map((order) => ({
        ...order,
        items: itemsByOrder.get(Number(order.order_id)) || []
      }))
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${batch.reference || `preparacion-${batch.id}`}.pdf"`);
    res.send(pdf);
  });

  app.patch("/api/orders/:id/type", (req, res) => {
    const before = one("SELECT * FROM sales_orders WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!before) return res.status(404).json({ error: "Pedido no encontrado" });
    const orderType = String(req.body?.order_type || "");
    if (orderType && !isValidOrderType(orderType)) return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    const recommended = orderType
      ? one(`SELECT * FROM kit_recipes
             WHERE is_deleted=0 AND order_type=$orderType AND is_type_default=1
             ORDER BY id DESC LIMIT 1`, { orderType })
      : null;
    const applyRecommended = Boolean(req.body?.apply_recommended_set);
    exec(`UPDATE sales_orders
          SET order_type=$orderType, order_type_source='manual', order_type_confidence=1,
              kit_recipe_id=CASE WHEN $applyRecommended=1 THEN $recipeId ELSE kit_recipe_id END,
              updated_at=CURRENT_TIMESTAMP
          WHERE id=$id`, {
      id: req.params.id,
      orderType: orderType || null,
      applyRecommended: applyRecommended ? 1 : 0,
      recipeId: recommended?.id || null
    });
    const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: req.params.id });
    audit("sales_order", req.params.id, applyRecommended ? "order_type_and_set_update" : "order_type_update", before, after);
    saveDb();
    res.json({ ...after, recommended_kit_recipe_id: recommended?.id || null });
  });

  app.patch("/api/orders/:id/fixed-set", (req, res) => {
    const order = one("SELECT * FROM sales_orders WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!order) return res.status(404).json({ error: "Pedido no encontrado" });
    const recipeId = optionalN(req.body?.kit_recipe_id);
    if (recipeId) {
      const recipe = one("SELECT * FROM kit_recipes WHERE id=$id AND is_deleted=0", { id: recipeId });
      if (!recipe) return badRequest(res, "Set fijo no encontrado", "KIT_RECIPE_NOT_FOUND");
    }
    exec("UPDATE sales_orders SET kit_recipe_id=$recipeId, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: req.params.id, recipeId });
    const after = one("SELECT * FROM sales_orders WHERE id=$id", { id: req.params.id });
    audit("sales_order", req.params.id, "fixed_set_update", order, after);
    saveDb();
    res.json(after);
  });

  app.patch("/api/order-lines/:id/include", (req, res) => {
    const before = one("SELECT * FROM sales_order_lines WHERE id=$id AND is_deleted=0", { id: req.params.id });
    if (!before) return res.status(404).json({ error: "Linea de pedido no encontrada" });
    const include = req.body?.include_in_cost === undefined ? !Number(before.include_in_cost ?? 1) : Boolean(req.body.include_in_cost);
    if (include) {
      const costMap = new Map((materialCosts ? materialCosts() : []).map((row) => [Number(row.material_id), row]));
      if (!normalizeOrderLineInclusion({ ...before, include_in_cost: 1 }, costMap)) {
        return badRequest(res, "No se puede incluir una línea sin coste registrado", "ORDER_LINE_COST_REQUIRED");
      }
    }
    exec("UPDATE sales_order_lines SET include_in_cost=$include, updated_at=CURRENT_TIMESTAMP WHERE id=$id", {
      id: req.params.id,
      include: include ? 1 : 0
    });
    const after = one("SELECT * FROM sales_order_lines WHERE id=$id", { id: req.params.id });
    audit("sales_order_line", req.params.id, include ? "include_in_cost" : "exclude_from_cost", before, after);
    saveDb();
    res.json(after);
  });

  app.post("/api/kit-recipes", (req, res) => {
    if (req.body.is_default) exec("UPDATE kit_recipes SET is_default=0");
    const orderType = String(req.body.order_type || "");
    if (!isValidOrderType(orderType)) return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    if (req.body.is_type_default && orderType) {
      exec("UPDATE kit_recipes SET is_type_default=0 WHERE order_type=$orderType", { orderType });
    }
    const id = insert(
      `INSERT INTO kit_recipes (name, version, is_complete, is_default, order_type, is_type_default, notes)
       VALUES ($name, $version, $isComplete, $isDefault, $orderType, $isTypeDefault, $notes)`,
      {
        name: req.body.name,
        version: req.body.version || "",
        isComplete: req.body.is_complete ? 1 : 0,
        isDefault: req.body.is_default ? 1 : 0,
        orderType,
        isTypeDefault: req.body.is_type_default ? 1 : 0,
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
      is_complete: req.body.is_complete === undefined ? undefined : (req.body.is_complete ? 1 : 0),
      is_default: req.body.is_default === undefined ? undefined : (req.body.is_default ? 1 : 0)
      ,is_type_default: req.body.is_type_default === undefined ? undefined : (req.body.is_type_default ? 1 : 0)
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    if (payload.is_default) exec("UPDATE kit_recipes SET is_default=0 WHERE id!=$id", { id: req.params.id });
    if (payload.order_type !== undefined && !isValidOrderType(String(payload.order_type || ""))) {
      return badRequest(res, "Tipologia de pedido no valida", "ORDER_TYPE_INVALID");
    }
    const current = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    const targetType = payload.order_type === undefined ? String(current?.order_type || "") : String(payload.order_type || "");
    if (payload.is_type_default && targetType) {
      exec("UPDATE kit_recipes SET is_type_default=0 WHERE order_type=$orderType AND id!=$id", { orderType: targetType, id: req.params.id });
    }
    updateEntity("kit_recipes", "kit_recipe", req.params.id, payload, ["name", "version", "is_complete", "is_default", "order_type", "is_type_default", "notes"], res);
  });

  app.delete("/api/kit-recipes/:id", (req, res) => softDelete("kit_recipes", "kit_recipe", req.params.id, res));
  app.post("/api/kit-recipes/:id/restore", (req, res) => restore("kit_recipes", "kit_recipe", req.params.id, res));

  app.post("/api/kit-recipes/:id/items", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.id });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const itemId = insert(
      `INSERT INTO kit_recipe_items (recipe_id, material_id, quantity, include_in_cost, notes)
       VALUES ($recipe, $material, $quantity, $include, $notes)`,
      {
        recipe: req.params.id,
        material: optionalN(req.body.material_id),
        quantity: n(req.body.quantity, 1),
        include: req.body.include_in_cost === undefined ? 1 : (req.body.include_in_cost ? 1 : 0),
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
    const payload = {
      ...req.body,
      include_in_cost: req.body.include_in_cost === undefined ? undefined : (req.body.include_in_cost ? 1 : 0)
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    updateEntity("kit_recipe_items", "kit_recipe_item", req.params.itemId, payload, ["material_id", "quantity", "include_in_cost", "notes"], res);
  });

  app.patch("/api/kit-recipes/:recipeId/items/:itemId/include", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (!recipe || recipe.is_deleted) return res.status(404).json({ error: "Set fijo no encontrado" });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    const before = one("SELECT * FROM kit_recipe_items WHERE id=$id AND recipe_id=$recipeId AND is_deleted=0", {
      id: req.params.itemId,
      recipeId: req.params.recipeId
    });
    if (!before) return res.status(404).json({ error: "Componente no encontrado" });
    const include = req.body?.include_in_cost === undefined ? !Number(before.include_in_cost ?? 1) : Boolean(req.body.include_in_cost);
    exec("UPDATE kit_recipe_items SET include_in_cost=$include, updated_at=CURRENT_TIMESTAMP WHERE id=$id", {
      id: req.params.itemId,
      include: include ? 1 : 0
    });
    const after = one("SELECT * FROM kit_recipe_items WHERE id=$id", { id: req.params.itemId });
    audit("kit_recipe_item", req.params.itemId, include ? "include_in_cost" : "exclude_from_cost", before, after);
    saveDb();
    res.json(after);
  });

  app.delete("/api/kit-recipes/:recipeId/items/:itemId", (req, res) => {
    const recipe = one("SELECT * FROM kit_recipes WHERE id=$id", { id: req.params.recipeId });
    if (recipe?.is_complete) return badRequest(res, "El kit esta marcado como completo", "KIT_COMPLETE");
    softDelete("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });

  app.post("/api/kit-recipes/:recipeId/items/:itemId/restore", (req, res) => {
    restore("kit_recipe_items", "kit_recipe_item", req.params.itemId, res);
  });
}

module.exports = { registerKitRoutes, orderLineIsPreparationCandidate };
