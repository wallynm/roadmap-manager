import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "currentColor",
  "aria-hidden": true,
});

export function PriorityNone({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="1"  y="7.5" width="2.5" height="1.5" rx="0.5" opacity="0.5" />
      <rect x="6.75" y="7.5" width="2.5" height="1.5" rx="0.5" opacity="0.5" />
      <rect x="12.5" y="7.5" width="2.5" height="1.5" rx="0.5" opacity="0.5" />
    </svg>
  );
}

export function PriorityUrgent({ size = 14, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="currentColor" opacity="0.15" />
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="7.25" y="3.5" width="1.5" height="6" rx="0.75" />
      <rect x="7.25" y="11" width="1.5" height="1.5" rx="0.75" />
    </svg>
  );
}

// Bars: 3 columns, left=short, right=tall. Full = all lit, dimmed = opacity 0.25.
function Bars({ lit }: { lit: 1 | 2 | 3 }) {
  const bars = [
    { x: 1,    y: 9,  h: 6 },   // left  – short
    { x: 6.75, y: 5,  h: 10 },  // mid   – medium
    { x: 12.5, y: 1,  h: 14 },  // right – tall
  ] as const;

  return (
    <>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x} y={b.y}
          width={2.75} height={b.h}
          rx="0.75"
          opacity={i < lit ? 1 : 0.2}
        />
      ))}
    </>
  );
}

export function PriorityHigh({ size = 14, ...p }: Props) {
  return <svg {...base(size)} {...p}><Bars lit={3} /></svg>;
}

export function PriorityMedium({ size = 14, ...p }: Props) {
  return <svg {...base(size)} {...p}><Bars lit={2} /></svg>;
}

export function PriorityLow({ size = 14, ...p }: Props) {
  return <svg {...base(size)} {...p}><Bars lit={1} /></svg>;
}
