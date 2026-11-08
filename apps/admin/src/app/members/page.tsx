"use client";

import { InvestorsScreen } from "@/components/investors";
import { investorsApi } from "@/lib/investors";

export default function MembersPage() {
  return <InvestorsScreen api={investorsApi} />;
}
