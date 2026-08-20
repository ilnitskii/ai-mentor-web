interface IconProps {
  name: "today" | "learn" | "progress" | "settings" | "arrow";
}

const paths = {
  today: "M4 5.5h16v14H4z M8 3v5 M16 3v5 M4 10h16",
  learn:
    "M4 5.5c3-1 5.3-.6 8 1.5v13c-2.7-2.1-5-2.5-8-1.5z M20 5.5c-3-1-5.3-.6-8 1.5v13c2.7-2.1 5-2.5 8-1.5z",
  progress: "M5 19V11 M12 19V5 M19 19v-8",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 12l2-1-2-3-2 .5-1.5-1.5.5-2-3-1-1.5 1-2-.5L5 8l-2 3 2 1v2l-2 1 2 3 2-.5L8.5 19l.5 2h6l.5-2 1.5-1.5 2 .5 2-3-2-1z",
  arrow: "M5 12h14 M14 7l5 5-5 5",
} as const;

export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
