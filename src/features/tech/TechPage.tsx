import { useState } from "react";
import { NumberField } from "@/components/field";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function TechPage() {
  const [bytes, setBytes] = useState(1024);
  const [bitsPerSecond, setBitsPerSecond] = useState(1000000);
  const [timeSeconds, setTimeSeconds] = useState(60);
  const [prefix, setPrefix] = useState<"decimal" | "binary">("decimal");
  const divisor = prefix === "decimal" ? 1000 : 1024;

  return (
    <ToolPage title="Tech Calculators">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>Convert bytes into larger units.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-80 flex-col gap-5">
            <NumberField id="bytes" label="Bytes" value={bytes} onChange={setBytes} />
            <div className="grid gap-2">
              <Label>Prefix</Label>
              <Select value={prefix} onChange={(event) => setPrefix(event.target.value as "decimal" | "binary")}>
                <option value="decimal">Decimal (KB, MB, GB)</option>
                <option value="binary">Binary (KiB, MiB, GiB)</option>
              </Select>
            </div>
            <div className="mt-auto grid gap-3">
              <ResultTile accent label={prefix === "decimal" ? "MB" : "MiB"} value={(bytes / divisor ** 2).toLocaleString("en-US", { maximumFractionDigits: 3 })} />
              <ResultTile label={prefix === "decimal" ? "GB" : "GiB"} value={(bytes / divisor ** 3).toLocaleString("en-US", { maximumFractionDigits: 3 })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer Time</CardTitle>
            <CardDescription>Estimate transfer size from bitrate and time.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-80 flex-col gap-5">
            <NumberField id="bps" label="Bitrate (bit/s)" value={bitsPerSecond} onChange={setBitsPerSecond} />
            <NumberField id="seconds" label="Time (seconds)" value={timeSeconds} onChange={setTimeSeconds} />
            <div className="mt-auto grid gap-3">
              <ResultTile accent label="Transferred" value={((bitsPerSecond * timeSeconds) / 8 / 1000 ** 2).toLocaleString("en-US", { maximumFractionDigits: 2 })} unit="MB" />
              <ResultTile label="Transferred" value={((bitsPerSecond * timeSeconds) / 8 / 1024 ** 2).toLocaleString("en-US", { maximumFractionDigits: 2 })} unit="MiB" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ToolPage>
  );
}
