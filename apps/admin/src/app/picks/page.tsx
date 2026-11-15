"use client";

import { PicksAdmin } from "@/components/picks-admin";
import { pickAdminApi } from "@/lib/picks";

export default function PicksPage() {
  return <PicksAdmin api={pickAdminApi} />;
}
