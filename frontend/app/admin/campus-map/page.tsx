"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createCampusLocation, deleteCampusLocation, getCampusLocations, updateCampusLocation, type CampusLocation } from "@/lib/api/campus-map";
import { createClient } from "@/lib/supabase/client";

function GovernanceCampusMapManager({ canManage = true }: { canManage?: boolean }) {
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [selected, setSelected] = useState<CampusLocation | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return locations.filter((location) => `${location.location_name} ${location.description || ""} ${location.category || ""}`.toLowerCase().includes(value));
  }, [locations, query]);

  async function token() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function load() {
    setError("");
    try {
      const result = await getCampusLocations(await token());
      setLocations(result.data);
      setSelected(result.data.find((item) => item.latitude && item.longitude) || result.data[0] || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load campus map locations.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const created = await createCampusLocation(
        {
          location_name: String(form.get("location_name") || "").trim(),
          description: String(form.get("description") || "").trim(),
          category: String(form.get("category") || "office"),
          latitude: Number(form.get("latitude")),
          longitude: Number(form.get("longitude")),
        },
        await token(),
      );
      setLocations((items) => [created.location, ...items]);
      setSelected(created.location);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add location.");
    } finally {
      setSaving(false);
    }
  }

  async function editLocation(location: CampusLocation) {
    const location_name = prompt("Location name", location.location_name);
    if (location_name === null) return;
    const description = prompt("Description", location.description || "");
    if (description === null) return;
    const category = prompt("Category: office, hostel, department", location.category || "office");
    if (category === null) return;
    try {
      const updated = await updateCampusLocation(location.id, { location_name, description, category }, await token());
      setLocations((items) => items.map((item) => (item.id === location.id ? updated.location : item)));
      setSelected((current) => current?.id === location.id ? updated.location : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update location.");
    }
  }

  async function removeLocation(location: CampusLocation) {
    if (!confirm(`Delete ${location.location_name}?`)) return;
    try {
      await deleteCampusLocation(location.id, await token());
      setLocations((items) => items.filter((item) => item.id !== location.id));
      setSelected((current) => current?.id === location.id ? null : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete location.");
    }
  }

  const mapSrc = selected?.latitude && selected?.longitude
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${selected.longitude - 0.004}%2C${selected.latitude - 0.004}%2C${selected.longitude + 0.004}%2C${selected.latitude + 0.004}&layer=mapnik&marker=${selected.latitude}%2C${selected.longitude}`
    : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Campus Map</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Campus Geo-Directory</h1>
          <p className="mt-2 text-sm text-[#3c475a]">{canManage ? "Manage offices, hostels, and departments shown to students." : "Find offices, hostels, and departments from the governance portal."}</p>
        </header>
        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        <div className="gov-card overflow-hidden rounded-lg">
          {mapSrc ? <iframe title="Campus map" src={mapSrc} className="h-[430px] w-full border-0" /> : <div className="grid h-[430px] place-items-center text-[#545f72]">Select or add a location with coordinates.</div>}
        </div>
        <div className="gov-card rounded-lg p-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder="Search campus locations..." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {filtered.map((location) => (
              <article key={location.id} className={selected?.id === location.id ? "rounded border border-[var(--gov-primary)] bg-[#d6e3ff] p-4 text-left" : "rounded border border-[var(--gov-outline)] p-4 text-left hover:bg-[#f4f3f7]"}>
                <button type="button" onClick={() => setSelected(location)} className="w-full text-left">
                  <strong className="text-[var(--gov-primary)]">{location.location_name}</strong>
                  <p className="mt-1 text-sm text-[#3c475a]">{location.description || "Campus location"}</p>
                  <p className="mt-2 text-xs font-bold uppercase text-[#545f72]">{location.category || "general"}</p>
                </button>
                {canManage ? (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => editLocation(location)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
                    <button onClick={() => removeLocation(location)} className="rounded border border-[#ba1a1a] px-3 py-1 text-xs font-bold text-[#ba1a1a]">Delete</button>
                  </div>
                ) : null}
              </article>
            ))}
            {!filtered.length ? <p className="text-sm text-[#545f72]">No locations found.</p> : null}
          </div>
        </div>
      </section>

      {canManage ? <form onSubmit={submit} className="gov-card h-fit rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Add Location</h2>
        {["location_name", "description", "latitude", "longitude"].map((field) => (
          <label key={field} className="mt-4 block">
            <span className="text-sm font-medium capitalize text-[#3c475a]">{field.replace("_", " ")}</span>
            <input name={field} required={field !== "description"} className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          </label>
        ))}
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#3c475a]">Category</span>
          <select name="category" className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]">
            <option value="office">Office</option>
            <option value="hostel">Hostel</option>
            <option value="department">Department</option>
          </select>
        </label>
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Adding..." : "Add Location"}</button>
      </form> : (
        <aside className="gov-card h-fit rounded-lg p-5">
          <h2 className="text-xl font-bold text-[var(--gov-primary)]">Location Finder</h2>
          <p className="mt-3 text-sm leading-6 text-[#3c475a]">
            Use the search box to filter campus offices, hostels, and departments. Location editing is reserved for admin and dean accounts.
          </p>
          <div className="mt-5 rounded border border-[var(--gov-outline)] bg-[#f4f3f7] p-4 text-sm">
            <strong>{locations.length}</strong> campus locations loaded
          </div>
        </aside>
      )}
    </div>
  );
}

export default function AdminCampusMapPage() {
  return <GovernanceCampusMapManager />;
}
