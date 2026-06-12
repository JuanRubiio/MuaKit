const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");
const { createCanvas } = require("@napi-rs/canvas");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function amount(value) {
  const parsed = Number(String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function detectFields(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const date = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1] || "";
  const invoiceNumber = text.match(/(?:factura|invoice|n[oº.]|numero|number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1] || "";
  const totalMatches = [...text.matchAll(/(?:total|importe)\s*[: ]+\s*([0-9.,]+)\s*(?:€|eur)?/gi)];
  const total = amount(totalMatches.at(-1)?.[1]);
  return { invoice_number: invoiceNumber, invoice_date: date, total, currency: /usd|\$/i.test(text) ? "USD" : "EUR", lines };
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
      const nativeText = content.items.map((item) => item.str).join(" ").trim();
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
    const suppliers = query("SELECT id, name FROM suppliers WHERE is_deleted=0");
    const normalizedText = normalize(fields.lines.slice(0, 12).join(" "));
    const supplier = suppliers.find((item) => normalizedText.includes(normalize(item.name))) || null;
    return { ...fields, suggested_supplier_id: supplier?.id || null, suggested_supplier_name: supplier?.name || "" };
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
      fields.lines.filter((line) => /\d+[.,]\d{2}/.test(line)).slice(0, 100).forEach((line, index) => {
        const values = [...line.matchAll(/(\d+[.,]\d{2})/g)].map((match) => amount(match[1])).filter((value) => value !== null);
        const total = values.at(-1) || 0;
        const normalizedLine = normalize(line);
        const material = query("SELECT id, name FROM materials WHERE is_deleted=0 ORDER BY LENGTH(name) DESC")
          .find((candidate) => normalizedLine.includes(normalize(candidate.name)));
        insert(`INSERT INTO expense_import_lines
          (expense_import_id, position, original_text, description, quantity, line_total, suggested_material_id, confidence, human_decision, original_data_json)
          VALUES ($import, $position, $original, $description, 1, $total, $material, $confidence, 'pending', $originalData)`, {
          import: importId, position: index + 1, original: line, description: line, total,
          material: material?.id || null, confidence: material ? 85 : Math.min(confidence, 69), originalData: JSON.stringify({ values })
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

module.exports = { createDocumentExtractionService, detectFields, normalize };
