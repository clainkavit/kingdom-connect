import type { NavIcon as NavIconName } from "@kingdom-connect/shared";
import {
  BookOpen,
  Briefcase,
  Building,
  Calendar,
  CheckCheck,
  EyeOff,
  Flag,
  History,
  House,
  Lightbulb,
  Link,
  ListChecks,
  Menu,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

const icons: Record<NavIconName, LucideIcon> = {
  "book-open": BookOpen,
  briefcase: Briefcase,
  building: Building,
  calendar: Calendar,
  "check-check": CheckCheck,
  "eye-off": EyeOff,
  flag: Flag,
  history: History,
  home: House,
  lightbulb: Lightbulb,
  link: Link,
  "list-checks": ListChecks,
  menu: Menu,
  "message-square": MessageSquare,
  newspaper: Newspaper,
  "refresh-cw": RefreshCw,
  shield: Shield,
  "sliders-horizontal": SlidersHorizontal,
  star: Star,
  users: Users,
};

export function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  const Icon = icons[name];
  return <Icon size={size} aria-hidden="true" />;
}
