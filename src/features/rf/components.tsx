import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FieldsetCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function FieldsetCard({ title, description, children }: FieldsetCardProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">{children}</CardContent>
    </Card>
  );
}
