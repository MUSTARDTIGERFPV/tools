import {
  Activity,
  Calculator,
  Clock3,
  Cpu,
  Dumbbell,
  FileSpreadsheet,
  Gauge,
  Navigation,
  Radio,
  Route,
  SatelliteDish,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompensationPage } from "@/features/compensation/CompensationPage";
import { CrsfPage } from "@/features/crsf/CrsfPage";
import { ElrsIdentifyPage } from "@/features/elrs/ElrsIdentifyPage";
import { FitnessPage } from "@/features/fitness/FitnessPage";
import { GpsPage } from "@/features/gps/GpsPage";
import { MavSimPage } from "@/features/mav/MavSimPage";
import { elrsConfig, mlrsConfig, tbsConfig } from "@/features/range/range-data";
import { RangePage } from "@/features/range/RangePage";
import { RfPage } from "@/features/rf/RfPage";
import { TechPage } from "@/features/tech/TechPage";
import { TtnSheetPage } from "@/features/ttn/TtnSheetPage";

const tools = [
  {
    title: "RF Calculators",
    description: "Power, FSPL, range, RSSI, wavelength, beamwidth, and voltage calculators.",
    href: "/rf-calculators/",
    icon: Radio,
    category: "Radio",
  },
  {
    title: "ExpressLRS Range",
    description: "Estimate range for an ExpressLRS control link.",
    href: "/elrs-range/",
    icon: SatelliteDish,
    category: "Radio",
  },
  {
    title: "mLRS Range",
    description: "Calculate link distance for mLRS configurations.",
    href: "/mlrs-range/",
    icon: Route,
    category: "Radio",
  },
  {
    title: "TBS Range",
    description: "Estimate Crossfire setup performance.",
    href: "/tbs-range/",
    icon: Gauge,
    category: "Radio",
  },
  {
    title: "Tech Calculators",
    description: "Technical conversion utilities and calculators.",
    href: "/tech-calculators/",
    icon: Calculator,
    category: "Utility",
  },
  {
    title: "CRSF Parser",
    description: "Interpret CRSF byte messages.",
    href: "/crsf/",
    icon: Activity,
    category: "Protocol",
  },
  {
    title: "ELRS Target Identifier",
    description: "Plug in an ExpressLRS RX or TX over USB and find its chip, MAC, target, and pin map.",
    href: "/elrs-identify/",
    icon: Cpu,
    category: "Radio",
  },
  {
    title: "TTN Spreadsheet Mapper",
    description: "Map TTN gateways from spreadsheet data.",
    href: "/ttn-sheet/",
    icon: FileSpreadsheet,
    category: "Mapping",
  },
  {
    title: "Compensation Clock",
    description: "Track the value of a working day in real time.",
    href: "/compensation/",
    icon: Clock3,
    category: "Time",
  },
  {
    title: "GPS Speedometer",
    description: "Live speed, heading, trip stats, and GNSS receiver diagnostics.",
    href: "/gps-speedometer/",
    icon: Navigation,
    category: "Navigation",
  },
  {
    title: "Fitness Calculator",
    description: "Chart fitness progress and projections.",
    href: "/fitness/",
    icon: Dumbbell,
    category: "Fitness",
  },
];

export function App() {
  const path = window.location.pathname;

  return <AppShell activePath={path}>{route(path)}</AppShell>;
}

function route(path: string) {
  if (path.startsWith("/rf-calculators")) return <RfExperience />;
  if (path.startsWith("/elrs-range")) return <RangePage config={elrsConfig} />;
  if (path.startsWith("/mlrs-range")) return <RangePage config={mlrsConfig} />;
  if (path.startsWith("/tbs-range")) return <RangePage config={tbsConfig} />;
  if (path.startsWith("/crsf")) return <CrsfPage />;
  if (path.startsWith("/elrs-identify")) return <ElrsIdentifyPage />;
  if (path.startsWith("/compensation")) return <CompensationPage />;
  if (path.startsWith("/fitness")) return <FitnessPage />;
  if (path.startsWith("/gps-speedometer")) return <GpsPage />;
  if (path.startsWith("/tech-calculators")) return <TechPage />;
  if (path.startsWith("/ttn-sheet")) return <TtnSheetPage />;
  if (path.startsWith("/mav-sim")) return <MavSimPage />;

  return <Home />;
}

function RfExperience() {
  return (
    <>
      <PageHeader
        title="RF Calculators"
        statLabel="Free-space model"
        stat="These calculators model ideal free-space behavior. Use terrain, Fresnel clearance, polarization, and noise margin before treating results as field expectations."
      />
      <RfPage />
    </>
  );
}

function Home() {
  return (
    <>
      <PageHeader
        eyebrow="Calculators & field tools"
        title="MUSTARDTIGER Tools"
        description="A small workshop of radio, protocol, and field instruments. No accounts, no tracking, everything runs in the browser."
      />
      <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <a key={tool.href} href={tool.href} className="group">
              <Card className="h-full overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_1px_1px_hsl(30_10%_14%/0.05),0_18px_36px_-22px_hsl(224_62%_32%/0.55)]">
                <CardHeader>
                  <div className="mb-5 flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-md border border-border bg-secondary text-accent">
                      <tool.icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {tool.category}
                    </span>
                  </div>
                  <CardTitle>{tool.title}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-accent underline decoration-accent/40 decoration-1 underline-offset-4 transition group-hover:decoration-accent">
                    Open tool
                  </span>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
