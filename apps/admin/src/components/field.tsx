"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/lib/language";

const inputClass =
  "border border-field bg-card px-5 text-[15px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** A password box with an eye button that shows what is typed; a problem shows under it. */
function PasswordInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  problem?: string | null;
}) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const problemId = `${props.id}-problem`;
  const Icon = shown ? EyeOff : Eye;
  return (
    <>
      <div className="relative">
        <input
          id={props.id}
          type={shown ? "text" : "password"}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.problem ? true : undefined}
          aria-describedby={props.problem ? problemId : undefined}
          className={`min-h-[52px] w-full rounded-full ${inputClass} pr-14 ${props.problem ? "border-destructive" : ""}`}
        />
        <button
          type="button"
          aria-label={`${shown ? t.hidePassword : t.showPassword}: ${props.label}`}
          onClick={() => setShown(!shown)}
          className="absolute inset-y-1 right-1 grid w-11 place-items-center rounded-full text-ink-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Icon aria-hidden className="size-5" />
        </button>
      </div>
      {props.problem ? (
        <p id={problemId} role="alert" className="text-sm text-bad-text">
          {props.problem}
        </p>
      ) : null}
    </>
  );
}

export function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
  /** Only shown for type "password". */
  problem?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-semibold text-foreground">
        {props.label}
      </label>
      {props.type === "password" ? (
        <PasswordInput {...props} />
      ) : props.multiline ? (
        <textarea
          id={props.id}
          rows={3}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={`rounded-[18px] ${inputClass} py-3`}
        />
      ) : (
        <input
          id={props.id}
          type={props.type ?? "text"}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={`min-h-[52px] rounded-full ${inputClass}`}
        />
      )}
    </div>
  );
}

export function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-[52px] rounded-full ${inputClass}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
