import type { LegalKind } from "@kingdom-connect/shared";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type PendingText = {
  id: string;
  kind: LegalKind;
  version: string;
  body_en: string;
  body_sw: string;
  approved_at: string | null;
};

export async function textsToAccept(): Promise<PendingText[]> {
  const { data, error } = await supabase.rpc("legal_texts_to_accept");
  if (error) throw error;
  return (data ?? []) as PendingText[];
}

export async function acceptTexts(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from("legal_acceptances")
    .insert(ids.map((id) => ({ legal_text_id: id, context_type: "reaccept" })));
  if (error) throw error;
}

export async function legalEntityName(): Promise<string> {
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "legal_entity_name")
    .maybeSingle();
  return typeof data?.value === "string" ? data.value : "";
}

/** The texts this Member still has to accept (S07): null while loading, and on failure. */
export function usePendingTexts(): {
  pending: PendingText[] | null;
  failed: boolean;
  reload: () => void;
} {
  const [pending, setPending] = useState<PendingText[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    textsToAccept()
      .then((texts) => {
        setFailed(false);
        setPending(texts);
      })
      .catch(() => setFailed(true));
  }, [round]);
  return { pending, failed, reload: () => setRound((r) => r + 1) };
}

export type PublicLegalText = {
  version: string;
  body_en: string;
  body_sw: string;
  approved_at: string | null;
  effective_at: string;
};

/** The terms or privacy notice in effect, which visitors may read before they have an account. */
export async function readPublicLegal(
  kind: LegalKind,
): Promise<{ text: PublicLegalText | null; entityName: string }> {
  const { data, error } = await supabase
    .from("legal_texts")
    .select("version, body_en, body_sw, approved_at, effective_at")
    .eq("kind", kind)
    .lte("effective_at", new Date().toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return { text: (data as PublicLegalText | null) ?? null, entityName: await legalEntityName() };
}
