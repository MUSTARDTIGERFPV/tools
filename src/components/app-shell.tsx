import { RadioTower } from "lucide-react";
import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  activePath?: string;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center px-5 py-4 lg:px-8">
          <a className="group flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_hsl(var(--steel)/0.5)]">
              <RadioTower className="h-5 w-5" />
            </span>
            <span className="font-serif text-base tracking-[0.3em] text-foreground">
              MUSTARDTIGER
            </span>
          </a>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mx-auto max-w-7xl px-5 pb-10 lg:px-8">
        <div className="border-t border-border pt-5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          tools.mustardtiger.xyz
        </div>
      </footer>
    </div>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  stat?: string;
  statLabel?: string;
};

export function PageHeader({ eyebrow, title, description, stat, statLabel = "Note" }: PageHeaderProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-end">
        <div>
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.28em] text-accent">
            {eyebrow ?? "MUSTARDTIGER"}
          </p>
          <h1 className="max-w-4xl font-serif text-4xl font-medium tracking-[-0.01em] text-foreground sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              {description}
            </p>
          ) : null}
        </div>
        {stat ? (
          <div className="rounded-md border border-border bg-card p-5 shadow-[0_1px_1px_hsl(30_10%_14%/0.05)]">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {statLabel}
            </p>
            <p className="mt-3 text-sm leading-6">{stat}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-10 h-px w-full bg-border" />
    </section>
  );
}
