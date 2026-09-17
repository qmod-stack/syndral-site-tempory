import directory from "../data/osu-directory.json" with { type: "json" };

export type Bounds = { north: number; south: number; east: number; west: number };
export type Venue = { id: string; name: string; area: string; access?: string };

// Names are transcribed from OSU University Dining Services' location directory.
// This is a directory, not a licensed menu, hours feed, or current availability claim.
export const OSU_DIRECTORY_URL = directory.sourceUrl;
export const OSU_AREAS: { name: string; venues: Omit<Venue, "area">[] }[] = directory.areas;
export const OSU_VENUES: Venue[] = OSU_AREAS.flatMap((area) => area.venues.map((venue) => ({ ...venue, area: area.name })));

export type GeofenceResult = "inside" | "outside" | "uncertain" | "unconfigured";
export function validBounds(bounds: Bounds | null): bounds is Bounds {
  return !!bounds && Object.values(bounds).every(Number.isFinite) && bounds.south < bounds.north && bounds.west < bounds.east &&
    bounds.south >= -90 && bounds.north <= 90 && bounds.west >= -180 && bounds.east <= 180 &&
    (bounds.north - bounds.south) < 0.005 && (bounds.east - bounds.west) < 0.005;
}

// A position near a fence is uncertain when its accuracy circle overlaps the edge.
// This avoids counting someone in a neighboring restaurant as a verified visit.
export function evaluateGeofence(bounds: Bounds | null, lat: number, lon: number, accuracyMeters: number): GeofenceResult {
  if (!validBounds(bounds)) return "unconfigured";
  if (![lat, lon, accuracyMeters].every(Number.isFinite) || accuracyMeters < 0 || accuracyMeters > 100) return "uncertain";
  const latRadius = accuracyMeters / 111_320;
  const lonRadius = accuracyMeters / (111_320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  if (lat - latRadius >= bounds.south && lat + latRadius <= bounds.north && lon - lonRadius >= bounds.west && lon + lonRadius <= bounds.east) return "inside";
  if (lat + latRadius < bounds.south || lat - latRadius > bounds.north || lon + lonRadius < bounds.west || lon - lonRadius > bounds.east) return "outside";
  return "uncertain";
}

export type DemoPreferences = { budget: boolean; vegetarian: boolean; nearby: boolean };
export type DemoProfile = { id: string; name: string; campus: "Oklahoma State"; saved: number[]; balance: number; days: number; preferences: DemoPreferences; reviews: { mealId: number; score: number; text: string }[]; visits: { venueId: string; at: string }[] };
export const PROFILE_KEY = "bitefind-local-profiles-v1";
export function readProfiles(): DemoProfile[] {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is DemoProfile => !!p && typeof p === "object" && typeof p.id === "string" && typeof p.name === "string" && p.campus === "Oklahoma State" && Array.isArray(p.saved) && Array.isArray(p.reviews) && Array.isArray(p.visits) && Number.isFinite(p.balance) && Number.isFinite(p.days)).slice(0, 8).map((p) => ({ id: p.id, name: p.name, campus: "Oklahoma State", saved: p.saved, balance: p.balance, days: p.days, preferences: { budget: p.preferences?.budget ?? true, vegetarian: p.preferences?.vegetarian ?? false, nearby: p.preferences?.nearby ?? true }, reviews: p.reviews, visits: p.visits }));
  } catch { return []; }
}
