import {
  Bot,
  ChartNoAxesCombined,
  LayoutDashboard,
  Megaphone,
  Package,
  Receipt,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navigationGroups: {
  label: string;
  items: NavigationItem[];
}[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/billing", label: "Billing", icon: Receipt },
      { href: "/ai-assistant", label: "AI Assistant", icon: Bot },
      { href: "/customers", label: "Customers", icon: UsersRound },
      { href: "/marketing", label: "Marketing Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/insights", label: "Business Insights", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings2 }],
  },
];

export function getNavigationItem(pathname: string) {
  return navigationGroups
    .flatMap((group) => group.items)
    .find((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
}
