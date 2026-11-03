"use client";

import { ReportsQueue } from "@/components/reports-queue";
import { reportsApi } from "@/lib/reports";

export default function ReportsPage() {
  return <ReportsQueue api={reportsApi} />;
}
