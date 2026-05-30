export function createIncomeViews(ctx) {
  const {
    state,
    $,
    api,
    euro,
    text,
    number,
    lower,
    badge,
    channelLabel,
    payoutStatusLabel,
    applyTextSearch,
    sortRows,
    paginateRows,
    renderPagination
  } = ctx;

  function renderIncome() {
    if (!state.incomeSummary) return;
    renderPayouts();
  }

  function filteredPayoutRows() {
    let rows = [...state.payouts];
    rows = applyTextSearch(rows, $("#payoutSearch")?.value, ["channel", "bank_reference", "raw_source_file", "notes"]);
    const channel = $("#payoutChannelFilter")?.value;
    const status = $("#payoutStatusFilter")?.value;
    const from = $("#payoutFromFilter")?.value;
    const to = $("#payoutToFilter")?.value;
    if (channel) rows = rows.filter((row) => row.channel === channel);
    if (status) rows = rows.filter((row) => row.status === status);
    if (from) rows = rows.filter((row) => String(row.payout_date || "") >= from);
    if (to) rows = rows.filter((row) => String(row.payout_date || "") <= to);
    return rows;
  }

  function renderIncomeSummaryCards(rows) {
    const pending = rows.filter((row) => !["paid", "executed"].includes(String(row.status || "")));
    const lastPayoutDate = rows.length ? [...rows].sort((a, b) => String(b.payout_date || "").localeCompare(String(a.payout_date || "")))[0].payout_date : "";
    $("#incomeSummaryCards").innerHTML = [
      ["Ingreso neto", euro.format(rows.reduce((sum, row) => sum + number(row.net_amount), 0)), `${rows.length} ingresos visibles`],
      ["Bruto", euro.format(rows.reduce((sum, row) => sum + number(row.gross_amount), 0)), "Importe antes de fees"],
      ["Fees", euro.format(rows.reduce((sum, row) => sum + number(row.fees_amount), 0)), "Comisiones acumuladas"],
      ["Pendientes", pending.length, lastPayoutDate ? `Último ingreso ${text(lastPayoutDate)}` : "Sin ingresos todavía"]
    ].map(([label, value, hint]) => `
      <article class="card dashboard-kpi-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${hint}</small>
      </article>
    `).join("");
  }

  function renderPayouts() {
    let rows = filteredPayoutRows();
    renderIncomeSummaryCards(rows);
    rows = sortRows(rows, $("#payoutSort")?.value, {
      date_asc: (a, b) => String(a.payout_date).localeCompare(String(b.payout_date)),
      net_desc: (a, b) => number(b.net_amount) - number(a.net_amount),
      net_asc: (a, b) => number(a.net_amount) - number(b.net_amount),
      fees_desc: (a, b) => number(b.fees_amount) - number(a.fees_amount),
      channel_asc: (a, b) => lower(a.channel).localeCompare(lower(b.channel)) || String(b.payout_date).localeCompare(String(a.payout_date)),
      default: (a, b) => String(b.payout_date).localeCompare(String(a.payout_date))
    });
    const meta = paginateRows("payouts", rows);
    $("#incomeResultText").textContent = `${meta.total} ingresos visibles.${meta.total ? ` Mostrando ${meta.startIndex + 1}-${meta.endIndex}.` : ""}`;
    $("#payoutList").innerHTML = meta.rows.map((payout) => `
      <article class="invoice-card ${payout.is_deleted ? "deleted" : ""} ${state.selectedPayoutId == payout.id ? "active" : ""}">
        <button type="button" class="invoice-open" data-open-payout="${payout.id}">
          <span>
            <strong>${channelLabel(payout.channel)}</strong>
            <div class="meta">${text(payout.payout_date)}${payout.bank_reference ? ` · ${text(payout.bank_reference)}` : ""}</div>
          </span>
          <span class="amount">${euro.format(number(payout.net_amount))}</span>
        </button>
        <div class="tags">
          ${badge(channelLabel(payout.channel), payout.channel === "bizum" ? "ok" : "")}
          ${badge(payoutStatusLabel(payout.status), ["paid", "executed"].includes(payout.status) ? "ok" : "warn")}
          ${badge(`Bruto ${euro.format(number(payout.gross_amount))}`)}
          ${badge(`Fees ${euro.format(number(payout.fees_amount))}`)}
        </div>
        <div class="row-actions">
          <button data-open-payout="${payout.id}" type="button">Ver</button>
          ${payout.is_deleted ? `<button data-restore-payout="${payout.id}" type="button">Restaurar</button>` : `<button class="ghost danger-text" data-delete-payout="${payout.id}" type="button">Archivar</button>`}
        </div>
      </article>
    `).join("") || `<div class="empty-state">No hay ingresos con esos filtros.</div>`;
    renderPagination("#payoutPagination", "payouts", meta);
  }

  async function openPayout(id) {
    const payout = state.payouts.find((row) => row.id == id) || await api(`/api/channel-payouts/${id}`);
    if (!payout) return;
    $("#payoutForm")?.classList.add("hidden");
    state.selectedPayoutId = payout.id;
    const panel = $("#payoutDetailPanel");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="selected-invoice">
        <div class="panel-head">
          <div>
            <h2>${channelLabel(payout.channel)} · ${text(payout.payout_date)}</h2>
            <p>${euro.format(number(payout.net_amount))} netos · ${payout.bank_reference ? text(payout.bank_reference) : "sin referencia bancaria"}</p>
          </div>
          <div class="row-actions">
            <button type="button" data-edit-payout-details="${payout.id}">Editar ingreso</button>
            <button type="button" class="ghost" data-close-payout-panels>Cerrar</button>
          </div>
        </div>
        <div class="tags">
          ${badge(channelLabel(payout.channel))}
          ${badge(payoutStatusLabel(payout.status), ["paid", "executed"].includes(payout.status) ? "ok" : "warn")}
          ${badge(payout.currency || "EUR")}
          ${payout.channel === "etsy" ? badge("Depósito neto", "warn") : ""}
          ${payout.channel === "bizum" ? badge("Ingreso directo", "ok") : ""}
        </div>
      </div>
      <div class="form-grid three">
        <div class="inline-note">Bruto: <strong>${euro.format(number(payout.gross_amount))}</strong></div>
        <div class="inline-note">Fees: <strong>${euro.format(number(payout.fees_amount))}</strong></div>
        <div class="inline-note">Neto: <strong>${euro.format(number(payout.net_amount))}</strong></div>
      </div>
      <div class="form-grid three">
        <div class="inline-note">Estado: <strong>${text(payoutStatusLabel(payout.status))}</strong></div>
        <div class="inline-note">Cuenta banco: <strong>${text(payout.bank_account_hint || "-")}</strong></div>
        <div class="inline-note">Referencia: <strong>${text(payout.bank_reference || "-")}</strong></div>
      </div>
      <div class="line-list">
        <article class="line-card">
          <div class="row-main">
            <strong>Origen</strong>
            <div class="meta">${text(payout.raw_source_file || "Creado manualmente")}</div>
            ${payout.external_id ? `<div class="meta">ID externo · ${text(payout.external_id)}</div>` : ""}
            ${payout.notes ? `<p>${text(payout.notes)}</p>` : ""}
          </div>
        </article>
      </div>
    `;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    renderPayouts();
  }

  return { renderIncome, renderIncomeSummaryCards, renderPayouts, openPayout };
}
