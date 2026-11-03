"use client";

import { AdminDashboard } from "@/components/admin-dashboard";
import { adminStatsApi } from "@/lib/admin-dashboard";
import { useAuth } from "@/lib/auth";

export default function AdminDashboardPage() {
  const { superAdmin } = useAuth();
  return <AdminDashboard api={adminStatsApi} superAdmin={superAdmin} />;
}
