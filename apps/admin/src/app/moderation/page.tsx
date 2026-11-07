"use client";

import { ModerationQueue } from "@/components/moderation-queue";
import { eventModerationApi } from "@/lib/events";

export default function ModerationPage() {
  return <ModerationQueue events={eventModerationApi} />;
}
