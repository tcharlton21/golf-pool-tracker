"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { formatScore, scoreColorClass } from "@/lib/format";
import type { PlayerOdds } from "@/lib/schemas";

interface HypotheticalLeaderboardProps {
  players: PlayerOdds[];        // full player list for score/thru display
  order: string[];              // normalized_names in current hypothetical order
  onOrderChange: (order: string[]) => void;
}

export function HypotheticalLeaderboard({
  players,
  order,
  onOrderChange,
}: HypotheticalLeaderboardProps) {
  const playerMap = Object.fromEntries(players.map((p) => [p.normalized_name, p]));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = order.indexOf(active.id as string);
      const newIdx = order.indexOf(over.id as string);
      onOrderChange(arrayMove(order, oldIdx, newIdx));
    }
  }

  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="px-4 py-2 text-xs text-amber-400/80 font-medium">
        Drag to reorder · pool updates instantly
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted-foreground border-b border-border/40">
                <th className="py-2 px-1 w-5" />
                <th className="py-2 px-2 text-left font-medium w-8">#</th>
                <th className="py-2 px-2 text-left font-medium">Player</th>
                <th className="py-2 px-2 text-center font-medium w-12">Score</th>
                <th className="py-2 px-2 text-center font-medium w-10">Thru</th>
              </tr>
            </thead>
            <tbody>
              {order.map((name, idx) => {
                const player = playerMap[name];
                return (
                  <SortableRow
                    key={name}
                    id={name}
                    position={idx + 1}
                    name={name}
                    score={player?.current_score ?? null}
                    thru={player?.thru ?? null}
                  />
                );
              })}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableRowProps {
  id: string;
  position: number;
  name: string;
  score: number | null;
  thru: string | null;
}

function SortableRow({ id, position, name, score, thru }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-border/20 last:border-0 bg-card hover:bg-secondary/30 transition-colors"
    >
      <td className="py-1.5 px-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      </td>
      <td className="py-1.5 px-2 text-muted-foreground tabular-nums">{position}</td>
      <td className="py-1.5 px-2 text-foreground/90">{name}</td>
      <td className={`py-1.5 px-2 text-center tabular-nums font-medium ${scoreColorClass(score)}`}>
        {formatScore(score)}
      </td>
      <td className="py-1.5 px-2 text-center text-muted-foreground tabular-nums">
        {thru ?? "—"}
      </td>
    </tr>
  );
}
