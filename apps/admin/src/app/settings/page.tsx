"use client";

import { SettingsScreen } from "@/components/settings-screen";
import { useAuth } from "@/lib/auth";
import { settingsApi } from "@/lib/settings";

export default function SettingsPage() {
  const { superAdmin } = useAuth();
  return <SettingsScreen api={settingsApi} superAdmin={superAdmin} />;
}
