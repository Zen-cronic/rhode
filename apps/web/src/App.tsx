import {ClosureReview} from './ClosureReview';
import {HosReview} from './HosReview';
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
const label = (value: string) => value === "review-hos" ? "Duty history review" : value.replaceAll("_", " ");
function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 36 40" fill="none" aria-hidden="true"><path d="M7 35V8h10c8 0 11 4 11 9 0 6-5 9-12 9H7" stroke="currentColor" strokeWidth="5"/><path d="m17 26 12 10M16 9v14" stroke="#E65C32" strokeWidth="5"/><path d="M16 3v3M16 30v7" stroke="#E65C32" strokeWidth="2"/></svg>;
}
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = { Recovery: "M5 19V9a4 4 0 0 1 4-4h10m-5-4 5 4-5 4M5 15c0-4 4-6 9-6h5", Planning: "M4 4h16v16H4zM4 10h16M10 10v10", Tracking: "M12 3v3m0 12v3M3 12h3m12 0h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10", Fleet: "M3 6h11v11H3zM14 10h4l3 4v3h-7M5 17v3m13-3v3", "Evidence & billing": "M6 3h9l4 4v14H6zM10 11h5m-5 4h5M14 3v5h5", Imports: "M4 15v6h16v-6M12 3v12m-5-5 5 5 5-5", Activity: "M3 12h4l3-7 4 14 3-7h4", Trips: "M5 5h5c5 0 0 14 5 14h4M3 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0m14 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.Activity}/></svg>;
}
function RouteRail({ load }: { load?: Load }) {
  return <div className="route-rail"><div className="route-station"><i/><span>ORIGIN<strong>{load?.pickup.name || "Select an active load"}</strong></span></div><div className="route-link" aria-hidden="true"><span/></div><div className="route-station"><i/><span>DESTINATION<strong>{load?.delivery.name || "Rehearse the next assignment"}</strong></span></div></div>;
}
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
          <BrandMark/><span>RoadStar</span>
        </div>
        <p className="eyebrow">CARRIER OPERATIONS</p>
        <h1>
          Every turn.<br /><em>Accounted for.</em>
        </h1>
        <p>
          From the first assignment to the last stop. A clear path through the unexpected.
        </p>
        <img className="login-sculpture" src="/brand/road-sculpture.png" alt="Sculptural orange road branching through a graphite junction" />
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
  const navigationItems = !state ? ["Activity"] : isDriver
    ? ["Trips", "Tracking", "Fleet", "Activity"]
    : ["Recovery", "Planning", "Tracking", "Fleet", "Evidence & billing", "Imports", "Activity"];
  const selectedNavigation = isDriver && view === "Recovery" ? "Trips" : view;
  const pendingProposals = state?.proposals.filter(proposal => proposal.status === "pending").slice().reverse() ?? [];
  const featuredProposals = pendingProposals.length ? pendingProposals : state?.proposals.slice(-1) ?? [];
  const historicalProposals = state?.proposals.filter(proposal => !featuredProposals.some(featured => featured.id === proposal.id)).slice().reverse() ?? [];
  const logout = async () => {
    clearSession();
    if (!localDemo && firebaseConfigured) await signOut(auth());
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#main">
          <BrandMark/>
          <span>
            RoadStar<small>TRANSPORT / CONTROL</small>
          </span>
        </a>
        <label className="mobile-view-picker">
          <span className="visually-hidden">Workspace view</span>
          <select aria-label="Workspace view" value={navigationItems.includes(selectedNavigation) ? selectedNavigation : navigationItems[0]} onChange={event => { setView(event.target.value); window.scrollTo({ top: 0, behavior: "instant" }); }}>
            {navigationItems.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="workspace-label">{session.carrier}</div>
        <nav aria-label="Main navigation">
          {navigationItems.map((item) => (
            <button
              key={item}
              onClick={() => { setView(item); window.scrollTo({ top: 0, behavior: "instant" }); }}
              aria-current={view === item || (isDriver && view === "Recovery" && item === "Trips") ? "page" : undefined}
            >
              <NavIcon name={item}/>
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
        <div className={`content view-${view.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{isDriver ? "DRIVER WORKSPACE" : "OPERATIONS"} <span className="eyebrow-slash">/</span> {isDriver && view === "Recovery" ? "TODAY’S MANIFEST" : view === "Recovery" ? "RECOVERY CONTROL" : view.toUpperCase()}</p>
              <h1>
                {isDriver && view === "Recovery"
                  ? "Today’s trips"
                  : view === "Recovery"
                    ? "Recovery control"
                    : view}
              </h1>
              <p>
                {isDriver && view === "Recovery"
                  ? "Your assignments. Your next stop. Your working day."
                  : view === "Recovery"
                  ? "Review alternatives before changing a commitment."
                  : ({ Planning: "Shape the route. Pair your fleet. Review every commitment.", Tracking: "A clear view of the journey, grounded in recorded evidence.", Fleet: "People, equipment and readiness, in one view.", "Evidence & billing": "Every stop has a record. Every charge needs its proof.", Imports: "Bring the source records into your operation.", Activity: "A traceable history of what was requested and confirmed.", Trips: "Your assignments. Your next stop. Your working day." }[view] || "Your carrier operations, connected.")}
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
              <div className={`summary ${isDriver ? "driver-summary" : ""}`}>
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
                  <ClosureReview state={state} session={session} send={send} online={online}/>
                  <div className="recovery-layout">
                    <section className="panel recovery-stage decision-workbench">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">RECOVERY WORKBENCH</p>
                          <h2>Compare assignments</h2>
                        </div>
                        {!state.proposals.length && <span className="tag">No proposals</span>}
                      </div>

                      {!state.proposals.length ? (
                        <div className="recovery-ready"><RouteRail load={state.loads.find(l => l.status !== "completed")}/><div className="ready-message"><span className="ready-symbol" aria-hidden="true">↗</span><div><h3>Ready to rehearse</h3><p>No recovery proposals yet. Select a load to compare an alternative assignment.</p></div></div></div>
                      ) : (
                        featuredProposals.map((p) => (
                            <Recovery
                              key={p.id}
                              proposal={p}
                              state={state}
                              onApprove={() => setApprove(p)}
                              disabled={!online}
                            />
                          ))
                      )}
                      {!!historicalProposals.length && <details className="recovery-history"><summary>Earlier reviews · {historicalProposals.length}</summary>{historicalProposals.map(proposal => <Recovery key={proposal.id} proposal={proposal} state={state} onApprove={() => setApprove(proposal)} disabled={!online}/>)}</details>}
                      <details className="recovery-guidance"><summary>Approval & route checks</summary><p>Assignments change only after approval. Route evidence is checked separately.</p></details>
                      <form className="section-footer rehearsal-selector" onSubmit={event => {
                        event.preventDefault();
                        const loadId = new FormData(event.currentTarget).get("loadId");
                        const load = state.loads.find(item => item.id === loadId);
                        if (load) setSelected(load);
                      }}>
                        <label htmlFor="rehearsal-load">Rehearse a load</label>
                        <div><select id="rehearsal-load" name="loadId" defaultValue="" required disabled={!online}>
                          <option value="" disabled>Choose load</option>
                          {state.loads.filter(load => load.status !== "completed").map(load => <option key={load.id} value={load.id}>{load.id} · {load.customer}</option>)}
                        </select><button disabled={!online}>Open rehearsal →</button></div>
                      </form>
                    </section>
                    <MapPanel state={state} session={session} compact focusLoadId={featuredProposals[0]?.load_id} />
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
                  <HosReview state={state} session={session} send={send} online={online}/>
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
              description={`${approve.load_id} · revision ${approve.revision}`}
              onClose={() => setApprove(null)}
            >
              <ApprovalChange proposal={approve} state={state}/>
              <div className="approval-acceptance"><strong>Driver acceptance is separate</strong><p>{approve.body.currentAssignmentId ? "Approval replaces the current assignment and sends a new offer." : "Approval sends a new assignment offer."} The proposed driver must accept it.</p></div>
              <details className="approval-technical"><summary>Checks & assumptions</summary><p>The server rechecks the load version, reservations and supporting evidence before applying this revision.</p><ul>{approve.body.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul></details>
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
      <span className="metric-caption">{caption}</span>
      <span className="metric-mobile-caption">{{ "Open loads": "Open", "Driver offers": "Offers", "Recovery reviews": "Reviews", "Open stop visits": "Visits" }[caption] || caption}</span>
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
  proposal: p, state, onApprove, disabled,
}: {
  proposal: Proposal; state: State; onApprove: () => void; disabled: boolean;
}) {
  const load = state.loads.find(load => load.id === p.load_id);
  const old = state.assignments.find(assignment => assignment.id === p.body.currentAssignmentId);
  const name = (id?: string) => state.resources.find(resource => resource.id === id)?.name || id || "Unassigned";
  const stale = p.status === "pending" && load?.version !== p.expected_version;
  const resulting = p.status === "approved" ? state.assignments.find(assignment => assignment.loadId === p.load_id && assignment.driverId === p.body.driverId && !["superseded", "rejected"].includes(assignment.status)) : undefined;
  const assignmentStart = resulting?.startAt || old?.startAt;
  const startCaption = assignmentStart ? `Assignment starts ${time(assignmentStart)} ET` : load ? `Planned load start ${time(load.startAt)} ET` : "Start time unavailable";
  return (
    <article className="recovery-card decision-card">
      <div className="decision-heading">
        <div><h2>{p.load_id}</h2><p>{startCaption}</p></div>
        <Status value={stale ? "stale" : p.status}/>
      </div>
      <div className="driver-comparison" aria-label="Assignment comparison">
        <div className="driver-choice current-choice"><span>{p.status === "approved" ? "Before" : "Current driver"}</span><strong>{name(old?.driverId)}</strong><small>{old ? `${old.truckId} · ${old.trailerId}` : "No current assignment"}</small></div>
        <span className="decision-arrow" aria-hidden="true">→</span>
        <div className="driver-choice proposed-choice"><span>{p.status === "approved" ? "Approved driver" : "Proposed driver"}</span><strong>{name(p.body.driverId)}</strong><small>{p.body.truckId} · {p.body.trailerId}</small></div>
      </div>
      <div className="decision-proof-summary" aria-label="Proposal routing evidence">
        <strong>{p.body.proof.routingEvidence === "valhalla-truck" ? "Truck-route timing" : "Planning constraints"} {p.body.proof.eligible ? "screen passed" : "need review"}</strong>
        <span>{p.body.proof.deadheadKm} km estimated deadhead · {p.body.proof.routingEvidence === "valhalla-truck" ? "Valhalla modeled travel times" : "Straight-line planning estimate"}</span>
      </div>
      {p.body.comparison&&<div className="decision-proof-summary" aria-label="Modeled recovery outcome">
        <strong>Same pickup window · modeled outcome</strong>
        <span>Current plan: {p.body.comparison.current?.timing?`${time(p.body.comparison.current.timing.pickupReadyAt)} ET · ${p.body.comparison.current.timing.pickupLateMinutes?`${p.body.comparison.current.timing.pickupLateMinutes} min late`:'on time'}${p.body.comparison.current.eligible?'':' · constraints block dispatch'}`:p.body.comparison.currentUnavailable||'No assigned baseline'}</span>
        <span>Replacement: {p.body.comparison.proposed.timing?`${time(p.body.comparison.proposed.timing.pickupReadyAt)} ET · ${p.body.comparison.proposed.timing.pickupLateMinutes?`${p.body.comparison.proposed.timing.pickupLateMinutes} min late`:'on time'} · complete ${time(p.body.comparison.proposed.timing.completionAt)} ET`:'Timing unavailable'}</span>
        {!!p.body.comparison.current?.reasons.length&&<span>Current constraints: {p.body.comparison.current.reasons.join(' ')}</span>}
        <span>Snapshot at {p.body.comparison.evaluatedAt?`${time(p.body.comparison.evaluatedAt)} ET`:'proposal creation'}. Assumes stated travel/service times and preceding delivery positions. Approval rechecks feasibility; this is not a live ETA or measured savings.</span>
      </div>}
      {p.status === "pending" ? <div className="decision-action">
        <p>{old ? "Replaces the current assignment." : "Creates a new driver offer."} Driver acceptance is still required.</p>
        <button className="primary" disabled={disabled || stale} onClick={onApprove}>Review & approve →</button>
      </div> : <div className="decision-result"><span className={`tag status-${resulting?.status || p.status}`}>{resulting ? label(resulting.status) : label(p.status)}</span><p>{resulting?.status === "accepted" ? "The replacement driver accepted the trip." : resulting?.status === "offered" ? "Offer issued. Driver acceptance is still pending." : "Review retained with its original evidence."}</p></div>}
      {stale && <p className="notice">The load changed after rehearsal. Prepare a new proposal using current evidence.</p>}
      <details className="decision-evidence">
        <summary>Route, timing & supporting evidence</summary>
        <p className="recovery-reason">{p.body.reason}</p>
        <RouteRail load={load}/>
        <dl className="decision-facts"><div><dt>Load schedule</dt><dd>{load ? `${time(load.startAt)}–${time(load.endAt)} ET` : "Unavailable"}</dd></div><div><dt>Estimated deadhead</dt><dd>{p.body.proof.deadheadKm} km</dd></div><div><dt>Reviewed versions</dt><dd>Load v{p.expected_version} · proposal r{p.revision}</dd></div></dl>
        <p className="fine">{p.body.assumptions.join(" · ")}. Comparison uses the same appointment window. Travel times remain modeled.</p>
        {!!p.body.proof.reasons.length && <ul>{p.body.proof.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      </details>
    </article>
  );
}
function ApprovalChange({ proposal, state }: { proposal: Proposal; state: State }) {
  const previous = state.assignments.find(assignment => assignment.id === proposal.body.currentAssignmentId);
  const name = (id?: string) => state.resources.find(resource => resource.id === id)?.name || id || "Unassigned";
  return <div className="approval-change"><div className="driver-comparison" aria-label="Assignment change to approve">
    <div className="driver-choice current-choice"><span>Current assignment</span><strong>{name(previous?.driverId)}</strong><small>{previous ? <>Truck {previous.truckId}<br/>Trailer {previous.trailerId}</> : "No current assignment"}</small></div>
    <span className="decision-arrow" aria-hidden="true">→</span>
    <div className="driver-choice proposed-choice"><span>Proposed assignment</span><strong>{name(proposal.body.driverId)}</strong><small>Truck {proposal.body.truckId}<br/>Trailer {proposal.body.trailerId}</small></div>
  </div></div>;
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
        { id: "budget", header: "Driving headroom" },
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
    <section className="panel fleet-panel">
      <div className="fleet-inventory">{(["driver", "truck", "trailer"] as const).map(kind=><div key={kind}><NavIcon name={kind === "driver" ? "Trips" : "Fleet"}/><strong>{resources.filter(resource=>resource.kind===kind).length.toString().padStart(2,"0")}</strong><span>{kind}s in fleet</span></div>)}</div>
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
    [historyOpen, setHistoryOpen] = useState(false),
    [assignmentId, setAssignmentId] = useState(""),
    [expectedEnd, setExpectedEnd] = useState(""),
    [reason, setReason] = useState("Dock departure delayed"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = state.assignments.find((a) => a.id === assignmentId);
  const observedAt = state.scenarios[0]?.clock || state.serverTime;
  const affectedLoads = [...new Set((state.disruptions ?? []).flatMap(disruption => {
    const trip = state.assignments.find(assignment => assignment.id === disruption.assignment_id);
    return state.assignments.filter(assignment => trip && assignment.id !== trip.id &&
      ["offered", "accepted"].includes(assignment.status) &&
      (assignment.driverId === trip.driverId || assignment.truckId === trip.truckId || assignment.trailerId === trip.trailerId) &&
      Date.parse(assignment.startAt) < Date.parse(disruption.expected_end) && Date.parse(assignment.endAt) > Date.parse(trip.endAt))
      .map(assignment => assignment.loadId);
  }))];
  return (
    <section className="panel delay-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DISRUPTION MONITOR</p>
          <h2>Dock delays</h2>
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
      {affectedLoads.length > 0 && <p className="delay-impact"><strong>{affectedLoads.join(", ")}</strong> · next assignment{affectedLoads.length === 1 ? "" : "s"} at risk</p>}
      <details className="delay-history" open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}>
        <summary>{state.disruptions?.length ? `${state.disruptions.length} recorded delay${state.disruptions.length === 1 ? "" : "s"} · review affected commitments` : "No dock delays recorded"}</summary>
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
      </details>
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
              if (ok) { setOpen(false); setHistoryOpen(true); }
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
