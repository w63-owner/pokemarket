import { Badge } from "@/components/ui/badge";
import { CONDITION_LABELS, type CardCondition } from "@/lib/constants";
import { cn } from "@/lib/utils";

const conditionColors: Record<CardCondition, string> = {
  MINT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  NEAR_MINT:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  EXCELLENT: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  GOOD: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  LIGHT_PLAYED:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  PLAYED:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  POOR: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function ConditionBadge({ condition }: { condition: string }) {
  const cond = condition as CardCondition;
  const label = CONDITION_LABELS[cond] || condition;
  const color = conditionColors[cond] || "";

  return (
    <Badge variant="secondary" className={cn("text-xs font-medium", color)}>
      {label}
    </Badge>
  );
}
