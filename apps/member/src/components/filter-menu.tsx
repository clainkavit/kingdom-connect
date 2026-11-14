import ChevronDown from "lucide-react-native/icons/chevron-down";
import Search from "lucide-react-native/icons/search";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLanguage } from "../lib/language";
import { Button } from "./form";
import { Reveal } from "./motion";
import { usePalette } from "./palette";

/** How long typing pauses before a search box searches. */
export const TYPE_PAUSE_MS = 400;

/** A search box with a magnifier that searches once typing pauses, or at once on Enter. */
export function SearchBox({
  label,
  hint,
  value,
  onChange,
  onSearch,
  round,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  round?: boolean;
}) {
  const palette = usePalette();
  const [typed, setTyped] = useState(false);
  const latest = useRef(onSearch);
  latest.current = onSearch;
  useEffect(() => {
    if (!typed) return;
    const timer = setTimeout(() => latest.current(value), TYPE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [value, typed]);
  return (
    <View
      className={`min-h-[46px] flex-1 flex-row items-center gap-2.5 px-3.5 ${round ? "rounded-full border border-line bg-surface-2" : "rounded-[10px] border border-field bg-surface"}`}
    >
      <Search size={18} color={palette.ink2} aria-hidden />
      <TextInput
        aria-label={label}
        placeholder={hint}
        value={value}
        onChangeText={(next) => {
          setTyped(true);
          onChange(next);
        }}
        onSubmitEditing={() => {
          setTyped(false);
          onSearch(value);
        }}
        returnKeyType="search"
        className="min-h-[44px] min-w-0 flex-1 font-figtree text-[15px] text-ink"
      />
    </View>
  );
}

/** A row of filter buttons that wraps, kept above the results so an open menu covers them. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2" style={{ zIndex: 20 }}>
      {children}
    </View>
  );
}

/**
 * A filter shown as a button, "Region ▾", or "Region: Mwanza ▾" once chosen. Pressing it drops a small menu
 * under it; only one is open at a time, which the screen keeps track of.
 */
export function FilterMenu({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const on = value !== null;
  return (
    <View className="relative" style={{ zIndex: open ? 30 : 1 }}>
      <Pressable
        role="button"
        aria-label={`${label}: ${value ?? t.anyOption}`}
        aria-expanded={open}
        onPress={onToggle}
        className={`min-h-[46px] flex-row items-center gap-1.5 rounded-[10px] px-3.5 ${on ? "border-[1.5px] border-navy bg-blue-soft" : "border border-line bg-surface"}`}
      >
        <Text
          className={`text-sm ${on ? "font-figtree-bold text-info-text" : "font-figtree-semibold text-ink"}`}
        >
          {on ? `${label}: ${value}` : label}
        </Text>
        <ChevronDown
          size={16}
          color={on ? palette.blue : palette.ink2}
          aria-hidden
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      <Reveal
        show={open}
        from="above"
        style={{ position: "absolute", top: 52, left: 0 }}
        className="min-w-[240px] max-w-[320px] gap-2 rounded-card border border-line bg-surface p-2 shadow-md"
      >
        {children}
      </Reveal>
    </View>
  );
}

/** The choices inside a filter menu; choosing one applies it. */
export function FilterOptions({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView className="max-h-72" nestedScrollEnabled>
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="option"
            aria-selected={chosen}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            className={`min-h-[42px] justify-center rounded-md px-3 ${chosen ? "bg-blue-soft" : ""}`}
          >
            <Text
              className={`text-[15px] ${chosen ? "font-figtree-bold text-info-text" : "font-figtree text-ink"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A typed filter inside a menu, such as a profession: a box and Apply. */
export function TextFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(value);
  return (
    <View className="gap-2 p-1">
      <TextInput
        aria-label={label}
        placeholder={label}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => onApply(draft.trim())}
        className="min-h-[44px] rounded-[9px] border border-field px-3 font-figtree text-[15px] text-ink"
      />
      <Button label={t.filterApply} onPress={() => onApply(draft.trim())} />
    </View>
  );
}

/** "Clear all", shown once any filter is on. */
export function ClearAll({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return (
    <Pressable
      role="button"
      aria-label={t.clearAll}
      onPress={onPress}
      className="min-h-[46px] justify-center px-2.5"
    >
      <Text className="font-figtree-bold text-sm text-ink underline">{t.clearAll}</Text>
    </Pressable>
  );
}
