import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";
import type { Session, State } from "./api";
import { validateRouteEvidence } from "./route-evidence";
let loader: Promise<void> | undefined;
export function loadMaps(key: string) {
  return (loader ??= new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          "Map service could not be loaded. Check network and Maps configuration.",
        ),
      );
    document.head.appendChild(script);
  }));
}
export function MapPanel({
  state,
  session,
}: {
  state: State;
  session: Session;
}) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false),
    [mapStatus, setMapStatus] = useState("Loading map…");
  const [loadId, setLoadId] = useState(""),
    [truckId, setTruckId] = useState("");
  const [selection, setSelection] = useState<{
    loadId: string;
    truckId: string;
  } | null>(null);
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  const selectedLoad = state.loads.find(
    (load) => load.id === selection?.loadId,
  );
  const selectedTruck = state.resources.find(
    (resource) => resource.id === selection?.truckId,
  );
  const routeLoads =
    state.actor.role === "dispatcher"
      ? state.loads
      : state.loads.filter((load) =>
          state.assignments.some(
            (assignment) =>
              assignment.loadId === load.id &&
              ["offered", "accepted", "completed"].includes(assignment.status),
          ),
        );
  const trucks = state.resources.filter(
    (resource) =>
      resource.kind === "truck" &&
      (state.actor.role === "dispatcher" ||
        state.assignments.some(
          (assignment) =>
            assignment.loadId === loadId &&
            assignment.truckId === resource.id &&
            !["superseded", "rejected"].includes(assignment.status),
        )),
  );
  const route = useQuery({
    queryKey: [
      "truck-route",
      session.carrier,
      session.uid,
      selection?.loadId,
      selection?.truckId,
      selectedLoad?.version,
      selectedTruck?.version,
    ],
    queryFn: async () => {
      const result = validateRouteEvidence(
        await request(
          session,
          `route?loadId=${encodeURIComponent(selection!.loadId)}&truckId=${encodeURIComponent(selection!.truckId)}`,
        ),
      );
      if (
        result.loadId !== selection!.loadId ||
        result.truckId !== selection!.truckId
      )
        throw new Error(
          "Returned route does not match this load and vehicle. No route has been drawn.",
        );
      return result;
    },
    enabled:
      !!selection && !!selectedLoad && !!selectedTruck && navigator.onLine,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let markers: google.maps.Marker[] = [];
    loadMaps(key)
      .then(() => {
        if (cancelled || !ref.current) return;
        const first = !map.current;
        map.current ??= new google.maps.Map(ref.current, {
          center: { lat: 43.75, lng: -79.6 },
          zoom: 8,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
        const drivers = state.resources.filter(
          (resource) => resource.kind === "driver" && resource.position,
        );
        markers = drivers.map(
          (resource) =>
            new google.maps.Marker({
              map: map.current,
              position: resource.position,
              title: `${resource.name || resource.id} · ${resource.provenance}`,
            }),
        );
        if (first && drivers.length > 1) {
          const bounds = new google.maps.LatLngBounds();
          drivers.forEach((driver) => bounds.extend(driver.position!));
          map.current.fitBounds(bounds, 28);
        }
        setMapReady(true);
        setMapStatus(
          "Driver positions from operational records. Select a load and vehicle to request its truck route.",
        );
      })
      .catch((error) => setMapStatus(error.message));
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [key, state.resources]);
  useEffect(() => {
    if (
      !mapReady ||
      !map.current ||
      !route.data ||
      route.isError ||
      route.isFetching
    )
      return;
    const path = route.data.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const outline = new google.maps.Polyline({
      map: map.current,
      path,
      strokeColor: "#ffffff",
      strokeOpacity: 0.9,
      strokeWeight: 7,
      zIndex: 1,
    });
    const line = new google.maps.Polyline({
      map: map.current,
      path,
      strokeColor: "#205c91",
      strokeOpacity: 1,
      strokeWeight: 4,
      zIndex: 2,
    });
    const bounds = new google.maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    map.current.fitBounds(bounds, 28);
    return () => {
      outline.setMap(null);
      line.setMap(null);
    };
  }, [mapReady, route.data, route.isError, route.isFetching]);
  return (
    <section className="panel map-panel">
      <div className="panel-heading">
        <h2>Fleet geography</h2>
        <span className="tag">Ontario</span>
      </div>
      <form
        className="route-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (selection?.loadId === loadId && selection?.truckId === truckId)
            void route.refetch();
          else setSelection({ loadId, truckId });
        }}
      >
        <label>
          Route load
          <select
            aria-label="Route load"
            required
            value={loadId}
            onChange={(event) => {
              setLoadId(event.target.value);
              setTruckId("");
              setSelection(null);
            }}
          >
            <option value="">Choose load</option>
            {routeLoads.map((load) => (
              <option value={load.id} key={load.id}>
                {load.id} · {load.pickup.name} → {load.delivery.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route vehicle
          <select
            aria-label="Route vehicle"
            required
            value={truckId}
            onChange={(event) => {
              setTruckId(event.target.value);
              setSelection(null);
            }}
          >
            <option value="">Choose truck</option>
            {trucks.map((truck) => (
              <option value={truck.id} key={truck.id}>
                {truck.id}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={
            !loadId || !truckId || route.isFetching || !navigator.onLine
          }
        >
          {route.isFetching ? "Computing truck route…" : "Load truck route"}
        </button>
      </form>
      {key ? (
        <>
          <div
            ref={ref}
            className="map-canvas"
            aria-label="Google map of driver positions and verified truck route"
          />
          <p className="fine">{mapStatus}</p>
        </>
      ) : (
        <div className="map-unavailable">
          <span className="map-icon" aria-hidden="true">
            ⌖
          </span>
          <h3>Map is not connected</h3>
          <p>
            Configure a restricted Google Maps key to see driver locations and
            satellite imagery.
          </p>
          <p className="fine">
            Route evidence remains available below. Imagery requires map
            configuration.
          </p>
        </div>
      )}
      {selection && route.isFetching && (
        <p className="notice" role="status">
          Checking the selected vehicle against the routing dataset. The
          previous route is cleared while this request runs.
        </p>
      )}
      {selection && !navigator.onLine && (
        <p className="notice" role="status">
          Offline. Route evidence may be stale; reconnect to refresh it.
        </p>
      )}
      {selection && route.isError && (
        <div className="error" role="alert">
          <strong>Truck route unavailable</strong>
          <p>{route.error.message}</p>
          <button
            onClick={() => void route.refetch()}
            disabled={!navigator.onLine}
          >
            Retry truck route
          </button>
        </div>
      )}
      {route.data && !route.isError && !route.isFetching && (
        <div className="route-evidence">
          <div className="panel-heading">
            <strong>
              {route.data.loadId} · {route.data.truckId}
            </strong>
            <span className="tag">Truck route</span>
          </div>
          <p>
            <strong>{route.data.drivingMinutes} min</strong> · pickup → delivery
          </p>
          <p className="fine">
            {route.data.profile.evidence === "synthetic-scenario"
              ? "Synthetic vehicle profile"
              : "Reviewed vehicle profile"}{" "}
            · {route.data.profile.height} m high × {route.data.profile.width} m
            wide × {route.data.profile.length} m long
          </p>
          <p className="fine">
            Gross weight {route.data.profile.weight} t · axle load{" "}
            {route.data.profile.axle_load} t ·{" "}
            {route.data.profile.hazmat
              ? "Hazardous goods"
              : "No hazardous goods declared"}
          </p>
          <details>
            <summary>Routing evidence</summary>
            <p className="fine">
              Valhalla truck routing · {route.data.dataset}
            </p>
            <code>{route.data.fingerprint}</code>
          </details>
          <p className="fine">{route.data.warning}</p>
        </div>
      )}
    </section>
  );
}
