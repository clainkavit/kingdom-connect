import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLanguage } from "../lib/language";

/** Below this width the screen is a phone. */
export const PHONE_MAX = 880;

export const usePhone = () => useWindowDimensions().width <= PHONE_MAX;

/** Keeps a bar at the bottom of the scrolling page on the web; on a device it sits at the end. */
export const stickToBottom =
  Platform.OS === "web" ? ({ position: "sticky", bottom: 0 } as unknown as object) : undefined;

/** A panel that slides up from the bottom of the screen, with a title, Close, and buttons under the content. */
export function Sheet({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          role="dialog"
          aria-label={title}
          className="max-h-[88%] gap-3 rounded-t-[20px] bg-surface px-5 pb-6 pt-4"
        >
          <View className="flex-row items-center justify-between">
            <Text role="heading" aria-level={2} className="font-figtree-bold text-lg text-ink">
              {title}
            </Text>
            <Pressable
              role="button"
              aria-label={t.closeSheet}
              onPress={onClose}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="font-figtree-semibold text-sm text-blue">{t.closeSheet}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-3 pb-2">{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
