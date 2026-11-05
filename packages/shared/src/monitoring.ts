type Breadcrumb = { category?: string; message?: string; data?: Record<string, unknown> };

type EventParts = {
  user?: unknown;
  extra?: unknown;
  message?: string;
  request?: { url?: string };
  breadcrumbs?: Breadcrumb[];
  exception?: { values?: { value?: string }[] };
  contexts?: Record<string, unknown>;
};

const KEPT_CONTEXTS = ["browser", "os", "device", "app", "runtime", "trace"];
const URL_KEYS = ["url", "from", "to"];

const PATTERNS: RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
  /\+?\d[\d\s-]{7,}\d/g,
];

/** Blanks out email addresses, phone numbers and ids, which identify a member. */
export function redact(text: string): string {
  return PATTERNS.reduce((t, pattern) => t.replace(pattern, "[redacted]"), text);
}

const cleanUrl = (value: unknown) =>
  typeof value === "string" ? redact(value.replace(/[?#].*$/, "")) : value;

/**
 * What a crash report may carry (PRD section 15): the error and the screen, never the member,
 * their contact details or ids, request headers, cookies, bodies, query strings or console output.
 */
export function scrubEvent<T extends object>(event: T): T {
  const parts = event as EventParts;
  const { user: _user, extra: _extra, ...rest } = parts as EventParts & Record<string, unknown>;
  const scrubbed: EventParts & Record<string, unknown> = { ...rest };
  if (typeof parts.message === "string") scrubbed.message = redact(parts.message);
  if (parts.exception?.values)
    scrubbed.exception = {
      ...parts.exception,
      values: parts.exception.values.map((v) =>
        typeof v.value === "string" ? { ...v, value: redact(v.value) } : v,
      ),
    };
  if (parts.contexts)
    scrubbed.contexts = Object.fromEntries(
      Object.entries(parts.contexts).filter(([key]) => KEPT_CONTEXTS.includes(key)),
    );
  if (parts.request)
    scrubbed.request = parts.request.url ? { url: cleanUrl(parts.request.url) as string } : {};
  if (parts.breadcrumbs)
    scrubbed.breadcrumbs = parts.breadcrumbs
      .filter((b) => b.category !== "console")
      .map((b) => {
        const crumb: Breadcrumb = { ...b };
        if (typeof b.message === "string") crumb.message = redact(b.message);
        if (b.data) {
          const data: Record<string, unknown> = {};
          for (const key of URL_KEYS) if (key in b.data) data[key] = cleanUrl(b.data[key]);
          crumb.data = data;
        }
        return crumb;
      });
  return scrubbed as T;
}
