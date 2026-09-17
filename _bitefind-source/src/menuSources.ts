import sourceData from "../data/osu-menu-sources.json" with { type: "json" };
import directory from "../data/osu-directory.json" with { type: "json" };

export const ALLERGEN_GUIDE_URL = sourceData.officialAllergenGuide;
export const NET_NUTRITION_URL = sourceData.netNutrition;
export const MENU_SOURCE_CHECKED_AT = sourceData.checkedAt;

export function officialMenuUrl(venueId: string): string | null {
  return (sourceData.concepts as Record<string, string>)[venueId] ?? null;
}

export function officialAllergenUrl(venueId: string): string {
  return (sourceData.franchiseAllergens as Record<string, string>)[venueId] ?? NET_NUTRITION_URL;
}

export function officialAllergenLabel(venueId: string): string {
  if (venueId === "caribou-central" || venueId === "caribou-union") return "Caribou website; ask staff about allergens";
  if (venueId === "shake-smart") return "Shake Smart menu and allergen links";
  if (venueId === "chick-fil-a") return "Chick-fil-A nutrition and allergens";
  return "OSU NetNutrition; check service date";
}

export function missingOfficialMenuSources(): string[] {
  return directory.areas.flatMap((area) => area.venues).filter((venue) => !officialMenuUrl(venue.id)).map((venue) => venue.id);
}
