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
