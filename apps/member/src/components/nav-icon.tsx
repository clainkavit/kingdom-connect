import type { NavIcon as NavIconName } from "@kingdom-connect/shared";
import BookOpen from "lucide-react-native/icons/book-open";
import Briefcase from "lucide-react-native/icons/briefcase";
import Calendar from "lucide-react-native/icons/calendar";
import CheckCheck from "lucide-react-native/icons/check-check";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Flag from "lucide-react-native/icons/flag";
import History from "lucide-react-native/icons/rotate-ccw-clock";
import House from "lucide-react-native/icons/house";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import Link from "lucide-react-native/icons/link";
import ListChecks from "lucide-react-native/icons/list-checks";
import Megaphone from "lucide-react-native/icons/megaphone";
import MessageSquare from "lucide-react-native/icons/message-square";
import Milestone from "lucide-react-native/icons/milestone";
import Newspaper from "lucide-react-native/icons/newspaper";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Shield from "lucide-react-native/icons/shield";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Sprout from "lucide-react-native/icons/sprout";
import Users from "lucide-react-native/icons/users";
import type { LucideIcon } from "lucide-react-native";

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
  sprout: Sprout,
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
