"use client";

const inputClass =
  "border border-field bg-card px-5 text-[15px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-semibold text-foreground">
        {props.label}
      </label>
      {props.multiline ? (
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
