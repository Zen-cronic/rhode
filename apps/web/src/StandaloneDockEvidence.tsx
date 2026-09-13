import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import './standalone-dock-evidence.css'

const DockScene = lazy(() => import('./DockScene'))

type Selection = 'truck' | 'dock' | 'fence'
type Camera = 'overview' | 'dock' | 'top'

type Milestone = {
  id: 'arrival' | 'boundary' | 'exit' | 'draft' | 'recovery'
  step: string
  label: string
  time: string
  title: string
  detail: string
  atDock: boolean
  selected: Selection
  camera: Camera
  held: boolean
}

const milestones: Milestone[] = [
  {
    id: 'arrival',
    step: '01',
    label: 'Arrival',
    time: '08:30 ET',
    title: 'First retained yard observation',
    detail: 'RS-1042 is observed inside the synthetic london-local-yard fixture. This sample opens the retained visit; it is not a certified gate crossing.',
    atDock: true,
    selected: 'truck',
    camera: 'overview',
    held: false,
  },
  {
    id: 'boundary',
    step: '02',
    label: '120-min boundary',
    time: '10:30 ET',
    title: 'Free dwell allowance ends',
    detail: 'The retained contract grants 120 free minutes. Later observed dwell becomes billable only after this boundary.',
    atDock: true,
    selected: 'dock',
    camera: 'dock',
    held: false,
  },
  {
    id: 'exit',
    step: '03',
    label: 'Exit',
    time: '11:15:09 ET',
    title: 'Last retained yard observation',
    detail: 'RS-1042 is observed outside the yard in the complete synthetic replay. The interval closes at 165 minutes.',
    atDock: false,
    selected: 'fence',
    camera: 'top',
    held: false,
  },
  {
    id: 'draft',
    step: '04',
    label: 'Automatic draft',
    time: 'POST-EXIT',
    title: 'A CAD $75 draft is prepared',
    detail: '45 billable minutes produce a synthetic CAD $75 detention draft. The draft is automatic; dispatcher approval is a separate decision.',
    atDock: false,
    selected: 'dock',
    camera: 'dock',
    held: false,
  },
  {
    id: 'recovery',
    step: '05',
    label: 'Recovery consequence',
    time: '11:20 ET',
    title: 'The next assignment changes',
    detail: 'D-01 has 40 on-duty minutes remaining and is rejected for insufficient on-duty time and reach. Recovery separately assigns D-02.',
    atDock: false,
    selected: 'truck',
    camera: 'overview',
    held: false,
  },
]

const replayHash = 'abc688b8652682b33cbcf0b813c4ad285b8c3132a779cead246ecb4eb63007d2'

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function DiagramFallback({ atDock }: { atDock: boolean }) {
  return <div className="dock-proof-diagram" role="img" aria-label={`Schematic facility diagram. ${atDock ? 'RS-1042 is shown at the dock.' : 'RS-1042 is shown outside the dock.'}`}>
    <div className="dock-proof-diagram-building"><span>YARD / 03</span><strong>LOADING DOCK</strong></div>
    <div className="dock-proof-diagram-lane" />
    <div className={`dock-proof-diagram-truck ${atDock ? 'is-present' : 'is-departed'}`}><span>RS-1042</span></div>
    <div className="dock-proof-diagram-fence">SCHEMATIC LIMIT</div>
    <p>Diagram fallback · evidence remains available below</p>
  </div>
}

function BrandMark() {
  return <svg className="dock-proof-brand-mark" viewBox="0 0 36 40" fill="none" aria-hidden="true"><path d="M7 35V8h10c8 0 11 4 11 9 0 6-5 9-12 9H7" stroke="currentColor" strokeWidth="5"/><path d="m17 26 12 10M16 9v14" stroke="#E65C32" strokeWidth="5"/><path d="M16 3v3M16 30v7" stroke="#E65C32" strokeWidth="2"/></svg>
}

export function StandaloneDockEvidence() {
  const [activeId, setActiveId] = useState<Milestone['id']>('arrival')
  const [diagram, setDiagram] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [variableCost, setVariableCost] = useState('1.25')
  const active = milestones.find((item) => item.id === activeId) ?? milestones[0]
  const costPerKm = Number.parseFloat(variableCost)
  const addedDeadheadCost = Number.isFinite(costPerKm) && costPerKm >= 0 ? costPerKm * 138.9 : null
  const cad = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const fallback = <DiagramFallback atDock={active.atDock} />

  return <main className="dock-proof-page">
    <header className="dock-proof-header">
      <a className="dock-proof-brand" href="/" aria-label="RoadStar home">
        <BrandMark />
        <span><strong>RoadStar</strong><small>TRANSPORT / CONTROL</small></span>
      </a>
      <div className="dock-proof-header-actions">
        <span>PUBLIC SYNTHETIC RECEIPT</span>
        <a href="/?view=matched-401">Matched 401 replay</a>
        <a href="/">Operations</a>
      </div>
    </header>

    <section className="dock-proof-hero" aria-labelledby="dock-proof-title">
      <div>
        <p className="dock-proof-eyebrow">RETAINED REPLAY / RS-1042 / COMPLETE</p>
        <h1 id="dock-proof-title">The dock wait that<br/><em>changed the next move.</em></h1>
      </div>
      <div className="dock-proof-hero-note">
        <span className="dock-proof-status"><i/>REPLAY VERIFIED LOCALLY</span>
        <p>One exact synthetic receipt connects observed yard samples, detention math, and the recovery decision they caused.</p>
        <dl><div><dt>Facility</dt><dd>london-local-yard</dd></div><div><dt>Window</dt><dd>08:30–11:15:09 ET</dd></div></dl>
      </div>
    </section>

    <section className="dock-proof-console" aria-label="Interactive dock evidence receipt">
      <div className="dock-proof-console-head">
        <div><span>RECEIPT / 2026-09-13</span><strong>Select a milestone to inspect the retained state.</strong></div>
        <button type="button" aria-pressed={diagram} onClick={() => setDiagram((value) => !value)}>{diagram ? 'Show 3D scene' : 'Use diagram'}</button>
      </div>

      <div className="dock-proof-timeline" role="group" aria-label="Replay milestones">
        {milestones.map((item) => <button
          type="button"
          key={item.id}
          aria-pressed={item.id === active.id}
          onClick={() => setActiveId(item.id)}
          className={item.id === active.id ? 'is-active' : ''}
        >
          <span>{item.step}</span>
          <strong>{item.label}</strong>
          <small>{item.time}</small>
        </button>)}
      </div>

      <div className="dock-proof-stage-grid">
        <div className="dock-proof-scene-wrap">
          <div className="dock-proof-scene-label">
            <span>SCHEMATIC FACILITY / {active.atDock ? 'TRUCK AT DOCK' : 'TRUCK DEPARTED'}</span>
            <strong>{active.title}</strong>
          </div>
          {diagram ? fallback : <SceneBoundary fallback={fallback}>
            <Suspense fallback={<div className="dock-proof-scene-loading" role="status">Loading schematic 3D scene…</div>}>
              <DockScene
                atDock={active.atDock}
                held={active.held}
                selected={active.selected}
                onSelect={() => undefined}
                camera={active.camera}
                reducedMotion={reducedMotion}
                onUnavailable={() => setDiagram(true)}
              />
            </Suspense>
          </SceneBoundary>}
          <p className="dock-proof-schematic-note">Illustrative placement only · no surveyed bay, queue, geofence, or boundary claim</p>
        </div>

        <aside className="dock-proof-inspector" aria-live="polite">
          <span className="dock-proof-inspector-index">MILESTONE {active.step} / 05</span>
          <p className="dock-proof-inspector-time">2026-09-13 · {active.time}</p>
          <h2>{active.title}</h2>
          <p>{active.detail}</p>
          {active.id === 'recovery' ? <div className="dock-proof-decision">
            <span>D-01 / REJECTED</span><strong>40 min on-duty</strong><small>Insufficient on-duty time and reach</small>
            <i aria-hidden="true">→</i>
            <span>D-02 / SEPARATE ASSIGNMENT</span><strong>Recovery candidate</strong><small>Dispatcher approval remains separate</small>
          </div> : <div className="dock-proof-measure">
            <div><span>Dwell observed</span><strong>165 min</strong></div>
            <div><span>Free allowance</span><strong>120 min</strong></div>
            <div><span>Billable</span><strong>45 min</strong></div>
          </div>}
        </aside>
      </div>
    </section>

    <section className="dock-proof-outcomes" aria-label="Receipt outcome">
      <div className="dock-proof-outcome-lead">
        <p className="dock-proof-eyebrow">THE RECEIPT</p>
        <h2>165 minutes in.<br/>45 minutes billable.</h2>
        <p>The retained interval creates an automatic <strong>CAD $75 detention draft</strong>. Draft creation does not approve the charge; dispatcher approval is a separate recorded step.</p>
      </div>
      <div className="dock-proof-equation" aria-label="Detention calculation">
        <div><span>OBSERVED DWELL</span><strong>165</strong><small>minutes</small></div><i>−</i>
        <div><span>FREE WINDOW</span><strong>120</strong><small>minutes</small></div><i>=</i>
        <div className="is-result"><span>BILLABLE</span><strong>45</strong><small>minutes · CAD $75 draft</small></div>
      </div>
    </section>

    <section className="dock-proof-value" aria-labelledby="value-title">
      <div className="dock-proof-value-intro">
        <p className="dock-proof-eyebrow">RECOVERY CONSEQUENCE / MODELED</p>
        <h2 id="value-title">Organizer value scenario</h2>
        <p>The organizer brief places the at-risk load revenue between <strong>$1,000 and $7,000</strong> without naming a currency. This scenario models that range as CAD. The retained recovery adds <strong>138.9 km</strong> of deadhead.</p>
      </div>
      <div className="dock-proof-value-model">
        <label>
          <span>EDITABLE VARIABLE COST</span>
          <span className="dock-proof-cost-input"><b>CAD $</b><input type="number" min="0" step="0.05" inputMode="decimal" value={variableCost} onChange={(event) => setVariableCost(event.target.value)} aria-describedby="variable-cost-note"/><b>/ km</b></span>
          <small id="variable-cost-note">Local planning input · default CAD $1.25/km</small>
        </label>
        <div className="dock-proof-value-math" aria-live="polite">
          <div><span>AT-RISK LOAD REVENUE</span><strong>CAD $1,000–$7,000</strong><small>Brief amount · currency modeled as CAD</small></div>
          <i>−</i>
          <div><span>MODELED ADDED-DEADHEAD COST</span><strong>{addedDeadheadCost === null ? 'Enter a rate' : cad(addedDeadheadCost)}</strong><small>138.9 km × variable cost</small></div>
          <i>=</i>
          <div className="is-result"><span>REVENUE LESS MODELED ADDED-DEADHEAD COST</span><strong>{addedDeadheadCost === null ? '—' : `${cad(1000 - addedDeadheadCost)}–${cad(7000 - addedDeadheadCost)}`}</strong><small>Modeled range · planning scenario only</small></div>
        </div>
      </div>
      <p className="dock-proof-value-limits"><strong>Excluded from this scenario:</strong> labor and equipment cost, margin, recovery win probability, and collection. The CAD $75 detention candidate is excluded and has not been collected.</p>
    </section>

    <section className="dock-proof-hos" aria-labelledby="hos-title">
      <div className="dock-proof-hos-copy">
        <p className="dock-proof-eyebrow">BOUNDED CANADIAN PLANNING PROFILE</p>
        <h2 id="hos-title">A planning gate, not an ELD.</h2>
        <p>This fixture checks the supported daily planning gates together. It does not certify a logbook or determine legal compliance.</p>
      </div>
      <div className="dock-proof-gates">
        <div><span>DRIVING GATE</span><strong>13h</strong><small>Remaining amount not retained in this receipt</small></div>
        <div className="is-exact"><span>ON-DUTY GATE</span><strong>14h</strong><small><b>40 min remaining</b> at 11:20 ET</small></div>
        <div><span>ELAPSED GATE</span><strong>16h</strong><small>Remaining amount not retained in this receipt</small></div>
      </div>
      <p className="dock-proof-boundary-note"><strong>Exact bounded result:</strong> D-01 is rejected for insufficient on-duty time and reach. The receipt makes no additional driving or elapsed-headroom claim.</p>
    </section>

    <section className="dock-proof-provenance" aria-labelledby="provenance-title">
      <div>
        <p className="dock-proof-eyebrow">PROVENANCE / SELF-CONTAINED</p>
        <h2 id="provenance-title">What this page can prove.</h2>
      </div>
      <div className="dock-proof-source-grid">
        <article><span>ARRIVAL OBSERVATION</span><strong>0ecf3516...</strong><small>2026-09-13T12:30:00Z</small></article>
        <article><span>EXIT OBSERVATION</span><strong>539ac67f...</strong><small>2026-09-13T15:15:09Z</small></article>
      </div>
      <details>
        <summary>Full replay fingerprint</summary>
        <p>SHA-256</p><code>{replayHash}</code>
      </details>
    </section>

    <section className="dock-proof-limits" aria-label="Receipt limitations">
      <strong>READ THIS RECEIPT PRECISELY</strong>
      <ul>
        <li>One exact retained synthetic replay; no database or network access.</li>
        <li>Observed samples, not certified arrival or departure crossing times.</li>
        <li>Schematic facility geometry; no surveyed location claim.</li>
        <li>Not a certified electronic logging device or compliance determination.</li>
        <li>No live traffic, telematics, rate, or driver-status updates.</li>
        <li>Browser controls inspect evidence and issue no operational commands.</li>
      </ul>
    </section>

    <footer className="dock-proof-footer">
      <span>RoadStar / public synthetic evidence</span>
      <nav aria-label="Public evidence links"><a href="/?view=matched-401">Matched Highway 401 replay</a><a href="/">Return to RoadStar</a></nav>
    </footer>
  </main>
}
