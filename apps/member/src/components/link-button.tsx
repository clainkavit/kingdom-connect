import { Link } from "expo-router";
import { Pressable } from "react-native";

type LinkButtonProps = {
  href: string;
  className?: string;
  current?: boolean;
  label?: string;
  children: React.ReactNode;
};

export function LinkButton({ href, className, current, label, children }: LinkButtonProps) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      role="link"
      asChild
    >
      <Pressable className={`active:opacity-80 ${className ?? ""}`}>{children}</Pressable>
    </Link>
  );
}
