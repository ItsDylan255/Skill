import clsx from "clsx";
import { HobbyMenu } from "./menus";
import {
  Map as MapIcon,
  Ellipsis,
  Flag,
  GanttChart,
  LayoutDashboard,
  Bookmark,
  ListChecks,
  Music,
  PanelLeft,
  Plus,
  Repeat,
  Settings,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useMatch, useNavigate } from "react-router-dom";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { createHobby, reorder, updateHobby } from "../db/repo";
import type { Hobby } from "../db/types";
import { mutate, useHobbies } from "../lib/store";
import { openHobbySettings, openSettings, toggleSidebar, useUi } from "../lib/uiState";
import { ColorPicker, HobbyIcon, IconPicker } from "./icons";
import { HobbySettingsDialog, hiddenTabs, SettingsDialog } from "./SettingsDialog";
import { SkillLogo } from "./SkillLogo";
import { SortableList, swallowNextClick, useSortableItem } from "./sortable";
import { Button, CreateMoreToggle, Field, IconButton, Input, Modal, useCreateMore, useContextMenu } from "./ui";

export function Layout({ children }: { children: ReactNode }) {
  const { sidebarOpen } = useUi();

  // Ctrl+B toggles the sidebar, like in Slate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full bg-panel">
      {sidebarOpen && <Sidebar />}
      <main
        className={clsx(
          "my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-bg",
          !sidebarOpen && "ml-2",
        )}
      >
        {children}
      </main>
      <SettingsDialog />
      <HobbySettingsDialog />
    </div>
  );
}

export function SidebarTrigger() {
  return (
    <IconButton label="Seitenleiste (Strg+B)" className="-ml-1" onClick={toggleSidebar}>
      <PanelLeft size={16} />
    </IconButton>
  );
}

function Sidebar() {
  const { data: hobbies = [] } = useHobbies();
  const hobbyId = useMatch("/h/:hobbyId/*")?.params.hobbyId;
  const [creating, setCreating] = useState(false);

  return (
    <aside className="flex w-60 shrink-0 flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <SkillLogo className="size-7" />
        <span className="text-sm font-semibold">Skill</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-medium text-muted">Hobbys</span>
          <IconButton label="Hobby hinzufügen" className="size-6" onClick={() => setCreating(true)}>
            <Plus size={14} />
          </IconButton>
        </div>
        <SortableList items={hobbies} onReorder={(ids) => mutate(() => reorder("hobby", ids))}>
          {(items) => items.map((h) => <HobbyRow key={h.id} hobby={h} active={String(h.id) === hobbyId} />)}
        </SortableList>
      </nav>

      <div className="p-2">
        <button
          onClick={openSettings}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-sm text-sidebar-fg transition-colors hover:bg-elev hover:text-fg"
        >
          <Settings size={16} /> Einstellungen
        </button>
      </div>
      <NewHobbyModal open={creating} onClose={() => setCreating(false)} />
    </aside>
  );
}

/** Sidebar entry of a hobby; the whole row can be dragged to change the order. */
function HobbyRow({ hobby: h, active }: { hobby: Hobby; active: boolean }) {
  const { ref, style, handle, isDragging } = useSortableItem(h.id);
  const menu = useContextMenu();
  // releasing the mouse after dragging should not open the hobby
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      {...handle}
      className={clsx(
        "group flex h-8 shrink-0 items-center rounded-lg pr-1 text-sm transition-colors",
        active ? "bg-elev font-medium text-fg" : "text-sidebar-fg hover:bg-elev hover:text-fg",
        isDragging && "bg-elev shadow-lg",
      )}
    >
      <NavLink
        to={`/h/${h.id}`}
        draggable={false}
        onPointerDownCapture={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onClick={(e) => {
          const p = down.current;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) e.preventDefault();
        }}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2"
      >
        <span style={{ color: h.color }}>
          <HobbyIcon name={h.icon} size={15} />
        </span>
        <span className="truncate">{h.name}</span>
      </NavLink>
      <IconButton
        label="Hobby-Einstellungen"
        className="size-6 opacity-0 group-hover:opacity-100"
        onClick={() => openHobbySettings(h.id)}
      >
        <Ellipsis size={15} />
      </IconButton>
    </div>
    {menu.at && <HobbyMenu hobby={h} at={menu.at} onClose={menu.close} />}
    </>
  );
}

export const TABS: { path: string; id: string; label: string; icon: ReactNode }[] = [
  { path: "", id: "overview", label: "Übersicht", icon: <LayoutDashboard /> },
  { path: "/exercises", id: "exercises", label: "Übungen", icon: <ListChecks /> },
  { path: "/songs", id: "songs", label: "Songs", icon: <Music /> },
  { path: "/routines", id: "routines", label: "Routinen", icon: <Repeat /> },
  { path: "/plan", id: "plan", label: "Plan", icon: <MapIcon /> },
  { path: "/list", id: "list", label: "Merkliste", icon: <Bookmark /> },
  { path: "/goals", id: "goals", label: "Ziele", icon: <Flag /> },
  { path: "/phases", id: "phases", label: "Phasen", icon: <GanttChart /> },
];

/**
 * Header of every hobby page, like Slate's project header: sidebar toggle,
 * breadcrumb (hobby / …) and the segmented switch between the sections.
 */
export function HobbyHeader({ trail }: { trail?: { label: string; to?: string }[] }) {
  const hobbyId = useMatch("/h/:hobbyId/*")?.params.hobbyId;
  const { data: hobbies = [] } = useHobbies();
  const hobby = hobbies.find((h) => String(h.id) === hobbyId);
  const hidden = hiddenTabs(hobby);
  const base = `/h/${hobbyId}`;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
      <SidebarTrigger />
      <nav className="flex max-w-[40%] min-w-0 shrink-0 items-center gap-1.5 text-sm">
        <Link to={base} className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-medium hover:bg-elev">
          {hobby && (
            <span className="shrink-0" style={{ color: hobby.color }}>
              <HobbyIcon name={hobby.icon} size={14} />
            </span>
          )}
          <span className="truncate">{hobby?.name}</span>
        </Link>
        {trail?.map((t, i) => (
          <Fragment key={i}>
            <span className="text-muted/50">/</span>
            {t.to ? (
              <Link to={t.to} className="truncate rounded-md px-1 py-1 text-muted hover:bg-elev hover:text-fg">
                {t.label}
              </Link>
            ) : (
              <span className="truncate px-1 font-medium">{t.label}</span>
            )}
          </Fragment>
        ))}
      </nav>

      {hobby && <HobbyTabs hobby={hobby} hidden={hidden} base={base} />}
    </header>
  );
}

const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 });

export function tabOrder(hobby: Hobby) {
  let order: string[] = [];
  try {
    order = JSON.parse(hobby.tab_order || "[]");
  } catch {
    order = [];
  }
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + TABS.findIndex((t) => t.id === id));
  return [...TABS].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * The section switch; drag a section sideways to move it. Starts on movement, like the
 * sidebar list: a time-based start didn't fire in the app window.
 */
function HobbyTabs({ hobby, hidden, base }: { hobby: Hobby; hidden: string[]; base: string }) {
  const [tabs, setTabs] = useState(() => tabOrder(hobby));
  useEffect(() => setTabs(tabOrder(hobby)), [hobby]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    swallowNextClick();
    if (!e.over || e.active.id === e.over.id) return;
    const ids = tabs.map((t) => t.id);
    const next = arrayMove(tabs, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setTabs(next);
    mutate(() => updateHobby(hobby.id, { tab_order: JSON.stringify(next.map((t) => t.id)) }));
  };

  const visible = tabs.filter((t) => !hidden.includes(t.id));
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[horizontalOnly]}
      onDragEnd={onDragEnd}
      onDragCancel={swallowNextClick}
    >
      <SortableContext items={visible.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <nav className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
          {visible.map((t) => (
            <Tab key={t.id} tab={t} base={base} />
          ))}
        </nav>
      </SortableContext>
    </DndContext>
  );
}

function Tab({ tab: t, base }: { tab: (typeof TABS)[number]; base: string }) {
  const { ref, style, handle, isDragging } = useSortableItem(t.id);
  return (
    <NavLink
      ref={ref}
      style={style}
      {...handle}
      to={base + t.path}
      end={t.path === ""}
      // a link would start the browser's own drag on hold, which cancels ours
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={({ isActive }) =>
        clsx(
          "inline-flex h-6 touch-none items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors select-none [&_svg]:size-3.5",
          isActive ? "bg-elev text-fg shadow-xs" : "text-muted hover:text-fg",
          isDragging && "cursor-grabbing bg-elev shadow-md",
        )
      }
    >
      {t.icon}
      <span className="hidden lg:inline">{t.label}</span>
    </NavLink>
  );
}

export function NewHobbyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [icon, setIcon] = useState("sparkles");
  const [more, setMore] = useCreateMore();
  const [round, setRound] = useState(0);

  const submit = async () => {
    if (!name.trim()) return;
    const id = await mutate(() => createHobby({ name: name.trim(), color, icon }));
    setName("");
    if (more) return setRound((r) => r + 1);
    onClose();
    navigate(`/h/${id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neues Hobby"
      footer={
        <>
          <CreateMoreToggle on={more} onChange={setMore} />
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Erstellen
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input
          key={round}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Field>
      <Field label="Farbe">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Field label="Symbol">
        <IconPicker value={icon} onChange={setIcon} />
      </Field>
    </Modal>
  );
}

/** Header for pages outside the hobby sections (e.g. practice): title left, actions right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex-1 overflow-y-auto p-6", className)}>{children}</div>;
}
