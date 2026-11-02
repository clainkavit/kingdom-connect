import { isCurrent, memberNav, memberPhoneTabs } from "@kingdom-connect/shared";
import { usePathname } from "expo-router";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { strings } from "../strings";
import { LinkButton } from "./link-button";
import { NavIcon } from "./nav-icon";
import { usePalette } from "./palette";

const WIDE = 881;

function Wordmark({ phone }: { phone?: boolean }) {
  return (
    <Text className={`font-figtree-extrabold text-white ${phone ? "text-[21px]" : "text-[19px]"}`}>
      {strings.appName}
    </Text>
  );
}

function TopBar({ pathname, onSignOut }: { pathname: string; onSignOut?: () => void }) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-4 bg-navy px-7 py-3.5">
      <Wordmark />
      <View
        role="navigation"
        aria-label={strings.memberMenu}
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
                {item.label}
              </Text>
            </LinkButton>
          );
        })}
        {onSignOut ? (
          <Pressable
            role="button"
            aria-label={strings.logOut}
            onPress={onSignOut}
            className="rounded-[9px] px-3 py-2.5"
          >
            <Text className="font-figtree text-sm text-navy-ink">{strings.logOut}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const palette = usePalette();
  return (
    <View
      role="navigation"
      aria-label={strings.memberTabs}
      className="flex-row border-t border-line bg-surface px-1.5 pb-3.5 pt-1.5"
    >
      {memberPhoneTabs.map((item) => {
        const current = isCurrent(pathname, item);
        return (
          <LinkButton
            key={item.href}
            href={item.href}
            current={current}
            label={item.label}
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
}: {
  children: React.ReactNode;
  onSignOut?: () => void;
}) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const wide = width >= WIDE;
  return (
    <View className="flex-1 bg-bg">
      {wide ? (
        <TopBar pathname={pathname} onSignOut={onSignOut} />
      ) : (
        <View className="bg-navy px-5 py-4">
          <Wordmark phone />
        </View>
      )}
      <ScrollView className="flex-1" contentContainerClassName={wide ? "px-7 py-6" : "px-5 py-4"}>
        <View role="main">{children}</View>
      </ScrollView>
      {wide ? null : <TabBar pathname={pathname} />}
    </View>
  );
}
