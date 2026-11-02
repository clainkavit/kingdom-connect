import { memberNav, memberPhoneTabs, moreItems } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { strings } from "../strings";
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
  return (
    <View>
      <ScreenTitle>{title}</ScreenTitle>
      <EmptyState title={strings.comingSoonTitle} message={strings.comingSoonMessage} />
    </View>
  );
}

export function MoreList() {
  return (
    <View className="rounded-card border border-line bg-surface">
      {moreItems(memberNav, memberPhoneTabs).map((item, i, items) => (
        <LinkButton
          key={item.href}
          href={item.href}
          label={item.label}
          className={`min-h-[52px] flex-row items-center justify-between px-4 ${i < items.length - 1 ? "border-b border-line" : ""}`}
        >
          <Text
            className={`text-[15px] ${item.href === "/reports" ? "font-figtree-semibold text-bad-text" : "font-figtree text-ink"}`}
          >
            {item.label}
          </Text>
          <Text aria-hidden className="font-figtree text-[15px] text-ink-2">
            ›
          </Text>
        </LinkButton>
      ))}
    </View>
  );
}
