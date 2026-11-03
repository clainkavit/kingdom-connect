import { vi } from "vitest";

export const router = { pathname: "/", pushed: [] as string[] };

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
  useRouter: () => ({ push: (href: string) => router.pushed.push(href) }),
}));
