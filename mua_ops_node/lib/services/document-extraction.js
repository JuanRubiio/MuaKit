const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");
const { createCanvas } = require("@napi-rs/canvas");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function amount(value) {
  let raw = String(value || "").replace(/[^\d,.-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma > dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (dot > comma) raw = raw.replace(/,/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(day, monthName, year) {
  const months = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
  const normalizedMonth = normalize(monthName);
  const month = months[normalizedMonth.slice(0, 4)] || months[normalizedMonth.slice(0, 3)];
  return month ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
}

function nativePageText(items) {
  const rows = new Map();
  for (const item of items) {
    const y = Math.round(Number(item.transform?.[5] || 0) / 3) * 3;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(item);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0)).map((item) => item.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function detectFields(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const numericDate = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1] || "";
  const namedDate = text.match(/\b(?:paid on|bill created|fecha)\s+([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})/i);
  const spanishDate = text.match(/(?:fecha de la factura\/pago|fecha)\s*\n\s*(\d{1,2})\s+([a-záéíóú]{3,5})\.?\s+(\d{4})/i);
  const month = namedDate ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(namedDate[1].slice(0, 3).toLowerCase()) + 1 : 0;
  const date = spanishDate ? isoDate(spanishDate[1], spanishDate[2], spanishDate[3]) : namedDate && month ? `${namedDate[3]}-${String(month).padStart(2, "0")}-${String(namedDate[2]).padStart(2, "0")}` : numericDate;
  const invoiceNumber = text.match(/\bbill\s*#\s*([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1]
    || text.match(/factura\s+n[uú]mero\s+([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1]
    || text.match(/(?:factura|invoice|n[oº.]|numero|number)\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1] || "";
  const totalCandidates = [];
  for (const line of lines) {
    if (!/\b(grand\s+total|total\s+due|total|importe)\b/i.test(line) || /\b(subtotal|vat|iva|tax)\b/i.test(line)) continue;
    for (const match of line.matchAll(/(?:€\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(EUR|USD)|\$\s*([0-9][0-9.,]*))/gi)) {
      const raw = match[1] || match[2] || match[4];
      totalCandidates.push({ value: amount(raw), currency: match[1] || String(match[3] || "").toUpperCase() === "EUR" ? "EUR" : "USD" });
    }
  }
  if (/Meta Platforms|Meta anuncios|Gastos de Anuncios/i.test(text) && !totalCandidates.length) {
    const standalone = lines.map((line) => line.match(/^([0-9][0-9.,]*)\s*€$/)?.[1]).filter(Boolean);
    if (standalone.length) totalCandidates.push({ value: amount(standalone[0]), currency: "EUR" });
  }
  const selectedTotal = totalCandidates.at(-1) || null;
  const rateMatch = text.match(/\b1\s+(USD|EUR)\s*=\s*([0-9][0-9.,]*)\s+(EUR|USD)\b/i);
  const exchangeRate = rateMatch ? { from: rateMatch[1].toUpperCase(), rate: amount(rateMatch[2]), to: rateMatch[3].toUpperCase() } : null;
  return { invoice_number: invoiceNumber, invoice_date: date, total: selectedTotal?.value ?? null, currency: selectedTotal?.currency || "EUR", exchange_rate: exchangeRate, lines };
}

function detectedInvoiceLines(lines) {
  const excluded = /\b(total|subtotal|vat|iva|tax|payment|paid|billing|bill|address|overview|page \d|learn more|recipient|credit|discount|shipping|mastercard|floor|dublin|spain|transacci[oó]n|umbral de pago|emitido una factura)\b|=|\(\d+\s+items?\)/i;
  return lines.filter((line) => {
    if (line.length > 220 || excluded.test(line)) return false;
    const hasMoney = /(?:€|\$)\s*[0-9][0-9.,]*|[0-9][0-9.,]*\s*(?:€|EUR\b|USD\b)/i.test(line);
    const description = line.replace(/(?:€|\$|EUR|USD|[0-9][0-9.,]*)/gi, " ");
    return hasMoney && /[a-záéíóúñ]{3,}/i.test(description);
  }).slice(0, 100);
}

function parseInvoiceLine(line, fields) {
  const moneyMatches = [...line.matchAll(/(?:€\s*([0-9][0-9.,]*)|\$\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(€|EUR\b|USD\b))/gi)];
  const match = moneyMatches.at(-1);
  if (!match) return null;
  const originalAmount = amount(match[1] || match[2] || match[3]);
  const originalCurrency = match[1] || match[4] === "€" ? "EUR" : match[2] ? "USD" : String(match[4] || fields.currency || "EUR").toUpperCase();
  const targetCurrency = fields.currency || originalCurrency;
  let convertedAmount = originalAmount;
  if (originalCurrency !== targetCurrency && fields.exchange_rate?.rate) {
    if (fields.exchange_rate.from === originalCurrency && fields.exchange_rate.to === targetCurrency) convertedAmount = originalAmount * fields.exchange_rate.rate;
    else if (fields.exchange_rate.to === originalCurrency && fields.exchange_rate.from === targetCurrency) convertedAmount = originalAmount / fields.exchange_rate.rate;
  }
  const description = line
    .replace(match[0], "")
    .replace(/(?:€|\bEUR\b|\bUSD\b)/gi, "")
    .replace(/\s+\d+\s+impresiones\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[·,:;-]+$/, "")
    .trim();
  return {
    description: description || line,
    original_amount: originalAmount,
    original_currency: originalCurrency,
    converted_amount: Number(convertedAmount.toFixed(4)),
    target_currency: targetCurrency,
    exchange_rate: fields.exchange_rate || null
  };
}

function inferExpenseCategory(text, supplierCategory = "", historicalCategories = []) {
  const normalized = normalize(text);
  const signals = [
    ["software", /\b(apps?|software|subscription|suscripcion|license|licencia|hosting|domain|shopify|canva|capcut|globo product options)\b/],
    ["envios", /\b(shipping|shipment|postage|correo|correos|envio|transporte)\b/],
    ["marketing", /\b(marketing|advertising|publicidad|campaign|campana|meta ads|google ads)\b/],
    ["servicios", /\b(agency|agencia|consulting|consultoria|professional service|servicio profesional)\b/],
    ["materiales", /\b(material|jewel|joya|anillo|colgante|cadena|packaging|caja|pipeta|tisu|tissue|shein|aliexpress)\b/]
  ];
  const strong = signals.find(([, pattern]) => pattern.test(normalized))?.[0];
  if (strong) return strong;
  const counts = historicalCategories.reduce((map, category) => map.set(category, (map.get(category) || 0) + 1), new Map());
  const historical = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return historical || supplierCategory || "otros";
}

function createDocumentExtractionService({ query, one, exec, insert, saveDb, audit, UPLOAD_DIR }) {
  const queue = [];
  let running = false;
  const langPath = path.join(path.dirname(UPLOAD_DIR), "ocr-models");
  fs.mkdirSync(langPath, { recursive: true });
  for (const language of ["spa", "eng"]) {
    const source = require.resolve(`@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`);
    const target = path.join(langPath, `${language}.traineddata.gz`);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  }

  async function ocrImage(filePath) {
    const worker = await createWorker("spa+eng", 1, { langPath, cachePath: langPath, gzip: true });
    try {
      const result = await worker.recognize(filePath);
      return { text: result.data.text || "", confidence: Number(result.data.confidence || 0), words: result.data.words || [] };
    } finally {
      await worker.terminate();
    }
  }

  async function extractPdf(filePath) {
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
    if (pdf.numPages > 10) throw new Error("El PDF supera el limite de 10 paginas.");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const started = Date.now();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const nativeText = nativePageText(content.items);
      if (nativeText.length >= 60) {
        pages.push({ page: pageNumber, method: "native", text: nativeText, confidence: 100, duration_ms: Date.now() - started, coordinates: content.items.slice(0, 500).map((item) => ({ text: item.str, transform: item.transform, width: item.width, height: item.height })) });
        continue;
      }
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const temp = path.join(path.dirname(filePath), `ocr-${Date.now()}-${pageNumber}.png`);
      fs.writeFileSync(temp, canvas.toBuffer("image/png"));
      try {
        const ocr = await ocrImage(temp);
        pages.push({ page: pageNumber, method: "ocr", text: ocr.text, confidence: ocr.confidence, duration_ms: Date.now() - started, coordinates: ocr.words.slice(0, 500) });
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    }
    return pages;
  }

  function suggest(fields) {
    const suppliers = query("SELECT id, name, category FROM suppliers WHERE is_deleted=0");
    const normalizedText = normalize(fields.lines.slice(0, 20).join(" "));
    const supplier = suppliers.find((item) => normalizedText.includes(normalize(item.name))) || null;
    const historicalCategories = supplier ? query("SELECT category FROM invoices WHERE supplier_id=$supplier AND is_deleted=0 ORDER BY invoice_date DESC LIMIT 20", { supplier: supplier.id }).map((row) => row.category).filter(Boolean) : [];
    const category = inferExpenseCategory(fields.lines.join(" "), supplier?.category, historicalCategories);
    return { ...fields, category, suggested_supplier_id: supplier?.id || null, suggested_supplier_name: supplier?.name || "" };
  }

  async function process(importId) {
    const item = one(`SELECT ei.*, d.stored_path, d.mime_type FROM expense_imports ei JOIN documents d ON d.id=ei.document_id WHERE ei.id=$id`, { id: importId });
    if (!item) return;
    exec("UPDATE expense_imports SET status='processing', processing_started_at=CURRENT_TIMESTAMP, error_message='', updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: importId });
    saveDb();
    try {
      const pages = item.mime_type === "application/pdf" ? await extractPdf(item.stored_path) : [{ page: 1, method: "ocr", ...(await ocrImage(item.stored_path)), duration_ms: 0 }];
      const fullText = pages.map((page) => page.text).join("\n");
      const fields = suggest(detectFields(fullText));
      const confidence = pages.length ? pages.reduce((sum, page) => sum + Number(page.confidence || 0), 0) / pages.length : 0;
      const status = confidence >= 90 && fields.total !== null ? "ready" : "review";
      if (one("SELECT status FROM expense_imports WHERE id=$id", { id: importId })?.status === "confirmed") return;
      exec(`UPDATE expense_imports SET status=$status, extraction_method=$method, confidence=$confidence,
        detected_fields_json=$fields, pages_json=$pages, warnings_json=$warnings, processing_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, {
        id: importId, status, method: pages.every((page) => page.method === "native") ? "native" : "ocr", confidence,
        fields: JSON.stringify(fields), pages: JSON.stringify(pages), warnings: JSON.stringify(fields.total === null ? ["No se ha detectado un total fiable."] : [])
      });
      exec("DELETE FROM expense_import_lines WHERE expense_import_id=$id", { id: importId });
      [...new Set(detectedInvoiceLines(fields.lines))].forEach((line, index) => {
        const parsedLine = parseInvoiceLine(line, fields);
        if (!parsedLine) return;
        const normalizedLine = normalize(parsedLine.description);
        const material = fields.category === "materiales"
          ? query("SELECT id, name FROM materials WHERE is_deleted=0 ORDER BY LENGTH(name) DESC").find((candidate) => normalizedLine.includes(normalize(candidate.name)))
          : null;
        insert(`INSERT INTO expense_import_lines
          (expense_import_id, position, original_text, description, quantity, unit_price, line_total, suggested_material_id, confidence, human_decision, original_data_json)
          VALUES ($import, $position, $original, $description, 1, $total, $total, $material, $confidence, 'pending', $originalData)`, {
          import: importId, position: index + 1, original: line, description: parsedLine.description, total: parsedLine.converted_amount,
          material: material?.id || null, confidence: material ? 85 : Math.min(confidence, 69), originalData: JSON.stringify(parsedLine)
        });
      });
      audit("expense_import", importId, "process", null, { status, confidence });
    } catch (error) {
      exec("UPDATE expense_imports SET status='error', error_message=$error, processing_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: importId, error: error.message });
      audit("expense_import", importId, "process_error", null, { error: error.message });
    }
    saveDb();
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) await process(queue.shift());
    running = false;
  }

  function enqueue(id) {
    if (!queue.includes(Number(id))) queue.push(Number(id));
    setImmediate(drain);
  }

  exec("UPDATE expense_imports SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE status='processing'");
  for (const row of query("SELECT id FROM expense_imports WHERE status='pending' ORDER BY id")) enqueue(row.id);

  return { enqueue, process, status: () => ({ available: true, languages: ["spa", "eng"], model_path: langPath, pending: queue.length, running }) };
}

module.exports = { createDocumentExtractionService, detectFields, detectedInvoiceLines, parseInvoiceLine, inferExpenseCategory, nativePageText, normalize, amount };
