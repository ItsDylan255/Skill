import {
  BookOpen,
  Camera,
  ChefHat,
  Code,
  Dumbbell,
  Guitar,
  Languages,
  Mountain,
  Music,
  Palette,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export const HOBBY_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  guitar: Guitar,
  music: Music,
  languages: Languages,
  book: BookOpen,
  dumbbell: Dumbbell,
  mountain: Mountain,
  palette: Palette,
  camera: Camera,
  code: Code,
  chef: ChefHat,
  trophy: Trophy,
};

export const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#71717a",
];

export function HobbyIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = HOBBY_ICONS[name] ?? Sparkles;
  return <Icon size={size} />;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className="size-6 rounded-full ring-offset-2 ring-offset-card transition"
          style={{
            backgroundColor: c,
            boxShadow: value === c ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(HOBBY_ICONS).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex size-8 items-center justify-center rounded-md border transition ${
            value === key ? "border-fg/30 bg-elev text-fg" : "border-line text-muted hover:bg-elev"
          }`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
