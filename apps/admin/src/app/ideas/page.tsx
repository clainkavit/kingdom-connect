"use client";

import { IdeasOverviewScreen } from "@/components/ideas-overview";
import { ideasOverviewApi } from "@/lib/ideas-overview";

export default function IdeasPage() {
  return <IdeasOverviewScreen api={ideasOverviewApi} />;
}
