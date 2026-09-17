import type { BuildingPoint } from "./locations";

export type WalkingRoute = { meters: number; minutes: number; provider: "Valhalla pedestrian demo" };
export function campusCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 36.10 && lat <= 36.15 && lon >= -97.10 && lon <= -97.04;
}
export function parseWalkingRoute(input: unknown): WalkingRoute {
  const summary = (input as { trip?: { summary?: { length?: unknown; time?: unknown } } })?.trip?.summary;
  const length = summary?.length, time = summary?.time;
  if (typeof length !== "number" || typeof time !== "number" || !Number.isFinite(length) || !Number.isFinite(time) || length < 0 || length > 10 || time < 0 || time > 4 * 3600) throw new Error("The walking service returned an invalid route.");
  return { meters: Math.round(length * 1000), minutes: Math.max(1, Math.round(time / 60)), provider: "Valhalla pedestrian demo" };
}
export async function walkingRoute(origin: { lat: number; lon: number }, destination: BuildingPoint, signal?: AbortSignal): Promise<WalkingRoute> {
  if (!campusCoordinate(origin.lat, origin.lon) || !campusCoordinate(destination.lat, destination.lon)) throw new Error("Walking routes are limited to the OSU Stillwater campus area.");
  const response = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "X-Client-Id": "bitefind-local-prototype" },
    body: JSON.stringify({ locations: [origin, { lat: destination.lat, lon: destination.lon }], costing: "pedestrian", directions_options: { units: "kilometers", narrative: false } }),
  });
  if (!response.ok) throw new Error("The walking service is unavailable. Try the official campus map instead.");
  return parseWalkingRoute(await response.json());
}
