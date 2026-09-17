# BiteFind public preview source

Independent Oklahoma State dining prototype. This source reproduces the static preview in `/bitefind/`; the underscore keeps the source directory outside the GitHub Pages Jekyll output.

## Rebuild

Use Node.js 22.18+ (tested with Node.js 24) and npm:

```sh
cd _bitefind-source
npm ci
npm run verify
```

Copy `dist/public/bitefind/` to the repository's `bitefind/` directory when releasing. Commit both source and generated output. GitHub Pages publishes the main branch; Cloudflare currently supplies DNS for `syndral.tech`. Preserve the root homepage and CNAME.

## What is available

- Five-tab mobile preview, iPhone and Pixel frames, 27 OSU dining concepts and official menu/allergen links.
- Leaflet/OpenStreetMap map with eight approximate building centers, optional foreground location and pedestrian directions.
- Browser-local demo profiles, budget planning, geofence drafts and manual visit history.

## Boundaries

This release has no hosted account API, shared database, verified geofences, live crowds or approved item-level menu/allergen feed. Local profiles are demos, not authenticated accounts. No database, private test service, credentials or fictional meal artwork is included. Menu, allergen and availability information must be confirmed at official sources.

Nearby location is requested explicitly; routing is optional and disclosed in the app. Mapping and routing use public demonstration services; select suitable production providers before promoting a public pilot. Building markers are approximate, not counter entrances.

## Runtime integrity

The 28 files in `mobile-runtime.lock.json` are preserved. App UI lives in `src/Prototype.tsx` and `src/prototype.css`. `build:public` namespaces fixed phone asset paths in generated output only, writes content hashes and always disables the private API endpoint. It does not modify the protected runtime sources. The included Worker and Sites helper are runtime-lock dependencies, not the GitHub Pages deployment target.
