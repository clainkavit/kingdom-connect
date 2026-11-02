import type { FieldProblem, Strings } from "@kingdom-connect/shared";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLanguage } from "../lib/language";

export function problemText(t: Strings, problem: FieldProblem | undefined): string | null {
  if (!problem) return null;
  return {
    required: t.problemRequired,
    username: t.problemUsername,
    email: t.problemEmail,
    phone: t.problemPhone,
    password: t.problemPassword,
    nida: t.problemNida,
    id_number: t.problemIdNumber,
    study_year: t.problemStudyYear,
  }[problem];
}

function Label({ text }: { text: string }) {
  return <Text className="font-figtree-semibold text-sm text-ink">{text}</Text>;
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return <Text className="font-figtree text-[13px] text-bad-text">{text}</Text>;
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  hint?: string;
  problem?: string | null;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Label text={props.label} />
      <TextInput
        aria-label={props.label}
        aria-invalid={Boolean(props.problem)}
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboardType ?? "default"}
        multiline={props.multiline}
        className={`min-h-[44px] rounded-[9px] border bg-surface px-3 font-figtree text-[15px] text-ink ${props.problem ? "border-bad" : "border-field"} ${props.multiline ? "py-2.5" : ""}`}
      />
      {props.hint && !props.problem ? (
        <Text className="font-figtree text-[13px] text-ink-2">{props.hint}</Text>
      ) : null}
      <Problem text={props.problem ?? null} />
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={props.label}
      aria-disabled={props.disabled}
      disabled={props.disabled}
      onPress={props.onPress}
      className={`items-center justify-center px-4 ${props.secondary ? "min-h-[44px] rounded-[9px] border border-line bg-surface" : "min-h-[48px] rounded-[10px] bg-blue"} ${props.disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={
          props.secondary
            ? "font-figtree-semibold text-sm text-ink-2"
            : "font-figtree-bold text-[15px] text-blue-ink"
        }
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      className="min-h-[52px] flex-row items-center gap-3"
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-figtree-semibold text-[15px] text-ink">{label}</Text>
        {hint ? <Text className="font-figtree text-[13px] text-ink-2">{hint}</Text> : null}
      </View>
      <View
        className={`h-7 w-12 justify-center rounded-full px-0.5 ${checked ? "items-end bg-blue" : "items-start bg-line"}`}
      >
        <View className="h-6 w-6 rounded-full bg-surface" />
      </View>
    </Pressable>
  );
}

export function Message({ text, tone = "bad" }: { text: string | null; tone?: "bad" | "info" }) {
  if (!text) return null;
  return (
    <View
      role="alert"
      className={`rounded-[10px] px-3 py-2.5 ${tone === "info" ? "bg-blue-soft" : "bg-bad-soft"}`}
    >
      <Text
        className={`font-figtree text-[13px] leading-[19px] ${tone === "info" ? "text-info-text" : "text-bad-text"}`}
      >
        {text}
      </Text>
    </View>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  problem,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  problem?: string | null;
}) {
  return (
    <View>
      <Pressable
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onPress={() => onChange(!checked)}
        className="min-h-[44px] flex-row items-center gap-3"
      >
        <View
          className={`h-5 w-5 items-center justify-center rounded border ${checked ? "border-blue bg-blue" : "border-field bg-surface"}`}
        >
          {checked ? <Text className="font-figtree-bold text-xs text-white">✓</Text> : null}
        </View>
        <Text className="flex-1 font-figtree-semibold text-sm text-ink">{label}</Text>
      </Pressable>
      <Problem text={problem ?? null} />
    </View>
  );
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  problem,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  problem?: string | null;
}) {
  return (
    <View className="gap-1.5">
      <Label text={label} />
      <View role="radiogroup" aria-label={label} className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-checked={on}
              aria-label={option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-[44px] justify-center rounded-full px-4 ${on ? "bg-navy" : "border border-line bg-surface"}`}
            >
              <Text
                className={`text-sm ${on ? "font-figtree-bold text-white" : "font-figtree-semibold text-ink"}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Problem text={problem ?? null} />
    </View>
  );
}

/** A labelled choice from a long list (regions, districts, sectors), with a search box. */
export function ChoiceList({
  label,
  options,
  value,
  onChange,
  problem,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  problem?: string | null;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const chosen = options.find((o) => o.value === value)?.label;
  const shown = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <View className="gap-1.5">
      <Label text={label} />
      <Pressable
        role="button"
        aria-label={`${label}: ${chosen ?? t.choose}`}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        className={`min-h-[44px] justify-center rounded-[9px] border bg-surface px-3 ${problem ? "border-bad" : "border-field"} ${disabled ? "opacity-50" : ""}`}
      >
        <Text className={`font-figtree text-[15px] ${chosen ? "text-ink" : "text-ink-2"}`}>
          {chosen ?? t.choose}
        </Text>
      </Pressable>
      {open ? (
        <View className="gap-2 rounded-[9px] border border-line bg-surface p-2">
          <TextInput
            aria-label={`${t.searchList}: ${label}`}
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchList}
            className="min-h-[40px] rounded-lg border border-field px-3 font-figtree text-sm text-ink"
          />
          <ScrollView className="max-h-60" nestedScrollEnabled>
            {shown.map((option) => (
              <Pressable
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                aria-label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
                className={`min-h-[40px] justify-center rounded-md px-3 ${option.value === value ? "bg-blue-soft" : ""}`}
              >
                <Text className="font-figtree text-[15px] text-ink">{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Problem text={problem ?? null} />
    </View>
  );
}
