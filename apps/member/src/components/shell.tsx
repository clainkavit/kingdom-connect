import { isCurrent, memberNav, memberPhoneTabs } from "@kingdom-connect/shared";
import { usePathname } from "expo-router";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LanguageSwitch } from "./language-switch";
import { LinkButton } from "./link-button";
import { NotificationBell } from "./notifications";
import { NavIcon } from "./nav-icon";
import { usePalette } from "./palette";

const WIDE = 881;

function Wordmark({ phone }: { phone?: boolean }) {
  const { platformName } = useLanguage();
  return (
    <Text className={`font-figtree-extrabold text-white ${phone ? "text-[21px]" : "text-[19px]"}`}>
      {platformName}
    </Text>
  );
}

function TopBar({
  pathname,
  onSignOut,
  unread,
}: {
  pathname: string;
  onSignOut?: () => void;
  unread: number;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-4 bg-navy px-7 py-3.5">
      <Wordmark />
      <View
        role="navigation"
        aria-label={t.memberMenu}
        className="flex-row flex-wrap items-center gap-1.5"
      >
        {memberNav.map((item) => {
          const current = isCurrent(pathname, item);
          return (
            <LinkButton
              key={item.href}
              href={item.href}
              current={current}
              className={`rounded-[9px] px-3 py-2.5 ${current ? "bg-blue" : ""}`}
            >
              <Text
                className={`text-sm ${current ? "font-figtree-bold text-white" : "font-figtree text-navy-ink"}`}
              >
                {t[item.key]}
              </Text>
            </LinkButton>
          );
        })}
        <NotificationBell count={unread} color={palette.navyInk} />
        <LanguageSwitch onNavy />
        {onSignOut ? (
          <Pressable
            role="button"
            aria-label={t.logOut}
            onPress={onSignOut}
            className="rounded-[9px] px-3 py-2.5"
          >
            <Text className="font-figtree text-sm text-navy-ink">{t.logOut}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const palette = usePalette();
  const { t } = useLanguage();
  return (
    <View
      role="navigation"
      aria-label={t.memberTabs}
      className="flex-row border-t border-line bg-surface px-1.5 pb-3.5 pt-1.5"
    >
      {memberPhoneTabs.map((item) => {
        const current = isCurrent(pathname, item);
        return (
          <LinkButton
            key={item.href}
            href={item.href}
            current={current}
            label={t[item.key]}
            className="min-h-[52px] flex-1 items-center justify-center"
          >
            <NavIcon name={item.icon} size={26} color={current ? palette.blue : palette.ink2} />
          </LinkButton>
        );
      })}
    </View>
  );
}

export function MemberShell({
  children,
  onSignOut,
  unread = 0,
}: {
  children: React.ReactNode;
  onSignOut?: () => void;
  unread?: number;
}) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const wide = width >= WIDE;
  return (
    <View className="flex-1 bg-bg">
      {wide ? (
        <TopBar pathname={pathname} onSignOut={onSignOut} unread={unread} />
      ) : (
        <View className="flex-row items-center justify-between bg-navy px-5 py-2.5">
          <Wordmark phone />
          <NotificationBell count={unread} color="#ffffff" />
        </View>
      )}
      <ScrollView className="flex-1" contentContainerClassName={wide ? "px-7 py-6" : "px-5 py-4"}>
        <View role="main">{children}</View>
      </ScrollView>
      {wide ? null : <TabBar pathname={pathname} />}
    </View>
  );
}
