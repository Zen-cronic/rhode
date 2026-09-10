import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Modal } from "./ReviewDialog";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { Load } from "@roadstar/domain";
import { ApiError, request } from "./api";
import type { Command, Proposal, Resource, Session, State, Visit } from "./api";
import { MapPanel } from "./MapPanel";
import { Documents, downloadOriginal } from "./Documents";
import { EvidenceBilling } from "./EvidenceBilling";
import { Maintenance } from "./Maintenance";
import { Planning } from "./Planning";
import { GroupManifest } from "./GroupManifest";
import { Tracking } from "./Tracking";
const localDemo = import.meta.env.VITE_AUTH_MODE === "local-demo";
const firebaseConfigured = !!import.meta.env.VITE_FIREBASE_API_KEY;
function auth() {
  const app =
    getApps()[0] ||
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    });
  return getAuth(app);
}
const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
const date = (value: string) =>
  new Date(value).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
const label = (value: string) => value.replaceAll("_", " ");
function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
function Status({ value }: { value: string }) {
  return <span className={`tag status-${value}`}>{label(value)}</span>;
}
function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [carrier, setCarrier] = useState(localDemo ? "demo-carrier" : ""),
    [identity, setIdentity] = useState("demo-dispatcher"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      if (localDemo)
        onLogin({
          carrier,
          token: identity,
          uid: identity,
          label:
            identity === "demo-dispatcher"
              ? "Demo dispatcher"
              : identity.replace("demo-", ""),
        });
      else {
        const result = await signInWithEmailAndPassword(
          auth(),
          email,
          password,
        );
        onLogin({
          carrier,
          token: await result.user.getIdToken(),
          uid: result.user.uid,
          label: result.user.email || "Signed in",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login">
      <div className="login-story">
        <div className="brand">
          R<span>RoadStar</span>
        </div>
        <p className="eyebrow">CARRIER OPERATIONS</p>
        <h1>
          Keep the next load
          <br />
          moving.
        </h1>
        <p>
          One place to plan a dispatch, review a recovery and keep the evidence
          together.
        </p>
        <div className="login-note">
          Dispatcher approval stays at the center of every consequential change.
        </div>
        <div className="login-demo-links">
          <a href="/demo/roadstar-demo.mp4" target="_blank" rel="noreferrer">Watch demonstration ↗</a>
          <a href="/demo/roadstar-pitch.pdf" target="_blank" rel="noreferrer">View presentation ↗</a>
        </div>
      </div>
      <section className="login-form panel">
        <p className="eyebrow">OPERATIONS WORKSPACE</p>
        <h2>
          {localDemo ? "Open the synthetic rehearsal" : "Sign in to RoadStar"}
        </h2>
        <p>
          {localDemo
            ? "Explicit local demo access. Every operational record is a labeled scenario."
            : "Use your carrier account to access operational records."}
        </p>
        <form onSubmit={submit}>
          <label>
            Carrier ID
            <input
              required
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              autoComplete="organization"
            />
          </label>
          {localDemo ? (
            <label>
              Identity
              <select
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
              >
                <option value="demo-dispatcher">
                  Dispatcher · approvals and planning
                </option>
                <option value="demo-driver-1">Driver 1 · own trips</option>
                <option value="demo-driver-2">Driver 2 · own trips</option>
              </select>
            </label>
          ) : (
            <>
              <label>
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {!localDemo && !firebaseConfigured && (
            <p className="notice">
              Firebase sign-in is not configured for this deployment.
            </p>
          )}
          <button
            className="primary"
            disabled={pending || (!localDemo && !firebaseConfigured)}
          >
            {pending ? "Connecting…" : "Open operations →"}
          </button>
        </form>
        <p className="fine">
          Tracking starts only with an explicit driver work session.
        </p>
      </section>
    </main>
  );
}
export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [view, setView] = useState("Recovery"),
    [online, setOnline] = useState(navigator.onLine),
    [active, setActive] = useState(!document.hidden),
    [selected, setSelected] = useState<Load | null>(null),
    [approve, setApprove] = useState<Proposal | null>(null),
    [evidence, setEvidence] = useState<Visit | null>(null),
    [notice, setNotice] = useState(""),
    [commands, setCommands] = useState<Command[]>([]);
  const client = useQueryClient();
  const sessionEpoch = useRef(0);
  const clearSession = useCallback(() => {
    sessionEpoch.current += 1;
    setSession(null);
    client.clear();
    setCommands([]);
    setNotice("");
    setSelected(null);
    setApprove(null);
    setEvidence(null);
    setView("Recovery");
  }, [client]);
  const scope = session ? `${session.carrier}:${session.uid}` : "";
  useEffect(() => {
    const on = () => setOnline(navigator.onLine),
      visibility = () => setActive(!document.hidden);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!scope) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`roadstar:commands:${scope}`) || "[]",
      ) as Command[];
      setCommands(
        saved.map((c) =>
          c.status === "pending"
            ? {
                ...c,
                status: "failed",
                retryable: true,
                message: "Connection interrupted. Retry the original command.",
              }
            : c,
        ),
      );
    } catch {
      setCommands([]);
    }
  }, [scope]);
  const saveCommands = useCallback(
    (updater: (previous: Command[]) => Command[]) =>
      setCommands((previous) => {
        const next = updater(previous).slice(0, 30);
        localStorage.setItem(
          `roadstar:commands:${scope}`,
          JSON.stringify(next),
        );
        return next;
      }),
    [scope],
  );
  const snapshot = useQuery({
    queryKey: ["state", scope],
    queryFn: () => request<State>(session!, "state"),
    enabled: !!session && online,
  });
  const updates = useQuery({
    queryKey: ["updates", scope, snapshot.data?.cursor],
    queryFn: () =>
      request<{ cursor: string; changes: unknown[] }>(
        session!,
        `updates?cursor=${snapshot.data?.cursor ?? 0}`,
      ),
    enabled: !!session && !!snapshot.data && online && active,
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (
      updates.data &&
      snapshot.data &&
      BigInt(updates.data.cursor) > BigInt(snapshot.data.cursor)
    )
      void client.invalidateQueries({ queryKey: ["state", scope] });
  }, [updates.data, snapshot.data, client, scope]);
  useEffect(() => {
    if (!session || localDemo || !firebaseConfigured) return;
    let active = true;
    const expectedUid = session.uid;
    const unsubscribe = auth().onIdTokenChanged(async (user) => {
      if (!active) return;
      // Firebase broadcasts sign-out and account changes across tabs. A new
      // identity must select its own carrier; never inherit the prior actor.
      if (!user || user.uid !== expectedUid) {
        clearSession();
        return;
      }
      try {
        const token = await user.getIdToken();
        if (!active || auth().currentUser?.uid !== expectedUid) return;
        setSession((current) =>
          current?.uid === expectedUid ? { ...current, token } : current,
        );
      } catch {
        if (active) clearSession();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session?.uid, clearSession]);
  async function execute(command: Command) {
    if (!session) return;
    const commandEpoch = sessionEpoch.current;
    saveCommands((old) => [
      { ...command, status: "pending" },
      ...old.filter((c) => c.id !== command.id),
    ]);
    try {
      await request(session, command.path, command);
      if (commandEpoch !== sessionEpoch.current) return false;
      saveCommands((old) =>
        old.map((c) =>
          c.id === command.id
            ? {
                ...c,
                status: "synchronized",
                message: "Confirmed by server",
                retryable: false,
              }
            : c,
        ),
      );
      setNotice(
        `${label(command.path)} confirmed.${["approve", "dispatch"].includes(command.path) ? " Driver acceptance remains a separate action." : ""}`,
      );
      await client.invalidateQueries({ queryKey: ["state", scope] });
      return true;
    } catch (e) {
      if (commandEpoch !== sessionEpoch.current) return false;
      const error = e instanceof Error ? e.message : "Request failed";
      saveCommands((old) =>
        old.map((c) =>
          c.id === command.id
            ? {
                ...c,
                status: "failed",
                message: error,
                retryable: !(e instanceof ApiError) || e.retryable,
              }
            : c,
        ),
      );
      setNotice(error);
      await client.invalidateQueries({ queryKey: ["state", scope] });
      return false;
    }
  }
  const send = (path: string, body: Record<string, unknown>, version: number) =>
    execute({
      id: crypto.randomUUID(),
      path,
      body,
      version,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  if (!session) return <Login onLogin={setSession} />;
  const state = snapshot.data;
  const isDriver =
    state?.actor?.role === "driver" || session.token.startsWith("demo-driver");
  const logout = async () => {
    clearSession();
    if (!localDemo && firebaseConfigured) await signOut(auth());
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#main">
          R
          <span>
            RoadStar<small>Carrier operations</small>
          </span>
        </a>
        <div className="workspace-label">{session.carrier}</div>
        <nav aria-label="Main navigation">
          {(!state
            ? ["Activity"]
            : isDriver
              ? ["Trips", "Tracking", "Fleet", "Activity"]
              : [
                  "Recovery",
                  "Planning",
                  "Tracking",
                  "Fleet",
                  "Evidence & billing",
                  "Imports",
                  "Activity",
                ]
          ).map((item, i) => (
            <button
              key={item}
              onClick={() => setView(item)}
              aria-current={view === item ? "page" : undefined}
            >
              <span aria-hidden="true">
                {["↗", "▤", "⌖", "◉", "▧", "⇥", "≡"][i]}
              </span>
              {item}
              {item === "Recovery" &&
                !!state?.proposals.filter((p) => p.status === "pending")
                  .length && (
                  <b>
                    {
                      state.proposals.filter((p) => p.status === "pending")
                        .length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{isDriver ? "DR" : "DS"}</div>
          <strong>{session.label}</strong>
          <span>Carrier-scoped access</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main id="main" className="workspace">
        <header className="topbar">
          <div>
            <span className={`connection-dot ${online ? "" : "offline"}`} />
            {!online
              ? "Offline · actions unavailable"
              : snapshot.isError || updates.isError
                ? "Connection failed"
                : snapshot.isFetching
                  ? "Synchronizing…"
                  : "Synchronized"}
            <span className="topbar-separator">/</span>Eastern time
          </div>
          <div>
            <button
              className="quiet mobile-signout"
              onClick={() => void logout()}
            >
              Sign out
            </button>
            <button
              className="quiet"
              onClick={() => void snapshot.refetch()}
              disabled={!online || snapshot.isFetching}
            >
              ↻ Refresh
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">DISPATCH WORKSPACE</p>
              <h1>
                {isDriver && view === "Recovery"
                  ? "Today’s trips"
                  : view === "Recovery"
                    ? "A clearer next move."
                    : view}
              </h1>
              <p>
                {view === "Recovery"
                  ? "Rehearse a recovery. Compare the evidence. Approve with confidence."
                  : "Operational records, synchronized across your carrier."}
              </p>
            </div>
            {state?.scenarios[0] && (
              <div className="scenario-clock">
                <span className="tag">Synthetic rehearsal</span>
                <strong>{date(state.scenarios[0].clock)}</strong>
                <small>Scenario clock · independent of live time</small>
              </div>
            )}
          </div>
          {!online && (
            <div role="status" className="notice">
              You are offline. Displayed records may be stale. Review pending
              actions after reconnecting.
            </div>
          )}
          {notice && (
            <div role="status" className="notice dismissible">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {snapshot.isError && (
            <div role="alert" className="error panel">
              <h2>Operations could not be loaded</h2>
              <p>{snapshot.error.message}</p>
              <button
                onClick={() => void snapshot.refetch()}
                disabled={!online}
              >
                Try again
              </button>
            </div>
          )}
          {snapshot.isPending && (
            <div className="panel empty" role="status">
              Loading carrier operations…
            </div>
          )}
          {state && (
            <>
              <div className="summary">
                <Metric
                  label="Open loads"
                  value={state.loads.filter((l) => l.status === "open").length}
                  detail="Awaiting dispatch"
                />
                <Metric
                  label="Driver offers"
                  value={
                    state.assignments.filter((a) => a.status === "offered")
                      .length
                  }
                  detail="Awaiting acceptance"
                />
                <Metric
                  label="Recovery reviews"
                  value={
                    state.proposals.filter((p) => p.status === "pending").length
                  }
                  detail="Dispatcher approval needed"
                />
                <Metric
                  label="Open stop visits"
                  value={state.visits.filter((v) => !v.departure).length}
                  detail="Evidence accumulating"
                />
              </div>
              {view === "Recovery" && !isDriver && (
                <>
                  <DelayPanel state={state} send={send} disabled={!online} />
                  <div className="recovery-layout">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">RECOVERY WORKBENCH</p>
                          <h2>Compare before you commit</h2>
                        </div>
                        <span className="tag">Approval required</span>
                      </div>
                      <p className="fine">
                        Current assignments stay in place while alternatives are
                        prepared. A planning screen is not proof of a truck-safe
                        road route.
                      </p>
                      {!state.proposals.length ? (
                        <Empty>
                          No recovery proposals yet. Select a load below to
                          rehearse another assignment.
                        </Empty>
                      ) : (
                        state.proposals
                          .slice()
                          .reverse()
                          .map((p) => (
                            <Recovery
                              key={p.id}
                              proposal={p}
                              state={state}
                              onApprove={() => setApprove(p)}
                              disabled={!online}
                            />
                          ))
                      )}
                      <div className="section-footer">
                        {state.loads
                          .filter((l) => l.status !== "completed")
                          .slice(0, 4)
                          .map((l) => (
                            <button
                              key={l.id}
                              onClick={() => setSelected(l)}
                              disabled={!online}
                            >
                              Rehearse {l.id} →
                            </button>
                          ))}
                      </div>
                    </section>
                    <MapPanel state={state} session={session} />
                  </div>
                  <LoadBoard
                    state={state}
                    onSelect={setSelected}
                    disabled={!online}
                  />
                </>
              )}
              {view === "Planning" && (
                <>
                  {!isDriver && <Planning state={state} send={send} online={online} lastError={commands.find(command=>command.status==='failed')?.message}/>}
                  <LoadBoard state={state} onSelect={setSelected} disabled={!online}/>
                </>
              )}
              {view === "Imports" && <Imports session={session} />}
              {view === "Tracking" && <Tracking state={state} session={session} online={online}/>}
              {view === "Fleet" && (
                <>
                  <Fleet resources={state.resources} />
                  {!isDriver && (
                    <Maintenance
                      state={state}
                      send={send}
                      lastError={
                        commands.find((command) => command.status === "failed")
                          ?.message
                      }
                    />
                  )}
                </>
              )}
              {view === "Evidence & billing" && (
                <>
                  <Documents
                    state={state}
                    session={session}
                    send={send}
                    lastError={
                      commands.find((command) => command.status === "failed")
                        ?.message
                    }
                  />
                  <EvidenceBilling
                    state={state}
                    send={send}
                    lastError={
                      commands.find((command) => command.status === "failed")
                        ?.message
                    }
                    onVisit={setEvidence}
                  />
                </>
              )}
              {(view === "Trips" || (isDriver && view === "Recovery")) && (
                <div className="trip-workspace">
                  <section className="panel">
                    <h2>Your manifest</h2>
                    {state.tripGroups?.map(group=><GroupManifest key={group.id} group={group} state={state} session={session} send={send} online={online} lastError={commands.find(command=>command.status==='failed')?.message}/>)}
                    {!state.assignments.length ? (
                      <Empty>No trips assigned.</Empty>
                    ) : (
                      state.assignments
                        .filter((a) => a.status !== "superseded" && !state.tripGroups?.some(group=>group.body.stops.some(stop=>stop.assignmentId===a.id)))
                        .map((a) => {
                          const load = state.loads.find(
                            (l) => l.id === a.loadId,
                          );
                          return (
                            <article className="trip-card" key={a.id}>
                              <div className="panel-heading">
                                <h3>
                                  {load?.id} · {load?.customer}
                                </h3>
                                <Status value={a.status} />
                              </div>
                              <p>
                                {load?.pickup.name} → {load?.delivery.name}
                              </p>
                              <p>
                                {time(a.startAt)}–{time(a.endAt)} ET ·{" "}
                                {load?.equipment} ·{" "}
                                {load?.weightLb?.toLocaleString() ??
                                  "Unverified weight"}{" "}
                                lb
                              </p>
                              <p>
                                Truck {a.truckId} · Trailer {a.trailerId}
                              </p>
                              {a.status === "offered" && (
                                <div className="actions">
                                  <button
                                    className="primary"
                                    disabled={!online}
                                    onClick={() =>
                                      void send(
                                        "respond",
                                        {
                                          assignmentId: a.id,
                                          action: "accept",
                                        },
                                        a.version,
                                      )
                                    }
                                  >
                                    Accept trip
                                  </button>
                                  <button
                                    disabled={!online}
                                    onClick={() =>
                                      void send(
                                        "respond",
                                        {
                                          assignmentId: a.id,
                                          action: "reject",
                                        },
                                        a.version,
                                      )
                                    }
                                  >
                                    Reject trip
                                  </button>
                                </div>
                              )}
                              <p className="fine">
                                Delivery of an offer, driver acceptance and trip
                                execution are separate events.
                              </p>
                              {state.facilityNotes
                                ?.filter((note) => note.load_id === a.loadId)
                                .map((note) => {
                                  const source = state.documents?.find(
                                    (doc) => doc.id === note.document_id,
                                  );
                                  return (
                                    <div
                                      className="facility-note"
                                      key={note.id}
                                    >
                                      <strong>
                                        Reviewed instructions · {note.stop_id}
                                      </strong>
                                      <p>{note.instructions}</p>
                                      <p className="fine">
                                        Source revision {note.document_version}
                                      </p>
                                      {source && (
                                        <button
                                          onClick={() =>
                                            void downloadOriginal(
                                              session,
                                              source,
                                            ).catch((error) =>
                                              setNotice(error.message),
                                            )
                                          }
                                        >
                                          Download instruction source
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                            </article>
                          );
                        })
                    )}
                  </section>
                  <MapPanel state={state} session={session} />
                </div>
              )}
              {view === "Activity" && (
                <section className="panel">
                  <h2>Command activity</h2>
                  <p className="fine">
                    Pending and failed commands are saved on this browser. A
                    retry preserves the original request and version.
                  </p>
                  {!commands.length ? (
                    <Empty>No commands from this browser identity yet.</Empty>
                  ) : (
                    commands.map((c) => (
                      <div className="command-row" key={c.id}>
                        <div>
                          <strong>{label(c.path)}</strong>
                          <p>{c.message || "Awaiting server confirmation"}</p>
                          <small>
                            {date(c.createdAt)} · {c.id}
                          </small>
                        </div>
                        <Status value={c.status} />
                        {c.status === "failed" && c.retryable && (
                          <button
                            disabled={!online}
                            onClick={() => void execute(c)}
                          >
                            Retry original
                          </button>
                        )}
                        {c.status === "failed" && !c.retryable && (
                          <span className="fine">
                            Review current records before a new action.
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </section>
              )}
            </>
          )}
          {selected && state && (
            <PlanDialog
              load={selected}
              state={state}
              error={commands.find((c) => c.status === "failed")?.message}
              close={() => setSelected(null)}
              send={send}
            />
          )}{" "}
          {approve && state && (
            <Modal
              title="Approve the recovery?"
              description="The server will recheck the load version, reservations and supporting evidence before replacing the assignment."
              onClose={() => setApprove(null)}
            >
              <p>
                <strong>{approve.load_id}</strong> will be offered to{" "}
                <strong>
                  {state.resources.find((r) => r.id === approve.body.driverId)
                    ?.name || approve.body.driverId}
                </strong>
                .
              </p>
              <p>
                The previous assignment will be superseded atomically. The new
                driver must accept the offer.
              </p>
              <p className="notice">{approve.body.assumptions.join(" · ")}</p>
              {commands.find(
                (c) => c.status === "failed" && c.path === "approve",
              ) && (
                <p className="error" role="alert">
                  {
                    commands.find(
                      (c) => c.status === "failed" && c.path === "approve",
                    )?.message
                  }
                </p>
              )}
              <button
                className="primary"
                disabled={
                  !online ||
                  commands.some((c) => c.status === "pending") ||
                  state.loads.find((l) => l.id === approve.load_id)?.version !==
                    approve.expected_version
                }
                onClick={async () => {
                  if (
                    await send(
                      "approve",
                      { proposalId: approve.id },
                      approve.revision,
                    )
                  )
                    setApprove(null);
                }}
              >
                Approve revision {approve.revision}
              </button>
            </Modal>
          )}
          {evidence && state && (
            <Modal
              title="Same-stop evidence"
              description="Observed GPS samples need review against the stop boundary and contract."
              onClose={() => setEvidence(null)}
            >
              <dl>
                <dt>Load / stop</dt>
                <dd>
                  {evidence.load_id} / {evidence.stop_id}
                </dd>
                <dt>Arrival sample</dt>
                <dd>
                  {date(evidence.arrival)}
                  <code>{evidence.arrival_event}</code>
                </dd>
                <dt>Departure sample</dt>
                <dd>
                  {evidence.departure
                    ? date(evidence.departure)
                    : "Missing · visit is open"}
                  <code>{evidence.departure_event}</code>
                </dd>
              </dl>
              {state.loads.find((load) => load.id === evidence.load_id)
                ?.provenance === "synthetic" ? (
                <button
                  className="primary"
                  disabled={
                    !online ||
                    !evidence.departure ||
                    commands.some((c) => c.status === "pending")
                  }
                  onClick={async () => {
                    const version = Math.max(
                      0,
                      ...state.invoices
                        .filter((i) => i.visit_id === evidence.id)
                        .map((i) => i.revision),
                    );
                    if (
                      await send(
                        "detention",
                        { visitId: evidence.id, contractId: "demo-ftl" },
                        version,
                      )
                    )
                      setEvidence(null);
                  }}
                >
                  Prepare draft with demo contract
                </button>
              ) : (
                <p className="notice">
                  Select an approved carrier contract through the API before
                  preparing a draft. No default commercial contract is assumed.
                </p>
              )}
              <p className="fine">
                Synthetic terms: CAD 100/hour after 120 minutes. Creating a
                draft does not approve an invoice.
              </p>
            </Modal>
          )}
        </div>
        <footer>
          RoadStar / Carrier operations
          <span>
            Operational metrics only · modeled savings are not reported
          </span>
        </footer>
      </main>
    </div>
  );
}
function Metric({
  label: caption,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{caption}</span>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{detail}</small>
    </div>
  );
}
function LoadBoard({
  state,
  onSelect,
  disabled,
}: {
  state: State;
  onSelect: (load: Load) => void;
  disabled: boolean;
}) {
  return (
    <section className="panel load-board">
      <div className="panel-heading">
        <h2>Load planning board</h2>
        <span className="tag">{state.loads.length} loads</span>
      </div>
      {!state.loads.length ? (
        <Empty>
          No loads are available. Import or seed authorized scenario records
          through the API.
        </Empty>
      ) : (
        <div className="load-grid">
          {state.loads.map((l) => (
            <article className="load-card" key={l.id}>
              <div className="panel-heading">
                <strong>{l.id}</strong>
                <Status value={l.status} />
              </div>
              <h3>{l.customer}</h3>
              <div className="stop-line">
                <span>01</span>
                <div>
                  {l.pickup.name}
                  <small>{time(l.startAt)} ET · pickup</small>
                </div>
              </div>
              <div className="stop-line">
                <span>02</span>
                <div>
                  {l.delivery.name}
                  <small>{time(l.endAt)} ET · delivery window end</small>
                </div>
              </div>
              <div className="load-meta">
                {l.mode} · {l.equipment} ·{" "}
                {l.weightLb?.toLocaleString() ?? "Unverified"} lb
              </div>
              <div className="panel-heading">
                <span className="fine">
                  {label(l.provenance)} · v{l.version}
                </span>
                {l.status !== "completed" && (
                  <button disabled={disabled} onClick={() => onSelect(l)}>
                    {l.status === "open"
                      ? "Plan assignment"
                      : "Rehearse recovery"}{" "}
                    →
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function Recovery({
  proposal: p,
  state,
  onApprove,
  disabled,
}: {
  proposal: Proposal;
  state: State;
  onApprove: () => void;
  disabled: boolean;
}) {
  const load = state.loads.find((l) => l.id === p.load_id),
    old = state.assignments.find((a) => a.id === p.body.currentAssignmentId),
    name = (id?: string) =>
      state.resources.find((r) => r.id === id)?.name || id || "Unassigned";
  const stale = p.status === "pending" && load?.version !== p.expected_version;
  return (
    <article className="recovery-card">
      <div className="panel-heading">
        <div>
          <strong>{p.load_id}</strong>
          <p>{p.body.reason}</p>
        </div>
        <Status value={stale ? "stale" : p.status} />
      </div>
      <div className="timeline">
        <div className="axis">
          <span>Assignment</span>
          <span>{load ? time(load.startAt) : "—"}</span>
          <span>{load ? time(load.endAt) : "—"} ET</span>
        </div>
        <div className="timeline-row">
          <span>{p.status === "approved" ? "Before" : "Current"}</span>
          <div className="timeline-bar current">
            {name(old?.driverId)}
            <small>{old ? label(old.status) : "No reservation"}</small>
          </div>
        </div>
        <div className="timeline-row">
          <span>{p.status === "approved" ? "Approved" : "Proposed"}</span>
          <div className="timeline-bar proposed">
            {name(p.body.driverId)}
            <small>
              {p.status === "approved"
                ? "Offer issued · see current trip status below"
                : "Driver offer follows approval"}
            </small>
          </div>
        </div>
      </div>
      <div className="recovery-detail">
        <span>{p.body.proof.deadheadKm} km estimated deadhead</span>
        <span>
          Load v{p.expected_version} · proposal r{p.revision}
        </span>
      </div>
      <p className="fine">
        {p.body.assumptions.join(" · ")}. Comparison uses the same appointment
        window. Recorded dock delays and affected commitments appear above;
        travel times remain modeled.
      </p>
      {p.body.proof.reasons.length > 0 && (
        <ul>
          {p.body.proof.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {stale && (
        <p className="notice">
          The load changed after rehearsal. Prepare a new proposal using current
          evidence.
        </p>
      )}
      {p.status === "pending" && (
        <button
          className="primary"
          disabled={disabled || stale}
          onClick={onApprove}
        >
          Review & approve →
        </button>
      )}
    </article>
  );
}
function PlanDialog({
  load,
  state,
  close,
  send,
  error,
}: {
  load: Load;
  state: State;
  error?: string;
  close: () => void;
  send: (
    path: string,
    body: Record<string, unknown>,
    version: number,
  ) => Promise<boolean | undefined>;
}) {
  const [driverId, setDriver] = useState(""),
    [truckId, setTruck] = useState(""),
    [trailerId, setTrailer] = useState(""),
    [reason, setReason] = useState(
      load.status === "open"
        ? "Initial dispatch review."
        : "Dock departure delayed; review next-load coverage.",
    ),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult("");
    const ok = await send(
      "propose",
      { loadId: load.id, driverId, truckId, trailerId, reason },
      load.version,
    );
    setBusy(false);
    if (ok) close();
    else
      setResult(
        "Proposal could not be prepared. Review the server message and current evidence; no assignment was changed.",
      );
  }
  return (
    <Modal
      title={`Rehearse ${load.id}`}
      description="Choose an alternative. A successful screen creates a proposal for separate dispatcher approval."
      onClose={close}
    >
      <form onSubmit={submit}>
        {(
          [
            ["driver", "Driver", driverId, setDriver],
            ["truck", "Truck", truckId, setTruck],
            ["trailer", "Trailer", trailerId, setTrailer],
          ] as const
        ).map(([kind, caption, value, set]) => (
          <label key={kind}>
            {caption}
            <select
              aria-label={caption}
              required
              value={value}
              onChange={(e) => set(e.target.value)}
            >
              <option value="">Choose {kind}</option>
              {state.resources
                .filter((r) => r.kind === kind)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.id}
                    {r.equipment ? ` · ${r.equipment}` : ""}
                    {r.duty ? ` · ${label(r.duty)}` : ""}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <label>
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>
        <p className="fine">
          Checks include equipment, payload, declared duty budgets, maintenance
          holds, resource reservations and server-verified truck-route evidence.
          Route quality depends on supplied dimensions and OSM restriction coverage.
        </p>
        {result && (
          <p className="error" role="alert">
            {error || result}
          </p>
        )}
        <button className="primary" disabled={busy || !navigator.onLine}>
          {busy ? "Checking constraints…" : "Prepare recovery proposal"}
        </button>
      </form>
    </Modal>
  );
}
const column = createColumnHelper<Resource>();
function Fleet({ resources }: { resources: Resource[] }) {
  const columns = useMemo(
    () => [
      column.accessor((r) => r.name || r.id, {
        id: "resource",
        header: "Resource",
      }),
      column.accessor("kind", { header: "Type" }),
      column.accessor((r) => (r.duty ? label(r.duty) : r.equipment || "—"), {
        id: "state",
        header: "Duty / equipment",
      }),
      column.accessor(
        (r) =>
          r.position
            ? `${r.position.lat.toFixed(4)}, ${r.position.lng.toFixed(4)}`
            : "—",
        { id: "position", header: "Recorded position" },
      ),
      column.accessor(
        (r) =>
          r.budget ? `${r.budget.drivingMinutes} min driving` : "Not available",
        { id: "budget", header: "Declared budget" },
      ),
      column.accessor("provenance", {
        header: "Source",
        cell: (c) => label(c.getValue()),
      }),
      column.accessor("version", { header: "Version" }),
    ],
    [],
  );
  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Fleet & availability</h2>
        <span className="tag">{resources.length} resources</span>
      </div>
      <p className="fine">
        Duty budgets are declared evidence, not certified ELD records. A
        record’s presence does not establish dispatch availability.
      </p>
      {!resources.length ? (
        <Empty>No fleet resources are available.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function DelayPanel({
  state,
  send,
  disabled,
}: {
  state: State;
  send: (
    path: string,
    body: Record<string, unknown>,
    version: number,
  ) => Promise<boolean | undefined>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [assignmentId, setAssignmentId] = useState(""),
    [expectedEnd, setExpectedEnd] = useState(""),
    [reason, setReason] = useState("Dock departure delayed"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = state.assignments.find((a) => a.id === assignmentId);
  const observedAt = state.scenarios[0]?.clock || state.serverTime;
  return (
    <section className="panel delay-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DISRUPTION MONITOR</p>
          <h2>Protect the next appointment</h2>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={
            disabled || !state.assignments.some((a) => a.status === "accepted")
          }
        >
          Record dock delay
        </button>
      </div>
      {!state.disruptions?.length ? (
        <p className="fine">
          No dock delays recorded. Driver acceptance is required before
          reporting a delay on a trip.
        </p>
      ) : (
        state.disruptions.map((d) => {
          const trip = state.assignments.find((a) => a.id === d.assignment_id);
          const affected = state.assignments.filter(
            (a) =>
              trip &&
              a.id !== trip.id &&
              ["offered", "accepted"].includes(a.status) &&
              (a.driverId === trip.driverId ||
                a.truckId === trip.truckId ||
                a.trailerId === trip.trailerId) &&
              Date.parse(a.startAt) < Date.parse(d.expected_end) &&
              Date.parse(a.endAt) > Date.parse(trip.endAt),
          );
          return (
            <div className="delay-event" key={d.id}>
              <div>
                <strong>
                  {trip?.loadId || d.assignment_id} · {d.reason}
                </strong>
                <p>
                  Planned end {trip ? time(trip.endAt) : "—"} → expected{" "}
                  {time(d.expected_end)} ET
                </p>
              </div>
              <span className="tag">
                {affected.length
                  ? `${affected.length} next assignment${affected.length === 1 ? "" : "s"} at risk`
                  : "No overlapping active assignment"}
              </span>
              <div
                className="delay-track"
                aria-label={`Delay from ${trip ? time(trip.endAt) : "planned end"} to ${time(d.expected_end)}`}
              >
                <span
                  style={{
                    flex: trip
                      ? Math.max(
                          1,
                          Date.parse(trip.endAt) - Date.parse(trip.startAt),
                        )
                      : 1,
                  }}
                >
                  Planned
                </span>
                <span
                  style={{
                    flex: trip
                      ? Math.max(
                          1,
                          Date.parse(d.expected_end) - Date.parse(trip.endAt),
                        )
                      : 1,
                  }}
                >
                  Dock delay +
                  {trip
                    ? Math.round(
                        (Date.parse(d.expected_end) - Date.parse(trip.endAt)) /
                          60000,
                      )
                    : "?"}{" "}
                  min
                </span>
              </div>
              {affected.map((a) => (
                <p key={a.id} className="fine">
                  {a.loadId} begins {time(a.startAt)} ET. Rehearse with a
                  different available driver, truck and trailer.
                </p>
              ))}
            </div>
          );
        })
      )}
      {open && (
        <Modal
          title="Record a dock delay"
          description="Retain the observation and identify overlapping downstream resource commitments. This does not approve a recovery."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selected) return;
              setBusy(true);
              setError("");
              const ok = await send(
                "delay",
                { assignmentId, expectedEnd, observedAt, reason },
                selected.version,
              );
              setBusy(false);
              if (ok) setOpen(false);
              else
                setError(
                  "Delay was not recorded. Review command activity for the server reason and refresh the assignment.",
                );
            }}
          >
            <label>
              Accepted trip
              <select
                required
                value={assignmentId}
                onChange={(e) => {
                  setAssignmentId(e.target.value);
                  const a = state.assignments.find(
                    (x) => x.id === e.target.value,
                  );
                  setExpectedEnd(
                    a
                      ? new Date(Date.parse(a.endAt) + 90 * 60000).toISOString()
                      : "",
                  );
                }}
              >
                <option value="">Choose a trip</option>
                {state.assignments
                  .filter((a) => a.status === "accepted")
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.loadId} · planned end {time(a.endAt)} ET
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Expected end (ISO time with timezone)
              <input
                required
                value={expectedEnd}
                onChange={(e) => setExpectedEnd(e.target.value)}
                placeholder="2026-09-13T17:30:00Z"
              />
            </label>
            <label>
              Observation
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="fine">
              Observation clock: {date(observedAt)} ·{" "}
              {state.scenarios.length ? "synthetic scenario" : "server time"}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Recording…" : "Record delay & inspect impact"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
type SourceImport = {
  id: string;
  filename: string;
  sheet: string;
  rows: number;
  duplicates: number;
  created_at: string;
  sha256: string;
};
type SourceRow = {
  row_number: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  issues: unknown[];
  duplicate_of: number | null;
};
function Imports({ session }: { session: Session }) {
  const [selected, setSelected] = useState<SourceImport | null>(null),
    [offset, setOffset] = useState(0);
  const imports = useQuery({
    queryKey: ["imports", session.carrier],
    queryFn: () => request<SourceImport[]>(session, "imports"),
  });
  const rows = useQuery({
    queryKey: [
      "source-rows",
      session.carrier,
      selected?.id,
      selected?.sheet,
      offset,
    ],
    queryFn: () =>
      request<SourceRow[]>(
        session,
        `source-rows?importId=${encodeURIComponent(selected!.id)}&sheet=${encodeURIComponent(selected!.sheet)}&offset=${offset}`,
      ),
    enabled: !!selected,
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Import reconciliation</h2>
        <span className="tag">Original rows preserved</span>
      </div>
      <p className="fine">
        Source rows remain historical records. Missing fields and duplicates do
        not become live operational truth.
      </p>
      {imports.isPending ? (
        <Empty>Loading imported workbooks…</Empty>
      ) : imports.isError ? (
        <p role="alert" className="error">
          {imports.error.message}
        </p>
      ) : !imports.data.length ? (
        <Empty>
          No workbooks imported for this carrier. Customer data is kept separate
          from the synthetic demonstration.
        </Empty>
      ) : (
        imports.data.map((i) => (
          <div key={`${i.id}:${i.sheet}`} className="evidence-row">
            <div>
              <strong>
                {i.filename} / {i.sheet}
              </strong>
              <p>
                {i.rows} rows · {i.duplicates} duplicates · {date(i.created_at)}
              </p>
            </div>
            <button
              onClick={() => {
                setSelected(i);
                setOffset(0);
              }}
            >
              Inspect source rows
            </button>
          </div>
        ))
      )}
      {selected && (
        <Modal
          title={selected.sheet}
          description={`${selected.filename} · source lineage retained with workbook SHA-256`}
          onClose={() => setSelected(null)}
        >
          <code>{selected.sha256}</code>
          {rows.isPending ? (
            <Empty>Loading rows…</Empty>
          ) : rows.isError ? (
            <p className="error" role="alert">
              {rows.error.message}
            </p>
          ) : !rows.data.length ? (
            <Empty>No more rows.</Empty>
          ) : (
            rows.data.map((r) => (
              <details key={r.row_number} className="source-row">
                <summary>
                  Row {r.row_number} · {r.duplicate_of ? "duplicate" : "source"}{" "}
                  · {r.issues?.length || 0} issues
                </summary>
                <pre>
                  {JSON.stringify(
                    {
                      raw: r.raw,
                      normalized: r.normalized,
                      issues: r.issues,
                      duplicateOf: r.duplicate_of,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
          )}
          <div className="actions">
            <button
              disabled={!offset}
              onClick={() => setOffset((n) => Math.max(0, n - 100))}
            >
              Previous 100
            </button>
            <button
              disabled={!rows.data || rows.data.length < 100}
              onClick={() => setOffset((n) => n + 100)}
            >
              Next 100
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
