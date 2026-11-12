import { accountItems, growthSections } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { LinkButton } from "./link-button";
import { EmptyState } from "./states";

export function ScreenTitle({ children }: { children: string }) {
  return (
    <Text
      role="heading"
      aria-level={1}
      className="mb-5 font-figtree-extrabold text-[26px] tracking-tight text-ink"
    >
      {children}
    </Text>
  );
}

export function ComingSoon({ title }: { title: string }) {
  const { t } = useLanguage();
  return (
    <View>
      <ScreenTitle>{title}</ScreenTitle>
      <EmptyState title={t.comingSoonTitle} message={t.comingSoonMessage} />
    </View>
  );
}

/** The Growth section: Ideas, Training, Events and Milestone plans, each with what it is for. */
export function GrowthList() {
  const { t } = useLanguage();
  return (
    <View className="rounded-card border border-line bg-surface">
      {growthSections.map((item, i) => (
        <LinkButton
          key={item.href}
          href={item.href}
          label={t[item.key]}
          className={`min-h-[64px] flex-row items-center justify-between gap-3 px-4 py-3 ${i < growthSections.length - 1 ? "border-b border-line" : ""}`}
        >
          <View className="flex-1 gap-0.5">
            <Text className="font-figtree-bold text-[16px] text-ink">{t[item.key]}</Text>
            <Text className="font-figtree text-[13px] leading-5 text-ink-2">{t[item.hint]}</Text>
          </View>
          <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
            ›
          </Text>
        </LinkButton>
      ))}
    </View>
  );
}

/** The account page's links: My profile, News, Reports & Safety and Settings. */
export function AccountList() {
  const { t } = useLanguage();
  return (
    <View className="rounded-card border border-line bg-surface">
      {accountItems.map((item, i) => (
        <LinkButton
          key={item.href}
          href={item.href}
          label={t[item.key]}
          className={`min-h-[52px] flex-row items-center justify-between px-4 ${i < accountItems.length - 1 ? "border-b border-line" : ""}`}
        >
          <Text
            className={`text-[15px] ${item.href === "/reports" ? "font-figtree-semibold text-bad-text" : "font-figtree text-ink"}`}
          >
            {t[item.key]}
          </Text>
          <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
            ›
          </Text>
        </LinkButton>
      ))}
    </View>
  );
}
