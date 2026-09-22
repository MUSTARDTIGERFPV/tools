const startAngle = 135;
const sweep = 270;
const size = 320;
const center = size / 2;
const radius = 132;
/** Cropped below the dial: the 270-degree arc leaves the bottom empty. */
const viewHeight = 300;

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: center + r * Math.cos(rad), y: center + r * Math.sin(rad) };
}

function arcPath(from: number, to: number, r: number) {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

type GaugeProps = {
  value: number;
  max: number;
  unit: string;
  /** Short line under the readout: accuracy, ACQUIRING, SIGNAL STALE, etc. */
  status: string;
  alert: boolean;
};

export function Gauge({ value, max, unit, status, alert }: GaugeProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const fraction = clamped / max;
  const needle = startAngle + fraction * sweep;
  const majors = 8;

  return (
    <svg
      className="w-full max-w-[26rem]"
      role="img"
      aria-label={`${value.toFixed(1)} ${unit}`}
      viewBox={`0 0 ${size} ${viewHeight}`}
    >
      <defs>
        <linearGradient id="gs-bezel" x1="0.2" x2="0.8" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--card))" />
          <stop offset="45%" stopColor="hsl(var(--steel))" />
          <stop offset="100%" stopColor="hsl(var(--steel-dark))" />
        </linearGradient>
        <radialGradient id="gs-dial" cx="0.42" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--dial))" />
        </radialGradient>
      </defs>

      {/* Polished case, then the cream dial it holds. */}
      <circle
        cx={center}
        cy={center}
        fill="url(#gs-bezel)"
        r={radius + 20}
        stroke="hsl(var(--steel-dark) / 0.55)"
        strokeWidth={1}
      />
      <circle
        cx={center}
        cy={center}
        fill="url(#gs-dial)"
        r={radius + 13}
        stroke="hsl(var(--steel-dark) / 0.45)"
        strokeWidth={1}
      />

      <path
        d={arcPath(startAngle, startAngle + sweep, radius)}
        fill="none"
        stroke="hsl(var(--steel) / 0.5)"
        strokeWidth={13}
      />
      <path
        d={arcPath(startAngle, Math.max(startAngle + 0.01, needle), radius)}
        fill="none"
        stroke="hsl(var(--foreground) / 0.86)"
        strokeWidth={13}
      />

      {/* Applied markers: a long polished index at each major, hairline between. */}
      {Array.from({ length: majors * 4 + 1 }, (_, i) => {
        const t = i / (majors * 4);
        const angle = startAngle + t * sweep;
        const major = i % 4 === 0;
        const outer = polar(angle, radius - 11);
        const inner = polar(angle, radius - (major ? 27 : 19));
        return (
          <line
            key={`tick-${i}`}
            stroke={major ? "hsl(var(--foreground))" : "hsl(var(--foreground) / 0.35)"}
            strokeWidth={major ? 3 : 1}
            x1={outer.x}
            x2={inner.x}
            y1={outer.y}
            y2={inner.y}
          />
        );
      })}

      {Array.from({ length: majors + 1 }, (_, i) => {
        const t = i / majors;
        const angle = startAngle + t * sweep;
        const at = polar(angle, radius - 44);
        return (
          <text
            key={`label-${i}`}
            className="font-serif"
            dominantBaseline="middle"
            fill="hsl(var(--foreground) / 0.75)"
            fontSize={15}
            textAnchor="middle"
            x={at.x}
            y={at.y}
          >
            {Math.round(t * max)}
          </text>
        );
      })}

      <text
        className="font-mono"
        dominantBaseline="middle"
        fill="hsl(var(--foreground))"
        fontSize={64}
        fontWeight={500}
        letterSpacing={-2}
        textAnchor="middle"
        x={center}
        y={center - 6}
      >
        {value < 10 ? value.toFixed(1) : Math.round(value)}
      </text>
      <text
        dominantBaseline="middle"
        fill="hsl(var(--muted-foreground))"
        fontSize={13}
        letterSpacing={4}
        textAnchor="middle"
        x={center}
        y={center + 34}
      >
        {unit.toUpperCase()}
      </text>
      <text
        className="font-mono"
        dominantBaseline="middle"
        fill={alert ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground) / 0.85)"}
        fontSize={11}
        letterSpacing={1}
        textAnchor="middle"
        x={center}
        y={center + 60}
      >
        {status}
      </text>

      {/* Blued-steel pointer, tracking the chapter ring clear of the readout. */}
      <g
        style={{
          transform: `rotate(${needle}deg)`,
          transformOrigin: `${center}px ${center}px`,
          transition: "transform 250ms linear",
        }}
      >
        <polygon
          fill="hsl(var(--primary))"
          points={`${center + radius - 34},${center - 7} ${center + radius - 34},${center + 7} ${center + radius - 8},${center}`}
          stroke="hsl(var(--card) / 0.85)"
          strokeWidth={0.75}
        />
      </g>
    </svg>
  );
}

type SparklineProps = {
  values: number[];
  max: number;
};

export function Sparkline({ values, max }: SparklineProps) {
  const width = 300;
  const height = 48;
  const span = Math.max(1, max);
  const points = values.map((v, i) => {
    const x = values.length === 1 ? width : (i / (values.length - 1)) * width;
    const y = height - Math.max(0, Math.min(1, v / span)) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className="h-12 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Recent speed trace"
      viewBox={`0 0 ${width} ${height}`}
    >
      <line
        stroke="hsl(var(--border))"
        strokeWidth={1}
        x1={0}
        x2={width}
        y1={height - 2}
        y2={height - 2}
      />
      {points.length > 1 ? (
        <>
          <polygon
            fill="hsl(var(--primary) / 0.12)"
            points={`0,${height} ${points.join(" ")} ${width},${height}`}
          />
          <polyline
            fill="none"
            points={points.join(" ")}
            stroke="hsl(var(--primary))"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}
