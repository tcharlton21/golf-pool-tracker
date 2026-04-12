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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Unlink } from "lucide-react";
import { formatScore, scoreColorClass } from "@/lib/format";
import type { PlayerOdds } from "@/lib/schemas";

interface HypotheticalLeaderboardProps {
  players: PlayerOdds[];
  order: string[][];                          // slots: each slot = 1+ tied player names
  onOrderChange: (order: string[][]) => void;
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

  // Flat list of player names — used as SortableContext items
  const flatItems = order.flat();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine flat positions to know drag direction
    const oldFlatIdx = flatItems.indexOf(activeId);
    const overFlatIdx = flatItems.indexOf(overId);
    if (oldFlatIdx === -1 || overFlatIdx === -1) return;

    // Build new order:
    // 1. Remove active from its slot (split out if tied)
    // 2. Insert as solo slot adjacent to the over-player's slot
    const newOrder: string[][] = order.map((s) => [...s]);

    const activeSlotIdx = newOrder.findIndex((s) => s.includes(activeId));
    newOrder[activeSlotIdx] = newOrder[activeSlotIdx].filter((n) => n !== activeId);
    if (newOrder[activeSlotIdx].length === 0) newOrder.splice(activeSlotIdx, 1);

    // Find target slot after mutation
    const targetSlotIdx = newOrder.findIndex((s) => s.includes(overId));
    const insertAfter = overFlatIdx > oldFlatIdx;
    const insertPos = insertAfter ? targetSlotIdx + 1 : targetSlotIdx;

    newOrder.splice(insertPos, 0, [activeId]);
    onOrderChange(newOrder);
  }

  /** Split a player from their tie group into a solo slot immediately after. */
  function splitPlayer(slotIdx: number, playerName: string) {
    const slot = order[slotIdx];
    if (slot.length <= 1) return;
    const remaining = slot.filter((n) => n !== playerName);
    const newOrder = [
      ...order.slice(0, slotIdx),
      remaining,
      [playerName],
      ...order.slice(slotIdx + 1),
    ];
    onOrderChange(newOrder);
  }

  let posCounter = 1;

  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="px-4 py-2 text-xs text-amber-400/80 font-medium">
        Drag to reorder · unlink icon breaks a tie
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={flatItems} strategy={verticalListSortingStrategy}>
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
              {order.map((slot, slotIdx) => {
                const isTied = slot.length > 1;
                const startPos = posCounter;
                posCounter += slot.length;
                const posLabel = isTied ? `T${startPos}` : `${startPos}`;

                return slot.map((name, i) => {
                  const player = playerMap[name];
                  return (
                    <SortablePlayerRow
                      key={name}
                      id={name}
                      posLabel={i === 0 ? posLabel : ""}
                      name={name}
                      isTied={isTied}
                      score={player?.current_score ?? null}
                      thru={player?.thru ?? null}
                      onSplit={() => splitPlayer(slotIdx, name)}
                    />
                  );
                });
              })}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortablePlayerRowProps {
  id: string;
  posLabel: string;
  name: string;
  isTied: boolean;
  score: number | null;
  thru: string | null;
  onSplit: () => void;
}

function SortablePlayerRow({ id, posLabel, name, isTied, score, thru, onSplit }: SortablePlayerRowProps) {
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
      className={`border-b border-border/20 last:border-0 transition-colors ${
        isTied ? "bg-amber-500/5 hover:bg-amber-500/10" : "bg-card hover:bg-secondary/30"
      }`}
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
      <td className={`py-1.5 px-2 tabular-nums ${isTied ? "text-amber-400/80" : "text-muted-foreground"}`}>
        {posLabel}
      </td>
      <td className="py-1.5 px-2 text-foreground/90">
        <div className="flex items-center gap-1">
          {name}
          {isTied && (
            <button
              onClick={onSplit}
              className="ml-1 text-amber-400/60 hover:text-amber-400 transition-colors"
              title="Break tie — move to own position"
            >
              <Unlink className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </td>
      <td className={`py-1.5 px-2 text-center tabular-nums font-medium ${scoreColorClass(score)}`}>
        {formatScore(score)}
      </td>
      <td className="py-1.5 px-2 text-center text-muted-foreground tabular-nums">
        {thru ?? "—"}
      </td>
    </tr>
  );
}
