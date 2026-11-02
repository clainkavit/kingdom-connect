"use client";

import { VerificationQueue } from "@/components/verification-queue";
import { verificationApi } from "@/lib/verification";

export default function VerificationPage() {
  return <VerificationQueue api={verificationApi} />;
}
