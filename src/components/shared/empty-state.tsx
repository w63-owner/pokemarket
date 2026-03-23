import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-20 text-center",
        className,
      )}
    >
      {icon && (
        <div className="bg-muted text-muted-foreground rounded-full p-4">
          {icon}
        </div>
      )}
      <div className="max-w-xs space-y-1">
        <p className="font-display text-foreground text-base font-semibold">
          {title}
        </p>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action &&
        (action.href ? (
          <Button asChild variant="outline">
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
