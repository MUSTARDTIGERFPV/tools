import { useMemo, useState } from "react";
import { NumberField } from "@/components/field";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const targetBodyFat = 5;

export function FitnessPage() {
  const [metric, setMetric] = useState(true);
  const [weight, setWeight] = useState(80);
  const [height, setHeight] = useState(175);
  const [bodyFat, setBodyFat] = useState(20);
  const unit = metric ? "kg" : "lb";
  const heightUnit = metric ? "cm" : "in";
  const calc = useMemo(() => calculateFitness(weight, height, bodyFat, metric), [bodyFat, height, metric, weight]);

  function switchUnits(toMetric: boolean) {
    if (toMetric === metric) return;
    setMetric(toMetric);
    setWeight(round1(toMetric ? weight * 0.453592 : weight * 2.20462));
    setHeight(round1(toMetric ? height * 2.54 : height / 2.54));
  }

  return (
    <ToolPage title="Body Composition Tracker" note="Projection assumes lean body mass stays constant." noteLabel="Assumption">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Button variant={metric ? "default" : "outline"} onClick={() => switchUnits(true)}>
                Metric
              </Button>
              <Button variant={!metric ? "default" : "outline"} onClick={() => switchUnits(false)}>
                Imperial
              </Button>
            </div>

            <NumberField id="fitness-weight" label={`Current weight (${unit})`} value={weight} onChange={setWeight} />
            <NumberField id="fitness-height" label={`Height (${heightUnit})`} value={height} onChange={setHeight} />
            <NumberField id="fitness-bodyfat" label="Current body fat (%)" min={1} max={60} value={bodyFat} onChange={setBodyFat} />

            <div className="grid gap-3 sm:grid-cols-2">
              <ResultTile label="Lean body mass" value={format1(calc.leanMass)} unit={unit} />
              <ResultTile accent label="Weight at 5% body fat" value={format1(calc.targetWeight)} unit={unit} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results & projections</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Current BMI" value={format1(calc.currentBmi)} detail={bmiCategory(calc.currentBmi)} accent />
              <MetricTile label="Fat mass" value={`${format1(calc.fatMass)} ${unit}`} detail={`To lose: ${format1(calc.fatToLose)} ${unit}`} />
              <MetricTile label="Target weight" value={`${format1(calc.targetWeight)} ${unit}`} detail={`To lose: ${format1(calc.weightToLose)} ${unit}`} />
              <MetricTile label="Target BMI" value={format1(calc.targetBmi)} detail={bmiCategory(calc.targetBmi)} />
            </div>

            <div>
              <h3 className="mb-3 text-lg font-medium">Body composition projection</h3>
              <ProjectionChart points={calc.points} unit={unit} />
              <div className="mt-4 flex flex-wrap gap-5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-[1px] border border-primary bg-primary" />
                  Body fat %
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-[1px] border border-primary bg-card" />
                  BMI
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Body composition reference</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <ReferenceTable
            title="BMI categories"
            headers={["Category", "BMI range"]}
            rows={[
              ["Underweight", "Below 18.5"],
              ["Normal weight", "18.5 - 24.9"],
              ["Overweight", "25 - 29.9"],
              ["Obesity (Class 1)", "30 - 34.9"],
              ["Obesity (Class 2)", "35 - 39.9"],
              ["Extreme Obesity", "40 or higher"],
            ]}
          />
          <ReferenceTable
            title="Body fat % categories"
            headers={["Category", "Men", "Women"]}
            rows={[
              ["Essential Fat", "2-5%", "10-13%"],
              ["Athletes", "6-13%", "14-20%"],
              ["Fitness", "14-17%", "21-24%"],
              ["Average", "18-24%", "25-31%"],
              ["Obese", "25%+", "32%+"],
            ]}
          />
        </CardContent>
      </Card>
    </ToolPage>
  );
}

function MetricTile({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "rounded-md border border-primary bg-primary p-4 text-primary-foreground" : "rounded-md border border-border bg-secondary/60 p-4"}>
      <p className={accent ? "text-xs font-medium uppercase tracking-[0.18em] text-primary-foreground/70" : "text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"}>{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight">{value}</p>
      <p className={accent ? "mt-2 text-sm text-primary-foreground/70" : "mt-2 text-sm text-muted-foreground"}>{detail}</p>
    </div>
  );
}

function ProjectionChart({ points, unit }: { points: ProjectionPoint[]; unit: string }) {
  const width = 720;
  const height = 260;
  const padding = 34;
  const maxBodyFat = Math.max(...points.map((point) => point.bodyFat), 40);
  const minBmi = Math.min(...points.map((point) => point.bmi), 15);
  const maxBmi = Math.max(...points.map((point) => point.bmi), 35);

  const x = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const yBodyFat = (value: number) => height - padding - (value / maxBodyFat) * (height - padding * 2);
  const yBmi = (value: number) => height - padding - ((value - minBmi) / Math.max(maxBmi - minBmi, 1)) * (height - padding * 2);
  const bodyFatPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${yBodyFat(point.bodyFat)}`).join(" ");
  const bmiPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${yBmi(point.bmi)}`).join(" ");

  return (
    <div className="overflow-hidden rounded-xl border bg-secondary/30 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Body fat and BMI projection">
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="currentColor" className="text-border" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="currentColor" className="text-border" />
        <path d={bodyFatPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={bmiPath} fill="none" stroke="hsl(var(--foreground))" strokeDasharray="8 6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={point.weight.toFixed(2)}>
            <circle cx={x(index)} cy={yBodyFat(point.bodyFat)} r="4" fill="hsl(var(--primary))" />
            <circle cx={x(index)} cy={yBmi(point.bmi)} r="4" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="2" />
            {index === 0 || index === points.length - 1 ? (
              <text x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : "end"} className="fill-muted-foreground text-[12px]">
                {point.weight.toFixed(1)} {unit}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="mt-3 max-h-56 overflow-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Body fat</th>
              <th className="px-4 py-3">BMI</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr className="border-t" key={point.weight.toFixed(2)}>
                <td className="px-4 py-3 font-mono">{point.weight.toFixed(1)} {unit}</td>
                <td className="px-4 py-3 font-mono">{point.bodyFat.toFixed(1)}%</td>
                <td className="px-4 py-3 font-mono">{point.bmi.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferenceTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-medium">{title}</h3>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary">
            <tr>{headers.map((header) => <th className="px-4 py-3" key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t" key={row.join("-")}>
                {row.map((cell) => <td className="px-4 py-3" key={cell}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ProjectionPoint = {
  weight: number;
  bodyFat: number;
  bmi: number;
};

function calculateFitness(weight: number, height: number, bodyFat: number, metric: boolean) {
  const weightKg = metric ? weight : weight * 0.453592;
  const heightM = metric ? height / 100 : height * 0.0254;
  const leanMass = weight * (1 - bodyFat / 100);
  const targetWeight = leanMass / 0.95;
  const fatMass = weight * (bodyFat / 100);
  const targetFatMass = targetWeight * (targetBodyFat / 100);
  const fatToLose = fatMass - targetFatMass;
  const weightToLose = weight - targetWeight;
  const currentBmi = weightKg / (heightM * heightM);
  const targetBmi = (metric ? targetWeight : targetWeight * 0.453592) / (heightM * heightM);
  const endWeight = Math.max(targetWeight, weight * 0.6);
  const step = (weight - endWeight) / 10;

  const points = Array.from({ length: 11 }, (_, index) => {
    const projectedWeight = weight - step * index;
    const projectedWeightKg = metric ? projectedWeight : projectedWeight * 0.453592;
    return {
      weight: projectedWeight,
      bodyFat: ((projectedWeight - leanMass) / projectedWeight) * 100,
      bmi: projectedWeightKg / (heightM * heightM),
    };
  }).filter((point) => point.bodyFat >= targetBodyFat);

  return {
    leanMass,
    targetWeight,
    fatMass,
    fatToLose,
    weightToLose,
    currentBmi,
    targetBmi,
    points,
  };
}

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  if (bmi < 35) return "Obesity (Class 1)";
  if (bmi < 40) return "Obesity (Class 2)";
  return "Extreme Obesity";
}

function format1(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "-";
}

function round1(value: number) {
  return Number(value.toFixed(1));
}
