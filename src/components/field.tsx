import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NumberFieldProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function NumberField({ id, label, value, onChange, min, max, step }: NumberFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        max={max}
        min={min}
        step={step ?? "any"}
        type="number"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}
