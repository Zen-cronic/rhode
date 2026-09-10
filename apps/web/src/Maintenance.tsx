import { useState } from "react";
import { Modal } from "./ReviewDialog";
import type { MaintenanceHold, State, SendCommand } from "./api";
const date = (value: string) =>
  new Date(value).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
function period(value: string) {
  const bounds = value
    .slice(1, -1)
    .split(",")
    .map((part) =>
      part
        .replaceAll('"', "")
        .replace(" ", "T")
        .replace(/([+-]\d{2})$/, "$1:00"),
    );
  return bounds.length === 2 &&
    bounds.every((bound) => Number.isFinite(Date.parse(bound)))
    ? bounds.map(date).join(" → ")
    : "Schedule unavailable";
}
export function Maintenance({
  state,
  send,
  lastError,
}: {
  state: State;
  send: SendCommand;
  lastError?: string;
}) {
  const [open, setOpen] = useState(false),
    [resourceId, setResourceId] = useState(""),
    [startAt, setStartAt] = useState(
      state.scenarios[0]?.clock || state.serverTime,
    ),
    [endAt, setEndAt] = useState(
      new Date(
        Date.parse(state.scenarios[0]?.clock || state.serverTime) +
          24 * 3600000,
      ).toISOString(),
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [release, setRelease] = useState<{
      hold: MaintenanceHold;
      version: number;
    } | null>(null);
  const resource = state.resources.find((item) => item.id === resourceId);
  const holds = state.maintenanceHolds || [];
  return (
    <section className="panel maintenance-panel">
      <div className="panel-heading">
        <h2>Maintenance & availability holds</h2>
        <button
          onClick={() => {
            setFailed(false);
            setOpen(true);
          }}
          disabled={!navigator.onLine}
        >
          Place resource hold
        </button>
      </div>
      <p className="fine">
        A hold excludes a resource from new eligible assignments during the
        interval. Existing trips require a separate recovery review.
      </p>
      {!holds.length ? (
        <div className="empty">No maintenance holds recorded.</div>
      ) : (
        holds.map((hold) => {
          const item = state.resources.find(
            (resource) => resource.id === hold.resource_id,
          );
          return (
            <article className="evidence-row" key={hold.id}>
              <div>
                <strong>
                  {item?.name || hold.resource_id} · {hold.reason}
                </strong>
                <p>{period(hold.period)}</p>
                <span className="tag">
                  {hold.resolved_at ? "Released" : "Active hold"}
                </span>
              </div>
              {!hold.resolved_at && (
                <button
                  onClick={() => {
                    if (item) {
                      setFailed(false);
                      setRelease({ hold, version: item.version });
                    }
                  }}
                  disabled={!item || !navigator.onLine}
                >
                  Review release
                </button>
              )}
            </article>
          );
        })
      )}
      {open && (
        <Modal
          title="Place an availability hold"
          description="Choose the resource, hold interval and reason. The server will apply this to future assignment checks."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!resource) return;
              setBusy(true);
              setFailed(false);
              const ok = await send(
                "maintenance",
                {
                  action: "hold",
                  resourceId,
                  startAt,
                  endAt,
                  reason: reason.trim(),
                },
                resource.version,
              );
              setBusy(false);
              if (ok) setOpen(false);
              else setFailed(true);
            }}
          >
            <label>
              Resource
              <select
                aria-label="Held resource"
                required
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              >
                <option value="">Choose resource</option>
                {state.resources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id} · {item.kind}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts (ISO timestamp with timezone)
              <input
                required
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </label>
            <label>
              Ends (ISO timestamp with timezone)
              <input
                required
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </label>
            <label>
              Hold reason
              <textarea
                required
                minLength={5}
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {failed && (
              <p className="error" role="alert">
                {lastError ||
                  "The hold was not recorded. Review the resource and interval."}
              </p>
            )}
            <button
              className="primary"
              disabled={
                busy ||
                !resource ||
                reason.trim().length < 5 ||
                !navigator.onLine
              }
            >
              {busy ? "Recording hold…" : "Place resource hold"}
            </button>
          </form>
        </Modal>
      )}
      {release && (
        <Modal
          title="Release this resource hold?"
          description={`${release.hold.resource_id} · ${release.hold.reason}`}
          onClose={() => setRelease(null)}
        >
          <p>{period(release.hold.period)}</p>
          <p>
            The hold will remain in history as released. Other reservation,
            equipment and duty checks still apply.
          </p>
          {failed && (
            <p className="error" role="alert">
              {lastError ||
                "Release was not recorded. Review current resource state."}
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !navigator.onLine ||
              state.resources.find(
                (item) => item.id === release.hold.resource_id,
              )?.version !== release.version
            }
            onClick={async () => {
              setBusy(true);
              setFailed(false);
              const ok = await send(
                "maintenance",
                {
                  action: "release",
                  resourceId: release.hold.resource_id,
                  holdId: release.hold.id,
                },
                release.version,
              );
              setBusy(false);
              if (ok) setRelease(null);
              else setFailed(true);
            }}
          >
            Release hold
          </button>
        </Modal>
      )}
    </section>
  );
}
