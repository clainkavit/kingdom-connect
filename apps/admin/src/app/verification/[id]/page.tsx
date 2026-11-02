"use client";

import { useParams } from "next/navigation";
import { ApplicationReview } from "@/components/application-review";
import { verificationApi } from "@/lib/verification";

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  return <ApplicationReview key={id} id={id} api={verificationApi} />;
}
