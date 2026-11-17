import { accountItems, growthSections } from "@kingdom-connect/shared";
import { Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { LinkButton } from "./link-button";
import { usePalette } from "./palette";
import { usePhone } from "./sheet";
import { usePhoneHeader } from "./phone-header";
import { EmptyState } from "./states";

/** The canvas page header: an optional back link, a 32px maroon title, a subtitle and actions on the right. */
export function PageHeader({
  back,
  title,
  subtitle,
  children,
}: {
  back?: { label: string; href: string };
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  const phone = usePhone();
  const inBand = usePhoneHeader({ back, title, subtitle }, phone);
  if (inBand)
    return children ? (
      <View className="flex-row flex-wrap items-center gap-3">{children}</View>
    ) : null;
  return (
    <View className="gap-3">
      {back ? (
        <LinkButton
          href={back.href}
          label={back.label}
          className="min-h-[36px] flex-row items-center gap-1.5 self-start"
        >
          <ChevronLeft size={16} color={palette.navy} aria-hidden />
          <Text className="font-figtree-semibold text-[15px] text-navy underline">
            {back.label}
          </Text>
        </LinkButton>
      ) : null}
      <View className="flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1 basis-[360px] gap-1.5">
          <Text
            role="heading"
            aria-level={1}
            className={`font-figtree-extrabold text-navy ${phone ? "text-[24px] leading-[28px]" : "text-[32px] leading-[37px]"}`}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="font-figtree text-[15px] leading-[22px] text-ink-2">{subtitle}</Text>
          ) : null}
        </View>
        {children ? (
          <View className="flex-row flex-wrap items-center gap-3">{children}</View>
        ) : null}
      </View>
    </View>
  );
}

export function ScreenTitle({ children }: { children: string }) {
  return (
    <Text
      role="heading"
      aria-level={1}
      className="mb-5 font-figtree-extrabold text-[28px] leading-[34px] tracking-tight text-navy"
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
