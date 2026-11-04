"use client";

import { RecoveriesScreen } from "@/components/recoveries";
import { recoveriesApi } from "@/lib/recoveries";

export default function RecoveriesPage() {
  return <RecoveriesScreen api={recoveriesApi} />;
}
