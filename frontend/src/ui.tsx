import type { ComponentChildren, FunctionalComponent } from "preact";

export const Panel: FunctionalComponent<{ title?: string; subtitle?: string; actions?: ComponentChildren; className?: string }> = ({
  title,
  subtitle,
  actions,
  className,
  children
}) => (
  <section className={`next-panel ${className || ""}`.trim()}>
    {(title || actions) && (
      <header className="next-panel-head">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
    )}
    {children}
  </section>
);

export const StatCard: FunctionalComponent<{ label: string; value: string; meta?: string }> = ({ label, value, meta }) => (
  <article className="next-stat">
    <span>{label}</span>
    <strong>{value}</strong>
    {meta && <small>{meta}</small>}
  </article>
);

export const EmptyState: FunctionalComponent<{ title: string; text: string }> = ({ title, text }) => (
  <div className="next-empty">
    <strong>{title}</strong>
    <span>{text}</span>
  </div>
);

export const PlaceholderView: FunctionalComponent<{ title: string; text: string }> = ({ title, text }) => (
  <Panel title={title} subtitle="Preparado para la siguiente fase">
    <EmptyState title="Vista reservada" text={text} />
  </Panel>
);

export const Pager: FunctionalComponent<{
  meta: { total: number; page: number; totalPages: number; start: number; end: number };
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}> = ({ meta, pageSize, onPage, onPageSize }) => (
  <div className="next-pager">
    <div className="next-pager-meta">
      <span>{meta.total ? `${meta.start + 1}-${meta.end} de ${meta.total}` : "0 resultados"}</span>
      <label>
        <span>Por página</span>
        <select value={pageSize} onInput={(event) => onPageSize(Number((event.target as HTMLSelectElement).value))}>
          {[10, 20, 50].map((size) => (
            <option value={size}>{size}</option>
          ))}
        </select>
      </label>
    </div>
    <div className="next-pager-buttons">
      <button className="ghost" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Anterior
      </button>
      <span>
        Página {meta.page} / {meta.totalPages}
      </span>
      <button className="ghost" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Siguiente
      </button>
    </div>
  </div>
);
