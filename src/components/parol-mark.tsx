type ParolMarkProps = { className?: string };

export function ParolMark({ className }: ParolMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 270"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M120 8 141 59 186 30 166 79 224 90 173 111 203 163 151 143 120 198 89 143 37 163 67 111 16 90 74 79 54 30 99 59Z"
        fill="#8F0500"
        stroke="#FFECC5"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m120 37 17 49 47 4-46 19-18 45-18-45-46-19 47-4Z"
        fill="#044529"
        stroke="#FFFBE9"
        strokeOpacity=".8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m120 45 13 43-13 14-13-14Z" fill="#562400" />
      <path d="m179 90-43 13-14-15Z" fill="#FFECC5" />
      <path d="m120 151-13-43 13-13 13 13Z" fill="#8F0500" />
      <path d="m61 90 43-13 16 11Z" fill="#FFECC5" />
      <circle cx="120" cy="96" r="12" fill="#FFFBE9" />
      <circle cx="120" cy="96" r="5" fill="#8F0500" />
      <path d="M105 184v36m15-32v42m15-46v36" stroke="#FFECC5" strokeWidth="2" strokeLinecap="round" />
      <path d="m120 226 13 13-13 20-13-20Z" fill="#8F0500" stroke="#FFFBE9" strokeWidth="1.5" />
      <path d="m120 230 7 9-7 11-7-11Z" fill="#FFECC5" />
    </svg>
  );
}
