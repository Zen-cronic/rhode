import { useState } from "react";
import { Modal } from "./ReviewDialog";
import type {
  DocumentFields,
  ShipmentDocument,
  State,
  SendCommand,
} from "./api";
const fields = [
  ["billNumber", "Bill number"],
  ["signedBy", "Signed by"],
  ["observedDate", "Date written on document"],
  ["notes", "Notes"],
] as const;
export function DocumentReview({
  document: doc,
  state,
  send,
  lastError,
  onClose,
  onDownload,
}: {
  document: ShipmentDocument;
  state: State;
  send: SendCommand;
  lastError?: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const original = doc.extraction.fields;
  const [values, setValues] = useState<DocumentFields>(
    doc.extraction.reviewedFields ??
      original ?? {
        billNumber: null,
        signedBy: null,
        observedDate: null,
        notes: null,
      },
  );
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const stale =
    state.documents?.find((current) => current.id === doc.id)?.version !==
    doc.version;
  return (
    <Modal
      title="Review document fields"
      description={`${doc.extraction.filename} · ${doc.load_id} · source revision ${doc.version}`}
      onClose={onClose}
    >
      <button onClick={onDownload}>Download original for review</button>
      <p className="fine">
        Compare each value with the source. Blank reviewed values are recorded
        as unknown. The original extraction remains unchanged.
      </p>
      <code>{doc.sha256}</code>
      {!original && (
        <p className="notice">
          No extracted fields are available. Any review must be based on the
          original document.
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setFailed(false);
          const reviewed = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              value?.trim() || null,
            ]),
          );
          const ok = await send(
            "review-document",
            { documentId: doc.id, fields: reviewed, reason: reason.trim() },
            doc.version,
          );
          setBusy(false);
          if (ok) onClose();
          else setFailed(true);
        }}
      >
        {fields.map(([key, caption]) => (
          <div className="field-review" key={key}>
            <label>
              {caption}
              {key === "notes" ? (
                <textarea
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValues({ ...values, [key]: event.target.value })
                  }
                />
              ) : (
                <input
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValues({ ...values, [key]: event.target.value })
                  }
                />
              )}
            </label>
            <p className="fine">
              Original extraction:{" "}
              <span>{original?.[key] || "Not extracted"}</span>
            </p>
          </div>
        ))}
        <label>
          Review reason
          <textarea
            minLength={10}
            maxLength={2000}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe what you confirmed or corrected against the source."
          />
        </label>
        {stale && (
          <p className="notice">
            The source revision changed during review. Close this dialog and
            reopen the current document.
          </p>
        )}
        {failed && (
          <p className="error" role="alert">
            {lastError ||
              "Review was not saved. Check current document evidence."}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy || stale || reason.trim().length < 10 || !navigator.onLine
          }
        >
          {busy ? "Saving reviewed fields…" : "Save reviewed fields"}
        </button>
      </form>
    </Modal>
  );
}
export function FacilityNoteReview({
  document: doc,
  state,
  send,
  lastError,
  onClose,
}: {
  document: ShipmentDocument;
  state: State;
  send: SendCommand;
  lastError?: string;
  onClose: () => void;
}) {
  const load = state.loads.find((item) => item.id === doc.load_id);
  const [stopId, setStopId] = useState(""),
    [instructions, setInstructions] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const current = state.documents?.find((item) => item.id === doc.id);
  const stale =
    current?.version !== doc.version ||
    current.extraction.reviewStatus !== "reviewed";
  return (
    <Modal
      title="Save facility instructions"
      description={`Use the reviewed source ${doc.extraction.filename}; instructions are linked to document revision ${doc.version}.`}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setFailed(false);
          const ok = await send(
            "facility-note",
            { documentId: doc.id, stopId, instructions: instructions.trim() },
            doc.version,
          );
          setBusy(false);
          if (ok) onClose();
          else setFailed(true);
        }}
      >
        <label>
          Shipment stop
          <select
            aria-label="Shipment stop"
            required
            value={stopId}
            onChange={(event) => setStopId(event.target.value)}
          >
            <option value="">Choose the source shipment stop</option>
            {load &&
              [load.pickup, load.delivery].map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Reviewed arrival instructions
          <textarea
            minLength={10}
            maxLength={4000}
            required
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Record instructions supported by the reviewed source."
          />
        </label>
        <p className="fine">
          Saved instructions appear with this stop and preserve their source
          document, revision and reviewer.
        </p>
        {stale && (
          <p className="notice">
            Review the current source document before saving instructions.
          </p>
        )}
        {failed && (
          <p className="error" role="alert">
            {lastError ||
              "Instructions were not saved. Review the source revision."}
          </p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            stale ||
            !stopId ||
            instructions.trim().length < 10 ||
            !navigator.onLine
          }
        >
          {busy ? "Saving instructions…" : "Save facility instructions"}
        </button>
      </form>
    </Modal>
  );
}
