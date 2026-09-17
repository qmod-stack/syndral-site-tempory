import points from "../data/osu-map-points.json" with { type: "json" };
import directory from "../data/osu-directory.json" with { type: "json" };

export type BuildingPoint = (typeof points.points)[number];
export const BUILDING_POINTS = points.points;
export const BUILDING_POINT_DATE = points.checkedAt;
export function buildingForVenue(venueId: string): BuildingPoint | null {
  const venue = directory.areas.flatMap((area) => area.venues.map((entry) => ({ ...entry, area: area.name }))).find((entry) => entry.id === venueId);
  if (!venue) return null;
  return BUILDING_POINTS.find((point) => ("venueId" in point && point.venueId === venueId) || ("area" in point && point.area === venue.area)) ?? null;
}
