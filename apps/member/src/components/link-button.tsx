import { Link } from "expo-router";
import { Pressable } from "react-native";

type LinkButtonProps = {
  href: string;
  className?: string;
  current?: boolean;
  children: React.ReactNode;
};

export function LinkButton({ href, className, current, children }: LinkButtonProps) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} role="link" asChild>
      <Pressable className={className}>{children}</Pressable>
    </Link>
  );
}
