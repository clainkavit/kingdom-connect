import type { NavIcon as NavIconName } from "@kingdom-connect/shared";
import {
  BookOpen,
  Briefcase,
  Calendar,
  CheckCheck,
  Ellipsis,
  Flag,
  History,
  House,
  Lightbulb,
  Link,
  ListChecks,
  Megaphone,
  MessageSquare,
  Milestone,
  Newspaper,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react-native";

const icons: Record<NavIconName, LucideIcon> = {
  "book-open": BookOpen,
  briefcase: Briefcase,
  calendar: Calendar,
  "check-check": CheckCheck,
  ellipsis: Ellipsis,
  flag: Flag,
  history: History,
  home: House,
  lightbulb: Lightbulb,
  link: Link,
  "list-checks": ListChecks,
  megaphone: Megaphone,
  "message-square": MessageSquare,
  milestone: Milestone,
  newspaper: Newspaper,
  "refresh-cw": RefreshCw,
  shield: Shield,
  "sliders-horizontal": SlidersHorizontal,
  users: Users,
};

export function NavIcon({
  name,
  size = 18,
  color,
}: {
  name: NavIconName;
  size?: number;
  color: string;
}) {
  const Icon = icons[name];
  return <Icon size={size} color={color} aria-hidden />;
}
