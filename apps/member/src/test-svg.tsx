import type { ReactNode } from "react";

/** Unit tests run on react-native-web; this draws react-native-svg's shapes as plain SVG. */
export default function Svg({
  children,
  ...props
}: { children?: ReactNode } & Record<string, unknown>) {
  return <svg {...(props as object)}>{children}</svg>;
}

export function Circle(props: Record<string, unknown>) {
  return <circle {...(props as object)} />;
}
