import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Shared rule files copied verbatim into supabase/functions/_shared for the Edge Functions. */
export const functionCopies = [
  {
    from: at("../src/registration-rules.ts"),
    to: at("../../../supabase/functions/_shared/registration-rules.ts"),
  },
];
