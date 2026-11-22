/** Skill logo: three rising bars (getting better with practice), in the style of the Slate and Self logos. */
export function SkillLogo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="skill-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill="url(#skill-logo-bg)" />
      <rect x="2" y="2" width="1020" height="1020" rx="230" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="4" />
      <rect x="227" y="542" width="150" height="200" rx="44" fill="#fff" fillOpacity="0.34" />
      <rect x="437" y="412" width="150" height="330" rx="44" fill="#fff" fillOpacity="0.66" />
      <rect x="647" y="282" width="150" height="460" rx="44" fill="#fff" />
    </svg>
  );
}
