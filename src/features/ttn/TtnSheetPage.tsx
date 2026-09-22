import { useState } from "react";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Row = Record<string, string>;

export function TtnSheetPage() {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const points = rows.filter((row) => row.latitude && row.longitude);

  async function loadSheet() {
    setError("");
    const id = url.match(/[-\w]{25,}/)?.[0];
    if (!id) {
      setError("Enter a valid Google Sheet URL.");
      return;
    }
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
    const csv = await response.text();
    setRows(parseCsv(csv));
  }

  return (
    <ToolPage title="TTN Spreadsheet Mapper" note="Expected columns: latitude, longitude, and optionally gatewayId." noteLabel="Input">
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Google Sheet</CardTitle>
            <CardDescription>Load rows from a public or accessible Google Sheet CSV export.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Google Sheet URL" />
            <Button className="w-fit" onClick={loadSheet}>Load sheet</Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <ResultTile accent label="Rows" value={String(rows.length)} />
          <ResultTile label="Points" value={String(points.length)} />
          <ResultTile label="Gateways" value={String(new Set(points.map((row) => row.gatewayId).filter(Boolean)).size)} />
        </div>

        {points.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="px-4 py-3">Latitude</th>
                      <th className="px-4 py-3">Longitude</th>
                      <th className="px-4 py-3">Gateway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.slice(0, 100).map((row, index) => (
                      <tr className="border-t" key={`${row.latitude}-${row.longitude}-${index}`}>
                        <td className="px-4 py-3 font-mono">{row.latitude}</td>
                        <td className="px-4 py-3 font-mono">{row.longitude}</td>
                        <td className="px-4 py-3 font-mono">{row.gatewayId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ToolPage>
  );
}

function parseCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line: string) {
  return line.match(/("([^"]|"")*"|[^,]+)/g)?.map((value) => value.replace(/^"|"$/g, "").replace(/""/g, "\"")) ?? [];
}
