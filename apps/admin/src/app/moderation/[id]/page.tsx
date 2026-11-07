"use client";

import { useParams } from "next/navigation";
import { PostReview } from "@/components/opportunity-moderation";
import { opportunityModerationApi } from "@/lib/opportunities";

export default function PostReviewPage() {
  const { id } = useParams<{ id: string }>();
  return <PostReview key={id} id={id} api={opportunityModerationApi} />;
}
