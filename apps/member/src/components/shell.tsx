import { isCurrent, memberNav, memberPhoneTabs, type NavItem } from "@kingdom-connect/shared";
import logo from "../../assets/brand/logo.jpg";
import { usePathname, useRouter } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Search from "lucide-react-native/icons/search";
import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useLanguage } from "../lib/language";
import { LanguageMenu } from "./language-menu";
import { EnterOnChange } from "./motion";
import { LinkButton } from "./link-button";
import { NotificationBell } from "./notifications";
import { PhoneHeaderProvider, usePhoneHeaderSlot } from "./phone-header";
import { NavIcon } from "./nav-icon";
import { ProfileLink } from "./profile-link";
import { usePalette } from "./palette";

const WIDE = 881;

/** The crown logo, cropped as on the canvas header: 40 by 36 with 10px corners. */
function Mark() {
  return (
    <Image
      source={logo}
      aria-hidden
      resizeMode="cover"
      style={{ width: 40, height: 36, borderRadius: 10 }}
    />
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

/** The maroon band on a phone: the logo, bell and avatar, or a detail page's Back and title (canvas). */
function PhoneBand({ unread }: { unread: number }) {
  const { t } = useLanguage();
  const header = usePhoneHeaderSlot();
  if (header?.home)
    return (
      <View className="gap-1.5 bg-navy px-5 pb-5 pt-3">
        <View className="flex-row items-center justify-between">
          <Mark />
          <View className="flex-row items-center">
            <NotificationBell count={unread} color="#ffffff" />
            <ProfileLink color="#ffffff" />
          </View>
        </View>
        {header.detail ? (
          <Text className="pt-1 font-figtree text-[13px] text-navy-ink">{header.detail}</Text>
        ) : null}
        <Text
          role="heading"
          aria-level={1}
          className="font-figtree-extrabold text-[24px] leading-[30px] text-white"
        >
          {header.title}
        </Text>
        {header.subtitle ? (
          <Text className="font-figtree text-[14px] leading-5 text-navy-ink">
            {header.subtitle}
          </Text>
        ) : null}
        {header.below ?? null}
      </View>
    );
  if (header)
    return (
      <View className="gap-1 bg-navy px-5 pb-5 pt-3">
        {header.back?.onPress ? (
          <Pressable
            role="button"
            aria-label={header.back.label}
            onPress={header.back.onPress}
            className="min-h-[36px] flex-row items-center gap-1 self-start"
          >
            <ChevronLeft size={16} color="#ffffff" aria-hidden />
            <Text className="font-figtree-semibold text-[15px] text-white">
              {header.back.short ?? t.back}
            </Text>
          </Pressable>
        ) : header.back ? (
          <LinkButton
            href={header.back.href}
            label={header.back.label}
            className="min-h-[36px] flex-row items-center gap-1 self-start"
          >
            <ChevronLeft size={16} color="#ffffff" aria-hidden />
            <Text className="font-figtree-semibold text-[15px] text-white">
              {header.back.short ?? t.back}
            </Text>
          </LinkButton>
        ) : null}
        <View className="flex-row items-center gap-3.5">
          {header.leading ?? null}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              role="heading"
              aria-level={1}
              className="font-figtree-extrabold text-[22px] leading-[28px] text-white"
            >
              {header.title}
            </Text>
            {header.subtitle ? (
              <Text className="font-figtree text-[14px] leading-5 text-navy-ink">
                {header.subtitle}
              </Text>
            ) : null}
            {header.detail ? (
              <Text className="font-figtree text-[13px] leading-5 text-navy-ink">
                {header.detail}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  return (
    <View className="flex-row items-center justify-between bg-navy px-5 py-3">
      <Mark />
      <View className="flex-row items-center">
        <NotificationBell count={unread} color="#ffffff" />
        <ProfileLink color="#ffffff" />
      </View>
    </View>
  );
}

export function MemberShell(props: {
  children: React.ReactNode;
  unread?: number;
  unreadMessages?: number;
}) {
  return (
    <PhoneHeaderProvider>
      <ShellFrame {...props} />
    </PhoneHeaderProvider>
  );
}

function ShellFrame({
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
        <PhoneBand unread={unread} />
      )}
      <ScrollView
        className="flex-1"
        contentContainerClassName={wide ? "items-center px-10 py-6" : "px-5 py-4"}
      >
        <View role="main" className={wide ? "w-full max-w-[1360px]" : ""}>
          <EnterOnChange value={pathname}>{children}</EnterOnChange>
        </View>
      </ScrollView>
      {wide ? null : <TabBar pathname={pathname} unreadMessages={unreadMessages} />}
    </View>
  );
}
