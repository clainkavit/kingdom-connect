import { adminNav } from "@kingdom-connect/shared";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/screens";

const sections = adminNav.filter((item) => item.href !== "/");

export function generateStaticParams() {
  return sections.map((item) => ({ section: item.href.slice(1) }));
}

export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = sections.find((i) => i.href === `/${section}`);
  if (!item) notFound();
  return <ComingSoon titleKey={item.key} />;
}
