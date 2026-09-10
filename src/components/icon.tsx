import type { CSSProperties } from "react";

const paths = {
  video: "M3 5h12v14H3zM15 10l6-4v12l-6-4Z",
  settings: "M4 7h16M4 17h16M9 4v6M15 14v6",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  library: "M4 4h4v16H4zM11 4h4v16h-4zM18 4l3 15M4 8h4M11 16h4",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
  download: "M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5",
  paperclip: "m8 12 7-7a3 3 0 0 1 4 4L9 19a5 5 0 0 1-7-7L13 1m-6 12 8-8",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  sparkle:
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4",
  file: "M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8ZM14 2v6h6M8 13h8M8 17h5",
  box: "m12 3 9 5-9 5-9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5",
  book: "M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15",
  calendar:
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M7 2v4M17 2v4M3 10h18M7 14h2M15 14h2M7 18h2",
  edit: "m15 5 4 4M4 20l4-1L21 6a2 2 0 0 0-4-4L4 15Zm9-16 4 4",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  check: "m5 12 4 4L19 6",
  chevron: "m9 5 7 7-7 7",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
