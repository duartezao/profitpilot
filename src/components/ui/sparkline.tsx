import { cn } from "@/lib/utils";

/** Sparkline simples (linha fina, sem eixos), conforme design system. */
export function Sparkline({
  data,
  className,
  color,
  width = 96,
  height = 28,
}: {
  data: number[];
  className?: string;
  /** Cor da linha (hex). Por defeito accent. */
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn(!color && "text-accent", className)}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        stroke={color ?? "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
