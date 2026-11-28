"use client";

import { PublicListingsScreen } from "@/components/public-listings";
import { publicListingsApi } from "@/lib/public-listings";

export default function PublicListingsPage() {
  return <PublicListingsScreen api={publicListingsApi} />;
}
