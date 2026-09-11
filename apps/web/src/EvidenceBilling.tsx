import { useState } from "react";
import { Modal } from "./ReviewDialog";
import type { Invoice, State, Visit, SendCommand } from "./api";
const date = (value: string) =>
  new Date(value).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
const money = (invoice: Invoice) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: invoice.body.currency,
  }).format(invoice.body.amountCents / 100);
export function EvidenceBilling({
  state,
  send,
  lastError,
  onVisit,
}: {
  state: State;
  send: SendCommand;
  lastError?: string;
  onVisit: (visit: Visit) => void;
}) {
  const [selected, setSelected] = useState<Invoice | null>(null);
  return (
    <section className="panel billing-panel">
      <div className="panel-heading">
        <h2>Stop evidence & detention billing</h2>
        <span className="tag">Observed samples</span>
      </div>
      <p className="fine">
        GPS arrival and departure observations retain their sample precision
        through approval. Billing approval records a reviewed revision; it does
        not initiate payment.
      </p>
      <details className="visit-session-policy"><summary>How visits and free time are counted</summary><p>Boundary uncertainty holds the current visit open. A confident exit closes it; a confident return starts a separate visit, even after a short absence. No exit grace period is applied.</p><p>Each separate observed visit receives the shipment contract’s free-time allowance. Confirm that this rule matches the shipment terms before approving detention. Sample timestamps are observations, not exact dock crossing times.</p></details>
      <div className="evidence-ledger"><div><span className="step-index">01</span><strong>Observe</strong><small>{state.visits.length} recorded stop visits</small></div><i aria-hidden="true"/><div><span className="step-index">02</span><strong>Review</strong><small>{state.invoices.filter(invoice=>invoice.status === "draft").length} draft revisions</small></div><i aria-hidden="true"/><div><span className="step-index">03</span><strong>Approve</strong><small>{state.invoices.filter(invoice=>invoice.status === "approved").length} approved revisions</small></div></div>
      {!state.visits.length ? (
        <div className="empty">
          No stop visits have been recorded. Evidence appears when accepted-trip
          telemetry establishes a visit.
        </div>
      ) : (
        state.visits.map((visit) => (
          <div className="evidence-row" key={visit.id}>
            <div>
              <strong>
                {visit.load_id} · {visit.stop_id}
              </strong>
              <p>
                {date(visit.arrival)} →{" "}
                {visit.departure ? date(visit.departure) : "Visit still open"}
              </p>
            </div>
            <p className="fine">{visit.session_policy==='confidence-disk-split-v1'?'Separate visit · confident exit ends this visit':'Visit policy not recorded'}</p>
            <button onClick={() => onVisit(visit)}>Review stop evidence</button>
          </div>
        ))
      )}
      {state.invoices
        .slice()
        .sort((a, b) => b.revision - a.revision)
        .map((invoice) => {
          const latest = Math.max(
            ...state.invoices
              .filter((item) => item.visit_id === invoice.visit_id)
              .map((item) => item.revision),
          );
          const visit = state.visits.find(
            (item) => item.id === invoice.visit_id,
          );
          return (
            <article className="invoice-review-row" key={invoice.id}>
              <div className="panel-heading">
                <div>
                  <strong>
                    {visit?.load_id || "Detention"} · revision{" "}
                    {invoice.revision}
                  </strong>
                  <p className="fine">
                    {invoice.body.dwellMinutes} minutes {invoice.body.timingEvidence?'reviewed':'observed'} ·{" "}
                    {invoice.body.billableMinutes} billable minutes
                  </p>
                </div>
                <strong>{money(invoice)}</strong>
                <span className={`tag status-${invoice.status}`}>
                  {invoice.status}
                </span>
              </div>
              {visit&&<p className="fine">Observed visit: {date(visit.arrival)} → {visit.departure?date(visit.departure):'Still open'} · {visit.stop_id}</p>}
              <p className="fine">
                Timestamp precision:{" "}
                {invoice.body.precision.replaceAll("_", " ")}
                {invoice.revision < latest
                  ? ` · historical revision; latest is ${latest}`
                  : ""}
              </p>
              <p className="fine">{invoice.body.visitPolicy?'Free-time allowance applies to this observed visit. Exit and return are not merged.':'Historical invoice: visit-session policy was not recorded in this revision.'}</p>
              {!!invoice.body.timingConflicts?.length&&<p className="notice">{invoice.body.timingConflictReview?'A previously flagged overlap was rechecked and resolved at approval.':'Draft flagged overlapping visit times. Review the document correction before billing approval; the server rechecks current visits.'}</p>}
              {invoice.body.timingEvidence&&<div className="notice"><strong>Reviewed document times</strong><p>{date(invoice.body.timingEvidence.arrivalAt)} → {date(invoice.body.timingEvidence.departureAt)}</p><p>{invoice.body.timingEvidence.document.filename} · correction {invoice.body.timingEvidence.revision} · {invoice.body.timingEvidence.reason}</p><p className="fine">Original GPS observations remain unchanged. Prior invoice revisions are history, not additional charges.</p></div>}
              {invoice.body.review && (
                <details>
                  <summary>Approval evidence</summary>
                  <p>{invoice.body.review.note}</p>
                  <p className="fine">
                    Reviewed {date(invoice.body.review.recordedAt)} · prior
                    revision retained
                  </p>
                </details>
              )}
              {state.assignments.some(a=>a.id===visit?.assignment_id&&a.visitReviewRequired)&&<p className="notice">Late GPS evidence requires visit reconciliation before approval.</p>}
              {invoice.status === "draft" && invoice.revision === latest && !state.assignments.some(a=>a.id===visit?.assignment_id&&a.visitReviewRequired) && (
                <button
                  onClick={() => setSelected(invoice)}
                  disabled={!navigator.onLine}
                >
                  Review invoice approval
                </button>
              )}
            </article>
          );
        })}
      {selected && (
        <InvoiceApproval
          invoice={selected}
          state={state}
          send={send}
          lastError={lastError}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
function InvoiceApproval({
  invoice,
  state,
  send,
  lastError,
  onClose,
}: {
  invoice: Invoice;
  state: State;
  send: SendCommand;
  lastError?: string;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const visit = state.visits.find((item) => item.id === invoice.visit_id);
  const latest = Math.max(
    ...state.invoices
      .filter((item) => item.visit_id === invoice.visit_id)
      .map((item) => item.revision),
  );
  const stale = latest !== invoice.revision || state.assignments.some(a=>a.id===visit?.assignment_id&&a.visitReviewRequired);
  const contract = invoice.body.contract;
  return (
    <Modal
      title="Review detention approval"
      description={`Draft revision ${invoice.revision} · ${money(invoice)} · ${visit?.load_id || invoice.visit_id}`}
      onClose={onClose}
    >
      <div className="notice">
        These are observed GPS samples. Exact boundary crossing times are not
        established by these timestamps. Review sample uncertainty, same-stop
        evidence and configured terms before approval.
      </div>
      {invoice.body.timingEvidence&&<div className="notice"><strong>Document times supersede GPS times for this billing draft.</strong><p>{date(invoice.body.timingEvidence.arrivalAt)} → {date(invoice.body.timingEvidence.departureAt)}</p><p>{invoice.body.timingEvidence.document.filename} · {invoice.body.timingEvidence.sourceNote}</p><p>{invoice.body.timingEvidence.reason}</p></div>}
      <dl>
        <dt>Observed arrival / departure</dt>
        <dd>
          {visit ? date(visit.arrival) : "Visit unavailable"} →{" "}
          {visit?.departure ? date(visit.departure) : "Departure unavailable"}
        </dd>
        <dt>{invoice.body.timingEvidence?'Reviewed / billable duration':'Observed / billable duration'}</dt>
        <dd>
          {invoice.body.dwellMinutes} / {invoice.body.billableMinutes} minutes
        </dd>
        <dt>Configured contract</dt>
        <dd>
          {contract
            ? `${contract.id} · v${contract.version} · ${contract.free_minutes} free minutes · ${new Intl.NumberFormat("en-CA", { style: "currency", currency: contract.currency }).format(contract.rate_cents_per_hour / 100)} per hour`
            : `${invoice.contract_id || "Contract"} · v${invoice.contract_version || "unknown"}`}
        </dd>
        <dt>Visit-session rule</dt>
        <dd>{invoice.body.visitPolicy?'Confident exit and return are separate visits. The free-time allowance applies separately to each visit.':'Visit-session policy was not recorded in this historical revision; review the original evidence and terms.'}</dd>
        <dt>Source telemetry samples</dt>
        <dd>
          {invoice.body.evidence.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </dd>
      </dl>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setFailed(false);
          const ok = await send(
            "approve-invoice",
            {
              invoiceId: invoice.id,
              acknowledgeObservedSamples: true,
              ...(invoice.body.timingEvidence?{acknowledgeCorrectedTimes:true}:{}),
              evidenceNote: note.trim(),
            },
            invoice.revision,
          );
          setBusy(false);
          if (ok) onClose();
          else setFailed(true);
        }}
      >
        <label className="checkbox-label">
          <input
            type="checkbox"
            required
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I reviewed the observed samples, their uncertainty, the same-stop
            evidence and the configured contract terms.{invoice.body.timingEvidence?' I also reviewed the corrected document times and their supporting evidence.':''}
          </span>
        </label>
        <label>
          Evidence review note
          <textarea
            required
            minLength={20}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record what you checked and any remaining uncertainty."
          />
        </label>
        {stale && (
          <p className="notice">
            Billing or visit evidence changed. Close this dialog and review the
            latest draft.
          </p>
        )}
        {failed && (
          <p className="error" role="alert">
            {lastError ||
              "Approval was not recorded. Review current evidence and contract terms."}
          </p>
        )}
        <button
          className="primary"
          disabled={
            !acknowledged ||
            note.trim().length < 20 ||
            busy ||
            stale ||
            !visit?.departure ||
            !navigator.onLine
          }
        >
          {busy
            ? "Recording approval…"
            : `Approve billing revision ${invoice.revision}`}
        </button>
      </form>
      <p className="fine">
        The server rechecks the latest revision, contract version and source
        samples. Approval creates a new revision and retains observed-sample
        precision.
      </p>
    </Modal>
  );
}
