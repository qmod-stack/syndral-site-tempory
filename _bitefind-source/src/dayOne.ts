import catalog from "../data/pilot-catalog.json" with { type: "json" };
import directory from "../data/osu-directory.json" with { type: "json" };
import mapPoints from "../data/osu-map-points.json" with { type: "json" };

export type Restriction = "vegetarian" | "egg" | "fish" | "milk" | "peanut" | "sesame" | "shellfish" | "soy" | "tree-nut" | "wheat";
export const DIETARY_RESTRICTIONS: { id: Restriction; label: string }[] = [
  { id: "vegetarian", label: "Vegetarian" }, { id: "egg", label: "Avoid listed egg" },
  { id: "fish", label: "Avoid listed fish" }, { id: "milk", label: "Avoid listed milk" },
  { id: "peanut", label: "Avoid listed peanut" }, { id: "sesame", label: "Avoid listed sesame" },
  { id: "shellfish", label: "Avoid listed shellfish" }, { id: "soy", label: "Avoid listed soy" },
  { id: "tree-nut", label: "Avoid listed tree nuts" }, { id: "wheat", label: "Avoid listed wheat" },
];
export type PilotVenue = { id: string; name: string; area: string; lat: number | null; lon: number | null; locationPrecision?: "surveyed" | "building" | "unknown"; hours: string | null; orderUrl: string; kind?: "area" | "concept"; parentId?: string | null; access?: string | null; geometry?: { north: number; south: number; east: number; west: number; reviewedAt: string } | null };
export type PilotItem = { id: string; venueId: string; name: string; ingredients: string[] | null; allergens: string[] | null; vegetarian: boolean | null; serving: string | null; nutrition: { calories?: number; proteinG?: number; sodiumMg?: number } | null; isDemo: boolean; sourceUrl: string | null; reviewedAt: string | null; expiresAt: string | null };
export const PILOT_VENUES: PilotVenue[] = [
  ...catalog.venues.map((venue) => ({ ...venue, kind: "area" as const })),
  ...directory.areas.flatMap((area) => area.venues.map((venue) => { const point = mapPoints.points.find((entry) => ("venueId" in entry && entry.venueId === venue.id) || ("area" in entry && entry.area === area.name)); return { id: venue.id, name: venue.name, area: area.name, lat: point?.lat ?? null, lon: point?.lon ?? null, hours: null, orderUrl: "https://www.grubhub.com/about/campus", kind: "concept" as const, parentId: catalog.venues.find((parent) => parent.name === area.name)?.id ?? null, access: "access" in venue ? venue.access : null }; })),
];
export const PILOT_SOURCE = catalog.venueSource;
export const PILOT_SOURCE_DATE = catalog.checkedAt;
export const ORDERING_GUIDE = "https://www.grubhub.com/about/campus";
export const OSU_NUTRITION_URL = "https://dining.okstate.edu/nutrition";
export type Match = { state: "conflict" | "verify" | "no-listed-conflict" | "unassessed"; explanation: string };

export function assessItem(item: PilotItem, restrictions: Restriction[], now = new Date()): Match {
  if (item.isDemo) return { state: "verify", explanation: "This fictional record cannot establish ingredients or dietary suitability." };
  const reviewedAt = Date.parse(item.reviewedAt ?? "");
  const expiresAt = Date.parse(item.expiresAt ?? "");
  const currentTime = now.getTime();
  if (![reviewedAt, expiresAt, currentTime].every(Number.isFinite) || reviewedAt > currentTime || expiresAt <= currentTime || expiresAt <= reviewedAt) return { state: "verify", explanation: "This source review has expired or has an invalid date. Confirm current ingredients with dining staff." };
  if (!restrictions.length) return { state: "unassessed", explanation: "No dietary filter is applied. Review the source and ask dining staff about ingredients and preparation." };
  for (const restriction of restrictions) {
    if (restriction === "vegetarian" && item.vegetarian === false) return { state: "conflict", explanation: "The reviewed record is marked non-vegetarian." };
    if (restriction !== "vegetarian" && item.allergens?.includes(restriction)) return { state: "conflict", explanation: `The reviewed record lists ${restriction}.` };
  }
  if (!item.ingredients || !item.allergens || (restrictions.includes("vegetarian") && item.vegetarian === null)) return { state: "verify", explanation: "Ingredients or dietary evidence are incomplete." };
  return { state: "no-listed-conflict", explanation: "No listed conflict in the reviewed record. Confirm preparation and cross-contact with dining staff." };
}

export function approxMeters(latA: number, lonA: number, latB: number, lonB: number): number {
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad, dLon = (lonB - lonA) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function allowedOrderUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === "https:" && (url.hostname === "www.grubhub.com" || url.hostname === "dining.okstate.edu"); } catch { return false; }
}
