import { cn } from "@/lib/utils";

type ResultTileProps = {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  className?: string;
};

export function ResultTile({ label, value, unit, accent = false, className }: ResultTileProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-secondary/60 p-4",
        accent && "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground",
          accent && "text-primary-foreground/70",
        )}
      >
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-medium tracking-tight">
        {value}
        {unit ? (
          <span
            className={cn(
              "ml-2 text-sm font-medium text-muted-foreground",
              accent && "text-primary-foreground/70",
            )}
          >
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}
