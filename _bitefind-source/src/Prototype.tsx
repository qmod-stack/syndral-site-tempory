import { useEffect, useRef, useState } from "react";
import {
  BookmarkFilledIcon, BookmarkIcon, ChevronRightIcon,
  ClockIcon, Cross2Icon, HomeIcon, InfoCircledIcon,
  MagnifyingGlassIcon, PersonIcon, ReloadIcon, SewingPinFilledIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets } from "./mobile";
import { evaluateGeofence, OSU_AREAS, OSU_DIRECTORY_URL, OSU_VENUES, PROFILE_KEY, readProfiles, validBounds, type Bounds, type DemoPreferences, type DemoProfile } from "./pilot";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { allowedOrderUrl, approxMeters, assessItem, DIETARY_RESTRICTIONS, ORDERING_GUIDE, OSU_NUTRITION_URL, PILOT_SOURCE, PILOT_SOURCE_DATE, PILOT_VENUES, type PilotItem, type PilotVenue, type Restriction } from "./dayOne";
import { BUILDING_POINTS, buildingForVenue, type BuildingPoint } from "./locations";
import { walkingRoute, type WalkingRoute } from "./walking";
import { ALLERGEN_GUIDE_URL, MENU_SOURCE_CHECKED_AT, officialAllergenLabel, officialAllergenUrl, officialMenuUrl } from "./menuSources";

type Tab = "home" | "food" | "places" | "plan" | "profile";
type FoodPanel = "find" | "settings" | "feedback" | "founder";

const START_BALANCE = 1247;
const START_DAYS = 77;
// Retained for compatibility with existing local profiles, never used as allergy evidence.
const DEFAULT_PREFERENCES: DemoPreferences = { budget: true, vegetarian: false, nearby: true };

export default function Prototype() {
  const [profiles, setProfiles] = useState<DemoProfile[]>(readProfiles);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem("bitefind-active-profile-v1") || "guest");
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const [guestBalance, setGuestBalance] = useState(START_BALANCE);
  const [guestDays, setGuestDays] = useState(START_DAYS);
  const [tab, setTab] = useState<Tab>("food");
  const [selectedVenue, setSelectedVenue] = useState("405-deli");
  const [foodPanel, setFoodPanel] = useState<FoodPanel>("find");
  const [draftBalance, setDraftBalance] = useState(String(activeProfile?.balance ?? START_BALANCE));
  const [draftDays, setDraftDays] = useState(String(activeProfile?.days ?? START_DAYS));
  const [toast, setToast] = useState("");
  const [pilotUser, setPilotUser] = useState<PilotUser | null>(null);
  const foodSurface = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboard();
  const insets = useKeyboardInsets();
  const balance = activeProfile?.balance ?? guestBalance;
  const days = activeProfile?.days ?? guestDays;
  const daily = days > 0 ? balance / days : 0;

  useEffect(() => { localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem("bitefind-active-profile-v1", activeProfileId); }, [activeProfileId]);
  useEffect(() => { if (tab === "food") foodSurface.current?.querySelector(".mobile-scroll")?.scrollTo({ top: 0 }); }, [tab, foodPanel]);
  useEffect(() => {
    const field = keyboard.focusedElement;
    const scroll = field?.closest(".mobile-scroll");
    if (!keyboard.visible || !field || !(scroll instanceof HTMLElement)) return;
    // Keep app fields above our navigation as the phone keyboard resizes the scroll area.
    const revealField = () => {
      const viewport = scroll.getBoundingClientRect(), input = field.getBoundingClientRect();
      const scale = viewport.width / scroll.clientWidth;
      const bottom = viewport.bottom - 78 * scale, top = viewport.top + 62 * scale;
      if (input.bottom > bottom) scroll.scrollTop += (input.bottom - bottom) / scale;
      else if (input.top < top) scroll.scrollTop -= (top - input.top) / scale;
    };
    const observer = new ResizeObserver(revealField);
    observer.observe(scroll);
    revealField();
    return () => observer.disconnect();
  }, [keyboard.focusedElement, keyboard.visible]);

  function updateProfile(change: (profile: DemoProfile) => DemoProfile) {
    setProfiles((current) => current.map((profile) => profile.id === activeProfileId ? change(profile) : profile));
  }
  function go(next: Tab) { keyboard.hide(); setTab(next); setToast(""); }
  function openFood(panel: FoodPanel = "find") { setFoodPanel(panel); go("food"); }
  function openPlaces() {
    const chosen = PILOT_VENUES.find((venue) => venue.id === selectedVenue);
    if (chosen?.kind !== "concept") setSelectedVenue(OSU_VENUES.find((venue) => venue.area === chosen?.area)?.id ?? "405-deli");
    go("places");
  }
  function updatePlan() {
    keyboard.hide();
    const nextBalance = Number(draftBalance);
    const nextDays = Number(draftDays);
    if (!draftBalance.trim() || !draftDays.trim() || !Number.isFinite(nextBalance) || nextBalance < 0 || nextBalance > 10000 || !Number.isFinite(nextDays) || nextDays < 1 || nextDays > 365) {
      setToast("Use a balance from $0–$10,000 and 1–365 days.");
      return;
    }
    const amount = Math.round(nextBalance * 100) / 100;
    const duration = Math.floor(nextDays);
    if (activeProfile) updateProfile((profile) => ({ ...profile, balance: amount, days: duration }));
    else { setGuestBalance(amount); setGuestDays(duration); }
    setDraftBalance(String(amount));
    setDraftDays(String(duration));
    setToast("Demo plan updated.");
  }
  function resetDemo() {
    keyboard.hide();
    if (activeProfile) updateProfile((profile) => ({ ...profile, balance: START_BALANCE, days: START_DAYS, saved: [], reviews: [], visits: [], preferences: DEFAULT_PREFERENCES }));
    else { setGuestBalance(START_BALANCE); setGuestDays(START_DAYS); }
    setDraftBalance(String(START_BALANCE));
    setDraftDays(String(START_DAYS));
    setToast("Demo data reset.");
  }
  function switchProfile(id: string) {
    keyboard.hide();
    const target = profiles.find((profile) => profile.id === id);
    setActiveProfileId(target ? id : "guest");
    setDraftBalance(String(target?.balance ?? guestBalance));
    setDraftDays(String(target?.days ?? guestDays));
    setToast(target ? `Switched to ${target.name}'s local demo.` : "Browsing as guest.");
  }
  function addProfile(name: string) {
    keyboard.hide();
    const clean = name.trim().slice(0, 40);
    if (!clean || profiles.length >= 8) return;
    const profile: DemoProfile = { id: crypto.randomUUID(), name: clean, campus: "Oklahoma State", saved: [], balance: START_BALANCE, days: START_DAYS, preferences: DEFAULT_PREFERENCES, reviews: [], visits: [] };
    setProfiles((current) => [...current, profile]);
    setActiveProfileId(profile.id);
    setDraftBalance(String(START_BALANCE));
    setDraftDays(String(START_DAYS));
    setToast("Local demo profile created.");
  }
  function deleteProfile() {
    keyboard.hide();
    if (!activeProfile) return;
    setProfiles((current) => current.filter((profile) => profile.id !== activeProfileId));
    setActiveProfileId("guest");
    setDraftBalance(String(guestBalance));
    setDraftDays(String(guestDays));
    setToast("Local profile and its demo history deleted.");
  }
  function saveVisit(venueId: string) {
    if (!activeProfile) { setToast("Create a local profile to save a demo visit."); return; }
    updateProfile((profile) => ({ ...profile, visits: [{ venueId, at: new Date().toISOString() }, ...profile.visits].slice(0, 30) }));
    setToast("Demo visit saved only in this browser.");
  }

  const screen = tab === "home"
    ? <HomeScreen name={activeProfile?.name ?? "there"} daily={daily} balance={balance} days={days} onDiscover={() => openFood()} onPlan={() => go("plan")} onPlaces={openPlaces} />
    : tab === "plan"
    ? <PlanScreen balance={balance} days={days} daily={daily} draftBalance={draftBalance} setDraftBalance={setDraftBalance} draftDays={draftDays} setDraftDays={setDraftDays} updatePlan={updatePlan} />
    : tab === "places"
    ? <PlacesScreen activeProfile={activeProfile} pilotUser={pilotUser} onVisit={saveVisit} venueId={selectedVenue} onChooseVenue={setSelectedVenue} onFood={() => openFood()} />
    : <ProfileScreen resetDemo={resetDemo} profiles={profiles} activeProfileId={activeProfileId} onSwitch={switchProfile} onCreate={addProfile} onDelete={deleteProfile} onPlaces={openPlaces} pilotUser={pilotUser} onFood={() => openFood("settings")} />;

  return <div className="bf-app" onBlurCapture={(event) => {
    const next = event.relatedTarget;
    // Clickable controls dismiss on click, so the keyboard cannot move the target before pointer-up.
    if (event.target.matches("input:not([type=checkbox]), textarea") && !(next instanceof HTMLElement && next.matches("input, textarea, button, a, summary, select"))) keyboard.hide();
  }} onClickCapture={(event) => {
    if (event.target instanceof Element && event.target.closest("button, a, summary, select, input[type=checkbox]")) keyboard.hide();
  }} onKeyUpCapture={(event) => {
    if (event.key === "Tab" && event.target instanceof HTMLElement && !event.target.matches("input:not([type=checkbox]), textarea")) keyboard.hide();
  }}>
    <div className="food-surface" ref={foodSurface} hidden={tab !== "food"}>
      <MobileScroll className="bf-scroll"><main className="bf-content" aria-label="BiteFind food discovery"><FoodScreen onSession={setPilotUser} selected={selectedVenue} setSelected={setSelectedVenue} panel={foodPanel} setPanel={setFoodPanel} onPlaces={openPlaces} /></main></MobileScroll>
    </div>
    {tab !== "food" && <MobileScroll key={tab} className="bf-scroll"><main className="bf-content" aria-label="BiteFind Oklahoma State pilot">{screen}</main></MobileScroll>}
    <BottomNav tab={tab} onChange={(next) => next === "places" ? openPlaces() : go(next)} />
    {toast && <div className="bf-toast" role="status" style={{ bottom: 79 + insets.bottomInset }}><InfoCircledIcon /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss message"><Cross2Icon /></button></div>}
  </div>;
}

function Brand() { return <div className="brand"><svg className="brand-mark" viewBox="0 0 32 42" aria-hidden="true"><path fill="currentColor" d="M16 1C7.7 1 1 7.7 1 16c0 10 15 25 15 25s15-15 15-25C31 7.7 24.3 1 16 1Z" /><path d="M11 9v9c0 3 2 5 5 5s5-2 5-5V9M16 9v24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" /></svg><span>Bite<b>Find</b></span></div>; }

function Header({ title, action }: { title: string; action?: React.ReactNode }) { return <header className="screen-header"><div><h1>{title}</h1></div>{action}</header>; }

function HomeScreen({ name, daily, balance, days, onDiscover, onPlan, onPlaces }: { name: string; daily: number; balance: number; days: number; onDiscover: () => void; onPlan: () => void; onPlaces: () => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return <div className="screen home-screen">
    <div className="pilot-brand"><Brand /><span>OSU pilot</span></div>
    <div className="home-top"><div><p className="eyebrow">{greeting}{name === "there" ? "" : `, ${name}`}.</p><h1>Make it a good bite.</h1></div></div>
    <p className="pilot-lede">Your campus. Your next meal. A little more planned.</p>
    <button className="balance-card" onClick={onPlan}>
      <div className="balance-row"><div><span>Demo dining dollars</span><strong>${formatMoney(balance)}</strong></div><ChevronRightIcon /></div>
      <div className="balance-divider" />
      <div className="balance-row"><div><span>Daily guide · {days} days left</span><strong>${daily.toFixed(2)}</strong></div><span className="status-pill">Edit plan <ChevronRightIcon /></span></div>
    </button>
    <div className="section-heading"><h2>Around campus</h2><span>27 dining spots</span></div>
    <button className="explore-card" onClick={onDiscover}><span className="explore-icon"><MagnifyingGlassIcon /></span><span><strong>Find your next bite</strong><small>Browse official menus & food sources</small></span><ChevronRightIcon /></button>
    <div className="quick-grid">
      <button onClick={onPlaces}><SewingPinFilledIcon /><span>Campus map<small>Find a spot & directions</small></span></button>
      <button onClick={onPlan}><BookmarkIcon /><span>Budget planner<small>Make your dollars last</small></span></button>
    </div>
    <div className="source-footnote"><InfoCircledIcon /><p>Independent Oklahoma State pilot. Menus open at the official source. Confirm current ingredients and allergens with dining staff.</p></div>
    <a className="quiet-link" href={OSU_NUTRITION_URL} target="_blank" rel="noreferrer">Explore OSU nutrition resources ↗</a>
  </div>;
}

function PlanScreen({ balance, days, daily, draftBalance, setDraftBalance, draftDays, setDraftDays, updatePlan }: { balance: number; days: number; daily: number; draftBalance: string; setDraftBalance: (value: string) => void; draftDays: string; setDraftDays: (value: string) => void; updatePlan: () => void }) {
  return <div className="screen plan-screen">
    <Header title="Make every dollar count." />
    <p className="pilot-lede">A simple daily guide for the rest of your semester.</p>
    <section className="budget-hero"><span className="sample-badge">Demo calculator</span><p>Your daily guide</p><strong>${daily.toFixed(2)}<small> / day</small></strong><div className="budget-breakdown"><span>${formatMoney(balance)} balance</span><span>{days} days left</span></div></section>
    <section className="form-card"><div className="section-heading"><h2>Adjust your plan</h2></div><div className="plan-fields"><label><span>Balance ($)</span><KeyboardInput inputMode="decimal" value={draftBalance} onChange={(event) => setDraftBalance(event.target.value)} /></label><label><span>Days left</span><KeyboardInput inputMode="numeric" value={draftDays} onChange={(event) => setDraftDays(event.target.value)} /></label></div><button className="primary-button" onClick={updatePlan}>Update daily guide</button></section>
    <div className="source-footnote"><InfoCircledIcon /><p>This is a manual estimate using demo dollars, separate from your university meal plan. Your balance divided by your remaining days sets the daily guide.</p></div>
    <section className="pilot-panel"><h2>Before you order</h2><p>Check current prices on the official menu or ordering service. BiteFind has no verified item prices yet.</p></section>
  </div>;
}

function ProfileScreen({ resetDemo, profiles, activeProfileId, onSwitch, onCreate, onDelete, onPlaces, pilotUser, onFood }: { resetDemo: () => void; profiles: DemoProfile[]; activeProfileId: string; onSwitch: (id: string) => void; onCreate: (name: string) => void; onDelete: () => void; onPlaces: () => void; pilotUser: PilotUser | null; onFood: () => void }) {
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const keyboard = useKeyboard();
  const active = profiles.find((profile) => profile.id === activeProfileId);
  function ask(action: "reset" | "delete") { keyboard.hide(); setConfirm(action); }
  return <div className="screen profile-screen">
    <Header title="Your BiteFind" /><p className="pilot-lede">A little more personal. Always in your control.</p>
    <section className="profile-card"><div className="profile-avatar"><PersonIcon /></div><div><h2>{pilotUser ? "Private test account" : "Welcome, explorer"}</h2><p>{pilotUser ? pilotUser.email : "Discover campus without signing in"}</p></div></section>
    <button className="settings-row" onClick={onFood}><span className="settings-icon"><PersonIcon /></span><span><strong>{pilotUser ? "Account & food preferences" : API_BASE ? "Food preferences & sign-in" : "Food preferences"}</strong><small>{pilotUser ? "Dietary filters, privacy & account access" : API_BASE ? "Set filters or use your tester invitation" : "Dietary filters and official source guidance"}</small></span><ChevronRightIcon /></button>
    <button className="settings-row" onClick={onPlaces}><span className="settings-icon"><SewingPinFilledIcon /></span><span><strong>Places & visits</strong><small>Campus map and manual visit history</small></span><ChevronRightIcon /></button>
    <section className="profile-section"><div className="section-heading"><h2>On this device</h2><span>Local demo</span></div><p>{active ? `${active.name}'s budget and manual visits are saved in this browser.` : "Guest budget changes last for this session. Create a local profile to keep a demo plan and manual visits."}</p>
      <details className="plain-details"><summary>Manage local profiles <span>{active?.name ?? "Guest"}</span></summary><p>Local profiles are separate from private test accounts. They do not provide secure sign-in.</p>
        <div className="profile-switch"><button aria-pressed={activeProfileId === "guest"} className={activeProfileId === "guest" ? "selected" : ""} onClick={() => onSwitch("guest")}>Guest</button>{profiles.map((profile) => <button key={profile.id} aria-pressed={activeProfileId === profile.id} className={activeProfileId === profile.id ? "selected" : ""} onClick={() => onSwitch(profile.id)}>{profile.name}</button>)}</div>
        {profiles.length < 8 && <div className="profile-create"><label>Display name<KeyboardInput value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" /></label><button className="secondary-button" disabled={!name.trim()} onClick={() => { onCreate(name); setName(""); }}>Create local profile</button></div>}
        {active && <button className="reset-button" onClick={() => ask("delete")}>Delete this local profile</button>}
      </details>
    </section>
    <div className="source-footnote"><InfoCircledIcon /><p>BiteFind is independent and not affiliated with OSU. Location is requested only when you choose a location feature. In-app allergen facts still need current source review.</p></div>
    <button className="reset-button" onClick={() => ask("reset")}><ReloadIcon /> Reset current demo data</button>
    <BottomSheet open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }} title={confirm === "delete" ? "Delete this local profile?" : "Reset demo data?"} description={confirm === "delete" ? `This removes ${active?.name ?? "this profile"}'s local budget and manual visit history from this browser.` : active ? "This restores the sample budget and clears this local profile's saved demo history and preferences." : "This restores the guest calculator to its starting sample balance and days."} snap={0.4}>
      <div className="confirm-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Keep my data</button><button className="danger-button" onClick={() => { if (confirm === "delete") onDelete(); else resetDemo(); setConfirm(null); }}>{confirm === "delete" ? "Delete local profile" : "Reset demo data"}</button></div>
    </BottomSheet>
  </div>;
}

const FENCE_KEY = "bitefind-demo-fences-v1";
const PIN_KEY = "bitefind-demo-pins-v1";
function readFences(): Record<string, Bounds> { try { const value = JSON.parse(localStorage.getItem(FENCE_KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
type Pin = { lat: number; lon: number };
function readPins(): Record<string, Pin> { try { const value = JSON.parse(localStorage.getItem(PIN_KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
function PlacesScreen({ activeProfile, pilotUser, onVisit, venueId, onChooseVenue, onFood }: { activeProfile?: DemoProfile; pilotUser: PilotUser | null; onVisit: (venueId: string) => void; venueId: string; onChooseVenue: (id: string) => void; onFood: () => void }) {
  const keyboard = useKeyboard();
  const mapCard = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [fences, setFences] = useState<Record<string, Bounds>>(readFences);
  const [pins, setPins] = useState<Record<string, Pin>>(readPins);
  const [draft, setDraft] = useState<Bounds | null>(null);
  const [mapMode, setMapMode] = useState<"browse" | "pin" | "box-first" | "box-second">("browse");
  const [firstCorner, setFirstCorner] = useState<Pin | null>(null);
  const [watching, setWatching] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Off · no device location requested");
  const [published, setPublished] = useState<PilotVenue[]>([]);
  const [geometrySource, setGeometrySource] = useState("");
  const [surveyConfirmed, setSurveyConfirmed] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [historyBuckets, setHistoryBuckets] = useState<{ weekday: string; hour: number; medianMinutes: number; contributors: number; observedDays: number }[]>([]);
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState("No walking route requested.");
  const [routeBusy, setRouteBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const routeRun = useRef(0);
  const directory = useRef<HTMLDetailsElement>(null);
  const venue = OSU_VENUES.find((item) => item.id === venueId)!;
  const currentFence = draft ?? fences[venueId] ?? null;
  const candidates = OSU_VENUES.filter((item) => `${item.name} ${item.area}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => { if (search.trim() && directory.current) directory.current.open = true; }, [search]);
  const approved = published.find((item) => item.id === venueId && item.geometry);
  const buildingPoint = buildingForVenue(venueId);
  const mapPins = { ...pins, ...Object.fromEntries(published.filter((item) => item.geometry && item.lat !== null && item.lon !== null).map((item) => [item.id, { lat: item.lat!, lon: item.lon! }])) };
  const mapFence = draft ?? fences[venueId] ?? approved?.geometry ?? null;
  useEffect(() => {
    let current = true;
    if (pilotUser) pilotRequest<{ venues: PilotVenue[] }>("catalog").then((catalog) => { if (current) setPublished(catalog.venues); }).catch(() => { if (current) setPublishStatus("Could not load reviewed map locations. Local drafts remain available."); });
    else setPublished([]);
    return () => { current = false; };
  }, [pilotUser?.id]);
  useEffect(() => {
    let current = true;
    if (pilotUser) pilotRequest<{ buckets: typeof historyBuckets }>(`history?venueId=${encodeURIComponent(venueId)}`).then((result) => { if (current) setHistoryBuckets(result.buckets); }).catch(() => { if (current) setHistoryBuckets([]); });
    else setHistoryBuckets([]);
    return () => { current = false; };
  }, [pilotUser?.id, venueId]);
  async function publishGeometry() {
    const bounds = fences[venueId], pin = pins[venueId];
    if (!pilotUser || pilotUser.role !== "founder" || !validBounds(bounds) || !pin || !surveyConfirmed || !geometrySource.trim()) { setPublishStatus("Save a draft box and pin, enter the review source, and confirm the on-site survey."); return; }
    try {
      await pilotRequest("founder/geometry", "POST", { venueId, ...bounds, pinLat: pin.lat, pinLon: pin.lon, sourceUrl: geometrySource.trim(), reviewedAt: new Date().toISOString() });
      const catalog = await pilotRequest<{ venues: PilotVenue[] }>("catalog"); setPublished(catalog.venues); setPublishStatus("Reviewed geometry published for signed-in testers."); setSurveyConfirmed(false);
    } catch (error) { setPublishStatus((error as Error).message); }
  }
  function geometryReview() {
    return <section className="pilot-panel"><h2>Reviewed map data</h2>
      <p>{pilotUser ? `${published.filter((item) => item.geometry).length} reviewed concepts are available to signed-in testers.` : "Sign in on Food to load reviewed geometry across devices."} {approved?.geometry ? `${venue.name} was reviewed ${new Date(approved.geometry.reviewedAt).toLocaleDateString()}.` : "This concept has no reviewed pin or service area yet."} A local draft never becomes a published location automatically.</p>
      {pilotUser?.role === "founder" && <div className="pilot-review-geometry"><h3>Founder geometry review</h3><p>Save a draft pin and box only after surveying the entrance, service area and GPS behavior on site. An OSU link alone does not verify the footprint.</p><label>OSU source URL<KeyboardInput type="url" value={geometrySource} onChange={(event) => setGeometrySource(event.target.value)} placeholder="https://map.okstate.edu/…" /></label><label className="pilot-check"><input type="checkbox" checked={surveyConfirmed} onChange={(event) => setSurveyConfirmed(event.target.checked)} />I surveyed this venue and reviewed its service area</label><button className="secondary-button" disabled={!validBounds(fences[venueId]) || !pins[venueId] || !surveyConfirmed || !geometrySource} onClick={publishGeometry}>Publish reviewed geometry</button><p role="status">{publishStatus}</p></div>}
    </section>;
  }
  function stopWatch() { if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); watchId.current = null; setWatching(false); setLocationStatus("Off · no device location requested"); }
  useEffect(() => { const onHidden = () => { if (document.hidden && watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; setWatching(false); setLocationStatus("Paused when the page was hidden"); } }; document.addEventListener("visibilitychange", onHidden); return () => { routeRun.current++; document.removeEventListener("visibilitychange", onHidden); if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }; }, []);
  function chooseVenue(id: string) { keyboard.hide(); setSearch(""); if (directory.current) directory.current.open = false; stopWatch(); routeRun.current++; onChooseVenue(id); setDraft(null); setMapMode("browse"); setFirstCorner(null); setRoute(null); setRouteBusy(false); setRouteStatus("No walking route requested."); }
  function calculateWalkingRoute() {
    if (!buildingPoint || !window.isSecureContext || !navigator.geolocation) { setRouteStatus("Walking route unavailable; use the official campus map."); return; }
    const run = ++routeRun.current;
    setRouteBusy(true); setRoute(null); setRouteStatus("Requesting one device location fix…");
    navigator.geolocation.getCurrentPosition(async (position) => {
      if (run !== routeRun.current) return;
      if (position.coords.accuracy > 100 || Date.now() - position.timestamp > 30000) { setRouteStatus("Location is too uncertain or old for a walking route."); setRouteBusy(false); return; }
      try {
        setRouteStatus("Calculating a pedestrian route…");
        const result = await walkingRoute({ lat: position.coords.latitude, lon: position.coords.longitude }, buildingPoint);
        if (run === routeRun.current) { setRoute(result); setRouteStatus("Route calculated to the building center; find the correct entrance and counter on arrival."); }
      } catch (error) { if (run === routeRun.current) setRouteStatus((error as Error).message); }
      finally { if (run === routeRun.current) setRouteBusy(false); }
    }, (error) => { if (run === routeRun.current) { setRouteStatus(error.code === 1 ? "Location permission denied. Choose a building manually." : "Could not get your location. Try again outdoors."); setRouteBusy(false); } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
  }
  function directions() {
    return <section className="walking-card"><h2>Walk to {venue.name}</h2><p>{buildingPoint ? `${buildingPoint.label} is an approximate building-level destination from OpenStreetMap; the indoor counter and entrance have not been surveyed.` : "No building point is available yet."} The route service may miss campus shortcuts or access restrictions.</p><button className="primary-button" disabled={!buildingPoint || routeBusy} onClick={calculateWalkingRoute}>Calculate walking route</button><p className="data-note">This one-time action sends your current coordinates and the building point to the external Valhalla pedestrian routing demo. BiteFind does not store either route or your GPS fix.</p>{route && <strong>{(route.meters / 1000).toFixed(2)} km · about {route.minutes} min walking</strong>}<p role="status">{routeStatus}</p><div className="walk-links">{buildingPoint && <a href={`https://www.google.com/maps/dir/?api=1&destination=${buildingPoint.lat}%2C${buildingPoint.lon}&travelmode=walking`} target="_blank" rel="noreferrer">Open Google walking directions ↗</a>}<a href="https://map.okstate.edu/?id=1842" target="_blank" rel="noreferrer">Official OSU wayfinding ↗</a>{buildingPoint && <a href={`https://www.openstreetmap.org/way/${buildingPoint.osmWayId}`} target="_blank" rel="noreferrer">Building map source ↗</a>}</div></section>;
  }
  function scrollToMap() {
    keyboard.hide();
    window.requestAnimationFrame(() => {
      const card = mapCard.current, scroll = card?.closest(".mobile-scroll");
      if (!(card instanceof HTMLElement) || !(scroll instanceof HTMLElement)) return;
      const viewport = scroll.getBoundingClientRect(), scale = viewport.width / scroll.clientWidth;
      scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + (card.getBoundingClientRect().top - viewport.top) / scale - 62), behavior: "smooth" });
    });
  }
  function onMapPick(lat: number, lon: number) {
    const rounded: Pin = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
    if (mapMode === "pin") { const next = { ...pins, [venueId]: rounded }; setPins(next); localStorage.setItem(PIN_KEY, JSON.stringify(next)); setMapMode("browse"); }
    else if (mapMode === "box-first") { stopWatch(); setFirstCorner(rounded); setMapMode("box-second"); }
    else if (mapMode === "box-second" && firstCorner) { setDraft({ north: Math.max(firstCorner.lat, rounded.lat), south: Math.min(firstCorner.lat, rounded.lat), east: Math.max(firstCorner.lon, rounded.lon), west: Math.min(firstCorner.lon, rounded.lon) }); setFirstCorner(null); setMapMode("browse"); }
  }
  function startWatch() {
    if (!validBounds(fences[venueId] ?? approved?.geometry ?? null)) { setLocationStatus("Save a valid area before opting in."); return; }
    if (!window.isSecureContext || !navigator.geolocation) { setLocationStatus("Device location is unavailable in this browser context."); return; }
    setLocationStatus("Requesting browser permission…");
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const result = evaluateGeofence(fences[venueId] ?? approved?.geometry ?? null, position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      setLocationStatus(`${result === "inside" ? "Inside area" : result === "outside" ? "Outside area" : "Uncertain near boundary or low accuracy"} · ±${Math.round(position.coords.accuracy)} m · device only`);
    }, (error) => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; setWatching(false); setLocationStatus(error.code === 1 ? "Permission denied · tracking off" : "Location unavailable · try again outdoors"); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    setWatching(true);
  }
  return <div className="screen places-screen"><Header title="Your campus, mapped." /><p className="pilot-lede">27 dining spots. Find a place and plan your walk.</p><div className="search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label="Search OSU dining directory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a dining concept…" /></div><div className="directory-count">{candidates.length} OSU dining options · <a href={OSU_DIRECTORY_URL} target="_blank" rel="noreferrer">Official directory ↗</a></div><details className="venue-select" ref={directory}><summary>Choose a dining spot<span>{venue.name}</span></summary><div role="group" aria-label="Dining concepts">{!candidates.length && <div className="empty-state"><MagnifyingGlassIcon /><strong>No dining spots found</strong><p>Try a restaurant or building name.</p><button className="secondary-button" onClick={() => { keyboard.hide(); setSearch(""); }}>Clear search</button></div>}{OSU_AREAS.map((area) => { const rows = candidates.filter((item) => item.area === area.name); return rows.length ? <section key={area.name}><h2>{area.name}</h2><div>{rows.map((item) => <button key={item.id} className={venueId === item.id ? "selected" : ""} onClick={() => chooseVenue(item.id)}>{item.name}{item.access && <small>{item.access}</small>}</button>)}</div></section> : null; })}</div>
    </details><section className="map-view-card" ref={mapCard}><div className="map-caption"><SewingPinFilledIcon /><span>Approximate building location</span></div>{mapMode !== "browse" && <div className="map-prompt" role="status"><strong>{mapMode === "pin" ? "Tap to place the venue pin" : mapMode === "box-first" ? "Tap the first box corner" : "Tap the opposite box corner"}</strong><button onClick={() => { setMapMode("browse"); setFirstCorner(null); }}>Cancel drawing</button></div>}<RealMap venueId={venueId} venueName={venue.name} pins={mapPins} fence={mapFence} firstCorner={firstCorner} buildingPoint={buildingPoint} mapMode={mapMode} onPick={onMapPick} /></section>
    <section className="venue-insight"><span className="eyebrow">YOUR DINING SPOT</span><h2>{venue.name}</h2><p>{venue.area} · OSU directory listing</p><button className="secondary-button" onClick={onFood}>Explore menus & food sources <ChevronRightIcon /></button><details className="plain-details"><summary>Wait & visit insights</summary><div className="availability-grid"><div><strong>Wait time</strong><span>Unavailable</span><small>No measured or validated estimate</small></div><div><strong>Live activity</strong><span>Unavailable</span><small>No participating-user data</small></div></div><p className="data-note">A geofence presence signal would indicate participating phones in an area, not queue length. Do not infer a wait from this demo.</p><VenueHistory buckets={historyBuckets} /></details></section>
    {directions()}<details className="advanced-details"><summary>Map & area tools<span>Draft pins, geofences & location checks</span></summary><section className="fence-editor"><h2>Map & restaurant area</h2><p>OpenStreetMap base map. Select a concept, then place its pin or tap two corners to draw a geofence. Eight building centers are source-backed reference points; counter pins and boxes are local drafts until surveyed. A map tile request is sent to OpenStreetMap when this screen loads.</p><div className="map-mode-row"><button className={mapMode === "pin" ? "selected" : ""} onClick={() => { stopWatch(); setMapMode("pin"); setFirstCorner(null); scrollToMap(); }}>Place {venue.name} pin</button><button className={mapMode.startsWith("box") ? "selected" : ""} onClick={() => { stopWatch(); setMapMode("box-first"); setFirstCorner(null); scrollToMap(); }}>Draw two-corner box</button></div><p className="map-status" role="status">{mapMode === "pin" ? "Tap the venue point on the map." : mapMode === "box-first" ? "Tap the first box corner." : mapMode === "box-second" ? "Tap the opposite box corner." : `${Object.keys(pins).length} of ${OSU_VENUES.length} concepts have locally placed pins.`}</p><div className="bounds-grid">{(["north", "south", "west", "east"] as const).map((key) => <label key={key}>{key}<KeyboardInput inputMode="decimal" aria-label={`${key} boundary`} value={currentFence?.[key] ?? ""} onChange={(event) => { stopWatch(); setMapMode("browse"); setDraft({ ...(currentFence ?? { north: 0, south: 0, west: 0, east: 0 }), [key]: Number(event.target.value) }); }} /></label>)}</div><div className="fence-actions"><button className="secondary-button" disabled={!validBounds(currentFence)} onClick={() => { if (!validBounds(currentFence)) return; const next = { ...fences, [venueId]: currentFence }; setFences(next); localStorage.setItem(FENCE_KEY, JSON.stringify(next)); setDraft(null); }}>Save this box</button><button className="reset-button" onClick={() => { stopWatch(); const next = { ...fences }; delete next[venueId]; setFences(next); localStorage.setItem(FENCE_KEY, JSON.stringify(next)); setDraft(null); }}>Clear box</button></div><button className="reset-button" onClick={() => { const next = { ...pins }; delete next[venueId]; setPins(next); localStorage.setItem(PIN_KEY, JSON.stringify(next)); }}>Clear {venue.name} pin</button><p className="data-note">{validBounds(fences[venueId]) ? "Draft box saved locally. Verify its actual footprint before publishing." : "No local draft geofence for this venue."}</p></section>
    {geometryReview()}<section className="tracking-card"><h2>Opt-in location check</h2><p>Only while this screen is visible, compare your device position with this saved rectangle. Raw coordinates stay in memory, are never uploaded or added to visit history, and are cleared when you stop or leave the screen. Browser permission is separate.</p><strong role="status">{locationStatus}</strong><button className="primary-button" disabled={!watching && !validBounds(fences[venueId] ?? approved?.geometry ?? null)} onClick={watching ? stopWatch : startWatch}>{watching ? "Stop location watch" : "Start device-only watch"}</button><button className="secondary-button" onClick={() => { const b = fences[venueId] ?? approved?.geometry; setLocationStatus(`Simulation: ${evaluateGeofence(b ?? null, b ? (b.north + b.south) / 2 : 0, b ? (b.east + b.west) / 2 : 0, 10)} · no GPS requested`); }}>Simulate a point in this area</button></section>
    </details><details className="advanced-details"><summary>My manual visit history<span>Saved only in this browser</span></summary><section className="visit-history"><h2>My demo visit history</h2><p>Manual entries only. This history belongs to the active local profile and is never inferred from GPS.</p><button className="secondary-button" onClick={() => onVisit(venueId)}>Add manual demo visit to {venue.name}</button>{activeProfile?.visits.length ? activeProfile.visits.map((visit, index) => <div key={`${visit.at}-${index}`}><strong>{OSU_VENUES.find((item) => item.id === visit.venueId)?.name ?? "Dining location"}</strong><time>{new Date(visit.at).toLocaleString()}</time></div>) : <p>No visits saved for this local profile.</p>}</section></details><p className="pilot-footer">Building centers are approximate. Entrances, indoor counters and service areas still need on-site review. Map tiles: OpenStreetMap.</p></div>;
}

function VenueHistory({ buckets }: { buckets: { weekday: string; hour: number; medianMinutes: number; contributors: number; observedDays: number }[] }) {
  return <div className="venue-history"><h3>Typical reported wait</h3>{buckets.length ? <><p>Median queue time from opt-in reports over the past 28 days. This measures participating reporters, not every visitor or live occupancy.</p>{buckets.map((bucket) => <div key={`${bucket.weekday}-${bucket.hour}`}><strong>{bucket.weekday} {new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, bucket.hour)))}</strong><span>{bucket.medianMinutes} min · {bucket.contributors} people across {bucket.observedDays} days</span></div>)}</> : <p>No validated historical pattern. At least ten distinct opt-in reporters across three separate days are needed for each weekday and hour. The app cannot say whether this place is busier than usual yet.</p>}</div>;
}

function RealMap({ venueId, venueName, pins, fence, firstCorner, buildingPoint, mapMode, onPick }: { venueId: string; venueName: string; pins: Record<string, Pin>; fence: Bounds | null; firstCorner: Pin | null; buildingPoint: BuildingPoint | null; mapMode: "browse" | "pin" | "box-first" | "box-second"; onPick: (lat: number, lon: number) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const instance = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!node.current) return;
    const map = L.map(node.current, { scrollWheelZoom: false, minZoom: 13, maxZoom: 19 }).setView([36.123, -97.070], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
    instance.current = map; overlay.current = L.layerGroup().addTo(map);
    const refresh = window.setTimeout(() => map.invalidateSize(), 0);
    return () => { window.clearTimeout(refresh); map.remove(); instance.current = null; overlay.current = null; };
  }, []);
  useEffect(() => {
    const map = instance.current; if (!map) return;
    const handle = (event: L.LeafletMouseEvent) => { if (mapMode !== "browse") onPick(event.latlng.lat, event.latlng.lng); };
    map.on("click", handle); return () => { map.off("click", handle); };
  }, [mapMode, onPick]);
  useEffect(() => {
    const layer = overlay.current; if (!layer) return;
    layer.clearLayers();
    BUILDING_POINTS.forEach((point) => {
      L.circleMarker([point.lat, point.lon], { radius: point.id === buildingPoint?.id ? 8 : 5, color: point.id === buildingPoint?.id ? "#f65a1b" : "#1f6d75", fillColor: point.id === buildingPoint?.id ? "#ff743c" : "#4e9ba2", fillOpacity: 0.9, weight: 2 }).bindTooltip(`${point.label} · approximate building center`).addTo(layer);
    });
    Object.entries(pins).forEach(([id, pin]) => {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lon)) return;
      const label = OSU_VENUES.find((item) => item.id === id)?.name ?? "Dining concept";
      L.circleMarker([pin.lat, pin.lon], { radius: id === venueId ? 8 : 5, color: id === venueId ? "#ff5a1f" : "#373a37", fillColor: id === venueId ? "#ff5a1f" : "#373a37", fillOpacity: 0.85 }).bindTooltip(`${label} · venue-specific pin`).addTo(layer);
    });
    if (validBounds(fence)) L.rectangle([[fence.south, fence.west], [fence.north, fence.east]], { color: "#ff5a1f", weight: 2, fillOpacity: 0.18 }).bindTooltip(`${venueName} · unverified box`).addTo(layer);
    if (firstCorner) L.circleMarker([firstCorner.lat, firstCorner.lon], { radius: 6, color: "#ff5a1f" }).addTo(layer);
  }, [pins, venueId, venueName, fence, firstCorner, buildingPoint]);
  useEffect(() => { const pin = pins[venueId] ?? buildingPoint; if (pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lon)) instance.current?.panTo([pin.lat, pin.lon]); }, [venueId, buildingPoint]);
  return <div ref={node} className="real-map" data-scroll-drag="ignore" aria-label={`OpenStreetMap campus view for ${venueName}`} />;
}
function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) { const { bottomInset, isKeyboardVisible } = useKeyboardInsets(); const items: {id:Tab;label:string;icon:React.ReactNode}[] = [{id:"home",label:"Home",icon:<HomeIcon/>},{id:"food",label:"Food",icon:<MagnifyingGlassIcon/>},{id:"places",label:"Places",icon:<SewingPinFilledIcon/>},{id:"plan",label:"Plan",icon:<BookmarkIcon/>},{id:"profile",label:"Profile",icon:<PersonIcon/>}]; return <nav className="bottom-nav" aria-label="Primary navigation" style={{ bottom: isKeyboardVisible ? bottomInset : 0, paddingBottom: isKeyboardVisible ? 7 : bottomInset + 7, minHeight: 66 + (isKeyboardVisible ? 0 : bottomInset) }}>{items.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => onChange(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>; }
function formatMoney(value: number) { return value.toLocaleString("en-US", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

type PilotUser = { id: string; email: string; campusId: string; role: "student" | "founder" };
type PilotMe = { alias: string; favorites: string[]; activeQueue: { id: string; venueId: string; startedAt: string; status: string } | null; activeSeat: { id: string; venueId: string; startedAt: string; status: string } | null; feedbackCount: number };
type PilotFeedback = { id: string; venueId: string; venueName: string; food: string | null; service: string | null; issue: string | null; createdAt: string; reviewedAt: string | null };
const API_BASE = String(import.meta.env.VITE_BITEFIND_API_BASE || (import.meta.env.DEV ? "http://127.0.0.1:8789" : ""));
async function pilotRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api/${path}`, { method, credentials: "include", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed. Please try again.");
  return body as T;
}
function FoodScreen({ onSession, selected, setSelected, panel, setPanel, onPlaces }: { onSession: (user: PilotUser | null) => void; selected: string; setSelected: (id: string) => void; panel: FoodPanel; setPanel: (panel: FoodPanel) => void; onPlaces: () => void }) {
  const keyboard = useKeyboard();
  const [mode, setMode] = useState<"demo" | "login" | "member">("demo");
  const [apiOnline, setApiOnline] = useState(false);
  const [user, setUser] = useState<PilotUser | null>(null);
  const [me, setMe] = useState<PilotMe | null>(null);
  const [venues, setVenues] = useState<PilotVenue[]>(PILOT_VENUES);
  const [items, setItems] = useState<PilotItem[]>([]);
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [remember, setRemember] = useState(false);
  const [nearby, setNearby] = useState<{ venueId: string; label: string; meters: number }[]>([]);
  const [locationMessage, setLocationMessage] = useState("Location is off. Choose a venue manually.");
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoFavorites, setDemoFavorites] = useState<string[]>([]);
  const [demoFeedback, setDemoFeedback] = useState<PilotFeedback[]>([]);
  const [food, setFood] = useState("");
  const [service, setService] = useState("");
  const [issue, setIssue] = useState("");
  const [queue, setQueue] = useState<PilotMe["activeQueue"]>(null);
  const [seat, setSeat] = useState<PilotMe["activeSeat"]>(null);
  const [seatSummary, setSeatSummary] = useState<{ medianMinutes: number; contributors: number; observedDays: number; periodDays: number } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [founder, setFounder] = useState<{ feedback: PilotFeedback[]; staleItems: number } | null>(null);
  const [waitSummaries, setWaitSummaries] = useState<{ venueId: string; medianMinutes: number; contributors: number; from: string; to: string }[]>([]);
  const pending = useRef<Record<string,string>>({});
  const selectedVenue = venues.find((v) => v.id === selected) ?? venues[0];
  const favorites = mode === "member" ? (me?.favorites ?? []) : demoFavorites;

  useEffect(() => { let current = true; if (API_BASE) pilotRequest("health").then(async () => { if (!current) return; setApiOnline(true); try { const session = await pilotRequest<{ user: PilotUser }>("session"); if (current) await loadMember(session.user); } catch { /* No session; public signup is disabled. */ } }).catch(() => { if (current) setApiOnline(false); }); return () => { current = false; }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { let current = true; if (mode === "member") pilotRequest<{ summary: typeof seatSummary }>(`seats?venueId=${encodeURIComponent(selected)}`).then((result) => { if (current) setSeatSummary(result.summary); }).catch(() => { if (current) setSeatSummary(null); }); else setSeatSummary(null); return () => { current = false; }; }, [mode, selected]);
  async function loadMember(nextUser: PilotUser) {
    const [catalog, profile] = await Promise.all([pilotRequest<{ venues: PilotVenue[]; items: PilotItem[] }>("catalog"), pilotRequest<PilotMe>("me")]);
    setUser(nextUser); onSession(nextUser); setMe(profile); setAlias(profile.alias); setQueue(profile.activeQueue); setSeat(profile.activeSeat); setVenues(catalog.venues); setItems(catalog.items); setMode("member"); setPassword(""); setMessage("");
    pilotRequest<{ summaries: typeof waitSummaries }>("waits").then((data) => setWaitSummaries(data.summaries)).catch(() => setWaitSummaries([]));
    const saved = localStorage.getItem(`bitefind-pilot-settings-${nextUser.id}`);
    if (saved) { try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) { setRestrictions(parsed.filter((v) => DIETARY_RESTRICTIONS.some((option) => option.id === v))); setRemember(true); } } catch { /* Ignore invalid local preferences. */ } }
  }
  async function signIn() {
    keyboard.hide(); setBusy(true); setMessage("");
    try { const result = await pilotRequest<{ user: PilotUser }>("login", "POST", { email, password }); await loadMember(result.user); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setBusy(false); setPassword(""); }
  }
  async function signOut() {
    keyboard.hide(); setBusy(true);
    try { await pilotRequest("logout", "POST"); } catch { setMessage("Could not end your server session. Check the connection and try signing out again."); return; } finally { setBusy(false); }
    if (user) localStorage.removeItem(`bitefind-pilot-settings-${user.id}`);
    setUser(null); onSession(null); setMe(null); setQueue(null); setSeat(null); setFounder(null); setWaitSummaries([]); setRestrictions([]); setRemember(false); setNearby([]); setMode("demo"); setVenues(PILOT_VENUES); setItems([]); setMessage("Signed out. Local dietary settings cleared.");
  }
  async function changePassword() {
    keyboard.hide(); setBusy(true); setMessage("");
    try { await pilotRequest("password", "POST", { currentPassword, newPassword }); setMessage("Password changed. Other sessions were signed out."); }
    catch (error) { setMessage((error as Error).message); }
    finally { setCurrentPassword(""); setNewPassword(""); setBusy(false); }
  }
  async function saveAlias() {
    keyboard.hide(); setBusy(true); setMessage("");
    try { const updated = await pilotRequest<PilotMe>("profile", "POST", { alias }); setMe(updated); setAlias(updated.alias); setMessage("Display name saved to your private account."); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function exportAccount() {
    setBusy(true); setMessage("");
    try {
      const record = await pilotRequest<unknown>("export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "bitefind-my-test-data.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Your account data was downloaded. Keep the file private.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteAccount() {
    keyboard.hide(); setBusy(true); setMessage("");
    try {
      await pilotRequest("me", "DELETE", { password: deletePassword });
      if (user) localStorage.removeItem(`bitefind-pilot-settings-${user.id}`);
      setUser(null); onSession(null); setMe(null); setQueue(null); setSeat(null); setFounder(null); setWaitSummaries([]); setRestrictions([]); setRemember(false); setNearby([]); setVenues(PILOT_VENUES); setItems([]); setMode("demo"); setPanel("find");
      setMessage("Your private test account and its server records were deleted.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setDeletePassword(""); setDeleteConfirmation(""); setBusy(false); }
  }
  function accountControls() {
    if (mode !== "member") return null;
    return <div className="pilot-panel"><h2>My test data</h2><p>Download your account profile, favorites, feedback and queue reports. This file contains private information; keep it secure. Device-only sample profiles and settings are separate.</p><button className="pilot-outline" disabled={busy} onClick={exportAccount}>Download my data</button><h3>Delete private test account</h3><p>This permanently removes your account, favorites, feedback, queue reports and sessions from this local service. Download your data first if needed. Type DELETE and enter your password to confirm.</p><label>Type DELETE<KeyboardInput value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><label>Current password<KeyboardInput type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label><button className="pilot-outline" disabled={busy || deleteConfirmation !== "DELETE" || !deletePassword} onClick={deleteAccount}>Delete my test account</button></div>;
  }
  function profileEditor() {
    return mode === "member" && <div className="pilot-panel"><h2>My private profile</h2><p>{user?.email} · {user?.role}. Only your account can edit this display name. Demo profiles on the other screens are separate.</p><label>Display name<KeyboardInput value={alias} maxLength={40} onChange={(event) => setAlias(event.target.value)} /></label><button className="pilot-outline" disabled={busy || alias.trim().length < 2 || alias.trim() === me?.alias} onClick={saveAlias}>Save display name</button></div>;
  }
  function updateRestrictions(next: Restriction[]) {
    setRestrictions(next);
    if (remember && user) localStorage.setItem(`bitefind-pilot-settings-${user.id}`, JSON.stringify(next));
  }
  function clearSettings() {
    if (user) localStorage.removeItem(`bitefind-pilot-settings-${user.id}`);
    setRestrictions([]); setRemember(false); setNearby([]); setLocationMessage("Location is off. Choose a venue manually."); setMessage("Local settings cleared.");
  }
  function findNearby() {
    setNearby([]); setLocationMessage("Requesting one location fix…");
    if (!window.isSecureContext || !navigator.geolocation) { setLocationMessage("Location unavailable. Choose a venue manually."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (Date.now() - position.timestamp > 30000 || ![latitude,longitude,accuracy].every(Number.isFinite) || accuracy > 75) { setLocationMessage("Position is too old or uncertain. Choose a venue manually."); return; }
      const ranked = BUILDING_POINTS.map((point) => ({ venueId: ("venueId" in point ? point.venueId : venues.find((v) => v.area === point.area)?.id) ?? "", label: point.label, meters: approxMeters(latitude, longitude, point.lat, point.lon) })).filter((entry) => entry.venueId).sort((a,b) => a.meters - b.meters);
      setNearby(ranked); setLocationMessage(ranked.length ? "Straight-line distance to a building center, not walking distance. Use Places for a pedestrian route." : "No mapped building points are configured yet. Choose a venue manually.");
    }, (error) => setLocationMessage(error.code === 1 ? "Location denied. Choose a venue manually." : "Location timed out or failed. Choose a venue manually."), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  }
  async function toggleFavorite() {
    if (mode !== "member") { setDemoFavorites((current) => current.includes(selected) ? current.filter((id) => id !== selected) : [...current, selected]); return; }
    try { const result = await pilotRequest<PilotMe>("favorite", "POST", { venueId: selected, selected: !favorites.includes(selected) }); setMe(result); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function queueAction(action: "start" | "finish" | "cancel") {
    setBusy(true); setMessage("");
    try {
      if (mode === "demo") {
        if (action === "start") setQueue({ id: crypto.randomUUID(), venueId: selected, startedAt: new Date().toISOString(), status: "active" });
        else { setQueue(null); setMessage(action === "finish" ? "Sample timer completed locally. This is not a measured wait." : "Sample timer cancelled."); }
      } else {
        const key = action === "start" ? `start-${selected}` : `${action}-${queue?.id}`;
        const requestId = pending.current[key] ?? crypto.randomUUID(); pending.current[key] = requestId;
        const result = await pilotRequest<PilotMe["activeQueue"]>(`queue/${action}`, "POST", action === "start" ? { venueId: selected, requestId } : { id: queue?.id, requestId });
        delete pending.current[key]; setQueue(action === "start" ? result : null);
        if (action === "finish") { setMessage("Test contribution saved. Reported waits need a sufficiently large genuine cohort."); pilotRequest<{ summaries: typeof waitSummaries }>("waits").then((updated) => setWaitSummaries(updated.summaries)).catch(() => setWaitSummaries([])); }
      }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function seatAction(action: "start" | "finish" | "cancel") {
    if (mode !== "member") { setMessage("Sign in to use an optional seated-time test report."); return; }
    setBusy(true); setMessage("");
    try {
      const key = action === "start" ? `seat-start-${selected}` : `seat-${action}-${seat?.id}`;
      const requestId = pending.current[key] ?? crypto.randomUUID(); pending.current[key] = requestId;
      const result = await pilotRequest<PilotMe["activeSeat"]>(`seat/${action}`, "POST", action === "start" ? { venueId: selected, requestId } : { id: seat?.id, requestId });
      delete pending.current[key]; setSeat(action === "start" ? result : null);
      setMessage(action === "finish" ? "Test seated-time report saved. It does not create a live occupancy estimate." : action === "cancel" ? "Seated-time report cancelled." : "Seated-time test started. End it when you leave the table.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function sendFeedback() {
    if (!food && !service && !issue) { setMessage("Choose at least one response."); return; }
    setBusy(true); setMessage("");
    try {
      if (mode === "demo") {
        if (demoFeedback.some((f) => f.venueId === selected && f.createdAt.slice(0,10) === new Date().toISOString().slice(0,10))) throw new Error("One sample report per venue today.");
        setDemoFeedback((current) => [{ id: crypto.randomUUID(), venueId: selected, venueName: selectedVenue.name, food: food || null, service: service || null, issue: issue || null, createdAt: new Date().toISOString(), reviewedAt: null }, ...current]);
        setMessage("Sample feedback saved in this session only.");
      } else {
        const key = `feedback-${selected}`; pending.current[key] ??= crypto.randomUUID();
        await pilotRequest("feedback", "POST", { venueId: selected, food: food || null, service: service || null, issue: issue || null, requestId: pending.current[key] }); delete pending.current[key];
        setMe((current) => current && ({ ...current, feedbackCount: current.feedbackCount + 1 })); setMessage("Private test feedback saved.");
      }
      setFood(""); setService(""); setIssue("");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function openFounder() {
    setPanel("founder"); if (mode !== "member") { setFounder({ feedback: demoFeedback, staleItems: items.length }); return; }
    try { setFounder(await pilotRequest("founder")); } catch (error) { setMessage((error as Error).message); }
  }
  async function reviewFeedback(id: string) {
    if (mode === "demo") { setDemoFeedback((current) => current.map((f) => f.id === id ? { ...f, reviewedAt: new Date().toISOString() } : f)); setFounder((current) => current && ({ ...current, feedback: current.feedback.map((f) => f.id === id ? { ...f, reviewedAt: new Date().toISOString() } : f) })); return; }
    try { await pilotRequest("founder/review", "POST", { id }); setFounder(await pilotRequest("founder")); } catch (error) { setMessage((error as Error).message); }
  }
  function chooseFood(id: string) { keyboard.hide(); setSelected(id); setItemId(null); setSearch(""); }
  const list = items.filter((item) => !item.isDemo && item.venueId === selected && (!search || item.name.toLowerCase().includes(search.toLowerCase())));
  const matching = list.filter((item) => ["no-listed-conflict", "unassessed"].includes(assessItem(item, restrictions).state));
  const uncertain = list.filter((item) => assessItem(item, restrictions).state === "verify");
  const conflicts = list.filter((item) => assessItem(item, restrictions).state === "conflict");
  const detailItem = list.find((item) => item.id === itemId);
  const reportedWait = mode === "member" ? waitSummaries.find((summary) => summary.venueId === selected) : null;

  return <div className="screen pilot-screen"><div className="pilot-brand"><Brand /><span>OSU pilot</span></div>
    <h1>Find your next bite.</h1><p className="pilot-lede">Explore 27 campus dining spots, all in one place.</p>
    <div className="account-strip"><span><span className={`connection-dot ${mode === "member" ? "connected" : ""}`} />{mode === "member" ? "Private test connected" : "Official menu sources"}</span>{apiOnline && mode === "demo" && <button onClick={() => { keyboard.hide(); setMode("login"); setMessage(""); }}>Tester sign-in <ChevronRightIcon /></button>}</div>
    {mode === "login" && <div className="pilot-panel"><h2>Invited tester sign-in</h2><p>No public registration. An operator must provision your private test account.</p><label>Email<KeyboardInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<KeyboardInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="primary-button" disabled={busy || !email || !password} onClick={signIn}>Sign in</button><button className="pilot-text-button" onClick={() => { keyboard.hide(); setMode("demo"); setPassword(""); }}>Browse official sources</button></div>}
    {mode !== "login" && <><nav className="pilot-nav" aria-label="Food sections"><button aria-pressed={panel === "find"} onClick={() => { keyboard.hide(); setPanel("find"); }}>Find food</button><button aria-pressed={panel === "settings"} onClick={() => { keyboard.hide(); setPanel("settings"); }}>My settings</button><button aria-pressed={panel === "feedback"} onClick={() => { keyboard.hide(); setPanel("feedback"); }}>Feedback</button></nav>
      {panel === "find" && <>
        <div className="browse-picker"><PilotConceptPicker venues={venues} selected={selected} onChoose={chooseFood} />
          <details className="plain-details nearby-details"><summary>Browse by area or distance</summary><div className="pilot-venue-row">{venues.filter((v) => v.kind !== "concept").map((v) => <button key={v.id} className={selected === v.id ? "active" : ""} onClick={() => chooseFood(v.id)}>{v.name}</button>)}</div><button className="pilot-text-button" onClick={findNearby}>Find nearby buildings</button><p>{locationMessage}</p>{nearby.map((n) => <button key={n.venueId} className="pilot-nearby" onClick={() => chooseFood(n.venueId)}>{n.label} · about {Math.round(n.meters)} m straight-line</button>)}</details>
        </div>
        {favorites.length > 0 && <details className="saved-spots plain-details"><summary><BookmarkFilledIcon /> Saved spots <span>{favorites.length}</span></summary><div>{favorites.map((id) => <button key={id} onClick={() => chooseFood(id)}>{venues.find((v) => v.id === id)?.name ?? "Dining spot"}<ChevronRightIcon /></button>)}</div><p>{mode === "member" ? "Saved to your private account." : "Kept for this browsing session."}</p></details>}
        <section className="pilot-panel food-venue-card">
          <div className="pilot-row"><div><span className="eyebrow">{selectedVenue.kind === "concept" ? "CAMPUS DINING" : "DINING AREA"}</span><h2>{selectedVenue.name}</h2><p><SewingPinFilledIcon /> {selectedVenue.area}</p></div><button className="save-button" aria-label={`${favorites.includes(selected) ? "Unsave" : "Save"} ${selectedVenue.name}`} aria-pressed={favorites.includes(selected)} onClick={toggleFavorite}>{favorites.includes(selected) ? <BookmarkFilledIcon /> : <BookmarkIcon />}</button></div>
          {selectedVenue.access && <p className="access-note">{selectedVenue.access}</p>}
          <div className="official-menu-links"><a className="menu-primary" href={officialMenuUrl(selected) ?? PILOT_SOURCE} target="_blank" rel="noreferrer">Open official menu <span>↗</span></a><a href={selectedVenue.kind === "concept" ? officialAllergenUrl(selected) : ALLERGEN_GUIDE_URL} target="_blank" rel="noreferrer">{selectedVenue.kind !== "concept" ? "OSU allergen guidance" : officialAllergenLabel(selected)} <span>↗</span></a></div>
          <button className="map-link" onClick={onPlaces}><SewingPinFilledIcon /> View on campus map <ChevronRightIcon /></button>
          <p className="menu-honesty">Official sources open in a new tab. Confirm today's availability and allergens with staff.</p>
        </section>
        <details className="source-disclosure"><summary><InfoCircledIcon /> About menus & allergens</summary><p>Item-level ingredients, allergens, prices and nutrition are not yet verified in BiteFind. A published menu does not prove today's availability. {items.length > 0 && "Operator-reviewed records appear below."}</p><p>Source links checked {MENU_SOURCE_CHECKED_AT}. NetNutrition may show old service dates; check the date and ask staff for current ingredients.</p><a href={ALLERGEN_GUIDE_URL} target="_blank" rel="noreferrer">OSU allergy & cross-contact guidance ↗</a><p>{selectedVenue.hours ? `Published service note: ${selectedVenue.hours}. Confirm before visiting.` : "Current hours are not verified."} <a href={PILOT_SOURCE} target="_blank" rel="noreferrer">OSU directory ↗</a> · checked {PILOT_SOURCE_DATE}.</p></details>
        <details className="plain-details ordering-details"><summary>Campus ordering</summary><p>BiteFind cannot confirm a cart, current price or order status.</p><a href={allowedOrderUrl(selectedVenue.orderUrl) ? selectedVenue.orderUrl : ORDERING_GUIDE} target="_blank" rel="noreferrer">{selectedVenue.orderUrl === ORDERING_GUIDE ? "How campus ordering works ↗" : "Open reviewed ordering link ↗"}</a></details>
        <div className="reviewed-items">
{items.some((item) => !item.isDemo && item.venueId === selected) && <><h3>Operator-reviewed item records</h3><div className="search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label="Search reviewed menu items" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviewed items…" /></div>{matching.length > 0 && <h3>{restrictions.length ? "No listed conflict" : "Browse records"} · {matching.length}</h3>}{matching.map((item) => <PilotItemRow key={item.id} item={item} restrictions={restrictions} onOpen={() => setItemId(item.id)} />)}{uncertain.length > 0 && <h3>Needs verification · {uncertain.length}</h3>}{uncertain.map((item) => <PilotItemRow key={item.id} item={item} restrictions={restrictions} onOpen={() => setItemId(item.id)} />)}{conflicts.length > 0 && <h3>Listed conflict · {conflicts.length}</h3>}{conflicts.map((item) => <PilotItemRow key={item.id} item={item} restrictions={restrictions} onOpen={() => setItemId(item.id)} />)}</>}</div>
                {detailItem && <div className="pilot-panel pilot-detail"><button className="pilot-text-button" onClick={() => setItemId(null)}>← Back to menu</button><h2>{detailItem.name}</h2><span className="pilot-badge">Reviewed source record</span><p>{assessItem(detailItem, restrictions).explanation}</p><dl><dt>Ingredients</dt><dd>{detailItem.ingredients?.join(", ") ?? "Unknown"}</dd><dt>Declared allergens</dt><dd>{detailItem.allergens?.join(", ") || (detailItem.allergens ? "None listed in source" : "Unknown")}</dd><dt>Serving size</dt><dd>{detailItem.serving ?? "Unknown"}</dd><dt>Nutrition</dt><dd>{detailItem.nutrition ? [detailItem.nutrition.calories !== undefined && `${detailItem.nutrition.calories} kcal`, detailItem.nutrition.proteinG !== undefined && `${detailItem.nutrition.proteinG} g protein`, detailItem.nutrition.sodiumMg !== undefined && `${detailItem.nutrition.sodiumMg} mg sodium`].filter(Boolean).join(" · ") : "Not sourced; no values shown."}</dd><dt>Source and freshness</dt><dd>{<><a href={detailItem.sourceUrl ?? PILOT_SOURCE} target="_blank" rel="noreferrer">Review source ↗</a> · checked {detailItem.reviewedAt ? new Date(detailItem.reviewedAt).toLocaleDateString() : "unknown"} · expires {detailItem.expiresAt ? new Date(detailItem.expiresAt).toLocaleDateString() : "unknown"}</>}</dd></dl><p className="pilot-caution">Cross-contact can occur during preparation. This software cannot establish that food is safe for an allergy. Ask dining staff before ordering.</p></div>}
        <details className="advanced-details report-details"><summary><ClockIcon /> Queue reports<span>{queue ? "Timer running" : "Optional test contribution"}</span></summary><div className="pilot-wait">{reportedWait ? `Median reported wait: ${reportedWait.medianMinutes} min · ${reportedWait.contributors} distinct reports. Your wait may differ.` : "No validated recent wait estimate."}</div><div className="pilot-panel"><h2>Optional queue report</h2><p>Measure only from joining a walk-in queue until served. A location fix does not start this timer. Test reports do not create a public wait estimate.</p>{queue ? <><strong>{queue.venueId === selected ? selectedVenue.name : venues.find((v) => v.id === queue.venueId)?.name} · {Math.floor((clock - Date.parse(queue.startedAt))/60000)}m {Math.floor((clock - Date.parse(queue.startedAt))/1000)%60}s</strong><div className="pilot-actions"><button disabled={busy} onClick={() => queueAction("finish")}>I was served</button><button disabled={busy} onClick={() => queueAction("cancel")}>Cancel</button></div></> : <button className="pilot-outline" disabled={busy} onClick={() => queueAction("start")}>Start a test queue report</button>}</div></details></>}
      {panel === "find" && <details className="advanced-details report-details"><summary>Seated-time reports<span>{seat ? "Report in progress" : "Optional test contribution"}</span></summary><div className="pilot-panel"><h2>Optional seated-time report</h2><p>Tap only when you sit down, and end when you leave. This is voluntary self-reporting, not GPS occupancy or a queue wait. Test reports cannot produce a public estimate.</p>{seatSummary ? <strong>Typical reported stay: {seatSummary.medianMinutes} min from {seatSummary.contributors} people across {seatSummary.observedDays} days.</strong> : <p>No validated seated-time pattern. At least ten distinct genuine reporters across three days are required.</p>}{seat ? <><p>Started at {venues.find((v) => v.id === seat.venueId)?.name ?? "a venue"} · {Math.max(0, Math.floor((clock - Date.parse(seat.startedAt)) / 60000))} min</p><div className="pilot-actions"><button disabled={busy} onClick={() => seatAction("finish")}>I left my seat</button><button disabled={busy} onClick={() => seatAction("cancel")}>Cancel</button></div></> : <button className="pilot-outline" disabled={busy || mode !== "member"} onClick={() => seatAction("start")}>I sat down here</button>}</div></details>}
      {panel === "settings" && <>{profileEditor()}<div className="pilot-panel"><h2>Dietary selections</h2><p>On this device only. These are discovery filters for operator-reviewed records, not an allergy-safety guarantee. Missing information remains in a separate verification group. OSU is still reviewing sesame information.</p>{DIETARY_RESTRICTIONS.map(({ id, label }) => <label className="pilot-check" key={id}><input type="checkbox" checked={restrictions.includes(id)} onChange={() => updateRestrictions(restrictions.includes(id) ? restrictions.filter((value) => value !== id) : [...restrictions, id])} />{label}</label>)}<label className="pilot-check"><input type="checkbox" checked={remember} disabled={!user} onChange={(e) => { const checked = e.target.checked; setRemember(checked); if (user) { if (checked) localStorage.setItem(`bitefind-pilot-settings-${user.id}`, JSON.stringify(restrictions)); else localStorage.removeItem(`bitefind-pilot-settings-${user.id}`); } }} />Remember on this device (signed-in test only)</label><button className="pilot-outline" onClick={clearSettings}>Clear my local settings</button></div><div className="pilot-panel"><h2>Privacy and access</h2><p>Independent BiteFind private test, not an OSU service. The nearby button requests one location fix and calculates only on this device; the fix is discarded. Dietary selections stay local. Signed-in favorites, feedback and queue reports are stored by the test operator, who can access them for support. No background tracking, meal-plan connection or public registration.</p><p>{API_BASE ? "Signed-in testers can download or delete their local-service account below. No operator contact has been configured, so do not invite real testers yet." : "This public preview has no connected account service. Demo profiles and manual visits stay in this browser."}</p>{mode === "member" && <button className="pilot-outline" disabled={busy} onClick={signOut}>Sign out and clear local settings</button>}</div>{mode === "member" && <div className="pilot-panel"><h2>Change test password</h2><p>Replace the temporary password supplied by the operator.</p><label>Current password<KeyboardInput type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label><label>New password (12+ characters)<KeyboardInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><button className="pilot-outline" disabled={busy || !currentPassword || newPassword.length < 12} onClick={changePassword}>Change password</button></div>}{mode === "member" && user?.role === "founder" && <button className="pilot-outline" onClick={openFounder}>Open founder review</button>}</>}
      {panel === "settings" && accountControls()}
      {panel === "feedback" && <div className="pilot-panel"><h2>Feedback for {selectedVenue.name}</h2><p>Food and service are separate. One submission per venue per campus day in a signed-in test. No public comments or photos.</p><label>Food quality<select value={food} onChange={(e) => setFood(e.target.value)}><option value="">Unanswered</option><option value="good">Good</option><option value="okay">Okay</option><option value="needs-work">Needs work</option></select></label><label>Service experience<select value={service} onChange={(e) => setService(e.target.value)}><option value="">Unanswered</option><option value="good">Good</option><option value="okay">Okay</option><option value="needs-work">Needs work</option></select></label><label>Issue category<select value={issue} onChange={(e) => setIssue(e.target.value)}><option value="">None</option><option value="unavailable-item">Unavailable item</option><option value="wrong-hours">Wrong hours</option><option value="dietary-info">Missing dietary information</option><option value="long-queue">Long queue</option><option value="other">Other</option></select></label><button className="primary-button" disabled={busy || (!food && !service && !issue)} onClick={sendFeedback}>Submit {mode === "member" ? "private test" : "sample"} feedback</button>{mode === "demo" && <button className="pilot-text-button" onClick={openFounder}>Review sample feedback as founder →</button>}</div>}
      {panel === "founder" && <div className="pilot-panel"><button className="pilot-text-button" onClick={() => setPanel("settings")}>← My settings</button><h2>{mode === "demo" ? "Sample founder view" : "Founder review"}</h2><p>{founder?.staleItems ?? "…"} menu records require current source review. Individual feedback is private to the operator.</p>{founder?.feedback.length ? founder.feedback.map((f) => <div className="pilot-issue" key={f.id}><strong>{f.venueName}</strong><span>Food: {f.food ?? "unanswered"} · Service: {f.service ?? "unanswered"}</span><span>Issue: {f.issue ?? "none"} · {new Date(f.createdAt).toLocaleDateString()}</span>{f.reviewedAt ? <em>Reviewed</em> : <button onClick={() => reviewFeedback(f.id)}>Mark reviewed</button>}</div>) : <p>No feedback submitted in this test yet.</p>}</div>}
    </>}
    {message && <p role="status" className="pilot-message">{message}</p>}
    <p className="pilot-footer">BiteFind · Eat better. Spend smarter.<br />Independent Oklahoma State pilot.</p>
  </div>;
}

function PilotConceptPicker({ venues, selected, onChoose }: { venues: PilotVenue[]; selected: string; onChoose: (id: string) => void }) {
  return <label className="pilot-concept-select">Choose your dining spot
    <select value={venues.find((venue) => venue.id === selected)?.kind === "concept" ? selected : ""} onChange={(event) => onChoose(event.target.value)}>
      <option value="" disabled>Choose a concept…</option>
      {OSU_AREAS.map((area) => <optgroup key={area.name} label={area.name}>{area.venues.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}</optgroup>)}
    </select>
  </label>;
}

function PilotItemRow({ item, restrictions, onOpen }: { item: PilotItem; restrictions: Restriction[]; onOpen: () => void }) {
  const assessment = assessItem(item, restrictions);
  return <button className="pilot-item" onClick={onOpen}><span><strong>{item.name}</strong><small>{assessment.explanation}</small></span><b className={`pilot-state ${assessment.state}`}>{assessment.state === "verify" ? "Verify" : assessment.state === "conflict" ? "Conflict" : "Source checked"}</b></button>;
}
