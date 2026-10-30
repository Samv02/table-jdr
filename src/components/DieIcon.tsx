import type { SVGProps } from "react";

const faces: Record<number, React.ReactNode> = {
  4: <polygon points="12,2 22,20 2,20" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  6: (
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  ),
  8: (
    <>
      <polygon points="12,2 21,12 12,22 3,12" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  10: (
    <>
      <polygon points="12,2 21,10 12,22 3,10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10l9 4 9-4M12 14v8" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  12: (
    <>
      <polygon
        points="12,2 20.5,6.5 22,15 16,21.5 8,21.5 2,15 3.5,6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <polygon
        points="12,7 16.5,10.5 15,16 9,16 7.5,10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </>
  ),
  20: (
    <>
      <polygon
        points="12,2 21,7 21,17 12,22 3,17 3,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <polygon points="12,6 18,16 6,16" fill="none" stroke="currentColor" strokeWidth="1" />
    </>
  ),
  100: (
    <>
      <polygon points="12,2 21,10 12,22 3,10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="12"
        y="13.5"
        fontSize="6"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="monospace"
      >
        %
      </text>
    </>
  ),
};

export function DieIcon({ sides = 10, ...props }: SVGProps<SVGSVGElement> & { sides?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      {faces[sides] ?? faces[10]}
    </svg>
  );
}
