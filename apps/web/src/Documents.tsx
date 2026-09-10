import { authHeaders, jsonResponse } from "@roadstar/client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, request } from "./api";
import type {
  Command,
  Session,
  State,
  ShipmentDocument,
  SendCommand,
} from "./api";
import { DocumentReview, FacilityNoteReview } from "./DocumentReview";
export async function downloadOriginal(
  session: Session,
  doc: ShipmentDocument,
) {
  const response = await fetch(`${apiUrl}/api/documents/${doc.id}/content`, {
    headers: authHeaders({ token: session.token, carrierId: session.carrier }),
  });
  if (!response.ok)
    throw new Error("Document could not be downloaded. Refresh and try again.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.extraction.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Documents({
  state,
  session,
  send,
  lastError,
}: {
  state: State;
  session: Session;
  send: SendCommand;
  lastError?: string;
}) {
  const [loadId, setLoad] = useState(""),
    [kind, setKind] = useState("pod"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<ShipmentDocument | null>(null),
    [facilityDoc, setFacilityDoc] = useState<ShipmentDocument | null>(null);
  const pending = useRef<{
    command: Command;
    uploadKey: string;
    document?: { id: string; version: number };
  } | null>(null);
  const client = useQueryClient();
  function changeFile(value: File | null) {
    setFile(value);
    pending.current = null;
    setMessage("");
    setFailed(false);
  }
  async function upload() {
    if (!file || !loadId) return;
    if (file.size > 12 * 1024 * 1024) {
      setMessage("Choose a file no larger than 12 MB.");
      setFailed(true);
      return;
    }
    const load = state.loads.find((l) => l.id === loadId);
    if (!load) return;
    setBusy(true);
    setFailed(false);
    setMessage("Registering document and uploading original file…");
    try {
      pending.current ??= {
        command: {
          id: crypto.randomUUID(),
          path: "document",
          body: { loadId, kind, mediaType: file.type, filename: file.name },
          version: load.version,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        uploadKey: crypto.randomUUID(),
      };
      const action = pending.current;
      action.document ??= await request<{ id: string; version: number }>(
        session,
        "document",
        action.command,
      );
      const res = await fetch(
        `${apiUrl}/api/documents/${action.document.id}/content`,
        {
          method: "PUT",
          headers: {
            ...authHeaders(
              { token: session.token, carrierId: session.carrier },
              {
                expectedVersion: action.document.version,
                key: action.uploadKey,
              },
            ),
            "Content-Type": file.type,
          },
          body: file,
        },
      );
      await jsonResponse(res);
      setMessage("Synchronized · original file stored and hash recorded.");
      pending.current = null;
      setFile(null);
      await client.invalidateQueries({ queryKey: ["state"] });
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error
          ? e.message
          : "Upload failed. Keep the selected file to retry the original request.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(doc: ShipmentDocument) {
    try {
      await downloadOriginal(session, doc);
    } catch (error) {
      setMessage((error as Error).message);
      setFailed(true);
    }
  }
  const documents = state.documents || [];
  return (
    <section id="documents" className="panel documents">
      <div className="panel-heading">
        <h2>Shipment documents</h2>
        <span className="tag">Original file + SHA-256</span>
      </div>
      <p className="fine">
        Keep PODs and manifests with the load. A stored file does not establish
        a delivery or authorize billing.
      </p>
      <div className="document-form">
        <label>
          Load
          <select
            value={loadId}
            onChange={(e) => {
              setLoad(e.target.value);
              pending.current = null;
            }}
            disabled={busy}
          >
            <option value="">Choose load</option>
            {state.loads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id} · {l.customer}
              </option>
            ))}
          </select>
        </label>
        <label>
          Document type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              pending.current = null;
            }}
            disabled={busy}
          >
            <option value="pod">Proof of delivery</option>
            <option value="manifest">Manifest</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Original file · PDF, JPEG or PNG, max 12 MB
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => changeFile(e.target.files?.[0] || null)}
            disabled={busy}
          />
        </label>
        <button
          className="primary"
          disabled={!file || !loadId || busy || !navigator.onLine}
          onClick={() => void upload()}
        >
          {busy
            ? "Uploading…"
            : failed && pending.current
              ? "Retry original upload"
              : "Upload document"}
        </button>
      </div>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "error" : "notice"}
        >
          {message}
        </p>
      )}
      <p className="fine">
        Keep this page open during upload. A pending upload retains its server
        record; reselect the file if the browser is closed.
      </p>
      {!documents.length ? (
        <div className="empty">No shipment documents yet.</div>
      ) : (
        documents.map((doc) => (
          <div className="evidence-row" key={doc.id} id={`document-${doc.id}`}>
            <div>
              <strong>{doc.extraction.filename}</strong>
              <p>
                {doc.load_id} · {doc.extraction.kind} · {doc.status} ·{" "}
                {doc.extraction.reviewStatus || "no extraction result"}
              </p>
              {doc.sha256 && <code>{doc.sha256}</code>}
            </div>
            <div className="document-actions">
              <button
                disabled={doc.status !== "stored" || !navigator.onLine}
                onClick={() => void download(doc)}
              >
                Download original
              </button>
              <button
                disabled={doc.status !== "stored" || !navigator.onLine}
                onClick={() => setReviewDoc(doc)}
              >
                Review fields
              </button>
              <button
                disabled={
                  doc.extraction.reviewStatus !== "reviewed" ||
                  !navigator.onLine
                }
                onClick={() => setFacilityDoc(doc)}
              >
                Save facility instructions
              </button>
            </div>
          </div>
        ))
      )}
      {!!state.facilityNotes?.length && (
        <div className="facility-notes">
          <h3>Reviewed facility instructions</h3>
          {state.facilityNotes.map((note) => (
            <article className="facility-note" key={note.id}>
              <strong>
                {note.load_id} · {note.stop_id}
              </strong>
              <p>{note.instructions}</p>
              <a href={`#document-${note.document_id}`}>
                Source document · reviewed revision {note.document_version}
              </a>
            </article>
          ))}
        </div>
      )}
      {reviewDoc && (
        <DocumentReview
          document={reviewDoc}
          state={state}
          send={send}
          lastError={lastError}
          onClose={() => setReviewDoc(null)}
          onDownload={() => void download(reviewDoc)}
        />
      )}
      {facilityDoc && (
        <FacilityNoteReview
          document={facilityDoc}
          state={state}
          send={send}
          lastError={lastError}
          onClose={() => setFacilityDoc(null)}
        />
      )}
    </section>
  );
}
