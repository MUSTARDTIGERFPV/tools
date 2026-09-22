import type { ReactNode } from "react";
import { PageHeader } from "@/components/app-shell";

type ToolPageProps = {
  title: string;
  note?: string;
  noteLabel?: string;
  children: ReactNode;
};

export function ToolPage({ title, note, noteLabel, children }: ToolPageProps) {
  return (
    <>
      <PageHeader title={title} stat={note} statLabel={noteLabel} />
      <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">{children}</section>
    </>
  );
}
