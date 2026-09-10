export type TruckRoute = {
  fingerprint: string;
  loadId: string;
  truckId: string;
  coordinates: [number, number][];
  drivingMinutes: number;
  deadheadMinutes: number;
  profile: {
    height: number;
    width: number;
    length: number;
    weight: number;
    axle_load: number;
    hazmat: boolean;
    evidence: "operator-verified" | "synthetic-scenario";
  };
  dataset: string;
  routing_evidence: "valhalla-truck";
  warning: string;
};

// Map geometry is accepted only with truck routing evidence. Missing or invalid
// geometry is an unavailable result, never a line between the load's stops.
export function validateRouteEvidence(input: unknown): TruckRoute {
  const route = input as Partial<TruckRoute> | null;
  const invalid = () =>
    new Error(
      "Truck routing returned incomplete geometry or vehicle evidence. No route has been drawn.",
    );
  if (
    !route ||
    route.routing_evidence !== "valhalla-truck" ||
    !["fingerprint", "loadId", "truckId", "dataset"].every((key) => {
      const value = route[key as keyof TruckRoute];
      return typeof value === "string" && value.trim().length > 0;
    }) ||
    typeof route.warning !== "string"
  )
    throw invalid();
  if (
    !Array.isArray(route.coordinates) ||
    route.coordinates.length < 2 ||
    !route.coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Math.abs(point[0]) <= 180 &&
        Number.isFinite(point[1]) &&
        Math.abs(point[1]) <= 90,
    )
  )
    throw invalid();
  if (
    !Number.isFinite(route.drivingMinutes) ||
    route.drivingMinutes! < 0 ||
    !Number.isFinite(route.deadheadMinutes) ||
    route.deadheadMinutes! < 0
  )
    throw invalid();
  const profile = route.profile;
  if (
    !profile ||
    !["height", "width", "length", "weight", "axle_load"].every(
      (key) =>
        typeof profile[key as keyof typeof profile] === "number" &&
        Number.isFinite(profile[key as keyof typeof profile]) &&
        Number(profile[key as keyof typeof profile]) > 0,
    ) ||
    typeof profile.hazmat !== "boolean" ||
    !["operator-verified", "synthetic-scenario"].includes(profile.evidence)
  )
    throw invalid();
  return route as TruckRoute;
}
