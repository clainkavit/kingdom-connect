"use client";

import { ModerationQueue } from "@/components/moderation-queue";
import { eventModerationApi } from "@/lib/events";
import { ideaModerationApi } from "@/lib/ideas";
import { trainingModerationApi } from "@/lib/training";

export default function ModerationPage() {
  return (
    <ModerationQueue
      events={eventModerationApi}
      training={trainingModerationApi}
      ideas={ideaModerationApi}
    />
  );
}
