import { useEffect, useMemo, useState } from "react";
import { NumberField } from "@/components/field";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const storageKey = "compensationValues";

export function CompensationPage() {
  const [now, setNow] = useState(new Date());
  const [startDate, setStartDate] = useState(todayIso());
  const [previousPay, setPreviousPay] = useState(0);
  const [yearlySalary, setYearlySalary] = useState(0);
  const [yearlyBonus, setYearlyBonus] = useState(0);
  const [yearlyStock, setYearlyStock] = useState(0);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    setStartDate(saved.startDate || todayIso());
    setPreviousPay(Number(saved.previousPay) || 0);
    setYearlySalary(Number(saved.yearlySalary) || 0);
    setYearlyBonus(Number(saved.yearlyBonus) || 0);
    setYearlyStock(Number(saved.yearlyStock) || 0);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ startDate, previousPay, yearlySalary, yearlyBonus, yearlyStock }),
    );
  }, [previousPay, startDate, yearlyBonus, yearlySalary, yearlyStock]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const calc = useMemo(() => calculateCompensation({
    now,
    previousPay,
    startDate,
    yearlyBonus,
    yearlySalary,
    yearlyStock,
  }), [now, previousPay, startDate, yearlyBonus, yearlySalary, yearlyStock]);

  return (
    <ToolPage title="Compensation Clock">
      <div className="grid gap-5 lg:grid-cols-[24rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="start-date">Start date</Label>
              <Input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <NumberField id="previous-pay" label="Previous pay this year" value={previousPay} onChange={setPreviousPay} />
            <NumberField id="yearly-salary" label="Yearly salary" value={yearlySalary} onChange={setYearlySalary} />
            <NumberField id="yearly-bonus" label="Yearly bonus" value={yearlyBonus} onChange={setYearlyBonus} />
            <NumberField id="yearly-stock" label="Yearly stock" value={yearlyStock} onChange={setYearlyStock} />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            <ResultTile accent label="Today" value={money(calc.todayEarnings)} />
            <ResultTile label="Total so far" value={money(calc.totalSoFar)} />
            <ResultTile label="Total yearly" value={money(calc.totalYearly)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Progress label="Day" value={calc.dayProgress} />
              <Progress label="Year" value={calc.yearProgress} />
              <ResultTile label="Tenure" value={calc.tenure} />
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Rate label="Daily" full={calc.daily24} work={calc.daily8} />
            <Rate label="Hourly" full={calc.hourly24} work={calc.hourly8} />
            <Rate label="Minute" full={calc.minute24} work={calc.minute8} />
            <Rate label="Second" full={calc.second24} work={calc.second8} />
          </div>
        </div>
      </div>
    </ToolPage>
  );
}

function Rate({ label, full, work }: { label: string; full: number; work: number }) {
  return <ResultTile label={label} value={money(full)} unit={`24h / ${money(work)} 8h`} />;
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">{value.toFixed(3)}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function calculateCompensation(input: {
  now: Date;
  startDate: string;
  previousPay: number;
  yearlySalary: number;
  yearlyBonus: number;
  yearlyStock: number;
}) {
  const start = new Date(`${input.startDate}T00:00:00`);
  const totalYearly = input.yearlySalary + input.yearlyBonus + input.yearlyStock;
  const daily24 = totalYearly / 365;
  const hourly24 = daily24 / 24;
  const minute24 = hourly24 / 60;
  const second24 = minute24 / 60;
  const daily8 = totalYearly / 260;
  const hourly8 = daily8 / 8;
  const minute8 = hourly8 / 60;
  const second8 = minute8 / 60;
  const daysSinceStart = Number.isFinite(start.getTime()) ? (input.now.getTime() - start.getTime()) / 86400000 : 0;
  const years = Math.floor(daysSinceStart / 365);
  const days = Math.floor(daysSinceStart % 365);
  const totalSoFar = daily24 * Math.max(0, daysSinceStart) + input.previousPay;
  const workStart = new Date(input.now);
  workStart.setHours(9, 0, 0, 0);
  const workEnd = new Date(input.now);
  workEnd.setHours(17, 0, 0, 0);
  const workedMs = Math.max(0, Math.min(input.now.getTime(), workEnd.getTime()) - workStart.getTime());
  const todayEarnings = input.now > workEnd ? daily8 : hourly8 * (workedMs / 3600000);
  const dayStart = new Date(input.now);
  dayStart.setHours(0, 0, 0, 0);
  const yearStart = new Date(input.now.getFullYear(), 0, 1);

  return {
    totalYearly,
    daily24,
    hourly24,
    minute24,
    second24,
    daily8,
    hourly8,
    minute8,
    second8,
    totalSoFar,
    todayEarnings,
    dayProgress: ((input.now.getTime() - dayStart.getTime()) / 86400000) * 100,
    yearProgress: ((input.now.getTime() - yearStart.getTime()) / (365 * 86400000)) * 100,
    tenure: years > 0 ? `${years}y ${days}d` : `${Math.max(0, Math.floor(daysSinceStart))}d`,
  };
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
