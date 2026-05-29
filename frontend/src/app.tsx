import { useEffect, useMemo, useState } from "preact/hooks";
import type {
  AuditRow,
  CostDetail,
  CostRow,
  DashboardFinance,
  DomainKey,
  IncomeSummary,
  Invoice,
  InvoiceDetail,
  KitRecipe,
  Material,
  Payout,
  Settings,
  ShopifyConnection,
  Summary,
  Supplier,
  SystemHealth,
  ViewKey
} from "./types";
import { api } from "./api";
import { buildBalanceChart, buildCategoryChart, buildCostEvolutionChart, buildExpenseChart, buildIncomeChart, buildIncomeMixChart, buildReorderChart, ChartSurface } from "./charts";
import { fieldContains, money, paginate, shortDate, shortDateTime, slug } from "./lib";
import { EmptyState, Pager, Panel, PlaceholderView, StatCard } from "./ui";

type Filters = {
  invoiceSearch: string;
  invoiceCategory: string;
  invoiceStatus: string;
  invoiceLines: string;
  invoiceFrom: string;
  invoiceTo: string;
  invoiceArchived: boolean;
  incomeSearch: string;
  incomeChannel: string;
  incomeStatus: string;
  incomeFrom: string;
  incomeTo: string;
  incomeArchived: boolean;
  materialSearch: string;
  materialCategory: string;
  materialOutlet: string;
  costSearch: string;
  costCategory: string;
  costOnlyWithPurchases: boolean;
  auditSearch: string;
  auditLane: string;
  logSearch: string;
  logOrigin: string;
  logLevel: string;
  logFrom: string;
  logTo: string;
};

type PaginationKey = "expenses" | "income" | "materials" | "costs" | "kits" | "activity" | "logs";
type PaginationState = Record<PaginationKey, { page: number; pageSize: number }>;

const domainConfig: Record<
  DomainKey,
  { label: string; views: Array<{ key: ViewKey; label: string; ready?: boolean }> }
> = {
  finance: {
    label: "Finanzas",
    views: [
      { key: "dashboard", label: "Dashboard", ready: true },
      { key: "expenses", label: "Gastos", ready: true },
      { key: "income", label: "Ingresos", ready: true },
      { key: "costs", label: "Costes", ready: true },
      { key: "margins", label: "Márgenes", ready: false }
    ]
  },
  operations: {
    label: "Operaciones",
    views: [
      { key: "materials", label: "Materiales", ready: true },
      { key: "kits", label: "Kits", ready: true },
      { key: "orders", label: "Pedidos", ready: false },
      { key: "purchasing", label: "Reposición", ready: false }
    ]
  },
  sales: {
    label: "Ventas",
    views: [
      { key: "channels", label: "Canales", ready: false },
      { key: "advertising", label: "Publicidad", ready: false },
      { key: "customers", label: "Clientes", ready: false }
    ]
  },
  system: {
    label: "Sistema",
    views: [
      { key: "activity", label: "Actividad", ready: true },
      { key: "settings", label: "Configuración", ready: true },
      { key: "diagnostics", label: "Diagnóstico", ready: true },
      { key: "logs", label: "Logs", ready: true }
    ]
  }
};

const initialFilters: Filters = {
  invoiceSearch: "",
  invoiceCategory: "",
  invoiceStatus: "",
  invoiceLines: "",
  invoiceFrom: "",
  invoiceTo: "",
  invoiceArchived: false,
  incomeSearch: "",
  incomeChannel: "",
  incomeStatus: "",
  incomeFrom: "",
  incomeTo: "",
  incomeArchived: false,
  materialSearch: "",
  materialCategory: "",
  materialOutlet: "",
  costSearch: "",
  costCategory: "",
  costOnlyWithPurchases: false,
  auditSearch: "",
  auditLane: "all",
  logSearch: "",
  logOrigin: "",
  logLevel: "relevant",
  logFrom: "",
  logTo: ""
};

const initialPagination: PaginationState = {
  expenses: { page: 1, pageSize: 12 },
  income: { page: 1, pageSize: 12 },
  materials: { page: 1, pageSize: 18 },
  costs: { page: 1, pageSize: 14 },
  kits: { page: 1, pageSize: 10 },
  activity: { page: 1, pageSize: 14 },
  logs: { page: 1, pageSize: 12 }
};


export function App() {
  const [domain, setDomain] = useState<DomainKey>("finance");
  const [view, setView] = useState<ViewKey>("dashboard");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [finance, setFinance] = useState<DashboardFinance | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shopify, setShopify] = useState<ShopifyConnection | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutDetail, setPayoutDetail] = useState<Payout | null>(null);
  const [incomeSummary, setIncomeSummary] = useState<IncomeSummary | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [costDetail, setCostDetail] = useState<CostDetail | null>(null);
  const [kits, setKits] = useState<KitRecipe[]>([]);
  const [auditBusiness, setAuditBusiness] = useState<AuditRow[]>([]);
  const [auditTechnical, setAuditTechnical] = useState<AuditRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [
          summaryResult,
          financeResult,
          invoicesResult,
          incomeSummaryResult,
          payoutsResult,
          materialsResult,
          costsResult
        ] = await Promise.allSettled([
          api.summary(),
          api.dashboardFinance(),
          api.invoices(true),
          api.incomeSummary(),
          api.payouts(true),
          api.materials(true),
          api.costs()
        ] as const);

        const primaryResults = [summaryResult, financeResult, invoicesResult, incomeSummaryResult, payoutsResult, materialsResult, costsResult];

        const nextSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
        const nextFinance = financeResult.status === "fulfilled" ? financeResult.value : null;
        const nextInvoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : null;
        const nextIncomeSummary = incomeSummaryResult.status === "fulfilled" ? incomeSummaryResult.value : null;
        const nextPayouts = payoutsResult.status === "fulfilled" ? payoutsResult.value : null;
        const nextMaterials = materialsResult.status === "fulfilled" ? materialsResult.value : null;
        const nextCosts = costsResult.status === "fulfilled" ? costsResult.value : null;

        if (nextSummary) setSummary(nextSummary);
        if (nextFinance) setFinance(nextFinance);
        if (nextInvoices) setInvoices(nextInvoices);
        if (nextIncomeSummary) setIncomeSummary(nextIncomeSummary);
        if (nextPayouts) setPayouts(nextPayouts);
        if (nextMaterials) setMaterials(nextMaterials);
        if (nextCosts) setCosts(nextCosts);

        const primaryFailures = primaryResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
        setError(primaryFailures[0] || "");
        const [settingsResult, shopifyResult, healthResult, suppliersResult, kitsResult, auditBusinessResult, auditTechnicalResult] = await Promise.allSettled([
          api.settings(),
          api.shopifyConnection(),
          api.systemHealth(),
          api.suppliers(true),
          api.kits(true),
          api.auditBusiness(400),
          api.auditTechnical(250)
        ] as const);
        const nextSettings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
        const nextShopify = shopifyResult.status === "fulfilled" ? shopifyResult.value : null;
        const nextHealth = healthResult.status === "fulfilled" ? healthResult.value : null;
        const nextSuppliers = suppliersResult.status === "fulfilled" ? suppliersResult.value : null;
        const nextKits = kitsResult.status === "fulfilled" ? kitsResult.value : null;
        const nextAuditBusiness = auditBusinessResult.status === "fulfilled" ? auditBusinessResult.value : null;
        const nextAuditTechnical = auditTechnicalResult.status === "fulfilled" ? auditTechnicalResult.value : null;
        if (nextSettings) setSettings(nextSettings);
        if (nextShopify) setShopify(nextShopify);
        if (nextHealth) setHealth(nextHealth);
        if (nextSuppliers) setSuppliers(nextSuppliers);
        if (nextKits) setKits(nextKits);
        if (nextAuditBusiness) setAuditBusiness(nextAuditBusiness);
        if (nextAuditTechnical) setAuditTechnical(nextAuditTechnical);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo cargar la app");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setInvoiceDetail(null);
    setPayoutDetail(null);
    setCostDetail(null);
  }, [view]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPagination((current) => {
      const next = { ...current };
      if (["invoiceSearch", "invoiceCategory", "invoiceStatus", "invoiceLines", "invoiceFrom", "invoiceTo", "invoiceArchived"].includes(key)) next.expenses = { ...next.expenses, page: 1 };
      if (["incomeSearch", "incomeChannel", "incomeStatus", "incomeFrom", "incomeTo", "incomeArchived"].includes(key)) next.income = { ...next.income, page: 1 };
      if (["materialSearch", "materialCategory", "materialOutlet"].includes(key)) next.materials = { ...next.materials, page: 1 };
      if (["costSearch", "costCategory", "costOnlyWithPurchases"].includes(key)) next.costs = { ...next.costs, page: 1 };
      if (["auditSearch", "auditLane"].includes(key)) next.activity = { ...next.activity, page: 1 };
      if (["logSearch", "logOrigin", "logLevel", "logFrom", "logTo"].includes(key)) next.logs = { ...next.logs, page: 1 };
      return next;
    });
  };

  const setPager = (key: PaginationKey, patch: Partial<{ page: number; pageSize: number }>) =>
    setPagination((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const visibleInvoices = useMemo(() => {
    return invoices
      .filter((row) => (filters.invoiceArchived ? row.is_deleted === 1 : row.is_deleted === 0))
      .filter((row) => (!filters.invoiceCategory ? row.category === filters.invoiceCategory : true))
      .filter((row) => (!filters.invoiceStatus ? row.status === filters.invoiceStatus : true))
      .filter((row) => (!filters.invoiceFrom ? row.invoice_date >= filters.invoiceFrom : true))
      .filter((row) => (!filters.invoiceTo ? row.invoice_date <= filters.invoiceTo : true))
      .filter((row) => {
        if (filters.invoiceLines === "with") return Number(row.line_count || 0) > 0;
        if (filters.invoiceLines === "without") return Number(row.line_count || 0) === 0;
        return true;
      })
      .filter((row) => (!filters.invoiceSearch ? true : fieldContains(row, filters.invoiceSearch)))
      .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.id - a.id);
  }, [invoices, filters]);

  const visiblePayouts = useMemo(() => {
    return payouts
      .filter((row) => (filters.incomeArchived ? row.is_deleted === 1 : row.is_deleted === 0))
      .filter((row) => (!filters.incomeChannel ? row.channel === filters.incomeChannel : true))
      .filter((row) => (!filters.incomeStatus ? row.status === filters.incomeStatus : true))
      .filter((row) => (!filters.incomeFrom ? row.payout_date >= filters.incomeFrom : true))
      .filter((row) => (!filters.incomeTo ? row.payout_date <= filters.incomeTo : true))
      .filter((row) => (!filters.incomeSearch ? true : fieldContains(row, filters.incomeSearch)))
      .sort((a, b) => b.payout_date.localeCompare(a.payout_date) || b.id - a.id);
  }, [payouts, filters]);

  const visibleMaterials = useMemo(() => {
    return materials
      .filter((row) => row.is_deleted === 0)
      .filter((row) => (!filters.materialCategory ? row.category === filters.materialCategory : true))
      .filter((row) => {
        if (filters.materialOutlet === "outlet") return row.is_outlet;
        if (filters.materialOutlet === "core") return !row.is_outlet;
        return true;
      })
      .filter((row) => (!filters.materialSearch ? true : fieldContains(row, filters.materialSearch)))
      .sort((a, b) => a.category.localeCompare(b.category, "es") || a.name.localeCompare(b.name, "es"));
  }, [materials, filters]);

  const visibleCosts = useMemo(() => {
    return costs
      .filter((row) => !row.is_outlet)
      .filter((row) => (!filters.costCategory ? row.category === filters.costCategory : true))
      .filter((row) => (!filters.costOnlyWithPurchases ? true : Number(row.purchase_lots || 0) > 0))
      .filter((row) => (!filters.costSearch ? true : fieldContains(row, filters.costSearch)))
      .sort((a, b) => (b.total_spend || 0) - (a.total_spend || 0) || a.name.localeCompare(b.name, "es"));
  }, [costs, filters]);

  const visibleKits = useMemo(
    () => kits.filter((row) => row.is_deleted === 0).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [kits]
  );

  const visibleBusinessAudit = useMemo(() => {
    const lanes: Record<string, string[]> = {
      all: [],
      expenses: ["invoice", "invoice_line"],
      income: ["channel_payout", "sales_order"],
      materials: ["material", "kit_recipe", "kit_recipe_item"],
      suppliers: ["supplier"]
    };
    return auditBusiness
      .filter((row) => (!lanes[filters.auditLane]?.length ? true : lanes[filters.auditLane].includes(row.entity_type)))
      .filter((row) => (!filters.auditSearch ? true : fieldContains(row, filters.auditSearch)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }, [auditBusiness, filters.auditLane, filters.auditSearch]);

  const visibleTechnicalAudit = useMemo(() => {
    return auditTechnical
      .filter((row) => {
        const normalized = slug(row.action);
        if (filters.logLevel === "relevant") return /error|warn|backup|sync|import|shopify/.test(normalized);
        if (!filters.logLevel) return true;
        return normalized.includes(filters.logLevel);
      })
      .filter((row) => (!filters.logOrigin ? row.entity_type === filters.logOrigin : true))
      .filter((row) => (!filters.logFrom ? row.created_at.slice(0, 10) >= filters.logFrom : true))
      .filter((row) => (!filters.logTo ? row.created_at.slice(0, 10) <= filters.logTo : true))
      .filter((row) => (!filters.logSearch ? true : fieldContains(row, filters.logSearch)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }, [auditTechnical, filters]);

  const expensePage = paginate(visibleInvoices, pagination.expenses.page, pagination.expenses.pageSize);
  const incomePage = paginate(visiblePayouts, pagination.income.page, pagination.income.pageSize);
  const materialPage = paginate(visibleMaterials, pagination.materials.page, pagination.materials.pageSize);
  const costPage = paginate(visibleCosts, pagination.costs.page, pagination.costs.pageSize);
  const kitPage = paginate(visibleKits, pagination.kits.page, pagination.kits.pageSize);
  const auditPage = paginate(visibleBusinessAudit, pagination.activity.page, pagination.activity.pageSize);
  const logPage = paginate(visibleTechnicalAudit, pagination.logs.page, pagination.logs.pageSize);

  async function openInvoice(id: number) {
    setInvoiceDetail(await api.invoiceDetail(id));
    setView("expenses");
    setDomain("finance");
  }

  async function openPayout(id: number) {
    setPayoutDetail(await api.payoutDetail(id));
    setView("income");
    setDomain("finance");
  }

  async function openCost(id: number) {
    setCostDetail(await api.costDetail(id));
    setView("costs");
    setDomain("finance");
  }

  const dashboardExpenseOption = useMemo(() => buildExpenseChart(finance), [finance]);
  const dashboardIncomeOption = useMemo(() => buildIncomeChart(finance), [finance]);
  const dashboardBalanceOption = useMemo(() => buildBalanceChart(finance), [finance]);
  const dashboardCategoryOption = useMemo(() => buildCategoryChart(finance), [finance]);
  const dashboardIncomeMixOption = useMemo(() => buildIncomeMixChart(finance), [finance]);
  const reorderOption = useMemo(() => buildReorderChart(finance), [finance]);
  const costEvolutionOption = useMemo(() => buildCostEvolutionChart(costDetail), [costDetail]);

  const pageTitle = useMemo(() => {
    const entry = Object.values(domainConfig).flatMap((section) => section.views).find((item) => item.key === view);
    return entry?.label || "Mua Ops Next";
  }, [view]);

  const pageSummary = useMemo(() => {
    if (!summary) return "Cargando datos del negocio";
    return `${summary.materials} materiales · ${summary.suppliers} proveedores · ${summary.invoices} facturas · ${summary.payouts} ingresos`;
  }, [summary]);

  const currentViews = domainConfig[domain].views;

  return (
    <div className="next-shell">
      <aside className="next-sidebar">
        <div className="next-brand">
          <img src="/img/Logo_Mua_negro.png" alt="Mua Kit" />
          <div>
            <strong>Mua Ops Next</strong>
            <span>Preview del refresh frontend</span>
          </div>
        </div>
        <nav className="next-domain-nav">
          {Object.entries(domainConfig).map(([key, section]) => (
            <button
              type="button"
              className={domain === key ? "is-active" : ""}
              onClick={() => {
                setDomain(key as DomainKey);
                setView(section.views[0].key);
              }}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="next-sidebar-foot">
          <a href="/" className="ghost-link">
            Abrir vista clásica
          </a>
        </div>
      </aside>

      <div className="next-app">
        <header className="next-topbar">
          <div>
            <p className="next-eyebrow">{domainConfig[domain].label}</p>
            <h1>{pageTitle}</h1>
            <p>{pageSummary}</p>
          </div>
          <div className="next-topbar-actions">
            <span className="next-status-dot" />
            <small>{loading ? "Sincronizando datos de la preview" : "Preview lista para revisión visual"}</small>
          </div>
        </header>

        <div className="next-subnav">
          {currentViews.map((item) => (
            <button type="button" className={view === item.key ? "is-active" : ""} onClick={() => setView(item.key)}>
              {item.label}
              {!item.ready && <em>Próx.</em>}
            </button>
          ))}
        </div>

        <main className="next-main">
          {error && (
            <Panel className="next-error-panel">
              <strong>No se ha podido montar la preview</strong>
              <span>{error}</span>
            </Panel>
          )}

          {loading && !summary ? (
            <Panel>
              <EmptyState title="Cargando frontend nuevo" text="Estamos hidratando datos y vistas para la preview." />
            </Panel>
          ) : (
            <>
              {view === "dashboard" && finance && (
                <div className="next-stack">
                  <div className="next-stats-grid">
                    <StatCard label="Gasto total" value={money(finance.kpis.period_expense)} meta="Periodo activo" />
                    <StatCard label="Ingreso neto" value={money(finance.kpis.period_net_received)} meta="Periodo activo" />
                    <StatCard label="Balance" value={money(finance.kpis.period_balance)} meta="Ingreso menos gasto" />
                    <StatCard label="Materiales" value={money(finance.kpis.materials_expense)} meta="Compra imputada" />
                    <StatCard label="Marketing" value={money(finance.kpis.marketing_expense)} meta="Meta y servicios" />
                    <StatCard label="Pendientes" value={String(finance.kpis.pending_payouts || 0)} meta="Ingresos en tránsito" />
                  </div>
                  <div className="next-grid next-grid-two">
                    <Panel title="Gastos mensuales" subtitle="Lectura principal del gasto operativo.">
                      <ChartSurface option={dashboardExpenseOption} />
                    </Panel>
                    <Panel title="Ingresos mensuales" subtitle="Seguimiento del ingreso neto por periodo.">
                      <ChartSurface option={dashboardIncomeOption} />
                    </Panel>
                  </div>
                  <div className="next-grid next-dashboard-lower">
                    <div className="next-stack">
                      <Panel title="Balance mensual" subtitle="Cruce de gasto, ingreso y diferencia.">
                        <ChartSurface option={dashboardBalanceOption} />
                      </Panel>
                      <Panel title="Concentración del gasto" subtitle="Dónde se va el dinero ahora mismo.">
                        <div className="next-split-list">
                          <div>
                            <h4>Proveedores</h4>
                            <ul className="next-compact-list">
                              {finance.top_suppliers.map((row) => (
                                <li>
                                  <strong>{row.supplier_name}</strong>
                                  <span>{money(row.total_spend)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4>Materiales</h4>
                            <ul className="next-compact-list">
                              {finance.top_materials.map((row) => (
                                <li>
                                  <strong>{row.name}</strong>
                                  <span>{money(row.total_spend)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </Panel>
                    </div>
                    <div className="next-stack">
                      <Panel title="Atención inmediata" subtitle="Incidencias que conviene revisar sin romper la lectura financiera.">
                        <ul className="next-alert-list">
                          <li><strong>Facturas en borrador</strong><span>{finance.pending_invoices.length}</span></li>
                          <li><strong>Ingresos pendientes</strong><span>{finance.pending_payouts.length}</span></li>
                          <li><strong>Materiales sin imagen</strong><span>{finance.materials_without_image.length}</span></li>
                          <li><strong>Materiales sin coste</strong><span>{finance.materials_without_cost.length}</span></li>
                          <li><strong>Kits incompletos</strong><span>{finance.kits_missing_cost.length}</span></li>
                        </ul>
                      </Panel>
                      <Panel title="Reposición de materiales" subtitle="Stock Shopify frente al punto de reposición.">
                        <ChartSurface option={reorderOption} className="next-chart-small" />
                      </Panel>
                      <div className="next-grid next-grid-two-mini">
                        <Panel title="Reparto del gasto">
                          <ChartSurface option={dashboardCategoryOption} className="next-chart-small" />
                        </Panel>
                        <Panel title="Canales de ingreso">
                          <ChartSurface option={dashboardIncomeMixOption} className="next-chart-small" />
                        </Panel>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {view === "expenses" && (
                <div className="next-stack">
                  {invoiceDetail && (
                    <Panel
                      title={`${invoiceDetail.supplier_name || "Sin proveedor"} · ${invoiceDetail.invoice_number || "Sin número"}`}
                      subtitle={`${shortDate(invoiceDetail.invoice_date)} · ${money(invoiceDetail.total)}`}
                      actions={<button className="ghost" onClick={() => setInvoiceDetail(null)}>Cerrar</button>}
                    >
                      <div className="next-detail-grid">
                        <StatCard label="Estado" value={invoiceDetail.status} />
                        <StatCard label="Categoría" value={invoiceDetail.category} />
                        <StatCard label="Líneas" value={String(invoiceDetail.lines.length)} />
                        <StatCard label="Documento" value={invoiceDetail.document_id ? "Adjunto" : "Sin adjunto"} />
                      </div>
                      <div className="next-card-list">
                        {invoiceDetail.lines.map((line) => (
                          <article className="next-entity-card compact">
                            <div>
                              <strong>{line.material_name || "Línea sin material"}</strong>
                              <small>{line.description || "Sin descripción"}</small>
                            </div>
                            <div className="next-inline-metrics">
                              <span>{line.package_count} paquetes</span>
                              <span>{line.total_units} uds</span>
                              <strong>{money(line.line_total)}</strong>
                            </div>
                          </article>
                        ))}
                      </div>
                    </Panel>
                  )}

                  <Panel title="Gastos" subtitle={`${visibleInvoices.length} facturas visibles en la preview`}>
                    <div className="next-filter-grid">
                      <input placeholder="Buscar proveedor, número, notas" value={filters.invoiceSearch} onInput={(e) => setFilter("invoiceSearch", (e.target as HTMLInputElement).value)} />
                      <select value={filters.invoiceCategory} onInput={(e) => setFilter("invoiceCategory", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todas las categorías</option>
                        {["materiales", "envios", "marketing", "software", "servicios", "otros"].map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <select value={filters.invoiceStatus} onInput={(e) => setFilter("invoiceStatus", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todos los estados</option>
                        {["draft", "posted", "paid", "archived"].map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <select value={filters.invoiceLines} onInput={(e) => setFilter("invoiceLines", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todas</option>
                        <option value="with">Con líneas</option>
                        <option value="without">Sin líneas</option>
                      </select>
                      <input type="date" value={filters.invoiceFrom} onInput={(e) => setFilter("invoiceFrom", (e.target as HTMLInputElement).value)} />
                      <input type="date" value={filters.invoiceTo} onInput={(e) => setFilter("invoiceTo", (e.target as HTMLInputElement).value)} />
                    </div>
                    <label className="next-check">
                      <input type="checkbox" checked={filters.invoiceArchived} onInput={(e) => setFilter("invoiceArchived", (e.target as HTMLInputElement).checked)} />
                      Ver archivadas
                    </label>
                    <div className="next-card-list">
                      {expensePage.rows.map((row) => (
                        <article className="next-entity-card" onClick={() => openInvoice((row as Invoice).id)}>
                          <div>
                            <strong>{(row as Invoice).supplier_name || "Sin proveedor"}</strong>
                            <small>{shortDate((row as Invoice).invoice_date)} · {(row as Invoice).invoice_number || "Sin número"}</small>
                          </div>
                          <div className="next-inline-metrics">
                            <span>{(row as Invoice).category}</span>
                            <span>{(row as Invoice).status}</span>
                            <strong>{money((row as Invoice).total)}</strong>
                          </div>
                        </article>
                      ))}
                    </div>
                    <Pager meta={expensePage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.expenses.pageSize} onPage={(page) => setPager("expenses", { page })} onPageSize={(pageSize) => setPager("expenses", { pageSize, page: 1 })} />
                  </Panel>
                </div>
              )}

              {view === "income" && (
                <div className="next-stack">
                  <div className="next-stats-grid">
                    <StatCard label="Ingreso neto" value={money(incomeSummary?.totals.net_amount)} meta={`${incomeSummary?.totals.payout_count || 0} ingresos`} />
                    <StatCard label="Bruto" value={money(incomeSummary?.totals.gross_amount)} meta="Antes de fees" />
                    <StatCard label="Fees" value={money(incomeSummary?.totals.fees_amount)} meta="Coste de cobro" />
                    <StatCard label="Pendientes" value={String(incomeSummary?.totals.pending_count || 0)} meta="En tránsito o sin cerrar" />
                  </div>
                  {payoutDetail && (
                    <Panel title={`${payoutDetail.channel} · ${payoutDetail.bank_reference || "Sin referencia"}`} subtitle={`${shortDate(payoutDetail.payout_date)} · ${money(payoutDetail.net_amount)}`} actions={<button className="ghost" onClick={() => setPayoutDetail(null)}>Cerrar</button>}>
                      <div className="next-detail-grid">
                        <StatCard label="Estado" value={payoutDetail.status} />
                        <StatCard label="Bruto" value={money(payoutDetail.gross_amount)} />
                        <StatCard label="Fees" value={money(payoutDetail.fees_amount)} />
                        <StatCard label="Neto" value={money(payoutDetail.net_amount)} />
                      </div>
                    </Panel>
                  )}
                  <Panel title="Ingresos" subtitle={`${visiblePayouts.length} movimientos visibles en la preview`}>
                    <div className="next-filter-grid">
                      <input placeholder="Buscar canal, referencia o fichero" value={filters.incomeSearch} onInput={(e) => setFilter("incomeSearch", (e.target as HTMLInputElement).value)} />
                      <select value={filters.incomeChannel} onInput={(e) => setFilter("incomeChannel", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todos los canales</option>
                        {["shopify", "etsy", "bizum"].map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <select value={filters.incomeStatus} onInput={(e) => setFilter("incomeStatus", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todos los estados</option>
                        {["in_transit", "paid", "executed"].map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <input type="date" value={filters.incomeFrom} onInput={(e) => setFilter("incomeFrom", (e.target as HTMLInputElement).value)} />
                      <input type="date" value={filters.incomeTo} onInput={(e) => setFilter("incomeTo", (e.target as HTMLInputElement).value)} />
                    </div>
                    <label className="next-check">
                      <input type="checkbox" checked={filters.incomeArchived} onInput={(e) => setFilter("incomeArchived", (e.target as HTMLInputElement).checked)} />
                      Ver archivados
                    </label>
                    <div className="next-card-list">
                      {incomePage.rows.map((row) => (
                        <article className="next-entity-card" onClick={() => openPayout((row as Payout).id)}>
                          <div>
                            <strong>{(row as Payout).channel}</strong>
                            <small>{shortDate((row as Payout).payout_date)} · {(row as Payout).bank_reference || "Sin referencia"}</small>
                          </div>
                          <div className="next-inline-metrics">
                            <span>{(row as Payout).status}</span>
                            <span>Fees {money((row as Payout).fees_amount)}</span>
                            <strong>{money((row as Payout).net_amount)}</strong>
                          </div>
                        </article>
                      ))}
                    </div>
                    <Pager meta={incomePage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.income.pageSize} onPage={(page) => setPager("income", { page })} onPageSize={(pageSize) => setPager("income", { pageSize, page: 1 })} />
                  </Panel>
                </div>
              )}

              {view === "materials" && (
                <div className="next-stack">
                  <Panel title="Materiales" subtitle={`${visibleMaterials.length} materiales activos en la preview`}>
                    <div className="next-filter-grid">
                      <input placeholder="Buscar material, jerarquía o notas" value={filters.materialSearch} onInput={(e) => setFilter("materialSearch", (e.target as HTMLInputElement).value)} />
                      <select value={filters.materialCategory} onInput={(e) => setFilter("materialCategory", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todas las categorías</option>
                        {Array.from(new Set(materials.map((row) => row.category))).sort().map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <select value={filters.materialOutlet} onInput={(e) => setFilter("materialOutlet", (e.target as HTMLSelectElement).value)}>
                        <option value="">Core y outlet</option>
                        <option value="core">Solo core</option>
                        <option value="outlet">Solo outlet</option>
                      </select>
                    </div>
                    <div className="next-material-grid">
                      {materialPage.rows.map((row) => {
                        const material = row as Material;
                        const image = material.image_url_override || material.image_url || "";
                        return (
                          <article className="next-material-card">
                            <div className="next-material-head">
                              <div className="next-material-thumb">{image ? <img src={image} alt={material.name} /> : <span>Sin imagen</span>}</div>
                              <div>
                                <strong>{material.name}</strong>
                                <small>{material.category} · {material.usage_type || "sin uso"}</small>
                              </div>
                            </div>
                            <div className="next-tag-row">
                              {[material.family, material.subfamily, material.variant, material.base_material, material.finish].filter(Boolean).map((value) => (
                                <span>{value}</span>
                              ))}
                            </div>
                            <div className="next-inline-metrics">
                              <span>Stock {material.effective_stock_qty ?? "—"}</span>
                              <span>Reposición {material.reorder_point ?? "—"}</span>
                              <span>{material.is_outlet ? "Outlet" : "Core"}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <Pager meta={materialPage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.materials.pageSize} onPage={(page) => setPager("materials", { page })} onPageSize={(pageSize) => setPager("materials", { pageSize, page: 1 })} />
                  </Panel>
                </div>
              )}

              {view === "kits" && (
                <Panel title="Kits" subtitle={`${visibleKits.length} recetas visibles en la preview`}>
                  <div className="next-card-list">
                    {kitPage.rows.map((row) => (
                      <article className="next-entity-card">
                        <div>
                          <strong>{(row as KitRecipe).name}</strong>
                          <small>{(row as KitRecipe).version || "Versión base"} · {(row as KitRecipe).items.length} materiales</small>
                        </div>
                        <div className="next-inline-metrics">
                          <span>{(row as KitRecipe).is_complete ? "Completo" : "En construcción"}</span>
                          <strong>{money((row as KitRecipe).total_known_cost || 0)}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                  <Pager meta={kitPage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.kits.pageSize} onPage={(page) => setPager("kits", { page })} onPageSize={(pageSize) => setPager("kits", { pageSize, page: 1 })} />
                </Panel>
              )}

              {view === "costs" && (
                <div className="next-stack">
                  {costDetail && (
                    <Panel title={costDetail.summary.name} subtitle={`${costDetail.summary.purchase_lots} lotes activos · coste medio ${money(costDetail.summary.weighted_avg_unit_cost_inc_vat)}`} actions={<button className="ghost" onClick={() => setCostDetail(null)}>Cerrar</button>}>
                      <ChartSurface option={costEvolutionOption} />
                      <div className="next-card-list">
                        {costDetail.lots.map((lot) => (
                          <article className="next-entity-card compact">
                            <div>
                              <strong>{shortDate(lot.invoice_date)} · {lot.supplier_name || "Sin proveedor"}</strong>
                              <small>{lot.invoice_number || "Sin número"} · {lot.package_count} paquetes · {lot.total_units} unidades</small>
                            </div>
                            <div className="next-inline-metrics">
                              <span>{money(lot.line_total)}</span>
                              <strong>{money(lot.unit_cost)}</strong>
                            </div>
                          </article>
                        ))}
                      </div>
                    </Panel>
                  )}
                  <Panel title="Costes" subtitle={`${visibleCosts.length} materiales con lectura de coste visible`}>
                    <div className="next-filter-grid">
                      <input placeholder="Buscar material o proveedor" value={filters.costSearch} onInput={(e) => setFilter("costSearch", (e.target as HTMLInputElement).value)} />
                      <select value={filters.costCategory} onInput={(e) => setFilter("costCategory", (e.target as HTMLSelectElement).value)}>
                        <option value="">Todas las categorías</option>
                        {Array.from(new Set(costs.map((row) => row.category))).sort().map((value) => <option value={value}>{value}</option>)}
                      </select>
                      <label className="next-check inline">
                        <input type="checkbox" checked={filters.costOnlyWithPurchases} onInput={(e) => setFilter("costOnlyWithPurchases", (e.target as HTMLInputElement).checked)} />
                        Solo con compras
                      </label>
                    </div>
                    <div className="next-card-list">
                      {costPage.rows.map((row) => (
                        <article className="next-entity-card" onClick={() => openCost((row as CostRow).material_id)}>
                          <div>
                            <strong>{(row as CostRow).name}</strong>
                            <small>{(row as CostRow).category} · {(row as CostRow).main_supplier_name || "Sin proveedor"}</small>
                          </div>
                          <div className="next-inline-metrics">
                            <span>{(row as CostRow).purchase_lots} lotes</span>
                            <span>{money((row as CostRow).weighted_avg_unit_cost_inc_vat)}</span>
                            <strong>{money((row as CostRow).total_spend)}</strong>
                          </div>
                        </article>
                      ))}
                    </div>
                    <Pager meta={costPage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.costs.pageSize} onPage={(page) => setPager("costs", { page })} onPageSize={(pageSize) => setPager("costs", { pageSize, page: 1 })} />
                  </Panel>
                </div>
              )}

              {view === "activity" && (
                <Panel title="Actividad" subtitle="Línea temporal de negocio ya separada del ruido técnico.">
                  <div className="next-filter-grid">
                    <input placeholder="Buscar en actividad" value={filters.auditSearch} onInput={(e) => setFilter("auditSearch", (e.target as HTMLInputElement).value)} />
                    <select value={filters.auditLane} onInput={(e) => setFilter("auditLane", (e.target as HTMLSelectElement).value)}>
                      <option value="all">Toda la actividad</option>
                      <option value="expenses">Gastos</option>
                      <option value="income">Ingresos</option>
                      <option value="materials">Materiales y kits</option>
                      <option value="suppliers">Proveedores</option>
                    </select>
                  </div>
                  <div className="next-timeline">
                    {auditPage.rows.map((row) => (
                      <article className="next-timeline-item">
                        <strong>{(row as AuditRow).entity_type} · {(row as AuditRow).action}</strong>
                        <small>{shortDateTime((row as AuditRow).created_at)} · {(row as AuditRow).actor}</small>
                      </article>
                    ))}
                  </div>
                  <Pager meta={auditPage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.activity.pageSize} onPage={(page) => setPager("activity", { page })} onPageSize={(pageSize) => setPager("activity", { pageSize, page: 1 })} />
                </Panel>
              )}

              {view === "settings" && settings && (
                <div className="next-grid next-grid-two">
                  <Panel title="Configuración funcional" subtitle="La app nueva hereda la fuente de verdad del backend actual.">
                    <div className="next-key-value">
                      <div><span>Empresa</span><strong>{settings.company_name}</strong></div>
                      <div><span>Moneda</span><strong>{settings.currency}</strong></div>
                      <div><span>Estado factura por defecto</span><strong>{settings.default_invoice_status}</strong></div>
                      <div><span>Canal ingreso por defecto</span><strong>{settings.default_payout_channel}</strong></div>
                      <div><span>Multiplicador reposición</span><strong>{settings.reorder_alert_multiplier}</strong></div>
                    </div>
                  </Panel>
                  <Panel title="Conexión Shopify" subtitle="Resumen operativo para la preview y el futuro refresh.">
                    <div className="next-key-value">
                      <div><span>Tienda</span><strong>{shopify?.store_domain || "Sin configurar"}</strong></div>
                      <div><span>Versión API</span><strong>{shopify?.api_version || "—"}</strong></div>
                      <div><span>Última sync</span><strong>{shortDateTime(shopify?.last_sync_at)}</strong></div>
                      <div><span>Estado</span><strong>{shopify?.last_sync_status || "—"}</strong></div>
                    </div>
                  </Panel>
                </div>
              )}

              {view === "diagnostics" && health && (
                <div className="next-stack">
                  <div className="next-stats-grid">
                    <StatCard label="Base de datos" value={health.db_integrity === "ok" ? "Disponible" : health.db_integrity} meta={health.db_file} />
                    <StatCard label="Backups" value={health.latest_backup_name || "Sin backup"} meta={shortDateTime(health.latest_backup_at)} />
                    <StatCard label="Migraciones" value={String(health.migrations.applied.length)} meta={`${health.migrations.pending.length} pendientes`} />
                    <StatCard label="Shopify" value={health.shopify.configured ? "Configurado" : "Pendiente"} meta={health.shopify.last_sync_status || "sin sync"} />
                  </div>
                  <Panel title="Salud del sistema" subtitle="Observabilidad técnica separada del negocio.">
                    <div className="next-key-value">
                      <div><span>Versión app</span><strong>{health.app_version}</strong></div>
                      <div><span>Tamaño DB</span><strong>{health.db_size_bytes} bytes</strong></div>
                      <div><span>Directorio backups</span><strong>{health.backup_dir}</strong></div>
                      <div><span>Última sync Shopify</span><strong>{shortDateTime(health.shopify.last_sync_at)}</strong></div>
                    </div>
                  </Panel>
                </div>
              )}

              {view === "logs" && (
                <Panel title="Logs técnicos" subtitle="Vista filtrable para soporte y depuración durante la transición.">
                  <div className="next-filter-grid">
                    <input placeholder="Buscar acción, mensaje, origen" value={filters.logSearch} onInput={(e) => setFilter("logSearch", (e.target as HTMLInputElement).value)} />
                    <select value={filters.logOrigin} onInput={(e) => setFilter("logOrigin", (e.target as HTMLSelectElement).value)}>
                      <option value="">Todos los orígenes</option>
                      {Array.from(new Set(auditTechnical.map((row) => row.entity_type))).sort().map((value) => <option value={value}>{value}</option>)}
                    </select>
                    <select value={filters.logLevel} onInput={(e) => setFilter("logLevel", (e.target as HTMLSelectElement).value)}>
                      <option value="relevant">Relevantes</option>
                      <option value="error">Errores</option>
                      <option value="warn">Warnings</option>
                      <option value="info">Info</option>
                      <option value="debug">Debug</option>
                      <option value="">Todos</option>
                    </select>
                    <input type="date" value={filters.logFrom} onInput={(e) => setFilter("logFrom", (e.target as HTMLInputElement).value)} />
                    <input type="date" value={filters.logTo} onInput={(e) => setFilter("logTo", (e.target as HTMLInputElement).value)} />
                  </div>
                  <div className="next-card-list">
                    {logPage.rows.map((row) => (
                      <article className="next-entity-card compact">
                        <div>
                          <strong>{(row as AuditRow).action}</strong>
                          <small>{(row as AuditRow).entity_type} · {shortDateTime((row as AuditRow).created_at)}</small>
                        </div>
                        <button className="ghost" onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))}>Copiar detalle</button>
                      </article>
                    ))}
                  </div>
                  <Pager meta={logPage as ReturnType<typeof paginate<unknown>>} pageSize={pagination.logs.pageSize} onPage={(page) => setPager("logs", { page })} onPageSize={(pageSize) => setPager("logs", { pageSize, page: 1 })} />
                </Panel>
              )}

              {["margins", "orders", "purchasing", "channels", "advertising", "customers"].includes(view) && (
                <PlaceholderView title={pageTitle} text="Esta pantalla queda preparada en la nueva arquitectura de dominios para la siguiente fase funcional." />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
