"use client";

import { useParams } from "next/navigation";
import { BusinessReview } from "@/components/business-review";
import { businessReviewApi } from "@/lib/business-review";

export default function BusinessReviewPage() {
  const { id } = useParams<{ id: string }>();
  return <BusinessReview key={id} id={id} api={businessReviewApi} />;
}
