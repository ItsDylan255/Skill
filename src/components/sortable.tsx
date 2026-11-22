import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Drag & drop ordering for a list or grid. Keeps a local order so dropping
 * feels instant, and hands the new id order to `onReorder` to store it.
 */
export function SortableList<T extends { id: number }>({
  items,
  onReorder,
  grid,
  children,
}: {
  items: T[];
  onReorder: (ids: number[]) => void;
  grid?: boolean;
  children: (items: T[]) => ReactNode;
}) {
  const [order, setOrder] = useState(items);
  useEffect(() => setOrder(items), [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(
      order,
      order.findIndex((x) => x.id === e.active.id),
      order.findIndex((x) => x.id === e.over!.id),
    );
    setOrder(next);
    onReorder(next.map((x) => x.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((x) => x.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {children(order)}
      </SortableContext>
    </DndContext>
  );
}

/** The click that ends a drag must not open the item it was released on. */
export function swallowNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 100);
}

/** Props for one draggable item: spread `handle` on the drag handle (or the whole item). */
export function useSortableItem(id: number | string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    ref: setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      zIndex: isDragging ? 10 : undefined,
      position: "relative" as const,
    },
    handle: { ...attributes, ...listeners },
    isDragging,
  };
}
