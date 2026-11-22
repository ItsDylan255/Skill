import clsx from "clsx";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Toaster, toast as sonnerToast } from "sonner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={clsx(
        // same as Slate's btn / btn-primary / btn-outline / btn-ghost / btn-danger
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent font-medium whitespace-nowrap outline-none",
        "transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.97] [&_svg]:shrink-0 [&_svg]:opacity-80",
        "disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/30",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.75 text-sm",
        variant === "primary" && "border-primary bg-primary text-primary-fg shadow-xs hover:bg-primary/90",
        variant === "secondary" && "border-input bg-card text-fg shadow-xs/5 hover:bg-elev",
        variant === "ghost" && "text-fg hover:bg-elev",
        variant === "danger" && "text-bad-fg hover:bg-bad/8",
        className,
      )}
    />
  );
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-icon transition-colors",
        "hover:bg-elev hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    />
  );
}

const fieldClass =
  "w-full rounded-lg border border-input bg-bg dark:bg-white/[0.03] px-2.5 text-sm text-fg shadow-xs/5 outline-none transition-colors placeholder:text-muted/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20";

/** borderless field that shows on hover, for the properties column (Slate's input-ghost) */
const ghostFieldClass = "-ml-2 h-7 cursor-pointer rounded-md px-2 text-[13px] text-fg hover:bg-elev";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(fieldClass, "h-8", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(fieldClass, "min-h-20 py-2", className)} />;
}

type Opt = { value: string; label: ReactNode; group?: string; disabled?: boolean };

/** Reads <option>/<optgroup> children, so callers keep writing plain select markup. */
function readOptions(children: ReactNode, group?: string): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode; label?: string; disabled?: boolean }>(c)) return;
    if (c.type === "optgroup") out.push(...readOptions(c.props.children, c.props.label));
    else if (c.type === "option")
      out.push({ value: String(c.props.value ?? ""), label: c.props.children, group, disabled: c.props.disabled });
  });
  return out;
}

/**
 * Dropdown in Slate's style. Same API as a native <select> (value, onChange
 * with e.target.value, <option> children), but renders its own menu.
 */
export function Select({
  className,
  value,
  onChange,
  children,
  disabled,
  ghost,
}: SelectHTMLAttributes<HTMLSelectElement> & { ghost?: boolean }) {
  const pop = usePopover();
  const opts = readOptions(children);
  const current = opts.find((o) => o.value === String(value ?? ""));
  const pick = (v: string) => {
    pop.close();
    const target = { value: v };
    onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={pop.open}
        className={clsx(
          "flex w-full min-w-0 items-center gap-2 text-left outline-none transition-colors disabled:opacity-50",
          ghost ? ghostFieldClass : clsx(fieldClass, "h-8 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"),
          pop.anchor && (ghost ? "bg-elev" : "border-ring ring-[3px] ring-ring/20"),
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? <span className="text-muted/70">Wählen…</span>}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted/70" />
      </button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} matchWidth className="min-w-44">
          {opts.map((o, i) => (
            <div key={o.value + i}>
              {o.group && o.group !== opts[i - 1]?.group && (
                <>
                  {i > 0 && <MenuSeparator />}
                  <MenuLabel>{o.group}</MenuLabel>
                </>
              )}
              <MenuItem
                active={o.value === current?.value}
                right={o.value === current?.value && <Check size={13} />}
                onClick={() => !o.disabled && pick(o.value)}
              >
                {o.label}
              </MenuItem>
            </div>
          ))}
        </Popover>
      )}
    </>
  );
}

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Date field with a small calendar popover, like Slate's due date picker. Value: "YYYY-MM-DD" or "". */
export function DateInput({
  value,
  onChange,
  placeholder = "Kein Datum",
  ghost,
  className,
}: {
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  ghost?: boolean;
  className?: string;
}) {
  const pop = usePopover();
  return (
    <>
      <button
        type="button"
        onClick={pop.open}
        className={clsx(
          "group flex w-full min-w-0 items-center gap-2 text-left outline-none transition-colors",
          ghost ? ghostFieldClass : clsx(fieldClass, "h-8"),
          pop.anchor && (ghost ? "bg-elev" : "border-ring ring-[3px] ring-ring/20"),
          className,
        )}
      >
        <CalendarDays size={14} className="shrink-0 text-muted" />
        <span className={clsx("min-w-0 flex-1 truncate", !value && "text-muted/70")}>
          {value ? fromKey(value).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : placeholder}
        </span>
        {value && (
          <span
            role="button"
            title="Entfernen"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="hidden size-4 shrink-0 items-center justify-center rounded text-muted group-hover:flex hover:bg-elev hover:text-fg"
          >
            <X size={12} />
          </span>
        )}
      </button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className="w-64 p-2">
          <Calendar
            value={value || null}
            onChange={(v) => {
              onChange(v);
              pop.close();
            }}
          />
        </Popover>
      )}
    </>
  );
}

export function Calendar({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const today = keyOf(new Date());
  const [month, setMonth] = useState(() => {
    const d = value ? fromKey(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // grid starts on the Monday on or before the 1st
  const first = (month.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - first + i));
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center gap-1 pl-1">
        <span className="flex-1 text-[13px] font-medium">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <IconButton label="Vorheriger Monat" className="size-6" onClick={() => shift(-1)}>
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton label="Nächster Monat" className="size-6" onClick={() => shift(1)}>
          <ChevronRight size={14} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const k = keyOf(d);
          const selected = k === value;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={clsx(
                "tabular flex h-8 items-center justify-center rounded-md text-[13px] transition-colors",
                selected
                  ? "bg-primary font-medium text-primary-fg"
                  : k === today
                    ? "bg-elev font-semibold text-fg"
                    : d.getMonth() !== month.getMonth()
                      ? "text-muted/50 hover:bg-elev"
                      : "text-fg hover:bg-elev",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
        {[
          { label: "Heute", days: 0 },
          { label: "Morgen", days: 1 },
          { label: "Nächste Woche", days: 7 },
        ].map((q) => (
          <Badge key={q.label} as="button" onClick={() => {
              const t = new Date();
              onChange(keyOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() + q.days)));
            }}
          >
            {q.label}
          </Badge>
        ))}
        {value && (
          <Badge as="button" className="ml-auto text-muted" onClick={() => onChange("")}>
            Entfernen
          </Badge>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/**
 * Window on top of the page. Built on Base UI's Dialog: focus stays inside, Esc and a click
 * outside close only the topmost window, focus returns to where it was.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  headerRight,
  width = "max-w-lg",
  noPadding,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  width?: string;
  noPadding?: boolean;
}) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(o, details) => {
        if (o) return;
        // Esc with a menu open closes only the menu
        if (details.reason === "escape-key" && openPopovers > 0) return;
        onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/32 backdrop-blur-[1px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-6 pt-[10vh]">
          <BaseDialog.Popup
            // keyboard: focus moves into the window; mouse: fields with autoFocus keep it
            initialFocus={(type) => (type === "keyboard" ? true : undefined)}
            className={clsx(
              "pointer-events-auto flex max-h-[84vh] w-full flex-col rounded-2xl border border-line bg-card shadow-2xl/10 outline-none",
              "transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
              width,
            )}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3.5">
              <BaseDialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">{title}</BaseDialog.Title>
              {headerRight}
              <IconButton label="Schließen (Esc)" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className={clsx("min-h-0 flex-1 overflow-y-auto", !noPadding && "flex flex-col gap-3 p-5")}>
              {children}
            </div>
            {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </BaseDialog.Popup>
        </div>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export type Point = { x: number; y: number };

/** number of open menus; a window ignores Esc while one is open */
let openPopovers = 0;

/** Right-click menu state: spread `onContextMenu` on the row, render a Popover at `at`. */
export function useContextMenu() {
  const [at, setAt] = useState<Point | null>(null);
  return {
    at,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAt({ x: e.clientX, y: e.clientY });
    },
    close: () => setAt(null),
  };
}

/** Arrow keys move between menu entries, like in Slate's and every native menu. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-menu-item]:not(:disabled)")];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home" ? 0
    : e.key === "End" ? items.length - 1
    : e.key === "ArrowDown" ? (i + 1) % items.length
    : i <= 0 ? items.length - 1 : i - 1;
  e.preventDefault();
  items[next].focus();
}

/**
 * Small menu below a button or at the mouse (right-click). Built on Base UI's Popover:
 * flips and shifts to stay on screen, Esc and a click outside close only the topmost one.
 */
export function Popover({
  anchor,
  onClose,
  children,
  className = "w-52",
  matchWidth,
}: {
  /** a button to open below, or a point (right-click menu) */
  anchor: HTMLElement | Point;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** at least as wide as the anchor (dropdowns) */
  matchWidth?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const el = anchor instanceof HTMLElement ? anchor : null;
  useEffect(() => {
    openPopovers++;
    // counted down a moment later, so the Esc that closes the menu doesn't also reach the window
    return () => void setTimeout(() => openPopovers--, 0);
  }, []);
  const virtual = useMemo(() => {
    if (anchor instanceof HTMLElement) return null;
    const { x, y } = anchor;
    return { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
  }, [anchor]);

  return (
    <BasePopover.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        // a click on the button that opened the menu toggles it there; don't close twice
        if (details.reason === "outside-press" && el?.contains(details.event.target as Node)) return;
        onClose();
      }}
    >
      <BasePopover.Portal>
        <BasePopover.Positioner
          anchor={el ?? virtual}
          side="bottom"
          align="start"
          sideOffset={el ? 4 : 0}
          collisionPadding={8}
          className="z-[70] outline-none"
        >
          <BasePopover.Popup
            ref={ref}
            initialFocus={(type) => ref.current?.querySelector<HTMLInputElement>("input") ?? (type === "keyboard" ? true : undefined)}
            finalFocus={el ? true : false}
            onKeyDown={moveFocus}
            onContextMenu={(e) => e.preventDefault()}
            style={{ minWidth: matchWidth && el ? el.offsetWidth : undefined }}
            className={clsx(
              "max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-card p-1 text-sm shadow-lg/10 outline-none",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  active,
  right,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  right?: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-menu-item
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none",
        danger ? "text-bad-fg hover:bg-bad/8 focus-visible:bg-bad/8" : "hover:bg-elev focus-visible:bg-elev",
        active && "bg-elev font-medium",
      )}
    >
      {icon && <span className="flex w-4 shrink-0 justify-center text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {right}
    </button>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted">{children}</div>
);
export const MenuSeparator = () => <div className="my-1 h-px bg-elev" />;

/** Button + popover state. */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: (e: React.MouseEvent<HTMLElement>) => setAnchor(anchor ? null : e.currentTarget),
    close: () => setAnchor(null),
  };
}

/** Filter-style chip button like in Slate's tool bar. */
export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium text-fg shadow-xs/5 transition-colors [&_svg]:size-3.5 [&_svg]:opacity-70",
        active ? "border-chip-border-hover bg-elev" : "border-input bg-bg hover:bg-elev dark:bg-white/[0.03]",
        className,
      )}
    />
  );
}

/** Thin tool bar under the page header (search, filters, view options). */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-4">{children}</div>;
}

/** Small label like Slate's chip (labels, categories); as="button" for clickable ones. */
export function Badge({
  children,
  color,
  className,
  as,
  onClick,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  as?: "button";
  onClick?: () => void;
}) {
  const cls = clsx(
    "inline-flex h-5.5 min-w-0 shrink-0 items-center gap-1.25 rounded-md border border-chip-border px-1.5 text-xs text-chip-fg [&_svg]:size-3 [&_svg]:shrink-0",
    as === "button" && "cursor-pointer hover:bg-elev",
    className,
  );
  const dot = color && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
  return as === "button" ? (
    <button type="button" className={cls} onClick={onClick}>
      {dot}
      {children}
    </button>
  ) : (
    <span className={cls}>
      {dot}
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  color,
}: {
  value: number;
  className?: string;
  color?: string;
}) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-elev", className)}>
      <div
        className="h-full rounded-full bg-bar transition-[width] duration-500"
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-lg border border-line bg-card", className)}>{children}</div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex h-11 items-center justify-between px-4">
        <h3 className="text-[13px] font-medium text-muted">{title}</h3>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {text && <p className="max-w-sm text-xs text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}

// ---------- Confirm dialog ----------

type ConfirmOptions = { confirmLabel?: string; danger?: boolean };
type ConfirmRequest = ConfirmOptions & { message: string; resolve: (ok: boolean) => void };
let pushConfirm: ((r: ConfirmRequest) => void) | null = null;

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (pushConfirm) pushConfirm({ ...opts, message, resolve });
    else resolve(window.confirm(message));
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    pushConfirm = setReq;
    return () => {
      pushConfirm = null;
    };
  }, []);
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title="Bist du sicher?"
      width="max-w-sm"
      footer={
        <>
          <Button onClick={() => close(false)}>Abbrechen</Button>
          <Button
            variant="primary"
            className={req?.danger === false ? "" : "!bg-bad"}
            onClick={() => close(true)}
            autoFocus
          >
            {req?.confirmLabel ?? "Löschen"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{req?.message}</p>
    </Modal>
  );
}

// ---------- Toasts ----------

/** Message bottom right (Sonner); `action` adds a button such as "Rückgängig". */
export function toast(text: string, opts: { action?: { label: string; onClick: () => void }; duration?: number } = {}) {
  sonnerToast(text, { duration: opts.duration ?? 3500, action: opts.action });
}

export function ToastHost() {
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      offset={16}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[var(--width)] items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-sm text-fg shadow-lg/10",
          title: "min-w-0 flex-1",
          actionButton:
            "ml-auto h-7 shrink-0 cursor-pointer rounded-md border border-input bg-bg px-2.5 text-xs font-medium text-fg shadow-xs/5 transition-colors hover:bg-elev dark:bg-white/[0.03]",
        },
      }}
    />
  );
}

/** Small circle that fills up like a pie with progress (0–1). */
export function ProgressRing({
  value,
  size = 16,
  color = "currentColor",
  className,
}: {
  value: number;
  size?: number;
  color?: string;
  className?: string;
}) {
  const v = Math.min(1, Math.max(0, value));
  const m = size / 2;
  const outer = m - 0.75;
  const inner = outer - 2; // pie radius, leaves a gap to the ring
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={clsx("shrink-0 -rotate-90", className)}>
      <circle cx={m} cy={m} r={outer} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} />
      {v > 0 && (
        <circle
          cx={m}
          cy={m}
          r={inner / 2}
          fill="none"
          stroke={color}
          strokeWidth={inner}
          strokeDasharray={`${Math.PI * inner * v} ${Math.PI * inner}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      )}
    </svg>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-fg/15",
      )}
    >
      <span
        className={clsx(
          "absolute size-4 rounded-full shadow-sm transition-transform",
          on ? "translate-x-[18px] bg-primary-fg" : "translate-x-0.5 bg-white",
        )}
      />
    </span>
  );
}

const MORE_KEY = "hobby-manager-create-more";

/** "Weitere erstellen" like in Slate: after creating, the window stays open for the next one. */
export function useCreateMore() {
  const [on, set] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const change = (v: boolean) => {
    set(v);
    try {
      localStorage.setItem(MORE_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  };
  return [on, change] as const;
}

export function CreateMoreToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="mr-auto flex items-center gap-2 rounded-lg px-1 text-[13px] text-muted hover:text-fg"
    >
      <Switch on={on} /> Weitere erstellen
    </button>
  );
}
