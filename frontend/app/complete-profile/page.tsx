import { AppShell } from "@/components/layout/app-shell";
import { ProfileForm } from "@/components/auth/profile-form";
import { Card } from "@/components/ui/card";

export default function CompleteProfilePage() {
  return (
    <AppShell>
      <Card className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.3em] text-mint">New student onboarding</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Set up your SmartCampus experience</h1>
        <p className="mt-4 max-w-3xl text-white/55">
          Complete this quick checklist once and the app will tailor announcements, calendar events, reminders, and chat support to your department, level, and preferred style.
        </p>
        <ProfileForm />
      </Card>
    </AppShell>
  );
}
