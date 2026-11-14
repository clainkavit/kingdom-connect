import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const exclude = ["**/node_modules/**", "**/.next/**", "**/.expo/**", "**/dist/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "shared", include: ["packages/**/*.test.ts"], exclude },
      },
      {
        test: { name: "functions", include: ["supabase/functions/**/*.test.ts"], exclude },
      },
      {
        esbuild: { jsx: "automatic" },
        resolve: {
          alias: { "@": fileURLToPath(new URL("./apps/admin/src", import.meta.url)) },
        },
        test: {
          name: "admin",
          include: ["apps/admin/**/*.test.{ts,tsx}"],
          exclude,
          environment: "jsdom",
        },
      },
      {
        esbuild: { jsx: "automatic" },
        resolve: {
          alias: { "react-native": "react-native-web", "lucide-react-native": "lucide-react" },
        },
        test: {
          name: "member",
          setupFiles: ["apps/member/test/setup.ts"],
          include: ["apps/member/**/*.test.{ts,tsx}"],
          exclude,
          environment: "jsdom",
        },
      },
    ],
  },
});
