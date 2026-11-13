import { isCurrent, memberNav, memberPhoneTabs, type NavItem } from "@kingdom-connect/shared";
import { usePathname, useRouter } from "expo-router";
import Search from "lucide-react-native/icons/search";
import { useState } from "react";
import { ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LanguageMenu } from "./language-menu";
import { LinkButton } from "./link-button";
import { NotificationBell } from "./notifications";
import { NavIcon } from "./nav-icon";
import { ProfileLink } from "./profile-link";
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

function Mark() {
  const { platformName } = useLanguage();
  const initials = platformName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <View aria-hidden className="h-9 w-9 items-center justify-center rounded-[10px] bg-navy">
      <Text className="font-figtree-extrabold text-[15px] text-navy-ink">{initials}</Text>
    </View>
  );
}

function TopSearch() {
  const { t, platformName } = useLanguage();
  const palette = usePalette();
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = () => {
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <View className="min-w-[150px] flex-1 basis-0 items-center justify-center py-3">
      <View className="min-h-[42px] w-full max-w-[400px] flex-row items-center gap-2.5 rounded-full border border-line bg-bg px-3.5">
        <Search size={18} color={palette.ink2} aria-hidden />
        <TextInput
          aria-label={t.searchEverything(platformName)}
          placeholder={t.searchPlaceholder}
          placeholderTextColor={palette.ink3}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submit}
          returnKeyType="search"
          className="min-w-0 flex-1 font-figtree text-[15px] text-ink"
        />
      </View>
    </View>
  );
}

/** A small count on an icon; the screen reader hears it through the link's label instead. */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      aria-hidden
      style={{ position: "absolute", top: -4, right: -9 }}
      className="min-w-[18px] items-center rounded-full bg-bad px-1"
    >
      <Text className="font-figtree-bold text-[11px] text-white">{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function useNavLabel(unreadMessages: number) {
  const { t } = useLanguage();
  return (item: NavItem) =>
    item.href === "/messages" && unreadMessages > 0
      ? t.messagesUnread(unreadMessages)
      : t[item.key];
}

function NavGlyph({
  item,
  color,
  size,
  unreadMessages,
}: {
  item: NavItem;
  color: string;
  size: number;
  unreadMessages: number;
}) {
  return (
    <View>
      <NavIcon name={item.icon} size={size} color={color} />
      {item.href === "/messages" ? <CountBadge count={unreadMessages} /> : null}
    </View>
  );
}

function TopBar({
  pathname,
  unread,
  unreadMessages,
}: {
  pathname: string;
  unread: number;
  unreadMessages: number;
}) {
  const { t, platformName } = useLanguage();
  const palette = usePalette();
  const label = useNavLabel(unreadMessages);
  return (
    <View style={{ zIndex: 10 }} className="border-b border-line bg-surface">
      <View className="w-full flex-row flex-wrap items-stretch gap-x-4 px-7">
        <View className="flex-row items-center gap-2.5">
          <Mark />
          <Text className="font-figtree-extrabold text-[19px] text-navy">{platformName}</Text>
        </View>
        <TopSearch />
        <View
          role="navigation"
          aria-label={t.memberMenu}
          className="flex-row flex-wrap items-stretch gap-0.5"
        >
          {memberNav.map((item) => {
            const current = isCurrent(pathname, item);
            return (
              <LinkButton
                key={item.href}
                href={item.href}
                current={current}
                label={label(item)}
                className={`min-h-[72px] min-w-[62px] items-center justify-center gap-[3px] border-b-[3px] px-1 ${current ? "border-navy" : "border-transparent"}`}
              >
                <NavGlyph
                  item={item}
                  size={22}
                  color={current ? palette.navy : palette.ink2}
                  unreadMessages={unreadMessages}
                />
                <Text
                  numberOfLines={1}
                  className={`text-[13px] ${current ? "font-figtree-extrabold text-navy" : "font-figtree-semibold text-ink-2"}`}
                >
                  {t[item.key]}
                </Text>
              </LinkButton>
            );
          })}
        </View>
        <View className="flex-row items-center gap-1 border-l border-line pl-2.5">
          <NotificationBell count={unread} color={palette.ink2} />
          <LanguageMenu />
          <ProfileLink color={palette.navy} />
        </View>
      </View>
    </View>
  );
}

function TabBar({ pathname, unreadMessages }: { pathname: string; unreadMessages: number }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const label = useNavLabel(unreadMessages);
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
            label={label(item)}
            className="min-h-[56px] flex-1 items-center justify-center gap-0.5"
          >
            <NavGlyph
              item={item}
              size={24}
              color={current ? palette.blue : palette.ink2}
              unreadMessages={unreadMessages}
            />
            <Text
              numberOfLines={1}
              className={`text-[11px] ${current ? "font-figtree-bold text-blue" : "font-figtree text-ink-2"}`}
            >
              {t[item.key]}
            </Text>
          </LinkButton>
        );
      })}
    </View>
  );
}

export function MemberShell({
  children,
  unread = 0,
  unreadMessages = 0,
}: {
  children: React.ReactNode;
  unread?: number;
  unreadMessages?: number;
}) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const wide = width >= WIDE;
  return (
    <View className="flex-1 bg-bg">
      {wide ? (
        <TopBar pathname={pathname} unread={unread} unreadMessages={unreadMessages} />
      ) : (
        <View className="flex-row items-center justify-between bg-navy px-5 py-2.5">
          <Wordmark phone />
          <View className="flex-row items-center">
            <NotificationBell count={unread} color="#ffffff" />
            <ProfileLink color="#ffffff" />
          </View>
        </View>
      )}
      <ScrollView className="flex-1" contentContainerClassName={wide ? "px-7 py-6" : "px-5 py-4"}>
        <View role="main">{children}</View>
      </ScrollView>
      {wide ? null : <TabBar pathname={pathname} unreadMessages={unreadMessages} />}
    </View>
  );
}
