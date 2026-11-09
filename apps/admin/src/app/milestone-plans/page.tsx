"use client";

import { PlansAdminScreen } from "@/components/plans-admin";
import { plansAdminApi } from "@/lib/plans";

export default function MilestonePlansPage() {
  return <PlansAdminScreen api={plansAdminApi} />;
}
