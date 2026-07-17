import type { SVGProps } from "react";

/**
 * The official Markdown mark (community standard, CommonMark / markdown-mark).
 * lucide has no Markdown brand glyph, so we vendor this single well-known SVG.
 * Uses currentColor for both the frame and the "M↓", so it inherits the title color.
 */
export function MarkdownMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 208 128"
      role="img"
      aria-label="Markdown"
      className={className}
      {...props}
    >
      <rect
        x="5"
        y="5"
        width="198"
        height="118"
        rx="14"
        ry="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
      />
      <path
        fill="currentColor"
        d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0l-30-33h20V30h20v35h20z"
      />
    </svg>
  );
}
