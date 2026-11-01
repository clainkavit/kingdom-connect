import { isCurrent, memberNav, memberPhoneTabs, type NavItem } from "@kingdom-connect/shared";
import { usePathname } from "expo-router";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { strings } from "../strings";
import { LinkButton } from "./link-button";
import { NavIcon } from "./nav-icon";
import { usePalette } from "./palette";

const WIDE = 881;

function SidebarLink({ item, current }: { item: NavItem; current: boolean }) {
  const palette = usePalette();
  return (
    <LinkButton
      href={item.href}
      current={current}
      className={`flex-row items-center gap-3 rounded-[9px] px-2.5 py-2 ${current ? "bg-blue" : ""}`}
    >
      <NavIcon name={item.icon} color={current ? palette.blueInk : palette.navyInk} />
      <Text
        className={`text-sm ${current ? "font-figtree-semibold text-blue-ink" : "font-figtree-medium text-navy-ink"}`}
      >
        {item.label}
      </Text>
    </LinkButton>
  );
}

function SidebarSubLinks({ item }: { item: NavItem }) {
  if (!item.children) return null;
  return (
    <View className="mb-1 ml-10 gap-px">
      {item.children.map((child) => (
        <LinkButton key={child.href} href={child.href} className="px-2 py-1.5">
          <Text className="font-figtree text-[12.5px] text-navy-mute">{child.label}</Text>
        </LinkButton>
      ))}
    </View>
  );
}

function Sidebar({ pathname, onSignOut }: { pathname: string; onSignOut?: () => void }) {
  const palette = usePalette();
  return (
    <View className="w-[236px] gap-5 bg-navy px-3 pb-4 pt-[18px]">
      <View className="flex-row items-center gap-2.5 px-2">
        <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-blue">
          <NavIcon name="users" size={20} color={palette.blueInk} />
        </View>
        <View>
          <Text className="font-figtree-extrabold text-lg text-white">{strings.appName}</Text>
          <Text className="font-figtree text-[10.5px] text-navy-mute">{strings.tagline}</Text>
        </View>
      </View>
      <View role="navigation" aria-label={strings.memberMenu} className="gap-0.5">
        {memberNav.map((item) => (
          <View key={item.href}>
            <SidebarLink item={item} current={isCurrent(pathname, item)} />
            <SidebarSubLinks item={item} />
          </View>
        ))}
      </View>
      <View className="mt-auto gap-2 rounded-card border border-navy-2 p-3.5">
        <View className="flex-row items-center gap-2">
          <NavIcon name="shield" size={16} color={palette.navyInk} />
          <Text className="font-figtree-semibold text-sm text-white">{strings.reportTitle}</Text>
        </View>
        <Text className="font-figtree text-xs text-navy-mute">{strings.reportMessage}</Text>
        <LinkButton href="/reports" className="self-start rounded-lg bg-surface px-3 py-2">
          <Text className="font-figtree-semibold text-xs text-navy">{strings.reportAction}</Text>
        </LinkButton>
      </View>
      {onSignOut ? (
        <Pressable role="button" aria-label={strings.logOut} onPress={onSignOut} className="px-2">
          <Text className="font-figtree-medium text-sm text-navy-mute">{strings.logOut}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const palette = usePalette();
  return (
    <View
      role="navigation"
      aria-label={strings.memberTabs}
      className="flex-row border-t border-line bg-surface px-1 pb-1.5 pt-1.5"
    >
      {memberPhoneTabs.map((item) => {
        const current = isCurrent(pathname, item);
        return (
          <LinkButton
            key={item.href}
            href={item.href}
            current={current}
            className="flex-1 items-center gap-1 py-1"
          >
            <NavIcon name={item.icon} size={20} color={current ? palette.blue : palette.ink3} />
            <Text
              className={`font-figtree-semibold text-[10.5px] ${current ? "text-blue" : "text-ink-3"}`}
            >
              {item.label}
            </Text>
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
    <View className={`flex-1 bg-bg ${wide ? "flex-row" : ""}`}>
      {wide ? <Sidebar pathname={pathname} onSignOut={onSignOut} /> : null}
      <ScrollView className="flex-1" contentContainerClassName={wide ? "p-6" : "p-4"}>
        <View role="main">{children}</View>
      </ScrollView>
      {wide ? null : <TabBar pathname={pathname} />}
    </View>
  );
}
