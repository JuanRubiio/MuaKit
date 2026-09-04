const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const initSqlJs = require("sql.js");
const { amount: parsedAmount, detectFields, detectedInvoiceLines, detectedAlibabaLines, detectedAliExpressLines, detectedEtsyLines, detectedSheinLines, detectedCanvaLines, detectedCapCutLines, detectedKlaviyoLines, parseInvoiceLine, parseImpressions, inferExpenseCategory, fieldEvidence } = require("./lib/services/document-extraction");
const { cleanOriginalName, accountingQuality } = require("./lib/routes/expense-imports");
const { orderLineIsPreparationCandidate } = require("./lib/routes/kits");
const { ORDER_TYPES, detectOrderType, inferRecipeOrderType, isOrderTypeMarkerTitle } = require("./lib/services/order-typologies");

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(__dirname, "server.js");
const TEST_DIR = path.join(ROOT, "data", `mua_ops_test_${process.pid}_${Date.now()}`);
const PORT = Number(process.env.MUA_OPS_TEST_PORT || 5065);
const SHOPIFY_MOCK_PORT = Number(process.env.MUA_OPS_TEST_SHOPIFY_PORT || 5066);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertOrderPreparationCandidateFilter() {
  assert(!orderLineIsPreparationCandidate({ title: "Material de la joya", material_category: "joya", quantity: 1 }), "Preparation sheets should exclude order option markers");
  assert(!orderLineIsPreparationCandidate({ title: "Te gustaria anadir un segundo toping para tu joya?", material_category: "joya", quantity: 1 }), "Preparation sheets should exclude topping question prompts");
  assert(!orderLineIsPreparationCandidate({ title: "Pigmento verde menta", material_category: "joya", quantity: 1 }), "Preparation sheets should exclude pigment options");
  assert(orderLineIsPreparationCandidate({ title: "Colgante Gota dorado (acero)", material_category: "joya", quantity: 1 }), "Preparation sheets should keep physical jewellery");
  assert(orderLineIsPreparationCandidate({ title: "Letras doradas", quantity: 1 }), "Preparation sheets should keep known physical extras without material category");
}

assertOrderPreparationCandidateFilter();

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmWithRetry(target) {
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY"].includes(error.code) || attempt === 5) throw error;
      sleepMs(150 * (attempt + 1));
    }
  }
  if (lastError) throw lastError;
}

function cleanTestDir() {
  const resolved = path.resolve(TEST_DIR);
  assert(resolved.startsWith(path.join(ROOT, "data")), "Test directory must stay inside data/");
  rmWithRetry(resolved);
  fs.mkdirSync(resolved, { recursive: true });
}

function createMockShopifyServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/admin/oauth/access_token") {
      let body = "";
      for await (const chunk of req) body += chunk.toString();
      const params = new URLSearchParams(body);
      if (
        params.get("grant_type") === "client_credentials"
        && params.get("client_id") === "shpui_test_client"
        && params.get("client_secret") === "shpss_test_secret"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          access_token: "mock_access_token_1234",
          scope: "read_products,read_inventory,read_orders,read_shopify_payments_payouts",
          expires_in: 86399
        }));
        return;
      }
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_client", error_description: "Client credentials rejected by mock Shopify" }));
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/admin/api/2026-01/shopify_payments/payouts.json")) {
      if (req.headers["x-shopify-access-token"] !== "mock_access_token_1234") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errors: "Missing or invalid access token" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        payouts: [
          {
            id: 623721858,
            date: "2026-05-15",
            status: "paid",
            currency: "EUR",
            amount: "441.06",
            bank_reference: "trace-44106",
            type: "deposit",
            summary: {
              charges_gross_amount: "452.36",
              charges_fee_amount: "11.30"
            }
          }
        ]
      }));
      return;
    }
    if (req.method !== "POST" || !req.url.includes("/admin/api/2026-01/graphql.json")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    if (req.headers["x-shopify-access-token"] !== "mock_access_token_1234") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ errors: [{ message: "Missing or invalid access token" }] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    const payload = JSON.parse(body || "{}");
    const query = String(payload.query || "");
    let data = {};
    if (query.includes("shop {")) {
      data = { shop: { name: "Mua Kit Test", myshopifyDomain: "muakit-test.myshopify.com" } };
    } else if (query.includes("query ShopifyProducts")) {
      data = {
        products: {
          edges: [
            {
              cursor: "product-1",
              node: {
                id: "gid://shopify/Product/1",
                handle: "cadena-incluida-dorada-acero",
                title: "Cadena incluida dorada (acero)",
                status: "ACTIVE",
                updatedAt: "2026-05-15T10:00:00Z",
                featuredImage: { url: "https://cdn.shopify.com/mock/cadena-dorada.jpg" },
                images: { edges: [{ node: { url: "https://cdn.shopify.com/mock/cadena-dorada.jpg" } }] },
                variants: { edges: [{ node: { sku: "CAD-DOR-001", inventoryQuantity: 18 } }] }
              }
            },
            {
              cursor: "product-2",
              node: {
                id: "gid://shopify/Product/2",
                handle: "anillo-corazon-plateado-acero",
                title: "Anillo Corazón plateado (acero)",
                status: "ACTIVE",
                updatedAt: "2026-05-15T10:05:00Z",
                featuredImage: { url: "https://cdn.shopify.com/mock/anillo-corazon.jpg" },
                images: { edges: [{ node: { url: "https://cdn.shopify.com/mock/anillo-corazon.jpg" } }] },
                variants: { edges: [{ node: { sku: "ANI-PLA-001", inventoryQuantity: 12 } }] }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    } else if (query.includes("query ShopifyInventory")) {
      data = {
        products: {
          edges: [
            {
              cursor: "inventory-1",
              node: {
                handle: "cadena-incluida-dorada-acero",
                title: "Cadena incluida dorada (acero)",
                status: "ACTIVE",
                variants: { edges: [{ node: { sku: "CAD-DOR-001", inventoryQuantity: 20 } }] }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    } else if (query.includes("query ShopifyOrders")) {
      data = {
        orders: {
          edges: [
            {
              cursor: "order-1",
              node: {
                id: "gid://shopify/Order/1001",
                name: "#1001",
                createdAt: "2026-05-14T12:00:00Z",
                updatedAt: "2026-05-15T08:00:00Z",
                displayFinancialStatus: "PAID",
                displayFulfillmentStatus: "UNFULFILLED",
                currentTotalPriceSet: { shopMoney: { amount: "89.90", currencyCode: "EUR" } },
                currentSubtotalPriceSet: { shopMoney: { amount: "79.90", currencyCode: "EUR" } },
                currentTotalDiscountsSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } },
                totalShippingPriceSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } },
                totalTaxSet: { shopMoney: { amount: "10.00", currencyCode: "EUR" } },
                lineItems: {
                  nodes: [
                    {
                      id: "gid://shopify/LineItem/1001-1",
                      title: "Cadena incluida dorada (acero)",
                      quantity: 1,
                      sku: "CAD-DOR-001",
                      originalTotalSet: { shopMoney: { amount: "24.95", currencyCode: "EUR" } },
                      discountedTotalSet: { shopMoney: { amount: "24.95", currencyCode: "EUR" } },
                      totalDiscountSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } }
                    },
                    {
                      id: "gid://shopify/LineItem/1001-2",
                      title: "Anillo Corazón plateado (acero)",
                      quantity: 2,
                      sku: "ANI-PLA-001",
                      originalTotalSet: { shopMoney: { amount: "54.95", currencyCode: "EUR" } },
                      discountedTotalSet: { shopMoney: { amount: "49.95", currencyCode: "EUR" } },
                      totalDiscountSet: { shopMoney: { amount: "5.00", currencyCode: "EUR" } }
                    }
                  ]
                }
              }
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
  return new Promise((resolve) => {
    server.listen(SHOPIFY_MOCK_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function requestRaw(method, route, body) {
  const options = { method, headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${route}`, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload, text };
}

async function request(method, route, body) {
  const { response, payload, text } = await requestRaw(method, route, body);
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${text}`);
  }
  return payload;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      await request("GET", "/api/summary");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Server did not start in time");
}

async function run() {
  const mixedCurrencyFields = detectFields("Total 12.34 EUR\nOrder total in USD 13.50 USD");
  assert(mixedCurrencyFields.total === 12.34 && mixedCurrencyFields.currency === "EUR", "EUR totals should be preferred when a document also reports USD");
  const klaviyoText = `Invoice
Invoice number UL4YOXZE - 0002
Date of issue May 20, 2026
Klaviyo Inc Bill to
$45.00 USD due May 20, 2026
Description Qty Unit price Amount
Klaviyo Platform: 1.5k Profiles, 15k Emails (per sends) 1 $45.00 $45.00
Subtotal $45.00
Total excluding tax $45.00
VAT/GST - 0% on $45.00 - $0.00
Total $45.00
Amount due $45.00 USD`;
  const klaviyoFields = detectFields(klaviyoText);
  assert(klaviyoFields.invoice_number === "UL4YOXZE-0002" && klaviyoFields.invoice_date === "2026-05-20", "Klaviyo invoice number and issue date should be detected");
  assert(klaviyoFields.total === 45 && klaviyoFields.currency === "USD" && klaviyoFields.category === "software", "Klaviyo invoices should keep USD when no EUR value exists and be classified as software");
  assert(inferExpenseCategory(klaviyoText, "marketing", ["marketing"]) === "software", "Klaviyo should override supplier history as software");
  assert(inferExpenseCategory("Recibo de la Tesoreria General de la Seguridad Social cuota autonomo", "otros", ["otros"]) === "impuestos", "Social Security self-employed fees should be classified as tax expenses");
  const klaviyoLines = detectedKlaviyoLines(klaviyoFields.lines, klaviyoFields);
  assert(klaviyoLines.length === 1 && klaviyoLines[0].description.includes("Klaviyo Platform") && klaviyoLines[0].line_total === 45, "Klaviyo platform charges should become one editable line");
  assert(ORDER_TYPES.length === 7, "Orders should expose the seven agreed business typologies");
  const maternityDetection = detectOrderType([
    { id: 1, title: "Kit Müa | Recuerdos de Maternidad" },
    { id: 2, title: "Colgante Corazón dorado (acero)" }
  ]);
  assert(maternityDetection.code === "maternity" && maternityDetection.confidence >= 0.9, "Maternity kit markers should classify orders with high confidence");
  assert(maternityDetection.markerIds.includes(1), "The conceptual kit line should be identified as a typology marker");
  assert(!isOrderTypeMarkerTitle("Colgante huella plateado"), "Real jewellery lines should not be hidden as typology markers");
  assert(detectOrderType([{ title: "OMOI — Tu mascota convertida en joya" }]).code === "omoi", "Omoi orders should have their own typology");
  assert(detectOrderType([{ title: "Joya extra sin kit" }]).code === "extra_jewel", "Extra jewellery without a kit should have its own typology");
  assert(inferRecipeOrderType({ name: "Kit base mascota", notes: "Sin pipeta" }) === "pet", "Existing recipe names should be mapped to typologies");
  assert(parsedAmount("19.90") === 19.9, "Dot-decimal amounts should not be multiplied by 100");
  assert(parsedAmount("1.725,00") === 1725, "European amounts should parse thousands and decimals");
  const euroFields = detectFields("Shopify\nPaid on Jun 12, 2026\nTOTAL €17.25 EUR\nBill #543058864");
  assert(euroFields.total === 17.25 && euroFields.currency === "EUR", "The currency attached to invoice total should win over other currencies");
  assert(euroFields.invoice_number === "543058864" && euroFields.invoice_date === "2026-06-12", "Common invoice references and named dates should be normalized");
  const sendcloudFields = detectFields("Sendcloud BV\nMüa Fecha de factura 17-08-2026\nNúmero de factura 1-26-ES0044207\nBase imponible (sin IVA) 306,01 €\nIVA (21%) 64,26 €\nImporte total 370,27 €");
  assert(sendcloudFields.invoice_number === "1-26-ES0044207" && sendcloudFields.invoice_date === "2026-08-17" && sendcloudFields.total === 370.27, "Sendcloud invoice summaries should normalize invoice number, ISO date and total");
  assert(sendcloudFields.subtotal === 306.01 && sendcloudFields.tax === 64.26, "Sendcloud subtotal should use the taxable base, not the shipping section total");
  const sendcloudEvidence = fieldEvidence(sendcloudFields, [{ page: 1, text: "Base imponible (sin IVA) 306,01 €\nIVA (21%) 64,26 €" }]);
  assert(sendcloudEvidence.subtotal?.text.includes("Base imponible") && sendcloudEvidence.tax?.text.includes("IVA") && typeof sendcloudEvidence.subtotal?.confidence === "number", "Sendcloud taxable base and VAT should retain visual evidence with field confidence");
  const shippingQuality = accountingQuality({ suggested_supplier_id: 3429, invoice_number: "1-26-ES0044207", invoice_date: "2026-08-17", total: 370.27, subtotal: 306.01, tax: 64.26, category: "envios" }, []);
  assert(shippingQuality.lines_match && shippingQuality.decisions_complete && shippingQuality.batch_eligible, "Shipping imports without product lines should be batch eligible");
  const mismatchedShippingQuality = accountingQuality({ suggested_supplier_id: 3429, invoice_number: "1-26-ES0045917", invoice_date: "2026-08-31", total: 284.27, subtotal: 243.93, tax: 49.34, category: "envios" }, []);
  assert(!mismatchedShippingQuality.lines_match && !mismatchedShippingQuality.batch_eligible, "Shipping imports without lines must still be blocked when taxable base plus VAT does not reconcile to the total");
  assert(detectedInvoiceLines(sendcloudFields.lines, sendcloudFields).length === 0, "Sendcloud summaries should never generate product lines");
  const ikeaFields = detectFields("IKEA\nNº iSell: 1613657840\nTotal (con IVA) 753,83\n6/7/26");
  assert(ikeaFields.invoice_number === "1613657840" && ikeaFields.invoice_date === "2026-07-06" && ikeaFields.total === 753.83, "IKEA order summaries should recover references, short dates and bare totals");
  assert(detectFields("Fecha 31/02/2026").invoice_date === "", "Invalid calendar dates must not be accepted from OCR");
  assert(detectedInvoiceLines(["TOTAL €17.25 EUR", "Mua Kit Apps (1 item) €17.25 EUR", "Globo Product Options $19.90 USD", "Payment status paid"]).length === 1, "Only plausible product lines should become suggestions");
  const convertedLine = parseInvoiceLine("Globo Product Options $19.90 USD", { currency: "EUR", exchange_rate: { from: "USD", rate: 0.8669, to: "EUR" } });
  assert(convertedLine.description === "Globo Product Options" && convertedLine.converted_amount === 17.2513, "Suggested lines should keep a clean description and convert to invoice currency");
  const metaText = `Fecha de la factura/pago
4 abr. 2026, 6:31
Número de referencia: QHKDZJMEH2
18,51 €
26890650683955507-26464807553206484 Se te ha emitido una factura porque has alcanzado tu umbral de pago de 18,51 €.
Meta anuncios
Campañas
Campaña estreno / TESTEO
18,51 €
Mascotas 1630 Impresiones 5,27 €
Maternidad 18 764 Impresiones 13,24 €
Factura número FBADS-394-105737940`;
  const metaFields = detectFields(metaText);
  assert(metaFields.invoice_number === "FBADS-394-105737940", "Meta invoice numbers should be detected");
  assert(metaFields.invoice_date === "2026-04-04", "Spanish Meta invoice dates should be normalized");
  assert(metaFields.total === 18.51 && metaFields.currency === "EUR", "Standalone Meta invoice totals should be detected as EUR");
  const metaLines = detectedInvoiceLines(metaText.split("\n"));
  assert(metaLines.length === 2, "Meta campaign breakdown lines should become suggestions");
  const metaLine = parseInvoiceLine(metaLines[0], metaFields);
  assert(metaLine.description === "Mascotas" && metaLine.converted_amount === 5.27 && metaLine.original_currency === "EUR", "Meta campaign lines should have clean descriptions and EUR amounts");
  assert(parseInvoiceLine(metaLines[1], metaFields).description === "Maternidad", "Meta campaign concepts should remove grouped impression counts");
  assert(parseImpressions(metaLines[1]) === 18764, "Meta campaign impressions should be extracted as a structured metric");
  assert(parseImpressions("Campaña puntual 1 Impresión 0,01 €") === 1, "Singular Meta impressions should also be extracted");
  assert(cleanOriginalName("TransacciÃ³n n.Âº 123.pdf") === "Transacción n.º 123.pdf", "Mojibake document names should be repaired");
  assert(inferExpenseCategory("Globo Product Options subscription", "materiales", ["materiales"]) === "software", "Strong document signals should override supplier defaults");
  assert(inferExpenseCategory("Pedido mixto", "materiales", ["software", "software", "materiales"]) === "software", "Mixed suppliers should use historical invoice context");
  const aliExpressText = `AliExpress
Resumen
1D de pedido: 3074056047541055
Tiempo de la orden: 13jun., 2026
Subtotal: 996€
Todos los descuentos: 143€
Tarifa de envío: 0,00€
Total: 8,53€
1,48€ IVA incluido
Método de pago
476664******6704 EUR 8.53
Detalle del artículo
10 Uds. De cadenas de eslabones d
steel 1.5mm
179€ 2
Tmto Official Store
10 Uds. De cadenas de eslabones d
gold 1.5mm
319€ 2
Tmto Official Store
Cosas a tener en cuenta:`;
  const aliFields = detectFields(aliExpressText);
  assert(aliFields.invoice_number === "3074056047541055" && aliFields.invoice_date === "2026-06-13", "AliExpress order references and compact Spanish dates should be normalized");
  assert(aliFields.total === 8.53 && aliFields.subtotal === 9.96 && aliFields.discount === 1.43 && aliFields.shipping === 0, "AliExpress payment totals and summary amounts should be parsed despite OCR decimal loss");
  assert(inferExpenseCategory(aliExpressText, "envios", ["envios"]) === "materiales", "AliExpress order summaries should be classified as material expenses");
  const aliLines = detectedAliExpressLines(aliFields.lines, aliFields);
  assert(aliLines.length === 2 && aliLines[0].package_count === 2 && aliLines[0].units_per_package === 10 && aliLines[0].total_units === 20, "AliExpress item blocks should preserve products and quantities");
  assert(Math.abs(aliLines.reduce((sum, line) => sum + line.line_total, 0) - aliFields.subtotal) < 0.01, "AliExpress product lines should preserve gross prices before invoice discounts");
  const aliPackageText = `AliExpress
Detalle del artículo
Pinzas de acero inoxidable 3/12 pie
Silvery 12 pes
3,79€ x11
Shop1104152584 Store
Cosas a tener en cuenta:`;
  const aliPackageFields = detectFields(aliPackageText);
  const aliPackageLine = detectedAliExpressLines(aliPackageFields.lines, aliPackageFields)[0];
  assert(aliPackageLine.package_count === 11 && aliPackageLine.units_per_package === 12 && aliPackageLine.total_units === 132 && aliPackageLine.price_per_package === 3.79 && Math.abs(aliPackageLine.unit_price - 0.315833) < 0.000001 && aliPackageLine.line_total === 41.69, "AliExpress package structure should preserve packages, units per package and package price");
  const alibabaText = `Receipt
Marketplace Operator:
Receipt number: #27996940501042809
Alibaba.com Singapore E-Commerce Private Limited
Receipt date: 10:56 AM, Jul 12th, 2026 (PDT)
Order number: #27996940501042809 Order date: 6:04 PM, Jul 8th, 2026 (PDT)
Order details
Unit price Total amount
Item description Qty
(excl. tax) (excl. tax)
5ml 10ml 20ml 30ml 50ml 120ml DIY Craft Plastic Needle Tip Squeeze Bottle Glue 2,000.00 EUR 0.07 EUR 123.52
Applicator Bottle
Subtotal EUR 123.52
Shipping fee EUR 110.28
Order total EUR 233.80
Order total in USD USD 265.00
Payment information
Order total EUR 233.80
Payment processing fee EUR 7.01
Amount paid
EUR 240.81
Paid on July 10, 2026 (Credit/debit card ending in 7097) EUR 240.79`;
  const alibabaFieldsParsed = detectFields(alibabaText);
  assert(alibabaFieldsParsed.invoice_number === "27996940501042809" && alibabaFieldsParsed.invoice_date === "2026-07-10", "Alibaba receipts should use receipt/order id and paid date");
  assert(alibabaFieldsParsed.category === "materiales" && alibabaFieldsParsed.supplier_hint === "alibaba", "Alibaba wholesale purchases should be classified as material expenses");
  assert(alibabaFieldsParsed.subtotal === 123.52 && alibabaFieldsParsed.shipping === 117.29 && alibabaFieldsParsed.total === 240.81, "Alibaba product subtotal, shipping and processing fee should reconcile the paid total");
  assert(inferExpenseCategory(alibabaText, "envios", ["envios"]) === "materiales", "Alibaba receipts should not be classified as shipping just because they include logistics fees");
  const alibabaLines = detectedAlibabaLines(alibabaFieldsParsed.lines, alibabaFieldsParsed);
  assert(alibabaLines.length === 1 && alibabaLines[0].quantity === 2000, "Alibaba product rows should preserve wholesale quantities");
  assert(alibabaLines[0].description.includes("Applicator Bottle") && alibabaLines[0].line_total === 123.52, "Alibaba product rows should keep continuation text and product subtotal");
  assert(Math.abs(alibabaLines[0].unit_price - 0.06176) < 0.000001, "Alibaba unit price should be calculated from the product subtotal, not from shipping or fees");
  const etsyText = `Pedido n.º 4087214951
Comprado el 10 jun 2026
LancelotDIY
31 artículos · 504,70 €
Collar con cadena de cuentas de 2 mm, plata de ley 925 maciza, chapad …
14,93 €
Ctd.: 6; Color: White Gold Plated
N. º de transacción: 5109024083
Colgante de resina con forma de luna y leche materna de 9 x 11 mm con e … 16,16 €
Ctd.: 3; Color: Yellow Gold Plated
N. º de transacción: 5099084420
Resumen del pedido
Total de los artículos 504,70 €
Envío 13,57 €
Total 518,27 €
https://www.etsy.com/es/your/purchases/4087214951`;
  const etsyFields = detectFields(etsyText);
  assert(etsyFields.invoice_number === "4087214951" && etsyFields.invoice_date === "2026-06-10", "Etsy purchase references and dates should be detected");
  assert(etsyFields.subtotal === 504.7 && etsyFields.shipping === 13.57 && etsyFields.total === 518.27, "Etsy order adjustments should stay at invoice level");
  assert(inferExpenseCategory(etsyText, "joyas/plata", ["envios"]) === "materiales", "Etsy jewelry purchases should be classified as materials despite shipping text");
  const etsyLines = detectedEtsyLines(etsyFields.lines, etsyFields);
  assert(etsyLines.length === 2 && etsyLines[0].quantity === 6 && etsyLines[1].quantity === 3, "Etsy product variants should preserve quantities");
  assert(etsyLines[0].description.includes("White Gold Plated") && etsyLines[1].description.includes("Yellow Gold Plated"), "Etsy product descriptions should preserve finish variants");
  assert(etsyLines.every((line) => !/^env[ií]o$/i.test(line.description)) && Math.abs(etsyLines[0].line_total - 89.58) < 0.01, "Etsy shipping must not become a product line");
  const sheinText = `Infinite Styles Services Co., Limited
VAT Invoice
Bill To: Invoice No.:
Cristina Guerrero XES20260609312005089327_1
Billing Address: Invoice Date:
Calle Ayala 80 Malaga Spain 2026-06-12
Order Information
Order Number: Order Date:
GS017Y631007HVU 2026-06-09
Invoice Detail
Description Quantity | Taxable Amount VAT Rate VAT Amount Gross Amount
(EUR) (EUR) (EUR)
XZV 100 piezas Bolsas de plástico resellables 1 1.50 21% 0.31 1.81
transparentes para empaquetar joyas
XZV 100 piezas Bolsas de plástico resellables 1 1.50 21% 0.31 1.81
transparentes para empaquetar joyas
TOTAL 3.00 0.62 3.62
VAT Breakdown`;
  const sheinFields = detectFields(sheinText);
  assert(sheinFields.invoice_number === "XES20260609312005089327_1" && sheinFields.invoice_date === "2026-06-12", "Shein invoice references and dates should be detected");
  assert(sheinFields.subtotal === 3 && sheinFields.tax === 0.62 && sheinFields.total === 3.62, "Shein net amount, VAT and gross total should stay separated");
  assert(inferExpenseCategory(sheinText, "materiales", ["envios"]) === "materiales", "Shein VAT purchase invoices should be classified as materials");
  const sheinLines = detectedSheinLines(sheinFields.lines);
  assert(sheinLines.length === 1 && sheinLines[0].package_count === 2 && sheinLines[0].units_per_package === 100 && sheinLines[0].quantity === 200, "Repeated Shein packs should preserve package structure and real purchased units");
  assert(sheinLines[0].line_total === 3.62 && sheinLines[0].price_per_package === 1.81 && Math.abs(sheinLines[0].unit_price - 0.0181) < 0.000001, "Shein material prices should include VAT at package, unit and line level");
  const capcutText = `18 de junio de 2026
Secuencia: 1-13844802927
ID de pedido: MXGSH2FKWD
Documento: 784149346482
Cuenta de Apple: cquerreroheras gmail.com
CapCut - Editor de vídeo 20,00 €
2 puestos/mensual (Mensual Incluye el VAT del 21% 3,47 €
Se renueva el 19 de julio de 2026
Pagos y facturación
Cristina Guerrero Heras Subtotal 16,53 €
Ayala Se ha cargado un 21 % de VAT 3,47€
España Visa +++ 6704 (Apple Pay) 20,00 €`;
  const capcutFields = detectFields(capcutText);
  assert(capcutFields.invoice_number === "784149346482" && capcutFields.invoice_date === "2026-06-18", "CapCut document number and purchase date should be detected");
  assert(capcutFields.subtotal === 16.53 && capcutFields.tax === 3.47 && capcutFields.total === 20, "CapCut subtotal, VAT and final paid total should be separated correctly");
  assert(inferExpenseCategory(capcutText, "materiales", ["materiales"]) === "software", "CapCut invoices should stay classified as software");
  const capcutLines = detectedCapCutLines(capcutFields.lines, capcutFields);
  assert(capcutLines.length === 1 && capcutLines[0].quantity === 2, "CapCut subscriptions should become a single line with seat quantity");
  assert(!capcutLines[0].description.includes("Apple Pay") && capcutLines[0].line_total === 20, "CapCut payment rows must not become expense lines");
  const compactCapcutFields = detectFields(capcutText.replace("Subtotal 16,53 €", "Subtotal 1653€"));
  assert(compactCapcutFields.subtotal === 16.53, "CapCut compact OCR subtotals should be restored from the paid total and VAT");
  const canvaText = `Factura fiscal
Fecha de factura Nro. de factura
8 de julio de 2026 04936-17085274
Para Dirección de facturación
Suscripciones
Canva Pro 12,00 €
iAHOyLNOiT4
8 de julio de 2026
Los pagos se procesan de manera internacional. Se pueden aplicar Total 12,00 €
tarifas bancarias adicionales.
Impuestos incluidos 2,08 €
Importe total 12,00 €
Canva Pty. Ltd. ABN 80 158 929 938, VAT EU372042198`;
  const canvaFields = detectFields(canvaText);
  assert(canvaFields.invoice_number === "04936-17085274" && canvaFields.invoice_date === "2026-07-08", "Canva PDF invoice date and number should be read from the combined header row");
  assert(canvaFields.total === 12 && canvaFields.tax === 2.08 && canvaFields.category === "software", "Canva totals should stay at invoice level and be classified as software");
  assert(inferExpenseCategory(canvaText, "materiales", ["materiales"]) === "software", "Canva invoices should override supplier defaults as software");
  const canvaLines = detectedCanvaLines(canvaFields.lines, canvaFields);
  assert(canvaLines.length === 1 && canvaLines[0].description === "Canva Pro" && canvaLines[0].line_total === 12, "Canva subscriptions should create one product line and exclude included taxes");
  const appleIcloudText = `15 de enero de 2026
Secuencia: 1-12793147473
ID de pedido: MXG4XQ4LS5
Documento: 650077581715
Cuenta de Apple: cristina@example.com
iCloud 999€
iCloud+ con 2 TB (Mensual) Incluye el VAT del 21% 173€
Se renueva el 15 de febrero de 2026
Pagos y facturación
Cristina Guerrero Heras Subtotal 826€
Ayala Se ha cargado un 21 % de VAT 173€
España Visa +++ 6704 (Apple Pay) 9,99 €`;
  const appleIcloudFields = detectFields(appleIcloudText);
  assert(appleIcloudFields.invoice_number === "650077581715" && appleIcloudFields.invoice_date === "2026-01-15", "Apple iCloud document numbers and Spanish dates should be detected");
  assert(appleIcloudFields.subtotal === 8.26 && appleIcloudFields.tax === 1.73 && appleIcloudFields.total === 9.99, "Apple iCloud compact OCR amounts should be converted to euros");
  assert(inferExpenseCategory(appleIcloudText, "otros", ["otros"]) === "software", "Apple iCloud invoices should be classified as software");
  const appleIcloudLines = detectedInvoiceLines(appleIcloudFields.lines, appleIcloudFields);
  assert(appleIcloudLines.length === 1 && appleIcloudLines[0].description.includes("iCloud") && appleIcloudLines[0].line_total === 9.99, "Apple iCloud subscriptions should become one editable expense line");
  const appleStoreText = `Tu factura
¡Gracias por tu compra!
FACTURA FECHA DE EMISIÓN
04906-34141827 8 jun 2026
Resumen de la factura
ARTÍCULO IMPORTE
Precio de la suscripción 12,00 €
Cobrado: 12,00 €`;
  const appleStoreFields = detectFields(appleStoreText);
  assert(appleStoreFields.invoice_number === "04906-34141827" && appleStoreFields.invoice_date === "2026-06-08" && appleStoreFields.total === 12, "Apple App Store receipts should read invoice number, issue date and paid total");
  assert(detectedInvoiceLines(appleStoreFields.lines, appleStoreFields)[0].description === "Precio de la suscripción", "Apple App Store product descriptions should stay clean");
  const correosText = `SOCIEDAD EST. CORREOS Y TELÃ‰GRAFOS, S.A., S.M.E.
FACTURA
NIF CONTRATO CLIENTE FECHA NÂº FACTURA
25737299T 54090896 9981562306 30.06.2026 4004726887
Resumen
Base imponible sujeta a impuesto (IVA) 23,66
Importe Bruto 32,77
Importe bonificaciÃ³n -9,11
Tipo impositivo: EXENTO
Cuota: 0,00
Base imponible sujeta a impuesto (IVA) 370,79
Importe Bruto 608,01
Importe bonificaciÃ³n -237,22
Tipo impositivo: 21,00 %
Cuota: 77,87
Totales
Total importe bruto 640,78
Total importe bonificaciÃ³n -246,33
Total importe neto antes de impuesto 394,45
Total impuesto 77,87
Total factura en Euros 472,32
Detalle de envÃ­os
Producto Contrato PaÃ­s Peso Importe`;
  const correosFields = detectFields(correosText);
  assert(correosFields.invoice_number === "4004726887" && correosFields.invoice_date === "2026-06-30", "Correos invoice number and date should be detected from the header");
  assert(correosFields.subtotal === 640.78 && correosFields.discount === 246.33 && correosFields.tax === 77.87 && correosFields.total === 472.32, "Correos summary totals should stay at invoice level");
  assert(correosFields.category === "envios" && correosFields.supplier_hint === "correos" && correosFields.suppress_lines, "Correos invoices should be classified as shipping and avoid detail lines");
  assert(detectedInvoiceLines(correosFields.lines, correosFields).length === 0, "Correos detail invoices should not generate suggested lines");
  const dhlText = `DHL Express Spain, S.L.U.
aduanas.facturas.es@dhl.com
7Q5 2026007557 CRISTINA GUERRERO HERAS
Num. de factura :
05/04/2026 CALLE AYALA 80
Fecha :
Cta. aduana : DUTYESCSH
Valor CIF : 104,35
IVA 21,91 21,91
GESTION DE DESPACHO 19,00 19,00
I.V.A. 21 % sobre 19,00 3,99
Total a pagar euros : 44,90
HAWB: 5780280122`;
  const dhlFields = detectFields(dhlText);
  assert(dhlFields.invoice_number === "7Q5 2026007557" && dhlFields.invoice_date === "2026-04-05", "DHL customs invoices should keep the customs reference and issue date");
  assert(dhlFields.shipping === 19 && dhlFields.tax === 25.9 && dhlFields.total === 44.9, "DHL customs VAT and clearance fees should reconcile the paid total");
  assert(dhlFields.category === "envios" && dhlFields.supplier_hint === "dhl" && dhlFields.suppress_lines, "DHL customs invoices should be classified as shipping without detail lines");
  assert(detectedInvoiceLines(dhlFields.lines, dhlFields).length === 0, "DHL customs invoices should not generate suggested lines");
  const fedexText = `FedEx Express Spain S.L.U.
Numero de factura: 895541853
Fecha Factura: 04/06/2026
Importe de factura 114,13 EUR
HERAS, CRISTINA GUERRERO Total Pendiente 0,00 EUR
Factura de aranceles e impuestos a pagar por adelantado
Receptor: Total EUR 102,69
Importes fuera del ambito de aplicacion del IVA EUR 48,22
Gastos administrativos sujetos al IVA de 21,00 % EUR 14,47
Otros cargos sujetos al IVA de 21,00 % EUR 40,00
IVA del 21,00 % EUR 11,44
Importe total adeudado EUR 0,00`;
  const fedexFields = detectFields(fedexText);
  assert(fedexFields.invoice_number === "895541853" && fedexFields.invoice_date === "2026-06-04", "FedEx customs invoices should detect invoice number and invoice date");
  assert(fedexFields.subtotal === 102.69 && fedexFields.tax === 11.44 && fedexFields.total === 114.13, "FedEx should use invoice amount instead of pending or due zero totals");
  assert(fedexFields.category === "envios" && fedexFields.supplier_hint === "fedex" && fedexFields.suppress_lines, "FedEx customs invoices should be classified as shipping without detail lines");
  assert(detectedInvoiceLines(fedexFields.lines, fedexFields).length === 0, "FedEx customs invoices should not generate suggested lines");
  const evidence = fieldEvidence({ suggested_supplier_name: "Meta", invoice_number: "FBADS-394", invoice_date: "2026-04-04", total: 18.51 }, [{ page: 1, text: "Meta Platforms\nFactura FBADS-394\nTotal 18,51 EUR" }]);
  assert(evidence.supplier?.page === 1 && evidence.invoice_number?.text.includes("FBADS-394"), "Detected fields should retain document evidence");
  const safeAccounting = accountingQuality({ suggested_supplier_id: 1, invoice_number: "A-1", invoice_date: "2026-01-01", total: 10, category: "software" }, [{ line_total: 10, human_decision: "accepted" }], {});
  assert(safeAccounting.batch_eligible && safeAccounting.score === 4, "Accounting quality should be independent from OCR confidence");
  const discountedAccounting = accountingQuality({ suggested_supplier_id: 1, invoice_number: "A-2", invoice_date: "2026-01-01", subtotal: 11.5, discount: 1.5, total: 10, category: "materiales" }, [{ line_total: 11.5, human_decision: "accepted" }], {});
  assert(discountedAccounting.lines_match && discountedAccounting.calculated_total === 10, "Accounting quality should reconcile product subtotal and invoice-level discounts without changing material prices");
  const grossAccounting = accountingQuality({ suggested_supplier_id: 1, invoice_number: "A-3", invoice_date: "2026-01-01", subtotal: 3, tax: 0.62, total: 3.62, category: "materiales" }, [{ line_total: 3.62, human_decision: "accepted" }], {});
  assert(grossAccounting.lines_match && grossAccounting.line_price_basis === "gross", "Accounting quality should accept VAT-inclusive material lines without adding tax twice");
  const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  assert(indexHtml.includes('<option value="impuestos">Impuestos</option>'), "Manual invoice and settings forms should expose the tax expense category");
  cleanTestDir();
  const mockShopifyServer = await createMockShopifyServer();
  let serverOutput = "";
  let child = null;

  function startTestServer() {
    const proc = spawn(process.execPath, [SERVER, "--port", String(PORT)], {
      cwd: ROOT,
      env: {
        ...process.env,
        MUA_OPS_DATA_DIR: TEST_DIR,
        MUA_OPS_DB_FILE: path.join(TEST_DIR, "mua_ops_test.sqlite"),
        MUA_OPS_LEGACY_JSON: path.join(TEST_DIR, "empty.json"),
        MUA_OPS_AUTO_TEST_HEALTH_AFTER_SYNC: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    proc.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
    return proc;
  }

  async function stopTestServer() {
    if (!child) return;
    const proc = child;
    child = null;
    proc.kill();
    await new Promise((resolve) => proc.once("exit", resolve));
  }

  child = startTestServer();

  try {
    await waitForServer();

    const summary = await request("GET", "/api/summary");
    assert(summary.db_path.endsWith("mua_ops_test.sqlite"), "Summary should use the test database");
    assert(typeof summary.payouts === "number", "Summary should include payout count");

    const seededSuppliers = await request("GET", "/api/suppliers");
    const socialSecuritySupplier = seededSuppliers.find((supplier) => supplier.name === "Seguridad social");
    assert(socialSecuritySupplier?.category === "impuestos", "Seguridad social should be seeded as a tax expense supplier");

    const initialDashboard = await request("GET", "/api/dashboard/finance");
    assert(initialDashboard.kpis, "Dashboard finance should include KPIs");
    assert(Array.isArray(initialDashboard.monthly_spend), "Dashboard finance should include monthly spend");
    assert(initialDashboard.monthly_breakdown?.series?.total, "Dashboard finance should include monthly breakdown");
    assert(Array.isArray(initialDashboard.category_spend), "Dashboard finance should include category spend");
    assert(Array.isArray(initialDashboard.top_suppliers), "Dashboard finance should include top suppliers");
    assert(Array.isArray(initialDashboard.top_materials), "Dashboard finance should include top materials");
    assert(initialDashboard.profitability?.thresholds?.critical === 75, "Dashboard should expose the configured critical margin threshold");
    assert(initialDashboard.profitability?.thresholds?.healthy === 88, "Dashboard should expose the configured healthy margin threshold");
    assert(Array.isArray(initialDashboard.profitability?.bands), "Dashboard should expose margin bands");
    assert(Array.isArray(initialDashboard.profitability?.cost_drivers), "Dashboard should expose profitability cost drivers");
    assert(Array.isArray(initialDashboard.replenishment?.recommendations), "Dashboard should expose intelligent replenishment context");
    assert(initialDashboard.data_quality, "Dashboard should expose data quality context");

    const quarterDashboard = await request("GET", "/api/dashboard/finance?preset=this_quarter&granularity=week");
    assert(quarterDashboard.window.preset === "this_quarter", "Dashboard should support the current quarter preset");
    assert(quarterDashboard.granularity === "week", "Dashboard should support weekly granularity");
    const dailyDashboard = await request("GET", "/api/dashboard/finance?preset=last_30_days&granularity=day");
    assert(dailyDashboard.window.preset === "last_30_days", "Dashboard should support the last 30 days preset");
    assert(dailyDashboard.granularity === "day", "Dashboard should support daily granularity");
    assert(dailyDashboard.trend.keys.length === 30, "Daily Dashboard charts should retain the complete selected period");
    assert(dailyDashboard.profitability.series.length === 30, "Daily profitability charts should retain the complete selected period");
    for (const preset of ["this_month", "last_30_days", "this_quarter", "last_3_months", "last_6_months", "this_year", "all"]) {
      for (const granularity of ["day", "week", "month", "quarter"]) {
        const matrixDashboard = await request("GET", `/api/dashboard/finance?preset=${preset}&granularity=${granularity}`);
        assert(matrixDashboard.window.preset === preset, `Dashboard should preserve preset ${preset}`);
        assert(matrixDashboard.granularity === granularity, `Dashboard should preserve granularity ${granularity}`);
        assert(Array.isArray(matrixDashboard.trend?.keys), `Dashboard trend should be available for ${preset}/${granularity}`);
        assert(Array.isArray(matrixDashboard.profitability?.series), `Dashboard profitability should be available for ${preset}/${granularity}`);
      }
    }

    const initialHealth = await request("GET", "/api/system/health");
    assert(initialHealth.ok === true, "System health should be ok on a fresh database");
    assert(initialHealth.database.integrity === "ok", "System health should expose SQLite integrity");
    assert(initialHealth.schema.pending_migrations.length === 0, "System health should have no pending migrations");
    assert(initialHealth.schema.applied_migrations.length >= 2, "System health should expose applied migrations");

    const manualBackup = await request("POST", "/api/system/backup", { reason: "api-test" });
    assert(manualBackup.created === true, "Manual system backup should be created");
    assert(fs.existsSync(manualBackup.file), "Manual system backup file should exist");

    const missingPayout = await requestRaw("GET", "/api/channel-payouts/999999");
    assert(missingPayout.response.status === 404, "API errors should preserve HTTP status");
    assert(missingPayout.payload.code === "PAYOUT_NOT_FOUND", "API errors should expose a stable code");

    const settings = await request("GET", "/api/settings");
    assert(settings.dashboard_monthly_view === "total", "Settings should expose default dashboard monthly view");
    assert(settings.dashboard_income_monthly_view === "cobros", "Settings should expose default income dashboard view");
    [
      "dashboard_color_total", "dashboard_color_materiales", "dashboard_color_marketing", "dashboard_color_envios",
      "dashboard_color_servicios", "dashboard_color_software", "dashboard_color_impuestos", "dashboard_color_otros", "dashboard_color_balance",
      "dashboard_color_cobros", "dashboard_color_fees", "dashboard_color_shopify", "dashboard_color_etsy", "dashboard_color_bizum",
      "dashboard_color_profit_sales", "dashboard_color_profit_cost", "dashboard_color_profit_margin",
      "dashboard_color_sales_revenue", "dashboard_color_sales_orders", "dashboard_color_sales_ticket", "dashboard_color_sales_previous",
      "dashboard_color_margin_critical", "dashboard_color_margin_pressure", "dashboard_color_margin_healthy",
      "dashboard_color_cost_content", "dashboard_color_cost_fixed"
    ].forEach((key) => assert(/^#[0-9a-f]{6}$/i.test(settings[key]), `Settings should expose ${key}`));
    const updatedSettings = await request("PATCH", "/api/settings", {
      dashboard_monthly_view: "marketing",
      dashboard_income_monthly_view: "channel_shopify",
      default_invoice_status: "posted",
      default_payout_channel: "bizum",
      dashboard_color_bizum: "#c18a3a",
      dashboard_color_servicios: "#7a7168",
      dashboard_color_impuestos: "#8b5a42",
      dashboard_color_profit_margin: "#bf7412",
      dashboard_color_sales_revenue: "#0f6f64",
      dashboard_color_sales_orders: "#4b778a",
      dashboard_color_margin_healthy: "#157260"
    });
    assert(updatedSettings.dashboard_monthly_view === "marketing", "Settings should be editable");
    assert(updatedSettings.dashboard_income_monthly_view === "channel_shopify", "Settings should persist income dashboard defaults");
    assert(updatedSettings.default_invoice_status === "posted", "Settings should persist invoice defaults");
    assert(updatedSettings.default_payout_channel === "bizum", "Settings should persist payout defaults");
    assert(updatedSettings.dashboard_color_servicios === "#7a7168", "Settings should persist expense category colors");
    assert(updatedSettings.dashboard_color_impuestos === "#8b5a42", "Settings should persist tax expense category colors");
    assert(updatedSettings.dashboard_color_profit_margin === "#bf7412", "Settings should persist profitability series colors");
    assert(updatedSettings.dashboard_color_sales_revenue === "#0f6f64", "Settings should persist sales series colors");
    assert(updatedSettings.dashboard_color_sales_orders === "#4b778a", "Settings should persist sales comparison colors");
    assert(updatedSettings.dashboard_color_margin_healthy === "#157260", "Settings should persist profitability band colors");

    const shopifyConnection = await request("PATCH", "/api/shopify/connection", {
      store_domain: `http://127.0.0.1:${SHOPIFY_MOCK_PORT}`,
      client_id: "shpui_test_client",
      client_secret: "shpss_test_secret",
      api_version: "2026-01",
      sync_enabled: true,
      sync_interval_minutes: 60,
      pull_products: true,
      pull_inventory: true,
      pull_orders: true,
      pull_payouts: true
    });
    assert(shopifyConnection.credentials_configured === true, "Shopify connection should persist client credentials server-side");

    const connectionStatus = await request("GET", "/api/shopify/connection");
    assert(connectionStatus.client_id_masked.endsWith("ient"), "Shopify connection should only expose a masked client id");
    assert(connectionStatus.client_secret_masked.endsWith("cret"), "Shopify connection should only expose a masked client secret");
    assert(connectionStatus.auth_mode === "client_credentials", "Shopify connection should detect client credentials auth");
    const scopedConnection = await request("PATCH", "/api/shopify/connection", {
      pull_products: false,
      pull_inventory: true,
      pull_orders: false,
      pull_payouts: true
    });
    assert(scopedConnection.store_domain === `http://127.0.0.1:${SHOPIFY_MOCK_PORT}`, "Partial Shopify updates must preserve the domain");
    assert(scopedConnection.pull_products === false && scopedConnection.pull_orders === false, "Shopify sync scope should persist disabled resources");
    const scopedConnectionReloaded = await request("GET", "/api/shopify/connection");
    assert(scopedConnectionReloaded.pull_products === false && scopedConnectionReloaded.pull_orders === false, "Shopify sync scope should survive reload");
    await request("PATCH", "/api/shopify/connection", { pull_products: true, pull_orders: true });
    const healthWithShopify = await request("GET", "/api/system/health");
    const healthText = JSON.stringify(healthWithShopify);
    assert(!healthText.includes("shpss_test_secret"), "System health must not expose Shopify client secret");
    assert(!healthText.includes("mock_access_token_1234"), "System health must not expose Shopify access tokens");

    const connectionTest = await request("POST", "/api/shopify/connection/test", {});
    assert(connectionTest.ok === true, "Shopify connection test should succeed against mock server");

    const firstShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(firstShopifySync.products?.rows > 0, "Shopify sync should import products");
    assert(firstShopifySync.inventory?.rows > 0, "Shopify sync should import inventory");
    assert(firstShopifySync.orders?.rows > 0, "Shopify sync should import orders");
    assert(firstShopifySync.payouts?.rows > 0, "Shopify sync should import payouts");
    assert(firstShopifySync.verification_scheduled === false, "Automatic verification should stay disabled in API tests");

    const secondShopifySync = await request("POST", "/api/shopify/sync", {});
    assert(secondShopifySync.products?.created === 0, "Shopify product sync should be idempotent on second run");

    const shopifySyncStatus = await request("GET", "/api/shopify/sync-status");
    assert(shopifySyncStatus.last_sync_status === "ok", "Shopify sync status should record successful syncs");
    assert(shopifySyncStatus.last_products_sync_at, "Shopify sync status should retain per-block timestamps");
    assert(shopifySyncStatus.pull_products === true && shopifySyncStatus.pull_orders === true, "Shopify sync status should expose active sync scopes");

    const previousOrdersSyncAt = shopifySyncStatus.last_orders_sync_at;
    const previousProductsSyncAt = shopifySyncStatus.last_products_sync_at;
    await request("PATCH", "/api/shopify/connection", {
      pull_products: false,
      pull_inventory: false,
      pull_orders: true,
      pull_payouts: false
    });
    const scopedSync = await request("POST", "/api/shopify/sync", {});
    assert(scopedSync.products === null, "Shopify sync should skip disabled product scope");
    assert(scopedSync.inventory === null, "Shopify sync should skip disabled inventory scope");
    assert(scopedSync.payouts === null, "Shopify sync should skip disabled payouts scope");
    assert(scopedSync.orders?.status === "ok", "Shopify sync should still execute enabled order scope");
    assert(scopedSync.verification_scheduled === false, "Scoped sync should also report auto verification as disabled in test mode");
    const scopedStatusAfterSync = await request("GET", "/api/shopify/sync-status");
    assert(scopedStatusAfterSync.last_orders_sync_at && scopedStatusAfterSync.last_orders_sync_at !== previousOrdersSyncAt, "Order sync timestamp should advance when orders scope runs");
    assert(scopedStatusAfterSync.last_products_sync_at === previousProductsSyncAt, "Product sync timestamp should stay untouched when products scope is disabled");
    await request("PATCH", "/api/shopify/connection", {
      pull_products: true,
      pull_inventory: true,
      pull_orders: true,
      pull_payouts: true
    });

    const shopifyImport = await request("POST", "/api/import/payouts/shopify", {});
    assert(shopifyImport.rows_total > 0, "Shopify payouts import should read rows");
    assert(shopifyImport.rows_created > 0, "Shopify payouts import should create payouts");

    const etsyImport = await request("POST", "/api/import/payouts/etsy", {});
    assert(etsyImport.rows_total > 0, "Etsy payouts import should read rows");
    assert(etsyImport.rows_created > 0, "Etsy payouts import should create deposits");

    const secondShopifyImport = await request("POST", "/api/import/payouts/shopify", {});
    assert(secondShopifyImport.rows_created === 0, "Shopify payouts reimport should be idempotent");

    const incomeSummary = await request("GET", "/api/income/summary");
    assert(incomeSummary.payout_count > 0, "Income summary should include imported payouts");
    assert(incomeSummary.total_net_amount > 0, "Income summary should aggregate net payouts");

    const payoutImports = await request("GET", "/api/income/imports");
    assert(payoutImports.length >= 2, "Income imports should track payout imports");

    const payouts = await request("GET", "/api/channel-payouts");
    assert(payouts.some((row) => row.channel === "shopify"), "Channel payouts should include Shopify rows");
    assert(payouts.some((row) => row.channel === "etsy"), "Channel payouts should include Etsy rows");
    assert(payouts.some((row) => row.external_id === "shopify_payout:623721858"), "Shopify direct sync should persist API payouts");

    const manualPayout = await request("POST", "/api/channel-payouts", {
      channel: "bizum",
      payout_date: "2026-03-31",
      status: "paid",
      currency: "EUR",
      gross_amount: 100,
      fees_amount: 0,
      net_amount: 100,
      notes: "Manual payout test"
    });
    assert(manualPayout.id, "Manual payout should be created");
    assert(manualPayout.channel === "bizum", "Manual payout should allow Bizum channel");
    const editedPayout = await request("PATCH", `/api/channel-payouts/${manualPayout.id}`, {
      notes: "Manual payout edited",
      bank_reference: "TESTBANK001"
    });
    assert(editedPayout.bank_reference === "TESTBANK001", "Payout should be editable");
    const archivedPayout = await request("DELETE", `/api/channel-payouts/${manualPayout.id}`);
    assert(archivedPayout.is_deleted === 1, "Payout should be archivable");
    const restoredPayout = await request("POST", `/api/channel-payouts/${manualPayout.id}/restore`);
    assert(restoredPayout.is_deleted === 0, "Payout should be restorable");

    const duplicateSeed = await request("POST", "/api/channel-payouts", {
      channel: "shopify",
      external_id: "shopify|2026-05-20|441.06|csv-ref",
      payout_date: "2026-05-20",
      status: "paid",
      currency: "EUR",
      gross_amount: 452.36,
      fees_amount: 11.30,
      net_amount: 441.06,
      bank_reference: "csv-ref",
      notes: "Seeded from CSV-style import"
    });
    const duplicateUpdate = await request("POST", "/api/channel-payouts", {
      channel: "shopify",
      external_id: "gid://shopify/ShopifyPaymentsPayout/999",
      payout_date: "2026-05-20",
      status: "paid",
      currency: "EUR",
      gross_amount: 452.36,
      fees_amount: 11.30,
      net_amount: 441.06,
      notes: "Updated from API sync"
    });
    assert(duplicateUpdate.id === duplicateSeed.id, "Equivalent Shopify payouts should deduplicate across sources");
    assert(duplicateUpdate.external_id === "gid://shopify/ShopifyPaymentsPayout/999", "API payout id should replace fallback CSV-style id when matched");

    const supplier = await request("POST", "/api/suppliers", {
      name: "Test Supplier",
      category: "materiales",
      website: "https://example.com",
      lead_time_days: 7,
      notes: "Created by API test"
    });
    assert(supplier.id, "Supplier should be created");

    const editedSupplier = await request("PATCH", `/api/suppliers/${supplier.id}`, { lead_time_days: 9 });
    assert(editedSupplier.lead_time_days === 9, "Supplier should be editable");
    const archivedSupplier = await request("DELETE", `/api/suppliers/${supplier.id}`);
    assert(archivedSupplier.is_deleted === 1, "Supplier should be archived");
    const restoredSupplier = await request("POST", `/api/suppliers/${supplier.id}/restore`);
    assert(restoredSupplier.is_deleted === 0, "Supplier should be restored");

    const material = await request("POST", "/api/materials", {
      name: "Cadena acero banado dorado test",
      category: "cadena",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      manual_stock: 0,
      reorder_point: 10,
      target_stock: 50,
      notes: "Created by API test"
    });
    assert(material.id, "Material should be created");

    const products = await request("GET", "/api/shopify-products?q=cadena");
    assert(products.some((row) => row.handle === "cadena-incluida-dorada-acero"), "Shopify direct sync should expose imported products");
    if (products.length) {
      const linked = await request("PATCH", `/api/shopify-products/${products[0].id}`, { material_id: material.id });
      assert(linked.material_id === material.id, "Shopify product should link to a material");
    }

    const fixturePath = path.join(TEST_DIR, "sample-invoice.txt");
    fs.writeFileSync(fixturePath, "Sample invoice for Mua Ops API test");
    const form = new FormData();
    form.append("document", new Blob([fs.readFileSync(fixturePath)], { type: "text/plain" }), "sample-invoice.txt");
    form.append("related_entity", "invoice");
    const document = await request("POST", "/api/documents", form);
    assert(fs.existsSync(document.stored_path), "Uploaded document should be copied to uploads");

    const invoice = await request("POST", "/api/invoices", {
      supplier_id: supplier.id,
      document_id: document.id,
      invoice_number: "TEST-001",
      invoice_date: "2026-01-23",
      category: "materiales",
      subtotal: 16.76,
      discount: 0,
      shipping: 4,
      tax: 0,
      total: 20.76,
      currency: "EUR",
      status: "posted",
      notes: "API test invoice"
    });
    assert(invoice.id, "Invoice should be created");

    const duplicatedInvoice = await request("POST", `/api/invoices/${invoice.id}/duplicate`);
    assert(duplicatedInvoice.status === "draft", "Duplicated invoice should be created as a draft");
    assert(duplicatedInvoice.additional_tax === 0, "Duplicated invoice should default additional tax to zero");
    assert(duplicatedInvoice.invoice_number === "TEST-001 copia", "Duplicated invoice should suffix the invoice number");

    const taxInvoice = await request("POST", "/api/invoices", {
      supplier_id: socialSecuritySupplier.id,
      invoice_number: "TGSS-TEST-001",
      invoice_date: "2026-01-24",
      category: "impuestos",
      subtotal: 320,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 320,
      currency: "EUR",
      status: "posted",
      notes: "Self-employed social security fee"
    });
    assert(taxInvoice.id, "Tax expense invoices should be created");
    const dashboardWithTaxExpense = await request("GET", "/api/dashboard/finance?preset=this_year");
    assert(dashboardWithTaxExpense.category_spend.some((row) => row.category === "impuestos" && row.total === 320), "Dashboard finance should include tax expense category spend when present");

    const line = await request("POST", `/api/invoices/${invoice.id}/lines`, {
      material_id: material.id,
      description: "4 paquetes x 5 unidades a 4,19 EUR",
      package_count: 4,
      units_per_package: 5,
      price_per_package: 4.19,
      impressions: 18764,
      affects_stock: true
    });
    assert(line.total_units === 20, "Line should calculate total units");
    assert(Math.abs(line.unit_price - 0.838) < 0.0001, "Line should calculate unit cost");
    assert(line.impressions === 18764, "Invoice lines should preserve marketing impressions");

    let costs = await request("GET", "/api/costs/materials");
    let materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 1, "Costs should include active invoice line");
    assert(Math.abs(materialCost.weighted_avg_unit_cost_inc_vat - 0.838) < 0.0001, "Weighted cost should match line cost");

    const editedLine = await request("PATCH", `/api/invoices/${invoice.id}/lines/${line.id}`, {
      material_id: material.id,
      description: line.description,
      package_count: 4,
      units_per_package: 5,
      price_per_package: 5,
      impressions: 18764,
      affects_stock: true
    });
    assert(Math.abs(editedLine.unit_price - 1) < 0.0001, "Edited line should recalculate unit cost");

    const duplicatedLine = await request("POST", `/api/invoices/${invoice.id}/lines/${line.id}/duplicate`);
    assert(duplicatedLine.total_units === 20, "Duplicated line should preserve units");
    assert(Math.abs(duplicatedLine.unit_price - 1) < 0.0001, "Duplicated line should preserve unit cost without shipping allocation");
    assert(duplicatedLine.impressions === 18764, "Duplicated invoice lines should preserve impressions");

    const archivedInvoice = await request("DELETE", `/api/invoices/${invoice.id}`);
    assert(archivedInvoice.is_deleted === 1, "Invoice should be archived");
    costs = await request("GET", "/api/costs/materials");
    materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 2, "Archived material invoice should keep contributing to costs");

    const restoredInvoice = await request("POST", `/api/invoices/${invoice.id}/restore`);
    assert(restoredInvoice.is_deleted === 0, "Invoice should be restored");
    costs = await request("GET", "/api/costs/materials");
    materialCost = costs.find((row) => row.material_id === material.id);
    assert(materialCost.purchase_lots === 2, "Restored invoice should affect costs again");

    const kitRecipe = await request("POST", "/api/kit-recipes", {
      name: "Kit test base",
      version: "maternal",
      is_default: true,
      order_type: "maternity",
      is_type_default: true,
      notes: "API test fixed set"
    });
    assert(kitRecipe.id, "Kit recipe should be created");
    assert(Number(kitRecipe.is_default) === 1, "Kit recipe should be markable as default");
    assert(kitRecipe.order_type === "maternity" && Number(kitRecipe.is_type_default) === 1, "Kit recipes should be defaultable per order typology");

    const kitItem = await request("POST", `/api/kit-recipes/${kitRecipe.id}/items`, {
      material_id: material.id,
      quantity: 2,
      notes: "Component included by default"
    });
    assert(kitItem.id, "Kit recipe item should be created");

    let kits = await request("GET", "/api/kit-recipes");
    let defaultKit = kits.find((row) => row.id === kitRecipe.id);
    assert(defaultKit.item_count === 1, "Kit recipe should expose item count");
    assert(defaultKit.included_item_count === 1, "Kit recipe should count included components");
    assert(defaultKit.excluded_item_count === 0, "Kit recipe should count excluded components");
    assert(Math.abs(defaultKit.known_cost - 2) < 0.0001, "Kit recipe should include component cost in known cost");
    assert(defaultKit.missing_cost_items === 0, "Kit recipe should not mark included costed components as missing");

    const excludedKitItem = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: false
    });
    assert(Number(excludedKitItem.include_in_cost) === 0, "Kit item should be excludable from fixed set cost");
    kits = await request("GET", "/api/kit-recipes");
    defaultKit = kits.find((row) => row.id === kitRecipe.id);
    assert(defaultKit.included_item_count === 0, "Excluded kit items should not count as included");
    assert(defaultKit.excluded_item_count === 1, "Excluded kit items should count as excluded");
    assert(Math.abs(defaultKit.known_cost) < 0.0001, "Excluded kit item should not contribute to fixed set cost");
    assert(defaultKit.missing_cost_items === 0, "Excluded kit item should not count as missing cost");

    const includedKitItem = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: true
    });
    assert(Number(includedKitItem.include_in_cost) === 1, "Kit item should be includable again");
    const completedKit = await request("PATCH", `/api/kit-recipes/${kitRecipe.id}`, { is_complete: true });
    assert(Number(completedKit.is_complete) === 1, "Kit recipe should be markable as complete");
    const completeToggleAttempt = await requestRaw("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, {
      include_in_cost: false
    });
    assert(completeToggleAttempt.response.status === 400, "Completed kit recipe should block item inclusion edits");
    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}`, { is_complete: false });

    const orderSyncAfterCost = await request("POST", "/api/shopify/sync/orders", { full: true });
    assert(orderSyncAfterCost.orders?.rows > 0, "Full Shopify order sync should import order lines");
    let profitability = await request("GET", "/api/orders/profitability");
    assert(profitability.fixed_sets.some((row) => row.id === kitRecipe.id), "Order profitability should expose fixed sets");
    assert(profitability.active_set?.id === kitRecipe.id, "Order profitability should use the default fixed set");
    const profitableOrder = profitability.orders.find((order) => (order.lines || []).some((orderLine) => orderLine.material_id === material.id && orderLine.total_cost != null));
    assert(profitableOrder, "Order profitability should expose synced order lines with linked materials");
    assert(profitability.order_types.length === 7, "Profitability should publish the order typology catalogue");
    const invalidType = await requestRaw("PATCH", `/api/orders/${profitableOrder.id}/type`, { order_type: "not-a-type" });
    assert(invalidType.response.status === 400 && invalidType.payload.code === "ORDER_TYPE_INVALID", "Invalid order typologies should be rejected with a stable error");
    const typedOrder = await request("PATCH", `/api/orders/${profitableOrder.id}/type`, { order_type: "maternity", apply_recommended_set: true });
    assert(typedOrder.order_type === "maternity" && typedOrder.order_type_source === "manual", "Manual order classification should be persisted and audited");
    assert(typedOrder.kit_recipe_id === kitRecipe.id, "Applying a typology should optionally apply its recommended fixed set");
    profitability = await request("GET", "/api/orders/profitability");
    const typedProfitability = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(typedProfitability.order_type_meta.label === "Recuerdos de maternidad", "Order profitability should expose readable typology metadata");
    assert(typedProfitability.recommended_fixed_set?.id === kitRecipe.id && typedProfitability.set_matches_recommended, "Order profitability should distinguish the recommended and applied set");
    assert(typedProfitability.recommended_set?.id === kitRecipe.id, "Order profitability should preserve the recommended set compatibility alias");
    assert(["manual", "typology"].includes(typedProfitability.fixed_set_source), "Order profitability should expose whether the applied set is manual or typology-driven");
    assert(typedProfitability.preparation_status === "not_prepared", "Unfulfilled Shopify orders should start as not prepared");
    assert(typedProfitability.can_generate_preparation_sheet === true, "Not prepared orders with physical items should be eligible for a preparation sheet");
    assert(typedProfitability.preparation_items_count > 0, "Preparation sheets should expose physical order items");
    const emptyPreparationSheet = await requestRaw("POST", "/api/orders/preparation-sheets", { order_ids: [] });
    assert(emptyPreparationSheet.response.status === 400, "Preparation sheet generation should require selected orders");
    const preparationBatch = await request("POST", "/api/orders/preparation-sheets", { order_ids: [typedProfitability.id] });
    assert(preparationBatch.batch?.id, "Preparation sheet generation should create a batch");
    assert(preparationBatch.item_count === typedProfitability.preparation_items_count, "Preparation sheet item count should match the order preparation items");
    const preparationPdf = await requestRaw("GET", preparationBatch.pdf_url);
    assert(preparationPdf.response.ok && preparationPdf.response.headers.get("content-type")?.includes("application/pdf"), "Preparation sheet should return a PDF document");
    profitability = await request("GET", "/api/orders/profitability");
    const sheetGeneratedOrder = profitability.orders.find((order) => order.id === typedProfitability.id);
    assert(sheetGeneratedOrder.preparation_status === "sheet_generated", "Generated sheets should mark orders as sheet generated until Shopify prepares them");
    assert(sheetGeneratedOrder.can_generate_preparation_sheet === true, "Orders with an existing sheet should remain eligible for reprinting until Shopify prepares them");
    const regeneratedPreparationSheet = await request("POST", "/api/orders/preparation-sheets", { order_ids: [typedProfitability.id] });
    assert(regeneratedPreparationSheet.batch?.id && regeneratedPreparationSheet.batch.id !== preparationBatch.batch.id, "Reprinting should create a fresh preparation batch");
    const regeneratedPdf = await requestRaw("GET", regeneratedPreparationSheet.pdf_url);
    assert(regeneratedPdf.response.ok && regeneratedPdf.response.headers.get("content-type")?.includes("application/pdf"), "Regenerated preparation sheets should return a PDF document");
    const missingCostLines = profitableOrder.lines.filter((orderLine) => orderLine.material_id && orderLine.unit_cost == null);
    assert(missingCostLines.length > 0, "Fixture order should include Shopify lines without registered cost");
    assert(missingCostLines.every((orderLine) => Number(orderLine.include_in_cost) === 0), "Shopify lines without cost should be excluded automatically");
    assert(profitableOrder.status === "complete", "Orders with only excluded missing-cost lines should remain complete");
    assert(profitableOrder.missing_line_costs === 0, "Excluded missing-cost lines should not count as pending cost");
    assert(profitableOrder.fixed_set_cost > 0, "Order profitability should include fixed set cost");
    assert(profitableOrder.real_cost >= profitableOrder.fixed_set_cost, "Order real cost should include fixed set and content cost");
    const blockedInclusionAttempt = await requestRaw("PATCH", `/api/order-lines/${missingCostLines[0].id}/include`, {
      include_in_cost: true
    });
    assert(blockedInclusionAttempt.response.status === 400, "Order lines without cost should not be re-includable");
    assert(blockedInclusionAttempt.payload.code === "ORDER_LINE_COST_REQUIRED", "Missing-cost order lines should expose a stable inclusion error");
    const costedOrderLine = profitableOrder.lines.find((orderLine) => orderLine.material_id === material.id && orderLine.total_cost != null);
    const excludedOrderLine = await request("PATCH", `/api/order-lines/${costedOrderLine.id}/include`, {
      include_in_cost: false
    });
    assert(Number(excludedOrderLine.include_in_cost) === 0, "Order line should be excludable from content cost");
    profitability = await request("GET", "/api/orders/profitability");
    let changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    const changedCostedOrderLine = changedOrder.lines.find((orderLine) => orderLine.id === costedOrderLine.id);
    assert(Number(changedCostedOrderLine.include_in_cost) === 0, "Excluded order line should remain disabled after recomputing profitability");
    await request("PATCH", `/api/order-lines/${costedOrderLine.id}/include`, { include_in_cost: true });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    const restoredCostedOrderLine = changedOrder.lines.find((orderLine) => orderLine.id === costedOrderLine.id);
    assert(Number(restoredCostedOrderLine.include_in_cost) === 1, "Reincluded order line should stay enabled after recomputing profitability");

    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, { include_in_cost: false });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(Math.abs(changedOrder.fixed_set_cost) < 0.0001, "Excluded fixed set component should reduce order fixed set cost");
    await request("PATCH", `/api/kit-recipes/${kitRecipe.id}/items/${kitItem.id}/include`, { include_in_cost: true });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(changedOrder.fixed_set_cost > 0, "Reincluded fixed set component should restore order fixed set cost");

    const silverMaterial = await request("POST", "/api/materials", {
      name: "Colgante QA plata 925",
      category: "joya",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      base_material: "plata",
      finish: "pulida"
    });
    const silverInvoice = await request("POST", "/api/invoices", {
      supplier_id: supplier.id,
      invoice_date: "2026-06-01",
      status: "paid",
      category: "materiales",
      subtotal: 12,
      total: 12
    });
    await request("POST", `/api/invoices/${silverInvoice.id}/lines`, {
      material_id: silverMaterial.id,
      description: "Compra QA plata",
      package_count: 1,
      units_per_package: 1,
      total_units: 1,
      price_per_package: 12,
      unit_price: 12,
      line_total: 12,
      affects_stock: true
    });
    const linkedProductCandidates = await request("GET", `/api/shopify-products?q=${encodeURIComponent(costedOrderLine.title)}`);
    const linkedProduct = linkedProductCandidates.find((row) => row.title === costedOrderLine.title) || linkedProductCandidates[0];
    assert(linkedProduct, "A Shopify product should be available to validate silver order profiling");
    await request("PATCH", `/api/shopify-products/${linkedProduct.id}`, { material_id: silverMaterial.id });
    await request("POST", "/api/shopify/sync/orders", { full: true });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(changedOrder.contains_silver === true, "Orders with linked silver jewellery should be marked as silver-aware");
    assert(["silver", "mixed"].includes(changedOrder.silver_profile), "Silver-aware orders should expose a readable silver profile");
    assert(changedOrder.silver_line_count > 0, "Silver-aware orders should count the affected order lines");
    assert(profitability.metrics.silver_orders >= 1, "Profitability metrics should segment orders with silver jewellery");
    assert(profitability.metrics.average_profit != null, "Profitability metrics should expose average real profit");

    const noCostFixedMaterial = await request("POST", "/api/materials", {
      name: "Material sin coste para set",
      category: "material",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      notes: "Used to validate set-specific missing cost status"
    });
    const noCostKit = await request("POST", "/api/kit-recipes", {
      name: "Kit con coste pendiente",
      version: "qa",
      is_default: true,
      notes: "Should become the active default set"
    });
    await request("POST", `/api/kit-recipes/${noCostKit.id}/items`, {
      material_id: noCostFixedMaterial.id,
      quantity: 1,
      notes: "No cost component"
    });
    await request("PATCH", `/api/orders/${profitableOrder.id}/fixed-set`, { kit_recipe_id: kitRecipe.id });
    profitability = await request("GET", "/api/orders/profitability");
    changedOrder = profitability.orders.find((order) => order.id === profitableOrder.id);
    assert(profitability.active_set?.id === noCostKit.id, "Newest default set should become active");
    assert(changedOrder.fixed_set?.id === kitRecipe.id, "Order should preserve its explicitly assigned fixed set");
    assert(changedOrder.status === "complete", "Explicit order set should win over active set when determining missing costs");

    const fixedSetAudit = await request("GET", `/api/audit-log?entity=kit_recipe_item&id=${kitItem.id}`);
    assert(fixedSetAudit.some((row) => row.action === "exclude_from_cost"), "Audit log should include fixed set cost exclusion");
    assert(fixedSetAudit.some((row) => row.action === "include_in_cost"), "Audit log should include fixed set cost inclusion");
    const orderLineAudit = await request("GET", `/api/audit-log?entity=sales_order_line&id=${costedOrderLine.id}`);
    assert(orderLineAudit.some((row) => row.action === "exclude_from_cost"), "Audit log should include order line cost exclusion");
    assert(orderLineAudit.some((row) => row.action === "include_in_cost"), "Audit log should include order line cost inclusion");

    const replenishmentMaterial = await request("POST", "/api/materials", {
      name: "Caja de prueba para reposicion",
      category: "packaging",
      unit_label: "ud",
      preferred_supplier_id: supplier.id,
      manual_stock: 0,
      reorder_point: 5,
      target_stock: 12,
      tracks_inventory: true,
      purchase_pack_size: 5,
      minimum_order_quantity: 10
    });
    const replenishment = await request("GET", "/api/replenishment/recommendations");
    const replenishmentRow = replenishment.recommendations.find((row) => row.id === replenishmentMaterial.id);
    assert(replenishmentRow, "Replenishment should include inventory-controlled materials");
    assert(replenishmentRow.suggested_quantity === 15, "Replenishment should round fallback target deficit to purchase pack size");
    assert(replenishmentRow.reason.includes("referencia es manual"), "Every manual replenishment reference should explain its fallback");
    assert(replenishmentRow.action === "review", "Fallback target deficits should require human review instead of looking automatic");
    assert(replenishmentRow.confidence === "manual", "Fallback target deficits should expose manual confidence");
    assert(replenishmentRow.reliable_plan === false, "Manual references must not be marked as reliable purchase recommendations");
    assert(replenishmentRow.can_plan === true, "Recommendations with a supplier and quantity should be eligible for a purchase plan");
    assert(Array.isArray(replenishmentRow.blockers), "Replenishment should expose operational blockers");
    assert(replenishmentRow.formula?.rounded_quantity === 15, "Replenishment should expose the supervised calculation formula");
    assert(Array.isArray(replenishmentRow.demand_history) && replenishmentRow.demand_history.length === 12, "Replenishment should expose twelve weekly demand buckets");
    assert(replenishmentRow.demand_history.every((bucket) => Number.isFinite(bucket.direct) && Number.isFinite(bucket.sets)), "Weekly demand should separate direct and set consumption");
    assert(replenishmentRow.projection?.horizon_days === 90 && Object.prototype.hasOwnProperty.call(replenishmentRow.projection, "rupture_day"), "Replenishment should expose stock projection inputs");

    const purchasePlan = await request("POST", "/api/purchase-plans", { lines: [{ material_id: replenishmentMaterial.id, ordered_quantity: 20 }], name: "Plan QA" });
    assert(purchasePlan.orders.length === 1, "Purchase plan should group selected recommendations by supplier");
    const purchaseOrder = purchasePlan.orders[0];
    const purchaseLine = purchaseOrder.lines[0];
    assert(Number(purchaseLine.ordered_quantity) === 20, "Purchase plans should preserve supervised quantity overrides");
    await request("PATCH", `/api/purchase-order-lines/${purchaseLine.id}`, { ordered_quantity: 25 });
    const adjustedPlan = await request("GET", `/api/purchase-plans/${purchasePlan.plan.id}`);
    assert(Number(adjustedPlan.orders[0].lines[0].ordered_quantity) === 25, "Draft purchase quantities should remain editable");
    await request("PATCH", `/api/purchase-orders/${purchaseOrder.id}`, { status: "ordered" });
    const receipt = await request("POST", `/api/purchase-orders/${purchaseOrder.id}/receipts`, {
      lines: [{ purchase_order_line_id: purchaseLine.id, quantity: 5 }]
    });
    assert(receipt.stock_mutated === false, "Purchase receipt must never mutate operational stock");
    assert(receipt.status === "partially_received", "Partial receipt should preserve pending quantities");
    const purchasePlanAfterReceipt = await request("GET", `/api/purchase-plans/${purchasePlan.plan.id}`);
    assert(Number(purchasePlanAfterReceipt.orders[0].lines[0].received_quantity) === 5, "Purchase receipt should preserve traceable received quantity");

    const importForm = new FormData();
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const rejectedImportForm = new FormData();
    rejectedImportForm.append("documents", new Blob([Buffer.from("not an invoice")], { type: "text/plain" }), "invoice-test.txt");
    const rejectedImport = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: rejectedImportForm });
    assert(rejectedImport.status === 400, "Unsupported expense document types should be rejected");
    importForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-test.png");
    importForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-second.png");
    const importResponse = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: importForm });
    assert(importResponse.status === 202, "Supported expense document should enter the local processing queue");
    const importBatch = await importResponse.json();
    assert(importBatch.accepted.length === 2, "Multiple expense documents should enter the queue in one request");
    const expenseImport = importBatch.accepted[0];
    await request("PATCH", `/api/expense-imports/${expenseImport.id}`, {
      detected_fields: {
        suggested_supplier_id: supplier.id,
        invoice_number: "OCR-QA-001",
        invoice_date: "2026-06-01",
        total: 17.25,
        currency: "EUR"
      }
    });
    const confirmedImport = await request("POST", `/api/expense-imports/${expenseImport.id}/confirm`, {});
    assert(confirmedImport.invoice_id > 0, "Human confirmation should create a draft invoice transactionally");
    const importedInvoice = await request("GET", `/api/invoices/${confirmedImport.invoice_id}`);
    assert(importedInvoice.invoice.status === "draft", "Imported expense must remain draft after confirmation");
    const confirmedReprocess = await requestRaw("POST", `/api/expense-imports/${expenseImport.id}/reprocess`, {});
    assert(confirmedReprocess.response.status === 400 && confirmedReprocess.payload.code === "EXPENSE_IMPORT_CONFIRMED", "Confirmed imports must reject reprocessing");
    const qualityMetrics = await request("GET", "/api/expense-imports/quality");
    assert(Array.isArray(qualityMetrics.providers) && qualityMetrics.summary && Number.isFinite(qualityMetrics.summary.reviewed), "Expense import quality should expose provider learning metrics");
    const duplicateImportForm = new FormData();
    duplicateImportForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-test.png");
    const duplicateUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: duplicateImportForm });
    const duplicateNameResult = await duplicateUpload.json();
    assert(duplicateUpload.status === 409 && duplicateNameResult.rejected[0].code === "EXPENSE_IMPORT_NAME_DUPLICATE", "Previously imported filenames should be rejected before processing");
    await request("POST", `/api/expense-imports/${importBatch.accepted[1].id}/discard`, {});
    const deletedImport = await requestRaw("GET", `/api/expense-imports/${importBatch.accepted[1].id}`);
    assert(deletedImport.response.status === 404, "Discarding an import should physically delete its records");
    const discardedNameForm = new FormData();
    discardedNameForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-second.png");
    const discardedNameUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: discardedNameForm });
    const discardedNameResult = await discardedNameUpload.json();
    assert(discardedNameUpload.status === 202 && discardedNameResult.accepted.length === 1, "Discarded imports should not block uploading the same filename again");
    const duplicateInvoiceForm = new FormData();
    duplicateInvoiceForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-third.png");
    const duplicateInvoiceUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: duplicateInvoiceForm });
    const duplicateInvoiceBatch = await duplicateInvoiceUpload.json();
    const duplicateImport = duplicateInvoiceBatch.accepted[0];
    await request("PATCH", `/api/expense-imports/${duplicateImport.id}`, {
      detected_fields: { suggested_supplier_id: supplier.id, invoice_number: "OCR-QA-001", invoice_date: "2026-06-01", total: 17.25 }
    });
    const duplicateDetail = await request("GET", `/api/expense-imports/${duplicateImport.id}`);
    assert(duplicateDetail.duplicates.exact?.supplier_name === "Test Supplier" && duplicateDetail.duplicates.exact?.invoice_number === "OCR-QA-001", "Duplicate candidates should include human-readable invoice context");
    const duplicateConfirm = await requestRaw("POST", `/api/expense-imports/${duplicateImport.id}/confirm`, {});
    assert(duplicateConfirm.response.status === 400 && duplicateConfirm.payload.code === "EXPENSE_IMPORT_DUPLICATE", "Exact supplier and invoice number should still block duplicate confirmation");

    const batchImportForm = new FormData();
    batchImportForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-batch-safe.png");
    const batchUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: batchImportForm });
    const batchUploadResult = await batchUpload.json();
    const batchImport = batchUploadResult.accepted[0];
    await request("PATCH", `/api/expense-imports/${batchImport.id}`, {
      status: "review",
      detected_fields: { suggested_supplier_id: supplier.id, invoice_number: "OCR-BATCH-001", invoice_date: "2026-06-03", subtotal: 12.5, discount: 2.5, shipping: 0, tax: 0, total: 10, currency: "EUR", category: "software" }
    });
    const removableLine = await request("POST", `/api/expense-imports/${batchImport.id}/lines`, { description: "Temporary line", quantity: 1, line_total: 1, human_decision: "pending" });
    await request("DELETE", `/api/expense-imports/${batchImport.id}/lines/${removableLine.id}`);
    await request("POST", `/api/expense-imports/${batchImport.id}/lines`, { description: "Software subscription", quantity: 1, unit_price: 12.5, line_total: 12.5, human_decision: "accepted" });
    const batchDetail = await request("GET", `/api/expense-imports/${batchImport.id}`);
    assert(batchDetail.accounting_quality.batch_eligible && batchDetail.accounting_quality.lines_match, "Import detail should expose safe accounting quality");
    const batchConfirmation = await request("POST", "/api/expense-imports/batch-confirm", { ids: [batchImport.id, duplicateImport.id] });
    assert(batchConfirmation.confirmed.length === 1 && batchConfirmation.rejected.length === 1, "Batch confirmation should only create safe draft invoices");
    const discountedImportedInvoice = await request("GET", `/api/invoices/${batchConfirmation.confirmed[0].invoice_id}`);
    assert(discountedImportedInvoice.invoice.subtotal === 12.5 && discountedImportedInvoice.invoice.discount === 2.5 && discountedImportedInvoice.invoice.total === 10, "Imported draft should preserve invoice-level discounts separately from product prices");
    assert(discountedImportedInvoice.lines[0].line_total === 12.5, "Imported draft should preserve the original gross product price");

    const structuredImportForm = new FormData();
    structuredImportForm.append("documents", new Blob([tinyPng], { type: "image/png" }), "invoice-structured-line.png");
    const structuredUpload = await fetch(`${BASE_URL}/api/expense-imports`, { method: "POST", body: structuredImportForm });
    const structuredImport = (await structuredUpload.json()).accepted[0];
    await request("PATCH", `/api/expense-imports/${structuredImport.id}`, {
      detected_fields: { suggested_supplier_id: supplier.id, invoice_number: "OCR-STRUCTURED-001", invoice_date: "2026-06-04", subtotal: 2.23, tax: 0.47, total: 2.7, currency: "EUR", category: "materiales" }
    });
    await request("POST", `/api/expense-imports/${structuredImport.id}/lines`, { description: "100 bolsas", package_count: 1, units_per_package: 100, price_per_package: 2.7, line_total: 2.7, human_decision: "accepted" });
    const structuredConfirmation = await request("POST", `/api/expense-imports/${structuredImport.id}/confirm`, {});
    const structuredInvoice = await request("GET", `/api/invoices/${structuredConfirmation.invoice_id}`);
    assert(structuredInvoice.lines[0].package_count === 1 && structuredInvoice.lines[0].units_per_package === 100 && structuredInvoice.lines[0].total_units === 100, "Confirmed imports should preserve reviewed package structure");
    assert(Math.abs(structuredInvoice.lines[0].price_per_package - 2.7) < 0.000001 && Math.abs(structuredInvoice.lines[0].unit_price - 0.027) < 0.000001 && Math.abs(structuredInvoice.lines[0].line_total - 2.7) < 0.000001, "Confirmed imports should preserve VAT-inclusive package, unit and line prices");

    const dashboard = await request("GET", "/api/dashboard/finance");
    assert(dashboard.kpis.period_expense > 0, "Dashboard finance should aggregate invoice totals");
    assert(dashboard.kpis.materials_expense > 0, "Dashboard finance should aggregate material spend");
    assert(dashboard.kpis.period_net_received > 0, "Dashboard finance should aggregate payout income");
    assert(Array.isArray(dashboard.income_channels), "Dashboard finance should expose income by channel");
    assert(dashboard.monthly_breakdown.series.cobros.some((value) => value >= 0), "Dashboard finance should expose income monthly series");
    assert(Array.isArray(dashboard.monthly_breakdown.series.balance), "Dashboard finance should expose monthly balance");
    assert(dashboard.income_channels.some((row) => row.channel === "bizum"), "Dashboard finance should expose Bizum channel");
    assert(dashboard.top_suppliers.some((row) => row.supplier_name === "Test Supplier"), "Dashboard should include supplier concentration");
    assert(dashboard.monthly_breakdown.series.materiales.some((value) => value > 0), "Dashboard breakdown should include category spend by month");
    assert(dashboard.profitability.metrics.weighted_margin_percent == null || Number.isFinite(dashboard.profitability.metrics.weighted_margin_percent), "Dashboard weighted margin should be numeric when available");
    assert(dashboard.profitability.metrics.reliable_orders <= dashboard.profitability.metrics.total_orders, "Reliable order coverage should be bounded by total orders");
    assert(dashboard.profitability.bands.reduce((sum, row) => sum + row.orders, 0) === dashboard.profitability.metrics.reliable_orders, "Margin bands should reconcile with reliable orders");
    if (dashboard.comparison) {
      [
        "expense_change_percent",
        "weighted_margin_change_points",
        "reliable_coverage_change_points",
        "average_ticket_change_percent",
        "net_sales_change_percent",
        "total_profit_change_percent",
        "real_cost_sold_change_percent"
      ].forEach((key) => {
        assert(Object.prototype.hasOwnProperty.call(dashboard.comparison, key), `Dashboard comparison should expose ${key}`);
      });
    }
    assert(Array.isArray(dashboard.sales?.series), "Dashboard should expose sales series");
    assert(Array.isArray(dashboard.sales?.cumulative), "Dashboard should expose cumulative sales series");
    assert(dashboard.sales?.series.length === dashboard.sales?.cumulative.length, "Sales trend and cumulative series should align");
    assert(Array.isArray(dashboard.sales?.ticket_bands) && dashboard.sales.ticket_bands.length === 5, "Dashboard should expose ticket distribution bands");
    assert(Array.isArray(dashboard.sales?.top_products), "Dashboard should expose top sold products");
    if (dashboard.sales?.comparison) {
      assert(Object.prototype.hasOwnProperty.call(dashboard.sales.comparison, "marketing_per_order_change_percent"), "Dashboard sales comparison should expose marketing per order delta");
      assert(Object.prototype.hasOwnProperty.call(dashboard.sales.comparison, "average_profit_per_reliable_order_change_percent"), "Dashboard sales comparison should expose reliable profit delta");
    }

    const audit = await request("GET", `/api/audit-log?entity=invoice&id=${invoice.id}`);
    assert(audit.some((row) => row.action === "create"), "Audit log should include invoice creation");
    assert(audit.some((row) => row.action === "archive"), "Audit log should include invoice archive");
    assert(audit.some((row) => row.action === "restore"), "Audit log should include invoice restore");
    const payoutAudit = await request("GET", `/api/audit-log?entity=channel_payout&id=${manualPayout.id}`);
    assert(payoutAudit.some((row) => row.action === "create"), "Audit log should include payout creation");
    assert(payoutAudit.some((row) => row.action === "update"), "Audit log should include payout update");

    if (!process.env.MUA_OPS_SKIP_SYSTEM_TEST_HEALTH) {
      const initialTestHealth = await request("GET", "/api/system/test-health");
      assert(Object.prototype.hasOwnProperty.call(initialTestHealth, "coverage"), "Test health should expose a coverage slot even before running");
      const executedTestHealthRaw = await requestRaw("POST", "/api/system/test-health/run", {});
      assert(executedTestHealthRaw.response.ok, `System test health run should complete successfully: ${JSON.stringify(executedTestHealthRaw.payload)}`);
      const executedTestHealth = executedTestHealthRaw.payload;
      assert(executedTestHealth.status === "ok", `System test health run should finish in ok state: ${JSON.stringify(executedTestHealth)}`);
      assert(Array.isArray(executedTestHealth.suites) && executedTestHealth.suites.some((suite) => suite.id === "coverage"), "System test health should include coverage suite");
      assert(executedTestHealth.coverage && executedTestHealth.coverage.lines.pct > 0, "System test health should persist backend coverage summary");
      const reloadedTestHealth = await request("GET", "/api/system/test-health");
      assert(reloadedTestHealth.coverage && reloadedTestHealth.coverage.functions.pct > 0, "Reloaded system test health should keep coverage data");
      assert(Array.isArray(reloadedTestHealth.history) && reloadedTestHealth.history.length > 0, "System test health should keep execution history");
    }

    await stopTestServer();
    const dbFile = path.join(TEST_DIR, "mua_ops_test.sqlite");
    const backupDir = path.join(TEST_DIR, "backups");
    const backupCountBefore = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;
    const SQL = await initSqlJs({ locateFile: (file) => path.join(ROOT, "node_modules", "sql.js", "dist", file) });
    const db = new SQL.Database(fs.readFileSync(dbFile));
    db.run("DELETE FROM schema_migrations WHERE id='002_mvp_operational_columns'");
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    child = startTestServer();
    await waitForServer();
    const restartedHealth = await request("GET", "/api/system/health");
    assert(restartedHealth.ok === true, "Server should restart cleanly with an existing database");
    assert(restartedHealth.schema.pending_migrations.length === 0, "Migrations should be idempotent after restart");
    const backupCountAfter = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;
    assert(backupCountAfter > backupCountBefore, "Startup should create a backup before applying pending migrations");

    console.log("Mua Ops API test passed");
  } finally {
    await stopTestServer();
    await new Promise((resolve) => mockShopifyServer.close(resolve));
    if (process.env.MUA_OPS_TEST_DEBUG) {
      console.log(serverOutput);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
