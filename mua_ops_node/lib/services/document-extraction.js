const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

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

function parseImpressions(value) {
  const match = String(value || "").match(/\b(\d{1,3}(?:[ .]\d{3})+|\d+)\s+impresi[oó]n(?:es)?\b/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/[ .]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isoDate(day, monthName, year) {
  const months = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
  const normalizedMonth = normalize(monthName);
  const month = months[normalizedMonth.slice(0, 4)] || months[normalizedMonth.slice(0, 3)];
  return month ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
}

function numericDateToIso(value) {
  const match = String(value || "").match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  return match ? `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}` : "";
}

function aliExpressMoney(value, referenceTotal = null) {
  const raw = String(value || "").trim();
  const parsed = amount(raw);
  if (parsed === null) return null;
  if (!/[,.]/.test(raw) && referenceTotal !== null && parsed > Number(referenceTotal) * 2) return parsed / 100;
  return parsed;
}

function compactEuroMoney(value, expected = null) {
  const raw = String(value || "").trim();
  if (!/\d/.test(raw)) return null;
  const parsed = amount(raw);
  if (parsed === null) return null;
  if (/[,.]/.test(raw)) return parsed;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 2) return parsed;
  const candidates = [parsed, Number((parsed / 10).toFixed(2)), Number((parsed / 100).toFixed(2))];
  if (expected !== null && Number.isFinite(Number(expected))) {
    const expectedAmount = Number(Number(expected).toFixed(2));
    const closest = candidates.sort((a, b) => Math.abs(a - expectedAmount) - Math.abs(b - expectedAmount))[0];
    return Math.abs(closest - expectedAmount) <= 0.05 ? expectedAmount : closest;
  }
  if (digits.length >= 3) return Number((parsed / 100).toFixed(2));
  return parsed;
}

function aliExpressFields(lines) {
  if (!lines.some((line) => /aliexpress/i.test(line))) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const valueAfterLabel = (pattern) => findLine(pattern).replace(pattern, "").trim();
  const paymentTotal = findLine(/\bEUR\s+[0-9][0-9.,]*\b/i).match(/\bEUR\s+([0-9][0-9.,]*)\b/i)?.[1];
  const totalRaw = valueAfterLabel(/^\s*total\s*:\s*/i);
  const total = aliExpressMoney(totalRaw || paymentTotal);
  const statedSubtotal = aliExpressMoney(valueAfterLabel(/^\s*subtotal\s*:\s*/i), total);
  const discount = aliExpressMoney(valueAfterLabel(/^\s*todos los descuentos\s*:\s*/i), total);
  const shipping = aliExpressMoney(valueAfterLabel(/^\s*tarifa de env[ií]o\s*:\s*/i), total);
  const tax = aliExpressMoney(findLine(/\bI?VA incluido\b/i).match(/([0-9][0-9.,]*)\s*€/)?.[1], total);
  const orderNumber = findLine(/^\s*[i1]d de pedido\s*:/i).match(/:\s*([0-9]{8,})/)?.[1] || "";
  const dateMatch = findLine(/^\s*tiempo de la orden\s*:/i).match(/(\d{1,2})\s*([a-záéíóú]{3,5})\.?,?\s*(\d{4})/i);
  const invoiceDate = dateMatch ? isoDate(dateMatch[1], dateMatch[2], dateMatch[3]) : "";
  const subtotal = statedSubtotal ?? (total !== null && discount !== null ? Number((total + discount - Number(shipping || 0)).toFixed(2)) : null);
  return {
    invoice_number: orderNumber,
    invoice_date: invoiceDate,
    total,
    currency: "EUR",
    subtotal,
    discount,
    shipping,
    tax
  };
}

function englishDateToIso(value) {
  const match = String(value || "").match(/\b([A-Z][a-z]{2,8})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  return match ? isoDate(match[2], match[1], match[3]) : "";
}

function alibabaFields(lines) {
  const text = lines.join("\n");
  const normalizedText = normalize(text);
  if (!/\balibaba(?:\s+com|com)?\b/.test(normalizedText) || !/\breceipt\b/.test(normalizedText)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const receiptNumber = text.match(/\bReceipt\s+number\s*:\s*#?\s*([0-9]{8,})/i)?.[1] || "";
  const orderNumber = text.match(/\bOrder\s+number\s*:\s*#?\s*([0-9]{8,})/i)?.[1] || "";
  const paidDate = text.match(/\bPaid\s+on\s+([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/i)?.[1] || "";
  const receiptDate = text.match(/\bReceipt\s+date\s*:\s*(?:[0-9:]+\s*(?:AM|PM),?\s*)?([A-Z][a-z]{2,8}\s+\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  const receiptDateText = receiptDate ? `${receiptDate[1]}, ${receiptDate[2]}` : "";
  const subtotal = amount(findLine(/^\s*Subtotal\s+EUR\b/i).match(/\bEUR\s+([0-9][0-9.,]*)/i)?.[1]);
  const shippingFee = amount(findLine(/^\s*Shipping\s+fee\s+EUR\b/i).match(/\bEUR\s+([0-9][0-9.,]*)/i)?.[1]) || 0;
  const processingFee = amount(findLine(/^\s*Payment\s+processing\s+fee\s+EUR\b/i).match(/\bEUR\s+([0-9][0-9.,]*)/i)?.[1]) || 0;
  const orderTotal = amount(findLine(/^\s*Order\s+total\s+EUR\b/i).match(/\bEUR\s+([0-9][0-9.,]*)/i)?.[1]);
  const amountPaidIndex = lines.findIndex((line) => /^\s*Amount\s+paid\s*$/i.test(line));
  const paidTotal = amountPaidIndex >= 0 ? amount(lines[amountPaidIndex + 1]?.match(/\bEUR\s+([0-9][0-9.,]*)\b/i)?.[1] || lines[amountPaidIndex + 1]) : null;
  return {
    invoice_number: receiptNumber || orderNumber,
    invoice_date: englishDateToIso(paidDate) || englishDateToIso(receiptDateText),
    subtotal,
    discount: 0,
    shipping: Number((shippingFee + processingFee).toFixed(2)),
    shipping_fee: shippingFee,
    processing_fee: processingFee,
    tax: 0,
    total: paidTotal ?? orderTotal,
    currency: "EUR",
    category: "materiales",
    supplier_hint: "alibaba"
  };
}

function etsyFields(lines) {
  const text = lines.join("\n");
  if (!/etsy\.com\/.+\/purchases\/|pedido\s+n\.?\s*[º°]\s*\d+/i.test(text)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const orderNumber = text.match(/pedido\s+n\.?\s*[º°]\s*(\d{6,})/i)?.[1] || "";
  const dateMatch = text.match(/(?:comprado|pagado)\s+el\s+(\d{1,2})\s+([a-záéíóú]{3,5})\.?\s+(\d{4})/i);
  const value = (pattern) => amount(findLine(pattern).match(/([0-9][0-9.,]*)\s*€/)?.[1]);
  return {
    invoice_number: orderNumber,
    invoice_date: dateMatch ? isoDate(dateMatch[1], dateMatch[2], dateMatch[3]) : "",
    subtotal: value(/^total de los art[ií]culos\b/i),
    discount: value(/^descuento\b/i) || 0,
    shipping: value(/^env[ií]o\b/i) || 0,
    tax: value(/^(?:impuestos|iva)\b/i) || 0,
    total: value(/^total\s+[0-9]/i),
    currency: "EUR"
  };
}

function sheinFields(lines) {
  const text = lines.join("\n");
  if (!/infinite styles services/i.test(text) || !/\bVAT Invoice\b/i.test(text)) return null;
  const invoiceNumber = text.match(/\b(XES\d{12,}(?:_\d+)?)\b/i)?.[1] || "";
  const invoiceDate = lines.find((line, index) => index > 0 && /invoice date/i.test(lines[index - 1]))?.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1]
    || text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] || "";
  const totalRows = lines.filter((line) => /^TOTAL\s+[0-9]/i.test(line));
  const summary = totalRows[0]?.match(/^TOTAL\s+([0-9][0-9.,]*)\s+([0-9][0-9.,]*)\s+([0-9][0-9.,]*)/i);
  return {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    subtotal: amount(summary?.[1]),
    discount: 0,
    shipping: 0,
    tax: amount(summary?.[2]),
    total: amount(summary?.[3]),
    currency: "EUR"
  };
}

function capcutFields(lines) {
  const text = lines.join("\n");
  if (!/\bcapcut\b/i.test(text)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const leadingDate = lines.find((line) => /^\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}$/i.test(line)) || "";
  const leadingDateMatch = leadingDate.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})$/i);
  const renewalDateMatch = text.match(/se renueva el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  const documentNumber = findLine(/^\s*documento\s*:/i).match(/:\s*([A-Z0-9-]{6,})/i)?.[1]
    || findLine(/^\s*secuencia\s*:/i).match(/:\s*([A-Z0-9-]{6,})/i)?.[1]
    || "";
  const capcutLine = findLine(/\bcapcut\b.*[0-9][0-9.,]*\s*€/i);
  const paymentLine = findLine(/\bapple pay\b.*[0-9][0-9.,]*\s*€/i);
  const total = amount(paymentLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1] || capcutLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1]);
  const taxRaw = findLine(/\bVAT\b/i).match(/(?:VAT(?: del \d+ ?%)?\s*)([0-9][0-9.,]*)\s*€/i)?.[1];
  const tax = aliExpressMoney(taxRaw, total);
  const rawSubtotal = findLine(/\bsubtotal\b/i).match(/subtotal\s+([0-9][0-9.,]*)\s*€/i)?.[1];
  const subtotal = compactEuroMoney(rawSubtotal, total !== null && tax !== null ? Number((total - tax).toFixed(2)) : null);
  return {
    invoice_number: documentNumber,
    invoice_date: leadingDateMatch ? isoDate(leadingDateMatch[1], leadingDateMatch[2], leadingDateMatch[3])
      : renewalDateMatch ? isoDate(renewalDateMatch[1], renewalDateMatch[2], renewalDateMatch[3])
      : "",
    subtotal,
    discount: 0,
    shipping: 0,
    tax,
    total,
    currency: "EUR",
    supplier_hint: "capcut"
  };
}

function canvaFields(lines) {
  const text = lines.join("\n");
  const normalizedText = normalize(text);
  if (!/\bcanva\b/.test(normalizedText)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const amountFromLine = (pattern) => amount(findLine(pattern).match(/([0-9][0-9.,]*)\s*(?:\u20ac|EUR|â‚¬)/i)?.[1]);
  const headerIndex = lines.findIndex((line) => /fecha de factura/i.test(line) && /(?:nro\.?\s+de factura|invoice number)/i.test(line));
  const headerValueMatch = (headerIndex >= 0 ? lines[headerIndex + 1] || "" : text)
    .match(/(\d{1,2})\s+de\s+([a-zÃ¡Ã©Ã­Ã³Ãº]+)\s+de\s+(\d{4})\s+([A-Z0-9-]{6,})/i);
  const invoiceNumber = headerValueMatch?.[4]
    || text.match(/\b(?:nro\.?\s+de factura|numero de factura|invoice number)\s*[:#]?\s*([A-Z0-9-]{6,})/i)?.[1]
    || "";
  const invoiceDate = headerValueMatch ? isoDate(headerValueMatch[1], headerValueMatch[2], headerValueMatch[3]) : "";
  const total = amountFromLine(/^\s*importe total\b/i)
    ?? amountFromLine(/^\s*total\b/i)
    ?? amount(findLine(/\bcanva\b.*[0-9][0-9.,]*\s*(?:\u20ac|EUR|â‚¬)/i).match(/([0-9][0-9.,]*)\s*(?:\u20ac|EUR|â‚¬)/i)?.[1]);
  const tax = amountFromLine(/^\s*impuestos incluidos\b/i) || 0;
  return {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    subtotal: total,
    discount: 0,
    shipping: 0,
    tax,
    total,
    currency: "EUR",
    category: "software",
    supplier_hint: "canva"
  };
}

function appleFields(lines) {
  const text = lines.join("\n");
  const normalizedText = normalize(text);
  if (/\bcapcut\b/.test(normalizedText)) return null;
  if (!/\b(cuenta de apple|app store|icloud|cloud|apple pay|tu factura)\b/.test(normalizedText)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const findAfter = (pattern) => {
    const index = lines.findIndex((line) => pattern.test(line));
    return index >= 0 ? lines[index + 1] || "" : "";
  };
  const leadingDate = lines.find((line) => /^\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}$/i.test(line)) || "";
  const leadingDateMatch = leadingDate.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})$/i);
  const invoiceDateRow = findAfter(/factura\s+fecha\s+de\s+emisi[oó]n/i);
  const invoiceDateMatch = invoiceDateRow.match(/([A-Z0-9-]{5,})\s+(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})/i);
  const slashDateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  const documentNumber = findLine(/^\s*documento\s*:/i).match(/:\s*([A-Z0-9-]{6,})/i)?.[1]
    || findAfter(/n[uú]mero del documento/i).match(/\b([0-9]{10,})\b/)?.[1]
    || invoiceDateMatch?.[1]
    || "";
  const totalLine = findLine(/^\s*total\b/i);
  const paidLine = findLine(/\b(?:apple pay|cobrado)\b.*[0-9][0-9.,]*\s*€/i);
  const standaloneTotal = lines.find((line) => /^[0-9][0-9.,]*\s*€$/i.test(line)) || "";
  const productLine = lines.find((line) => /\b(?:icloud|cloud|meta verified|precio de la suscripci[oó]n)\b/i.test(line) && /[0-9][0-9.,]*\s*€/i.test(line) && !/\b(?:incluye|iva|vat|total|subtotal)\b/i.test(line)) || "";
  const totalRaw = totalLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1]
    || paidLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1]
    || standaloneTotal.match(/([0-9][0-9.,]*)\s*€/i)?.[1]
    || productLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1]
    || "";
  const total = compactEuroMoney(totalRaw);
  const taxRaw = lines.find((line) => /\b(?:VAT|IVA)\b/i.test(line))?.match(/([0-9][0-9.,]*)\s*€/i)?.[1] || "";
  const tax = compactEuroMoney(taxRaw);
  const subtotalRaw = findLine(/\bsubtotal\b/i).match(/subtotal\s+([0-9][0-9.,]*)\s*€/i)?.[1] || "";
  const subtotal = compactEuroMoney(subtotalRaw, total !== null && tax !== null ? Number((total - tax).toFixed(2)) : null)
    ?? (total !== null && tax !== null ? Number((total - tax).toFixed(2)) : total);
  let invoiceDate = "";
  if (leadingDateMatch) invoiceDate = isoDate(leadingDateMatch[1], leadingDateMatch[2], leadingDateMatch[3]);
  else if (invoiceDateMatch) invoiceDate = isoDate(invoiceDateMatch[2], invoiceDateMatch[3], invoiceDateMatch[4]);
  else if (slashDateMatch) invoiceDate = `${slashDateMatch[3]}-${String(slashDateMatch[2]).padStart(2, "0")}-${String(slashDateMatch[1]).padStart(2, "0")}`;
  return {
    invoice_number: documentNumber,
    invoice_date: invoiceDate,
    subtotal,
    discount: 0,
    shipping: 0,
    tax: tax || 0,
    total,
    currency: "EUR",
    supplier_hint: "apple"
  };
}

function correosFieldsSafe(lines) {
  const text = lines.join("\n");
  const normalizedText = normalize(text);
  if (!/\bcorreos\b/.test(normalizedText) || !/\bfactura\b/.test(normalizedText) || !/\bnif contrato cliente fecha\b/.test(normalizedText)) return null;
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const invoiceMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+([0-9]{6,})\b/);
  const value = (pattern) => amount(findLine(pattern).match(/(-?[0-9][0-9.,]*)\s*$/)?.[1]);
  const gross = value(/^total importe bruto\b/i);
  const discount = value(/^total importe bonificaci/i);
  const net = value(/^total importe neto antes de impuesto\b/i);
  const tax = value(/^total impuesto\b/i);
  const total = value(/^total factura en euros\b/i) ?? value(/^total impuestos incluidos\b/i);
  return {
    invoice_number: invoiceMatch?.[2] || "",
    invoice_date: numericDateToIso(invoiceMatch?.[1] || ""),
    subtotal: gross ?? net,
    discount: discount !== null ? Math.abs(discount) : 0,
    shipping: 0,
    tax: tax || 0,
    total,
    currency: "EUR",
    category: "envios",
    supplier_hint: "correos",
    suppress_lines: true
  };
}

function cleanAliExpressDescription(value) {
  return String(value || "")
    .replace(/^[^a-záéíóúñ0-9]+/i, "")
    .replace(/^(?:or|a|tf|iy|zn|f|n)\s*[,.)|!-]?\s*/i, "")
    .replace(/\s+[|$¡]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectedAliExpressLines(lines, fields = {}) {
  if (!lines.some((line) => /aliexpress/i.test(line))) return [];
  const detailStart = lines.findIndex((line) => /detalle del art[ií]culo/i.test(line));
  const detailEnd = lines.findIndex((line, index) => index > detailStart && /cosas a tener en cuenta/i.test(line));
  if (detailStart < 0) return [];
  const detail = lines.slice(detailStart + 1, detailEnd > detailStart ? detailEnd : lines.length);
  const result = [];
  const allDescriptionParts = [];
  let buffer = [];
  for (const line of detail) {
    if (/\b(?:official|offical|store|shop\d+)\b/i.test(line)) {
      buffer = [];
      continue;
    }
    const priceMatch = line.match(/([0-9][0-9.,]*)\s*€(?:\s*[xX]?\s*(\d+))?/);
    if (!priceMatch) {
      const cleaned = cleanAliExpressDescription(line);
      if (cleaned && !/^[A-ZÁÉÍÓÚÑ]{1,4}$/.test(cleaned)) {
        buffer.push(cleaned);
        allDescriptionParts.push(cleaned);
      }
      continue;
    }
    const unitPrice = aliExpressMoney(priceMatch[1], fields.total);
    let quantity = Number(priceMatch[2] || 0);
    const description = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (!quantity && result.length === 0 && unitPrice > 0 && fields.subtotal > 0) {
      const inferred = Math.round(fields.subtotal / unitPrice);
      if (inferred > 0 && inferred <= 100 && Math.abs(inferred * unitPrice - fields.subtotal) <= 0.05) quantity = inferred;
    }
    quantity = quantity || 1;
    if (description && unitPrice !== null) result.push({
      description,
      quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * quantity).toFixed(2)),
      original_text: [...buffer, line].join(" ")
    });
    buffer = [];
  }
  if (!result.length && allDescriptionParts.length && fields.subtotal > 0) {
    result.push({
      description: allDescriptionParts.slice(0, 2).join(" "),
      quantity: 1,
      unit_price: Number(fields.subtotal),
      line_total: Number(fields.subtotal),
      original_text: allDescriptionParts.join(" ")
    });
  }
  return result;
}

function detectedAlibabaLines(lines, fields = {}) {
  const text = lines.join("\n");
  const normalizedText = normalize(text);
  if (!/\balibaba(?:\s+com|com)?\b/.test(normalizedText) || !/\border details\b/.test(normalizedText)) return [];
  const start = lines.findIndex((line) => /^\s*Order\s+details\s*$/i.test(line));
  const end = lines.findIndex((line, index) => index > start && /^\s*Subtotal\s+EUR\b/i.test(line));
  if (start < 0 || end <= start) return [];
  const result = [];
  const rowPattern = /^(.*?)\s+([0-9][0-9.,]*)\s+EUR\s+([0-9][0-9.,]*)\s+EUR\s+([0-9][0-9.,]*)\s*$/i;
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index];
    const match = line.match(rowPattern);
    if (!match) continue;
    let description = match[1].replace(/\bUnit price\b.*$/i, "").trim();
    const continuation = lines[index + 1] || "";
    if (continuation && !/\b(EUR|Subtotal|Shipping|Order total|Payment|Qty|Item description|excl\. tax)\b/i.test(continuation) && !rowPattern.test(continuation)) {
      description = `${description} ${continuation}`.replace(/\s+/g, " ").trim();
      index += 1;
    }
    const purchasedUnits = amount(match[2]) || 1;
    const lineTotal = amount(match[4]);
    if (!description || lineTotal === null) continue;
    result.push({
      description,
      quantity: purchasedUnits,
      package_count: 1,
      units_per_package: purchasedUnits,
      total_units: purchasedUnits,
      price_per_package: lineTotal,
      unit_price: Number((lineTotal / purchasedUnits).toFixed(6)),
      line_total: lineTotal,
      original_text: line
    });
  }
  if (!result.length && fields.subtotal !== null) {
    const candidate = lines.slice(start + 1, end).find((line) => /bottle|lamp|lampara|applicator|squeeze/i.test(line));
    if (candidate) result.push({
      description: candidate,
      quantity: 1,
      package_count: 1,
      units_per_package: 1,
      total_units: 1,
      price_per_package: Number(fields.subtotal),
      unit_price: Number(fields.subtotal),
      line_total: Number(fields.subtotal),
      original_text: candidate
    });
  }
  return result;
}

function detectedEtsyLines(lines) {
  if (!lines.some((line) => /etsy\.com\/.+\/purchases\/|pedido\s+n\.?\s*[º°]\s*\d+/i.test(line))) return [];
  const result = [];
  const transactionPattern = /^n\.\s*[º°]\s+de transacci[oó]n\b/i;
  const ignored = /^(?:pedido|comprado el|personalizaci[oó]n|se aceptan cambios|resumen del pedido|total de los art[ií]culos|env[ií]o|total|impuestos|forma de pago|pagado el|notas del pedido|nota de|pol[ií]ticas|https?:\/\/)/i;
  let description = "";
  let price = null;
  let variant = "";
  for (const line of lines) {
    if (ignored.test(line) || /^\d+\s+art[ií]culos\b/i.test(line)) continue;
    const quantityMatch = line.match(/^ctd\.?\s*:\s*(\d+)(?:\s*;\s*(.*))?/i);
    if (quantityMatch && description && price !== null) {
      const quantity = Number(quantityMatch[1] || 1);
      variant = String(quantityMatch[2] || "").replace(/\s*;\s*/g, " · ").trim();
      result.push({
        description: `${description}${variant ? ` · ${variant}` : ""}`,
        quantity,
        unit_price: price,
        line_total: Number((price * quantity).toFixed(2)),
        original_text: `${description} ${price.toFixed(2)} € ${line}`
      });
      description = "";
      price = null;
      variant = "";
      continue;
    }
    if (transactionPattern.test(line)) {
      description = "";
      price = null;
      variant = "";
      continue;
    }
    const priceMatch = line.match(/([0-9][0-9.,]*)\s*€\s*$/);
    if (priceMatch) {
      price = amount(priceMatch[1]);
      const inlineDescription = line.slice(0, priceMatch.index).trim();
      if (inlineDescription) description = inlineDescription;
      continue;
    }
    if (!description && /(?:plata|colgante|collar|cadena|anillo|joya|resina)/i.test(line)) description = line.trim();
  }
  return result;
}

function detectedSheinLines(lines) {
  if (!lines.some((line) => /infinite styles services/i.test(line)) || !lines.some((line) => /\bVAT Invoice\b/i.test(line))) return [];
  const start = lines.findIndex((line) => /^invoice detail$/i.test(line));
  const end = lines.findIndex((line, index) => index > start && /^TOTAL\s+[0-9]/i.test(line));
  if (start < 0 || end < 0) return [];
  const rows = [];
  const rowPattern = /^(.*?)\s+(\d+)\s+([0-9][0-9.,]*)\s+(\d+(?:[.,]\d+)?%)\s+([0-9][0-9.,]*)\s+([0-9][0-9.,]*)$/;
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    if (/^description quantity\b|^\(EUR\)/i.test(line)) continue;
    const match = line.match(rowPattern);
    if (match) {
      if (current) rows.push(current);
      current = {
        description: match[1].trim(),
        package_quantity: Number(match[2] || 1),
        taxable: amount(match[3]),
        vat: amount(match[5]),
        gross: amount(match[6]),
        original_text: line
      };
      continue;
    }
    if (current) {
      current.description = `${current.description} ${line}`.replace(/\s+/g, " ").trim();
      current.original_text = `${current.original_text} ${line}`;
    }
  }
  if (current) rows.push(current);
  const grouped = new Map();
  for (const row of rows) {
    row.description = row.description
      .replace(/^XZV\s+/i, "")
      .replace(/(bolsas? de pl[aá]stico resellables).*$/i, "$1")
      .replace(/(bolsas? de (?:OPP )?resellables).*$/i, "$1")
      .replace(/(con cierre autoadhesivo).*$/i, "$1")
      .replace(/(bandeja de cabuj[oó]n de resina).*$/i, "$1")
      .replace(/\s+/g, " ")
      .trim();
    const piecesPerPack = Number(row.description.match(/\b(\d+)\s+(?:piezas|bolsas)\b/i)?.[1] || 1);
    const quantity = piecesPerPack * row.package_quantity;
    const key = `${normalize(row.description)}|${piecesPerPack}|${Number((row.gross / quantity).toFixed(6))}`;
    if (!grouped.has(key)) grouped.set(key, {
      description: row.description,
      package_count: 0,
      units_per_package: piecesPerPack,
      total_units: 0,
      quantity: 0,
      price_per_package: 0,
      unit_price: Number((row.gross / quantity).toFixed(6)),
      line_total: 0,
      original_text: "",
      shein_taxable_total: 0,
      shein_gross_total: 0,
      shein_vat_total: 0
    });
    const item = grouped.get(key);
    item.package_count += row.package_quantity;
    item.total_units += quantity;
    item.quantity += quantity;
    item.line_total = Number((item.line_total + row.gross).toFixed(2));
    item.shein_taxable_total = Number((item.shein_taxable_total + row.taxable).toFixed(2));
    item.shein_gross_total = Number((item.shein_gross_total + row.gross).toFixed(2));
    item.shein_vat_total = Number((item.shein_vat_total + row.vat).toFixed(2));
    item.price_per_package = Number((item.line_total / item.package_count).toFixed(6));
    item.unit_price = Number((item.line_total / item.total_units).toFixed(6));
    item.original_text = `${item.original_text} ${row.original_text}`.trim();
  }
  return [...grouped.values()];
}

function detectedCapCutLines(lines, fields = {}) {
  if (!lines.some((line) => /\bcapcut\b/i.test(line))) return [];
  const headline = lines.find((line) => /\bcapcut\b.*editor/i.test(line)) || "";
  if (!headline) return [];
  const seatsLine = lines.find((line) => /\b\d+\s+puestos\/mensual\b/i.test(line)) || "";
  const seatCount = Number(seatsLine.match(/\b(\d+)\s+puestos\/mensual\b/i)?.[1] || 1);
  const total = Number(fields.total ?? amount(headline.match(/([0-9][0-9.,]*)\s*€/i)?.[1]) ?? 0);
  const description = [headline.replace(/\s*[0-9][0-9.,]*\s*€\s*$/i, "").trim(), seatsLine.match(/\b\d+\s+puestos\/mensual\b/i)?.[0] || ""]
    .filter(Boolean)
    .join(" · ");
  return total > 0 ? [{
    description,
    quantity: seatCount,
    package_count: seatCount,
    units_per_package: 1,
    total_units: seatCount,
    price_per_package: Number((total / Math.max(1, seatCount)).toFixed(2)),
    unit_price: Number((total / Math.max(1, seatCount)).toFixed(2)),
    line_total: Number(total.toFixed(2)),
    original_text: [headline, seatsLine].filter(Boolean).join(" ")
  }] : [];
}

function detectedCanvaLines(lines, fields = {}) {
  if (!lines.some((line) => /\bcanva\b/i.test(line))) return [];
  const productLine = lines.find((line) => /\bcanva\b/i.test(line) && /[0-9][0-9.,]*\s*(?:\u20ac|EUR|â‚¬)/i.test(line) && !/\b(?:pty|ltd|vat|total|importe|impuestos|tax)\b/i.test(line)) || "";
  const total = Number(fields.total ?? amount(productLine.match(/([0-9][0-9.,]*)\s*(?:\u20ac|EUR|â‚¬)/i)?.[1]) ?? 0);
  if (!productLine || !total) return [];
  const description = cleanAliExpressDescription(productLine.replace(/\s*[0-9][0-9.,]*\s*(?:\u20ac|EUR|â‚¬)\s*$/i, ""));
  return [{
    description: description || "Canva",
    quantity: 1,
    package_count: 1,
    units_per_package: 1,
    total_units: 1,
    price_per_package: Number(total.toFixed(2)),
    unit_price: Number(total.toFixed(2)),
    line_total: Number(total.toFixed(2)),
    original_text: productLine
  }];
}

function detectedAppleLines(lines, fields = {}) {
  const normalizedText = normalize(lines.join(" "));
  if (/\bcapcut\b/.test(normalizedText)) return [];
  if (!/\b(cuenta de apple|app store|icloud|cloud|apple pay|tu factura)\b/.test(normalizedText)) return [];
  const productLine = lines.find((line) => /\b(?:icloud|cloud|meta verified|precio de la suscripci[oó]n)\b/i.test(line) && !/\b(?:incluye|iva|vat|total|subtotal)\b/i.test(line)) || "";
  if (!productLine) return [];
  const total = Number(fields.total ?? compactEuroMoney(productLine.match(/([0-9][0-9.,]*)\s*€/i)?.[1]) ?? 0);
  if (!total) return [];
  const detailLine = lines.find((line) => /\b(?:mensual|mensualmente|subscription|suscripci[oó]n|icloud\+)\b/i.test(line) && !/[0-9][0-9.,]*\s*€/i.test(line)) || "";
  const descriptionParts = [
    cleanAliExpressDescription(productLine.replace(/\s*[0-9][0-9.,]*\s*€\s*$/i, "")),
    cleanAliExpressDescription(detailLine.replace(/\b(?:incluye|se renueva)\b.*$/i, ""))
  ].filter(Boolean);
  const description = [...new Set(descriptionParts)].join(" · ");
  return [{
    description,
    quantity: 1,
    package_count: 1,
    units_per_package: 1,
    total_units: 1,
    price_per_package: Number(total.toFixed(2)),
    unit_price: Number(total.toFixed(2)),
    line_total: Number(total.toFixed(2)),
    original_text: [productLine, detailLine].filter(Boolean).join(" ")
  }];
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
  const aliExpress = aliExpressFields(lines);
  const alibaba = alibabaFields(lines);
  const etsy = etsyFields(lines);
  const shein = sheinFields(lines);
  const correos = correosFieldsSafe(lines);
  const canva = canvaFields(lines);
  const apple = appleFields(lines);
  const capcut = capcutFields(lines);
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
    for (const match of line.matchAll(/(?:€\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(€|EUR|USD)|\$\s*([0-9][0-9.,]*))/gi)) {
      const raw = match[1] || match[2] || match[4];
      totalCandidates.push({ value: amount(raw), currency: match[1] || String(match[3] || "").toUpperCase() === "EUR" || match[3] === "€" ? "EUR" : "USD" });
    }
  }
  if (/Meta Platforms|Meta anuncios|Gastos de Anuncios/i.test(text) && !totalCandidates.length) {
    const standalone = lines.map((line) => line.match(/^([0-9][0-9.,]*)\s*€$/)?.[1]).filter(Boolean);
    if (standalone.length) totalCandidates.push({ value: amount(standalone[0]), currency: "EUR" });
  }
  const selectedTotal = totalCandidates.at(-1) || null;
  const rateMatch = text.match(/\b1\s+(USD|EUR)\s*=\s*([0-9][0-9.,]*)\s+(EUR|USD)\b/i);
  const exchangeRate = rateMatch ? { from: rateMatch[1].toUpperCase(), rate: amount(rateMatch[2]), to: rateMatch[3].toUpperCase() } : null;
  return { invoice_number: invoiceNumber, invoice_date: date, total: selectedTotal?.value ?? null, currency: selectedTotal?.currency || "EUR", exchange_rate: exchangeRate, lines, ...(aliExpress || {}), ...(alibaba || {}), ...(etsy || {}), ...(shein || {}), ...(correos || {}), ...(canva || {}), ...(apple || {}), ...(capcut || {}) };
}

function detectedInvoiceLines(lines, fields = {}) {
  if (fields.suppress_lines) return [];
  const alibabaLines = detectedAlibabaLines(lines, fields);
  if (alibabaLines.length) return alibabaLines;
  const aliExpressLines = detectedAliExpressLines(lines, fields);
  if (aliExpressLines.length) return aliExpressLines;
  const etsyLines = detectedEtsyLines(lines, fields);
  if (etsyLines.length) return etsyLines;
  const sheinLines = detectedSheinLines(lines, fields);
  if (sheinLines.length) return sheinLines;
  const canvaLines = detectedCanvaLines(lines, fields);
  if (canvaLines.length) return canvaLines;
  const appleLines = detectedAppleLines(lines, fields);
  if (appleLines.length) return appleLines;
  const capcutLines = detectedCapCutLines(lines, fields);
  if (capcutLines.length) return capcutLines;
  const excluded = /\b(total|subtotal|vat|iva|tax|payment|paid|billing|bill|address|overview|page \d|learn more|recipient|credit|discount|shipping|mastercard|floor|dublin|spain|transacci[oó]n|umbral de pago|emitido una factura)\b|=|\(\d+\s+items?\)/i;
  return lines.filter((line) => {
    if (line.length > 220 || excluded.test(line)) return false;
    const hasMoney = /(?:€|\$)\s*[0-9][0-9.,]*|[0-9][0-9.,]*\s*(?:€|EUR\b|USD\b)/i.test(line);
    const description = line.replace(/(?:€|\$|EUR|USD|[0-9][0-9.,]*)/gi, " ");
    return hasMoney && /[a-záéíóúñ]{3,}/i.test(description);
  }).slice(0, 100);
}

function parseInvoiceLine(line, fields) {
  if (typeof line === "object" && line.description) {
    return { ...line, converted_amount: line.line_total, target_currency: fields.currency || "EUR", original_currency: fields.currency || "EUR" };
  }
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
    .replace(/\s+(?:\d{1,3}(?:[ .]\d{3})+|\d+)\s+impresi[oó]n(?:es)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[·,:;-]+$/, "")
    .trim();
  return {
    description: description || line,
    impressions: parseImpressions(line),
    original_amount: originalAmount,
    original_currency: originalCurrency,
    converted_amount: Number(convertedAmount.toFixed(4)),
    target_currency: targetCurrency,
    exchange_rate: fields.exchange_rate || null
  };
}

function inferExpenseCategory(text, supplierCategory = "", historicalCategories = []) {
  const normalized = normalize(text);
  if (/\baliexpress\b/.test(normalized) && /\bdetalle del articulo\b/.test(normalized)) return "materiales";
  if (/\balibaba(?:\s+com|com)?\b/.test(normalized) && /\b(receipt|order details|item description|applicator|squeeze bottle|bottle|lamp|lampara)\b/.test(normalized)) return "materiales";
  if (/\betsy\b/.test(normalized) && /\bpedido n\b|\bpurchases\b/.test(normalized) && /\b(plata|colgante|collar|cadena|anillo|joya|resina)\b/.test(normalized)) return "materiales";
  if (/\binfinite styles services\b/.test(normalized) && /\bvat invoice\b/.test(normalized) && /\binvoice detail\b/.test(normalized)) return "materiales";
  const signals = [
    ["software", /\b(apps?|software|subscription|suscripcion|license|licencia|hosting|domain|shopify|canva|capcut|apple|app store|icloud|cloud|globo product options)\b/],
    ["envios", /\b(shipping|shipment|postage|correo|correos|envio|transporte)\b/],
    ["marketing", /\b(marketing|advertising|publicidad|campaign|campana|meta ads|google ads)\b/],
    ["servicios", /\b(agency|agencia|consulting|consultoria|professional service|servicio profesional)\b/],
    ["materiales", /\b(material|jewel|joya|anillo|colgante|cadena|packaging|caja|pipeta|tisu|tissue|shein|aliexpress|alibaba|applicator|squeeze bottle|opaque|opaca|bottle|botella|lamp|lampara)\b/]
  ];
  const strong = signals.find(([, pattern]) => pattern.test(normalized))?.[0];
  if (strong) return strong;
  const counts = historicalCategories.reduce((map, category) => map.set(category, (map.get(category) || 0) + 1), new Map());
  const historical = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return historical || supplierCategory || "otros";
}

function fieldEvidence(fields, pages) {
  const pageLines = pages.flatMap((page) => String(page.text || "").split(/\r?\n/).map((line) => ({ page: page.page, text: line.trim() })).filter((line) => line.text));
  const find = (...needles) => {
    const normalizedNeedles = needles.filter((value) => value !== null && value !== undefined && value !== "").map(normalize);
    const match = pageLines.find((line) => normalizedNeedles.some((needle) => needle && normalize(line.text).includes(needle)));
    return match || null;
  };
  return {
    supplier: find(fields.suggested_supplier_name),
    invoice_number: find(fields.invoice_number),
    invoice_date: find(fields.invoice_date) || pageLines.find((line) => /\b(fecha|date|paid on|bill created)\b/i.test(line.text)) || null,
    total: pageLines.find((line) => fields.total !== null && amount(line.text) === Number(fields.total) && /\b(total|importe|due)\b|€|\bEUR\b|\bUSD\b|\$/i.test(line.text)) || null,
    category: find(fields.suggested_supplier_name) || pageLines.find((line) => /\b(meta anuncios|apps?|software|marketing|env[ií]o|material)\b/i.test(line.text)) || null
  };
}

function tsvWords(tsv) {
  return String(tsv || "").split(/\r?\n/).slice(1).map((row) => {
    const cells = row.split("\t");
    const left = Number(cells[6] || 0);
    const top = Number(cells[7] || 0);
    const width = Number(cells[8] || 0);
    const height = Number(cells[9] || 0);
    const text = cells.slice(11).join("\t").trim();
    return {
      text,
      confidence: Number(cells[10] || 0),
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height }
    };
  }).filter((word) => word.text && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0);
}

function hocrWords(hocr) {
  return [...String(hocr || "").matchAll(/<span[^>]*class=['"]ocrx_word['"][^>]*title=['"][^'"]*bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => ({
      text: match[5].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(),
      confidence: Number(match[0].match(/x_wconf\s+(\d+)/i)?.[1] || 0),
      bbox: { x0: Number(match[1]), y0: Number(match[2]), x1: Number(match[3]), y1: Number(match[4]) }
    }))
    .filter((word) => word.text && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0);
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
      const image = await loadImage(filePath);
      const scale = image.width < 900 ? 2 : 1;
      const canvas = createCanvas(image.width * scale, image.height * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = await worker.recognize(canvas.toBuffer("image/png"), {}, { text: true, blocks: true, tsv: true, hocr: true });
      const blockWords = (result.data.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => (paragraph.lines || []).flatMap((line) => line.words || [])));
      const words = (result.data.words || blockWords).map((word) => ({
        text: word.text || word.symbol || "",
        confidence: Number(word.confidence || 0),
        bbox: word.bbox ? {
          x0: Number(word.bbox.x0 || 0),
          y0: Number(word.bbox.y0 || 0),
          x1: Number(word.bbox.x1 || 0),
          y1: Number(word.bbox.y1 || 0)
        } : null
      })).filter((word) => word.text && word.bbox);
      if (!words.length) words.push(...tsvWords(result.data.tsv));
      if (!words.length) words.push(...hocrWords(result.data.hocr));
      return {
        text: result.data.text || "",
        confidence: Number(result.data.confidence || 0),
        words,
        source_width: image.width,
        source_height: image.height,
        ocr_width: canvas.width,
        ocr_height: canvas.height
      };
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
    const normalizedText = normalize(fields.lines.slice(0, 100).join(" "));
    const aliases = { meta: ["meta platforms", "meta anuncios", "facebook"], correos: ["correos"], shopify: ["shopify international"], etsy: ["etsy ireland", "etsy", "etsy com"], shein: ["shein", "infinite styles services"], aliexpress: ["aliexpress"], alibaba: ["alibaba", "alibaba com", "alibaba.com"], canva: ["canva"], capcut: ["capcut"], apple: ["apple", "app store", "icloud", "cuenta de apple"] };
    const supplierHint = normalize(fields.supplier_hint);
    const supplier = suppliers
      .map((item) => {
        const names = [normalize(item.name), ...(aliases[normalize(item.name)] || []).map(normalize)];
        const textScore = names.reduce((score, name) => score + (name && normalizedText.includes(name) ? name.length : 0), 0);
        const hintScore = supplierHint && names.includes(supplierHint) ? 1000 : 0;
        return { item, score: textScore + hintScore };
      })
      .sort((a, b) => b.score - a.score)[0];
    const matchedSupplier = supplier?.score ? supplier.item : null;
    const historicalCategories = matchedSupplier ? query("SELECT category FROM invoices WHERE supplier_id=$supplier AND is_deleted=0 ORDER BY invoice_date DESC LIMIT 30", { supplier: matchedSupplier.id }).map((row) => row.category).filter(Boolean) : [];
    const category = inferExpenseCategory(fields.lines.join(" "), matchedSupplier?.category, historicalCategories);
    return { ...fields, category, suggested_supplier_id: matchedSupplier?.id || null, suggested_supplier_name: matchedSupplier?.name || "", rule_source: historicalCategories.length ? "historical_supplier" : matchedSupplier ? "supplier_profile" : "document_signals" };
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
      fields.evidence = fieldEvidence(fields, pages);
      const confidence = pages.length ? pages.reduce((sum, page) => sum + Number(page.confidence || 0), 0) / pages.length : 0;
      const status = confidence >= 90 && fields.total !== null ? "ready" : "review";
      if (one("SELECT status FROM expense_imports WHERE id=$id", { id: importId })?.status === "confirmed") return;
      exec(`UPDATE expense_imports SET status=$status, extraction_method=$method, confidence=$confidence,
        detected_fields_json=$fields, pages_json=$pages, warnings_json=$warnings, processing_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$id`, {
        id: importId, status, method: pages.every((page) => page.method === "native") ? "native" : "ocr", confidence,
        fields: JSON.stringify(fields), pages: JSON.stringify(pages), warnings: JSON.stringify(fields.total === null ? ["No se ha detectado un total fiable."] : [])
      });
      exec("DELETE FROM expense_import_lines WHERE expense_import_id=$id", { id: importId });
      const historicalMaterialLines = fields.category === "materiales" && fields.suggested_supplier_id
        ? query(`SELECT il.description, m.id, m.name FROM invoice_lines il
          JOIN invoices i ON i.id=il.invoice_id
          JOIN materials m ON m.id=il.material_id
          WHERE i.supplier_id=$supplier AND i.is_deleted=0 AND m.is_deleted=0
          ORDER BY i.invoice_date DESC LIMIT 250`, { supplier: fields.suggested_supplier_id })
        : [];
      const detectedLines = detectedInvoiceLines(fields.lines, fields);
      const lineKey = (line) => typeof line === "string" ? normalize(line) : `${normalize(line.description)}|${Number(line.unit_price ?? line.line_total ?? 0).toFixed(6)}`;
      const uniqueLines = detectedLines.filter((line, index, all) => all.findIndex((candidate) => lineKey(candidate) === lineKey(line)) === index);
      uniqueLines.forEach((line, index) => {
        const parsedLine = parseInvoiceLine(line, fields);
        if (!parsedLine) return;
        const normalizedLine = normalize(parsedLine.description);
        const materialCandidates = fields.category === "materiales" ? query("SELECT id, name, preferred_supplier_id FROM materials WHERE is_deleted=0 ORDER BY (preferred_supplier_id=$supplier) DESC, LENGTH(name) DESC", { supplier: fields.suggested_supplier_id || 0 }) : [];
        const directMaterial = fields.category === "materiales" && !normalizedLine.includes("yellow gold plated")
          ? materialCandidates.find((candidate) => normalizedLine.includes(normalize(candidate.name)))
          : null;
        const stem = (token) => token.replace(/(?:es|s)$/i, "");
        const aliases = normalizedLine.includes("elephant gold") ? ["elefante", "dorado"]
          : normalizedLine.includes("elephant steel") ? ["elefante", "plateado"]
          : /(bottle|botella)/.test(normalizedLine) && /(squeeze|applicator|needle|aguja|opaca|opaque)/.test(normalizedLine) ? ["botella", "opaca", "resina", "3ml", "5ml"]
          : /(lamp|lampara)/.test(normalizedLine) ? ["lampara", "uv"]
          : normalizedLine.includes("etsy") ? []
          : [
            ...(normalizedLine.includes("pera") ? ["gota"] : []),
            ...(normalizedLine.includes("redondo") ? ["esencia"] : []),
            ...(normalizedLine.includes("white gold plated") ? ["plata", "plateado"] : []),
            ...(normalizedLine.includes("yellow gold plated") ? ["plata", "bañada", "oro"] : [])
          ]
        ;
        const matchText = normalize(`${normalizedLine} ${aliases.join(" ")}`);
        const fuzzyMaterial = !directMaterial && fields.category === "materiales" ? materialCandidates
          .map((candidate) => {
            const candidateTokens = normalize(candidate.name).split(" ").filter((token) => token.length > 2 && !["acero", "inoxidable", "material", "incluida", "premium", "para", "resina"].includes(token));
            const lineTokens = matchText.split(" ").map(stem);
            const hits = candidateTokens.filter((token) => lineTokens.includes(stem(token)));
            return { ...candidate, score: candidateTokens.length ? hits.length / candidateTokens.length : 0, hits: hits.length };
          })
          .filter((candidate) => candidate.hits >= 2 && candidate.score >= 0.5)
          .sort((a, b) => b.hits - a.hits || b.score - a.score)[0] : null;
        const historicalMaterial = historicalMaterialLines.find((candidate) => {
          const historical = normalize(candidate.description);
          return historical && (normalizedLine.includes(historical) || historical.includes(normalizedLine));
        });
        const material = directMaterial || fuzzyMaterial || historicalMaterial || null;
        insert(`INSERT INTO expense_import_lines
          (expense_import_id, position, original_text, description, package_count, units_per_package, total_units, quantity, price_per_package, unit_price, line_total, impressions, suggested_material_id, confidence, human_decision, original_data_json)
          VALUES ($import, $position, $original, $description, 1, 1, 1, 1, $total, $total, $total, $impressions, $material, $confidence, 'pending', $originalData)`, {
          import: importId, position: index + 1, original: typeof line === "string" ? line : line.original_text, description: parsedLine.description,
          total: parsedLine.line_total ?? parsedLine.converted_amount, impressions: parsedLine.impressions, material: material?.id || null,
          confidence: material ? (directMaterial ? 85 : fuzzyMaterial ? 76 : 78) : Math.min(confidence, 69),
          originalData: JSON.stringify({ ...parsedLine, material_rule_source: directMaterial ? "material_name" : fuzzyMaterial ? "material_tokens" : historicalMaterial ? "historical_invoice_line" : null })
        });
        if (typeof line === "object") {
          const packageCount = Number(line.package_count || 1);
          const totalUnits = Number(line.total_units || line.quantity || 1);
          const unitsPerPackage = Number(line.units_per_package || (packageCount ? totalUnits / packageCount : totalUnits) || 1);
          const pricePerPackage = Number(line.price_per_package ?? (packageCount ? Number(line.line_total || 0) / packageCount : Number(line.line_total || 0)));
          exec(`UPDATE expense_import_lines
            SET package_count=$packageCount,units_per_package=$unitsPerPackage,total_units=$totalUnits,quantity=$totalUnits,
                price_per_package=$pricePerPackage,unit_price=$unitPrice,line_total=$total
            WHERE expense_import_id=$import AND position=$position`, {
            import: importId, position: index + 1, packageCount, unitsPerPackage, totalUnits, pricePerPackage,
            unitPrice: line.unit_price, total: line.line_total
          });
        }
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
  for (const row of query("SELECT id, original_text, description FROM expense_import_lines WHERE LOWER(original_text) LIKE '%impresiones%'")) {
    const parsed = parseInvoiceLine(row.original_text, { currency: "EUR" });
    if (parsed?.description && /\s+\d+$/.test(row.description || "") && parsed.description !== row.description) {
      exec("UPDATE expense_import_lines SET description=$description, updated_at=CURRENT_TIMESTAMP WHERE id=$id", { id: row.id, description: parsed.description });
    }
  }
  saveDb();
  for (const row of query("SELECT id FROM expense_imports WHERE status='pending' ORDER BY id")) enqueue(row.id);

  return { enqueue, process, status: () => ({ available: true, languages: ["spa", "eng"], model_path: langPath, pending: queue.length, running }) };
}

module.exports = { createDocumentExtractionService, detectFields, detectedInvoiceLines, detectedAlibabaLines, detectedAliExpressLines, detectedEtsyLines, detectedSheinLines, detectedCanvaLines, detectedCapCutLines, parseInvoiceLine, parseImpressions, inferExpenseCategory, fieldEvidence, nativePageText, normalize, amount };
