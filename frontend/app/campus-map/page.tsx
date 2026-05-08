import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function CampusMapPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Campus Map</h1><p className="mt-3 text-white/55">OpenStreetMap + Leaflet location finder for offices, hostels, and departments.</p></Card></AppShell>;
}
