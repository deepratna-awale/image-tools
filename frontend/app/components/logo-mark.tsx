import { useId } from "react";

const WRENCH =
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z";

/** The site's mark: a picture with a wrench over its corner. Same drawing as app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  const wrench = `${id}-wrench`;
  const mask = `${id}-mask`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <path id={wrench} d={WRENCH} transform="translate(11 11) scale(0.55)" />
        <mask id={mask}>
          <rect width="24" height="24" fill="#fff" />
          <use href={`#${wrench}`} stroke="#000" strokeWidth={7.5} fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect x="2" y="3" width="17" height="15" rx="2.5" />
        <circle cx="7.5" cy="8.5" r="1.5" />
        <path d="m19 13-3.1-3.1a2 2 0 0 0-2.8 0L5 18" />
      </g>
      <use href={`#${wrench}`} strokeWidth={3.6} />
    </svg>
  );
}
