"use client";

import { Reverification } from "@/components/reverification";
import { reverificationApi } from "@/lib/reverification";

export default function ReverificationPage() {
  return <Reverification api={reverificationApi} />;
}
