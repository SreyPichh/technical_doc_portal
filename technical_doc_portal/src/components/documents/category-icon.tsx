import { Drill, FlaskConical, Folder, Info, Smile, Syringe, Waves, Wind, type LucideIcon } from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  wind: Wind,
  drill: Drill,
  smile: Smile,
  waves: Waves,
  syringe: Syringe,
  flask: FlaskConical,
  info: Info,
  folder: Folder,
};

export function CategoryIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Folder;
  return <Icon className={className} />;
}
