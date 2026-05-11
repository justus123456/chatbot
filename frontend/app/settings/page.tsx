"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SettingsExperience } from "@/components/settings/settings-experience";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsExperience />
    </AppShell>
  );
}
