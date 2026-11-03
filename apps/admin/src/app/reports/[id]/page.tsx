"use client";

import { useParams } from "next/navigation";
import { ReportDetail } from "@/components/reports-queue";
import { reportsApi } from "@/lib/reports";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportDetail key={id} id={id} api={reportsApi} />;
}
