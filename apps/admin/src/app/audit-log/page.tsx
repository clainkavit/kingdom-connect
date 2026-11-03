"use client";

import { AuditLog } from "@/components/audit-log";
import { auditApi } from "@/lib/audit";
import { useAuth } from "@/lib/auth";

export default function AuditLogPage() {
  const { superAdmin } = useAuth();
  return <AuditLog api={auditApi} superAdmin={superAdmin} />;
}
