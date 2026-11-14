import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { adminUrl } from "../lib/admin-url";

/** Sends a staff member to the admin console's log-in. The two apps stay separate (PRD section 15). */
export function openAdminConsole(base = adminUrl) {
  if (!base) return;
  const target = `${base.replace(/\/+$/, "")}/login`;
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(target);
  else void Linking.openURL(target);
}

/**
 * "I'm a member / I'm staff" on S01 Landing and S03 Log in, styled like the language pill.
 * Member is where the person already is; Staff leaves for the admin console. Hidden when no
 * admin console address is set for this environment.
 */
export function RoleChoice({ base = adminUrl }: { base?: string }) {
  const { t } = useLanguage();
  if (!base) return null;
  return (
    <View className="gap-2">
      <Text className="font-figtree-semibold text-[13px] text-ink-2">{t.signInAs}</Text>
      <View
        role="group"
        aria-label={t.signInAs}
        className="flex-row self-start rounded-full border border-line bg-surface p-1"
      >
        <Pressable
          role="button"
          aria-label={t.roleMember}
          aria-pressed
          className="min-h-[44px] items-center justify-center rounded-full bg-navy px-4"
        >
          <Text className="font-figtree-bold text-sm text-white">{t.roleMember}</Text>
        </Pressable>
        <Pressable
          role="link"
          aria-label={t.roleStaff}
          onPress={() => openAdminConsole(base)}
          className="min-h-[44px] items-center justify-center rounded-full px-4 active:opacity-70"
        >
          <Text className="font-figtree-bold text-sm text-ink-2">{t.roleStaff}</Text>
        </Pressable>
      </View>
    </View>
  );
}
