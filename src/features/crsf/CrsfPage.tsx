import { useMemo, useState } from "react";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const frameTypes: Record<number, string> = {
  0x02: "CRSF_FRAMETYPE_GPS",
  0x14: "CRSF_FRAMETYPE_LINK_STATISTICS",
  0x16: "CRSF_FRAMETYPE_RC_CHANNELS_PACKED",
  0x1e: "CRSF_FRAMETYPE_ATTITUDE",
  0x21: "CRSF_FRAMETYPE_FLIGHT_MODE",
  0x28: "CRSF_FRAMETYPE_DEVICE_PING",
  0x29: "CRSF_FRAMETYPE_DEVICE_INFO",
  0x32: "CRSF_FRAMETYPE_COMMAND",
};

const examples = [
  {
    label: "RC channels",
    value: "EE-18-16-E0-03-1F-F8-C0-07-3E-F0-81-0F-7C-E0-03-1F-F8-C0-07-3E-F0-81-0F-7C-AD",
  },
  { label: "Link statistics", value: "C8-0C-14-30-40-64-09-01-07-0A-32-64-09-65" },
  { label: "GPS", value: "C8-11-02-1C-5C-24-24-B7-16-A8-E8-03-70-23-28-04-4C-08-E0" },
];

export function CrsfPage() {
  const [input, setInput] = useState(examples[0].value);
  const parsed = useMemo(() => parseFrame(input), [input]);

  return (
    <ToolPage title="CRSF Message Parser">
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Frame input</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="EE-18-16-..."
            />
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button key={example.label} variant="outline" size="sm" onClick={() => setInput(example.value)}>
                  {example.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {parsed.error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">{parsed.error}</CardContent>
          </Card>
        ) : null}

        {parsed.bytes.length >= 3 ? (
          <Card>
            <CardHeader>
              <CardTitle>Frame</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                <ResultTile label="Sync" value={hex(parsed.sync)} />
                <ResultTile
                  accent={parsed.lengthValid}
                  label="Length"
                  value={`${hex(parsed.length)} / ${parsed.length}`}
                />
                <div className="rounded-xl border bg-secondary/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Type</p>
                  <p className="mt-3 font-mono text-3xl font-semibold tracking-tight">{hex(parsed.type)}</p>
                  <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
                    {frameTypes[parsed.type] ?? "Unknown"}
                  </p>
                </div>
                <ResultTile
                  accent={parsed.crcValid}
                  label="CRC"
                  value={hex(parsed.crcObserved)}
                  unit={parsed.crcValid ? "valid" : `calc ${hex(parsed.crcCalculated)}`}
                />
              </div>
              <div className="rounded-xl border bg-secondary/40 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Payload</p>
                <p className="mt-3 break-all font-mono text-sm">{parsed.payload.map(hex).join(" ") || "-"}</p>
              </div>
              <DecodedFrame parsed={parsed} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ToolPage>
  );
}

function DecodedFrame({ parsed }: { parsed: ParsedFrame }) {
  if (parsed.type === 0x16) {
    const channels = parseRcChannels(parsed.payload);
    return (
      <DataTable
        headers={["Channel", "µs", "Raw"]}
        rows={channels.map((channel, index) => [
          `Channel ${index + 1}`,
          ticksToUs(channel).toFixed(0),
          `${channel} / ${hex(channel)} / 0b${channel.toString(2)}`,
        ])}
      />
    );
  }

  if (parsed.type === 0x14) {
    const stats = parseLinkStats(parsed.payload);
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {stats.map(([label, value]) => (
          <ResultTile key={label} label={label} value={value} />
        ))}
      </div>
    );
  }

  if (parsed.type === 0x02) {
    const gps = parseGps(parsed.payload);
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {gps.rows.map(([label, value]) => (
          <ResultTile key={label} label={label} value={value} />
        ))}
        <a className="text-sm font-medium text-accent underline decoration-accent/40 decoration-1 underline-offset-4 hover:decoration-accent" href={gps.mapUrl} target="_blank" rel="noreferrer">
          View on Google Maps
        </a>
      </div>
    );
  }

  return null;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary">
          <tr>{headers.map((header) => <th className="px-4 py-3 font-medium" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t" key={row.join("-")}>
              {row.map((cell) => <td className="px-4 py-3 font-mono" key={cell}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ParsedFrame = ReturnType<typeof parseFrame>;

function parseFrame(input: string) {
  const bytes = parseFrameInput(input);
  const sync = bytes[0] ?? 0;
  const length = bytes[1] ?? 0;
  const type = bytes[2] ?? 0;
  const payload = bytes.slice(3, bytes.length - 1);
  const crcObserved = bytes[bytes.length - 1] ?? 0;
  const crcCalculated = crc8DvbS2(bytes.slice(2, -1));

  return {
    bytes,
    sync,
    length,
    type,
    payload,
    crcObserved,
    crcCalculated,
    crcValid: crcCalculated === crcObserved,
    lengthValid: length + 2 === bytes.length,
    error: input.trim() && bytes.some(Number.isNaN) ? "Input contains invalid hex bytes." : "",
  };
}

function parseFrameInput(input: string) {
  const cleaned = input.replace(/\s+/g, "").replace(/[-,]/g, "");
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.substring(i, i + 2), 16));
  }

  return bytes.filter((byte) => Number.isFinite(byte));
}

function crc8DvbS2(data: number[]) {
  let crc = 0x00;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0xd5) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function ticksToUs(ticks: number) {
  return (ticks - 992) * 5 / 8 + 1500;
}

function parseRcChannels(payload: number[]) {
  const bitStream = payload.flatMap((byte) => Array.from({ length: 8 }, (_, bit) => (byte >> bit) & 1));

  return Array.from({ length: 16 }, (_, channel) => {
    let value = 0;
    for (let bit = 0; bit < 11; bit++) {
      value |= (bitStream[channel * 11 + bit] ?? 0) << bit;
    }
    return value;
  });
}

function parseLinkStats(payload: number[]) {
  const signed = (value: number) => (value < 128 ? value : value - 256);
  return [
    ["Uplink RSSI 1", `-${payload[0]} dBm`],
    ["Uplink RSSI 2", `-${payload[1]} dBm`],
    ["Uplink LQ", `${payload[2]}%`],
    ["Uplink SNR", `${signed(payload[3])} dB`],
    ["Active antenna", String(payload[4])],
    ["RF mode", String(payload[5])],
    ["TX power", `${payload[6]} mW`],
    ["Downlink RSSI", `-${payload[7]} dBm`],
    ["Downlink LQ", `${payload[8]}%`],
    ["Downlink SNR", `${signed(payload[9])} dB`],
  ];
}

function parseGps(payload: number[]) {
  const int32 = (offset: number) => {
    const value = (payload[offset] << 24) | (payload[offset + 1] << 16) | (payload[offset + 2] << 8) | payload[offset + 3];
    return value > 0x7fffffff ? value - 0x100000000 : value;
  };
  const latitude = int32(0) / 10000000;
  const longitude = int32(4) / 10000000;
  const speed = ((payload[8] << 8) | payload[9]) / 10;
  const heading = ((payload[10] << 8) | payload[11]) / 100;
  const altitude = ((payload[12] << 8) | payload[13]) - 1000;
  const satellites = payload[14];

  return {
    mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
    rows: [
      ["Latitude", latitude.toFixed(7)],
      ["Longitude", longitude.toFixed(7)],
      ["Speed", `${speed.toFixed(1)} km/h`],
      ["Heading", `${heading.toFixed(2)} deg`],
      ["Altitude", `${altitude} m`],
      ["Satellites", String(satellites)],
    ],
  };
}

function hex(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}
