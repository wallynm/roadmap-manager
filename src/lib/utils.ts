import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  CircleDashed,
  Circle,
  CircleEllipsis,
  CheckCircle2,
  XCircle,
  Link2,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import {
  PriorityNone,
  PriorityUrgent,
  PriorityHigh,
  PriorityMedium,
  PriorityLow,
} from "@/components/ui/PriorityIcon";
import type { ItemStatus, Priority } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_CONFIG: Record<ItemStatus, { label: string; icon: LucideIcon; color: string }> = {
  backlog:     { label: "Backlog",     icon: CircleDashed,    color: "text-slate-400" },
  todo:        { label: "Todo",        icon: Circle,          color: "text-sky-400" },
  in_progress: { label: "In Progress", icon: CircleEllipsis,  color: "text-amber-400" },
  done:        { label: "Done",        icon: CheckCircle2,    color: "text-emerald-500" },
  canceled:    { label: "Canceled",    icon: XCircle,         color: "text-red-500" },
  duplicate:   { label: "Duplicate",   icon: Link2,           color: "text-violet-400" },
};

type PriorityIconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export const PRIORITY_CONFIG: Record<
  Priority,
  { color: string; bgColor: string; icon: PriorityIconComponent }
> = {
  Urgente: { color: "text-red-500",   bgColor: "bg-red-500/15",   icon: PriorityUrgent },
  Alta:    { color: "text-orange-400", bgColor: "bg-orange-400/15", icon: PriorityHigh },
  Média:   { color: "text-amber-400", bgColor: "bg-amber-400/15", icon: PriorityMedium },
  Baixa:   { color: "text-sky-400",   bgColor: "bg-sky-400/15",   icon: PriorityLow },
  Nenhuma: { color: "text-slate-400", bgColor: "bg-slate-400/10", icon: PriorityNone },
};

export function parseLabels(labelsJson: string): string[] {
  try {
    return JSON.parse(labelsJson);
  } catch {
    return [];
  }
}

export function parseDependsOn(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function parseRelatesTo(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function formatAge(dateStr: string | null): string {
  if (!dateStr) { return ""; }
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) { return "today"; }
  if (days === 1) { return "1d"; }
  if (days < 30) { return `${days}d`; }
  if (days < 365) { return `${Math.floor(days / 30)}mo`; }
  return `${Math.floor(days / 365)}y`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) { return "—"; }
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) { return ""; }
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}
