import CircleUser from "lucide-react-native/icons/circle-user";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { supabase } from "../lib/supabase";
import { LinkButton } from "./link-button";

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The signed-in member's initials, or null until known (or when there is no profile yet). */
function useMyInitials(): string | null {
  const [initials, setInitials] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (!id) return;
      const { data: row } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("member_id", id)
        .maybeSingle();
      const name = (row as { full_name: string | null } | null)?.full_name ?? "";
      if (live && name.trim()) setInitials(initialsOf(name));
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return initials;
}

/** The account button in the header: the member's initials in a maroon square, as on the canvas. */
export function ProfileLink({ color }: { color: string }) {
  const { t } = useLanguage();
  const initials = useMyInitials();
  return (
    <LinkButton
      href="/account"
      label={t.myAccount}
      className="h-11 w-11 items-center justify-center rounded-xl"
    >
      {initials ? (
        <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-navy">
          <Text className="font-figtree-extrabold text-[15px] text-navy-ink">{initials}</Text>
        </View>
      ) : (
        <CircleUser size={22} color={color} aria-hidden />
      )}
    </LinkButton>
  );
}
