"use client";

import { AdminPostForm } from "@/components/opportunity-moderation";
import { opportunityModerationApi } from "@/lib/opportunities";

export default function PostPage() {
  return <AdminPostForm api={opportunityModerationApi} />;
}
