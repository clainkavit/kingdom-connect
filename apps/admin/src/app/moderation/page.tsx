"use client";

import { ModerationQueue } from "@/components/moderation-queue";
import { OpportunityQueue } from "@/components/opportunity-moderation";
import { eventModerationApi } from "@/lib/events";
import { ideaModerationApi } from "@/lib/ideas";
import { opportunityModerationApi } from "@/lib/opportunities";
import { trainingModerationApi } from "@/lib/training";

export default function ModerationPage() {
  return (
    <div className="flex flex-col gap-6">
      <ModerationQueue
        events={eventModerationApi}
        training={trainingModerationApi}
        ideas={ideaModerationApi}
      />
      <OpportunityQueue api={opportunityModerationApi} />
    </div>
  );
}
