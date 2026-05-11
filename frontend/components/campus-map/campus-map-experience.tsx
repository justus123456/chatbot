"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DivIcon, LatLngBoundsExpression, LayerGroup, Map as LeafletMap } from "leaflet";
import { Building2, Clock, Crosshair, GraduationCap, Home, ListFilter, MapPin, Navigation, Route, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCampusLocations, type CampusLocation } from "@/lib/api/campus-map";
import { trackEngagement } from "@/lib/api/engagement";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Category = "all" | "office" | "hostel" | "department";

const campusCenter: [number, number] = [9.0687, 7.4898];
const fallbackLocations: CampusLocation[] = [
  {
    id: "office-student-affairs",
    location_name: "Student Affairs Office",
    category: "office",
    description: "Student support, welfare, and campus enquiries.",
    latitude: 9.0691,
    longitude: 7.4892,
  },
  {
    id: "office-bursary",
    location_name: "Bursary Office",
    category: "office",
    description: "School fees, receipts, and payment confirmation.",
    latitude: 9.0683,
    longitude: 7.4902,
  },
  {
    id: "hostel-main",
    location_name: "Main Student Hostel",
    category: "hostel",
    description: "Student accommodation block.",
    latitude: 9.0702,
    longitude: 7.4886,
  },
  {
    id: "hostel-female",
    location_name: "Female Hostel",
    category: "hostel",
    description: "Female student accommodation area.",
    latitude: 9.0708,
    longitude: 7.4903,
  },
  {
    id: "department-computer-science",
    location_name: "Computer Science Department",
    category: "department",
    description: "Department offices and academic enquiries.",
    latitude: 9.0679,
    longitude: 7.4894,
  },
  {
    id: "department-management",
    location_name: "Management Sciences Department",
    category: "department",
    description: "Department offices and lecture support.",
    latitude: 9.0674,
    longitude: 7.4907,
  },
];

const categories: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <MapPin className="size-4" /> },
  { key: "office", label: "Offices", icon: <Building2 className="size-4" /> },
  { key: "hostel", label: "Hostels", icon: <Home className="size-4" /> },
  { key: "department", label: "Departments", icon: <GraduationCap className="size-4" /> },
];

export function CampusMapExperience() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const locationIconRef = useRef<DivIcon | null>(null);
  const selectedIconRef = useRef<DivIcon | null>(null);
  const userLayerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const [locations, setLocations] = useState<CampusLocation[]>(fallbackLocations);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [selectedLocation, setSelectedLocation] = useState<CampusLocation>(fallbackLocations[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingFallback, setUsingFallback] = useState(true);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);

  const validLocations = useMemo(
    () => locations.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number"),
    [locations],
  );
  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return validLocations.filter((location) => {
      const locationCategory = normalizeCategory(location.category);
      const categoryMatch = category === "all" || locationCategory === category;
      const text = `${location.location_name} ${location.description || ""} ${location.category || ""}`.toLowerCase();
      return categoryMatch && (!normalizedQuery || text.includes(normalizedQuery));
    });
  }, [category, query, validLocations]);
  const smartLocations = useMemo(() => {
    return filteredLocations
      .map((location) => ({
        location,
        distanceKm:
          userPosition && typeof location.latitude === "number" && typeof location.longitude === "number"
            ? getDistanceKm(userPosition, { lat: location.latitude, lng: location.longitude })
            : null,
      }))
      .sort((first, second) => {
        if (first.distanceKm !== null && second.distanceKm !== null) return first.distanceKm - second.distanceKm;
        return first.location.location_name.localeCompare(second.location.location_name);
      });
  }, [filteredLocations, userPosition]);
  const selectedDistanceKm =
    userPosition && selectedLocation?.latitude && selectedLocation?.longitude
      ? getDistanceKm(userPosition, { lat: selectedLocation.latitude, lng: selectedLocation.longitude })
      : null;

  useEffect(() => {
    async function loadLocations() {
      setLoading(true);
      setError("");
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const response = await getCampusLocations(data.session?.access_token);
        const usable = response.data.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number");
        if (usable.length) {
          setLocations(usable);
          setSelectedLocation(usable[0]);
          setUsingFallback(false);
        } else {
          setUsingFallback(true);
        }
      } catch (caught) {
        setUsingFallback(true);
        setError(caught instanceof Error ? caught.message : "Could not load campus locations from the database.");
      } finally {
        setLoading(false);
      }
    }

    loadLocations();
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const timeout = window.setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      trackEngagement(
        {
          event_type: "campus_map_search",
          target_table: "campus_map",
          label: value,
          metadata: { category, result_count: filteredLocations.length },
        },
        data.session?.access_token,
      );
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [category, filteredLocations.length, query]);

  useEffect(() => {
    let cancelled = false;

    async function setupMap() {
      if (!mapElementRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapElementRef.current) return;

      const map = L.map(mapElementRef.current, { zoomControl: false }).setView(campusCenter, 17);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20,
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      locationIconRef.current = createMarkerIcon(L, "var(--accent)");
      selectedIconRef.current = createMarkerIcon(L, "#f59e0b");
      mapRef.current = map;
    }

    setupMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      userLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    async function drawMarkers() {
      if (!mapRef.current || !markerLayerRef.current) return;
      const L = await import("leaflet");
      markerLayerRef.current.clearLayers();
      routeLayerRef.current?.clearLayers();

      filteredLocations.forEach((location) => {
        const icon = location.id === selectedLocation?.id ? selectedIconRef.current : locationIconRef.current;
        const marker = L.marker([location.latitude as number, location.longitude as number], { icon: icon || undefined })
          .bindPopup(`<strong>${escapeHtml(location.location_name)}</strong><br />${escapeHtml(location.description || location.category || "")}`)
          .on("click", () => setSelectedLocation(location));
        markerLayerRef.current?.addLayer(marker);
      });

      if (filteredLocations.length) {
        const bounds = filteredLocations.map((location) => [location.latitude as number, location.longitude as number]) as LatLngBoundsExpression;
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
      }

      if (userPosition && selectedLocation?.latitude && selectedLocation?.longitude) {
        L.polyline(
          [
            [userPosition.lat, userPosition.lng],
            [selectedLocation.latitude, selectedLocation.longitude],
          ],
          { color: "#002045", dashArray: "8 8", weight: 4, opacity: 0.8 },
        ).addTo(routeLayerRef.current as LayerGroup);
      }
    }

    drawMarkers();
  }, [filteredLocations, selectedLocation, userPosition]);

  useEffect(() => {
    if (!mapRef.current || !selectedLocation) return;
    mapRef.current.flyTo([selectedLocation.latitude as number, selectedLocation.longitude as number], 18, { duration: 0.6 });
  }, [selectedLocation]);

  async function locateMe() {
    setError("");
    if (!navigator.geolocation) {
      setError("Your browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserPosition(coords);
        const L = await import("leaflet");
        userLayerRef.current?.clearLayers();
        L.circleMarker([coords.lat, coords.lng], {
          radius: 8,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.9,
          weight: 3,
        }).bindPopup("You are here").addTo(userLayerRef.current as LayerGroup);
        mapRef.current?.flyTo([coords.lat, coords.lng], 18);
      },
      () => setError("Location permission was not granted."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function openDirections(location: CampusLocation) {
    const destination = `${location.latitude},${location.longitude}`;
    const origin = userPosition ? `&from=${userPosition.lat},${userPosition.lng}` : "";
    window.open(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot${origin}&to=${destination}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] min-h-[720px] grid-cols-1 overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel)] shadow-glass lg:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="z-[510] flex min-h-0 flex-col border-b border-[var(--border-soft)] bg-[var(--panel)] lg:border-b-0 lg:border-r">
        <div className="border-b border-[var(--border-soft)] p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-mint">
            <Sparkles className="size-4" />
            Smart Campus Map
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--text-main)]">Find places faster.</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Search offices, hostels, and departments, then get distance and walking directions from your current location.
          </p>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3">
            <Search className="size-5 text-[var(--text-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]"
              placeholder="Search bursary, hostel, CS department..."
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                  category === item.key
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-muted)] hover:border-[var(--accent-soft)] hover:text-[var(--accent)]",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" className="justify-center text-white" onClick={locateMe}>
              <Crosshair className="size-4" />
              Locate me
            </Button>
            <Button type="button" variant="outline" className="justify-center" onClick={() => selectedLocation && openDirections(selectedLocation)}>
              <Navigation className="size-4" />
              Start route
            </Button>
          </div>

          {(loading || usingFallback || error) ? (
            <div className="mt-3 space-y-2">
              {loading ? <p className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">Loading campus locations...</p> : null}
              {usingFallback ? (
                <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                  Showing sample locations until exact campus coordinates are added by staff.
                </p>
              ) : null}
              {error ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-200">{error}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
            <ListFilter className="size-4 text-[var(--text-soft)]" />
            Places
          </div>
          <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)]">{smartLocations.length} found</span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {smartLocations.map(({ location, distanceKm }, index) => (
            <button
              key={location.id}
              type="button"
              onClick={() => setSelectedLocation(location)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition",
                selectedLocation?.id === location.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-glass"
                  : "border-[var(--border-soft)] bg-[var(--bg-elevated)] hover:border-[var(--accent-soft)]",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--panel-strong)] text-[var(--accent)]">
                      {getCategoryIcon(location.category)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--text-main)]">{location.location_name}</span>
                      <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">{normalizeCategory(location.category)}</span>
                    </span>
                  </span>
                  <span className="mt-3 line-clamp-2 block text-xs leading-5 text-[var(--text-muted)]">{location.description || "Campus location"}</span>
                </span>
                {index === 0 && distanceKm !== null ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">Nearest</span>
                ) : null}
              </span>
              <span className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--panel)] px-2 py-2 text-[var(--text-muted)]">
                  <Route className="size-3.5" />
                  {distanceKm !== null ? formatDistance(distanceKm) : "Enable location"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--panel)] px-2 py-2 text-[var(--text-muted)]">
                  <Clock className="size-3.5" />
                  {distanceKm !== null ? walkingEta(distanceKm) : "Walking ETA"}
                </span>
              </span>
            </button>
          ))}
          {!smartLocations.length ? (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 text-sm leading-6 text-[var(--text-muted)]">
              No matching campus locations. Try a shorter search like "hostel", "bursary", or "computer".
            </div>
          ) : null}
        </div>
      </aside>

      <Card className="relative min-h-0 overflow-hidden rounded-none border-0 p-0">
        <div ref={mapElementRef} className="h-full min-h-[520px] w-full bg-[var(--bg-elevated)]" />
        <div className="absolute left-4 right-4 top-4 z-[500] rounded-2xl border border-white/70 bg-white/90 p-4 text-slate-900 shadow-xl backdrop-blur-xl md:left-auto md:w-[360px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Selected destination</p>
          <h2 className="mt-2 text-xl font-bold text-[#002045]">{selectedLocation?.location_name}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{selectedLocation?.description || "Select a place to see details."}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Distance</p>
              <p className="mt-1 text-sm font-bold text-[#002045]">{selectedDistanceKm !== null ? formatDistance(selectedDistanceKm) : "Locate first"}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Walk time</p>
              <p className="mt-1 text-sm font-bold text-[#002045]">{selectedDistanceKm !== null ? walkingEta(selectedDistanceKm) : "Unknown"}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" className="flex-1 justify-center bg-[#002045] text-white hover:bg-[#06315f]" onClick={() => openDirections(selectedLocation)} disabled={!selectedLocation}>
              <Navigation className="size-4" />
              Directions
            </Button>
            <Button type="button" variant="outline" className="justify-center border-slate-300 bg-white text-slate-900" onClick={locateMe}>
              <Crosshair className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function normalizeCategory(value?: string | null): Category {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("hostel")) return "hostel";
  if (normalized.includes("department")) return "department";
  if (normalized.includes("office")) return "office";
  return "office";
}

function createMarkerIcon(leaflet: typeof import("leaflet"), color: string) {
  return leaflet.divIcon({
    className: "",
    html: `<span style="display:grid;width:34px;height:34px;place-items:center;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 12px 28px rgba(0,0,0,.28);"><span style="width:10px;height:10px;border-radius:999px;background:#03110b;"></span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
  });
}

function getCategoryIcon(value?: string | null) {
  const category = normalizeCategory(value);
  if (category === "hostel") return <Home className="size-4" />;
  if (category === "department") return <GraduationCap className="size-4" />;
  return <Building2 className="size-4" />;
}

function getDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function formatDistance(distanceKm: number) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(1)} km`;
}

function walkingEta(distanceKm: number) {
  const minutes = Math.max(1, Math.round((distanceKm / 4.8) * 60));
  if (minutes < 60) return `${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[character];
  });
}
