import { vi } from "vitest";

export const router = { pathname: "/" };

vi.mock("expo-router", () => ({
  Link: ({
    href,
    children,
    asChild: _asChild,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    asChild?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => router.pathname,
}));
