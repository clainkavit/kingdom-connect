import {
  emailSwitchCategories,
  formatDate,
  notificationCopy,
  notificationText,
  type NotificationCategory,
  type TextKey,
} from "@kingdom-connect/shared";
import Bell from "lucide-react-native/icons/bell";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import type { StoredNotification } from "../lib/notifications";
import { LinkButton } from "./link-button";
import { EmptyState } from "./states";

export function NotificationBell({ count, color }: { count: number; color: string }) {
  const { t } = useLanguage();
  return (
    <LinkButton
      href="/notifications"
      label={t.notificationsUnread(count)}
      className="relative h-11 w-11 items-center justify-center rounded-xl"
    >
      <Bell size={22} color={color} aria-hidden />
      {count > 0 ? (
        <View className="absolute -right-0.5 -top-0.5 min-w-[20px] items-center rounded-full bg-bad px-1.5">
          <Text className="font-figtree-bold text-xs text-white">{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </LinkButton>
  );
}

export function NotificationList({
  items,
  onOpen,
}: {
  items: StoredNotification[];
  onOpen: (item: StoredNotification) => void;
}) {
  const { t, language, platformName } = useLanguage();
  if (items.length === 0) return <EmptyState title={t.nothingNew} message={t.nothingNewMessage} />;
  return (
    <View className="rounded-card border border-line bg-surface">
      {items.map((item, i) => {
        const text = notificationText(notificationCopy[item.kind], language, {
          ...item.payload,
          platform_name: platformName,
        });
        const unread = !item.read_at;
        return (
          <Pressable
            key={item.id}
            role="link"
            aria-label={text.title}
            onPress={() => onOpen(item)}
            className={`min-h-[52px] flex-row gap-3 px-4 py-3 ${i < items.length - 1 ? "border-b border-line" : ""} ${unread ? "bg-blue-soft" : ""}`}
          >
            <View
              aria-label={unread ? t.unread : undefined}
              className={`mt-1.5 h-2.5 w-2.5 rounded-full ${unread ? "bg-blue" : "bg-transparent"}`}
            />
            <View className="flex-1 gap-0.5">
              <Text
                className={`text-[15px] text-ink ${unread ? "font-figtree-bold" : "font-figtree-semibold"}`}
              >
                {text.title}
              </Text>
              {text.message ? (
                <Text className="font-figtree text-sm leading-5 text-ink-2">{text.message}</Text>
              ) : null}
              <Text className="font-figtree text-xs text-ink-2">
                {formatDate(new Date(item.created_at), language)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const categoryLabels: Partial<Record<NotificationCategory, TextKey>> = {
  business: "categoryBusiness",
  connections: "categoryConnections",
  messages: "categoryMessages",
  opportunities: "categoryOpportunities",
  ideas: "categoryIdeas",
  plans: "categoryPlans",
  matches: "categoryMatches",
  learning: "categoryLearning",
  investor: "categoryInvestor",
};

export function EmailSwitches({
  values,
  onChange,
}: {
  values: Partial<Record<NotificationCategory, boolean>>;
  onChange: (category: NotificationCategory, email: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <View className="gap-3">
      <Text className="font-figtree text-sm leading-5 text-ink-2">{t.emailSettingsIntro}</Text>
      <View className="rounded-card border border-line bg-surface px-4">
        {emailSwitchCategories.map((category, i) => {
          const label = t[categoryLabels[category]!];
          const on = values[category] ?? true;
          return (
            <Pressable
              key={category}
              role="switch"
              aria-checked={on}
              aria-label={t.emailSwitch(label)}
              onPress={() => onChange(category, !on)}
              className={`min-h-[52px] flex-row items-center justify-between gap-3 ${i < emailSwitchCategories.length - 1 ? "border-b border-line" : ""}`}
            >
              <Text className="flex-1 font-figtree text-[15px] text-ink">{label}</Text>
              <View
                className={`h-7 w-12 justify-center rounded-full px-0.5 ${on ? "items-end bg-blue" : "items-start bg-field"}`}
              >
                <View className="h-6 w-6 rounded-full bg-white" />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
