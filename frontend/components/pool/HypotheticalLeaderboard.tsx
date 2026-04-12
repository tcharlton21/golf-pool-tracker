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
import { GripVertical, Unlink } from "lucide-react";
import { formatScore, scoreColorClass } from "@/lib/format";
import type { PlayerOdds } from "@/lib/schemas";

interface HypotheticalLeaderboardProps {
  players: PlayerOdds[];            // full player list for score/thru display
  order: string[][];                // slots: each slot is 1+ tied player names
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

  // Each slot's drag ID is the joined names (stable as long as slot membership doesn't change)
  const slotIds = order.map((slot) => slot.join("|"));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = slotIds.indexOf(active.id as string);
    const newIdx = slotIds.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    onOrderChange(arrayMove(order, oldIdx, newIdx));
  }

  /** Remove a player from their slot, creating a new solo slot after it. */
  function splitPlayer(slotIdx: number, playerName: string) {
    const slot = order[slotIdx];
    if (slot.length <= 1) return; // already solo
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
        Drag slots to reorder · click ✕ to break a tie
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
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
                const slotId = slotIds[slotIdx];

                return (
                  <SortableSlotRow
                    key={slotId}
                    id={slotId}
                    slot={slot}
                    startPos={startPos}
                    isTied={isTied}
                    playerMap={playerMap}
                    onSplit={(name) => splitPlayer(slotIdx, name)}
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

interface SortableSlotRowProps {
  id: string;
  slot: string[];
  startPos: number;
  isTied: boolean;
  playerMap: Record<string, PlayerOdds>;
  onSplit: (name: string) => void;
}

function SortableSlotRow({ id, slot, startPos, isTied, playerMap, onSplit }: SortableSlotRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const posLabel = isTied ? `T${startPos}` : `${startPos}`;

  return (
    <>
      {slot.map((name, i) => {
        const player = playerMap[name];
        const isFirst = i === 0;
        return (
          <tr
            key={name}
            ref={isFirst ? setNodeRef : undefined}
            style={isFirst ? style : undefined}
            className={`border-b border-border/20 last:border-0 bg-card hover:bg-secondary/30 transition-colors ${
              isTied ? "bg-amber-500/5" : ""
            }`}
          >
            <td className="py-1.5 px-1">
              {isFirst ? (
                <button
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
              ) : (
                <span className="w-3 h-3 block" />
              )}
            </td>
            <td className={`py-1.5 px-2 tabular-nums ${isTied ? "text-amber-400/80" : "text-muted-foreground"}`}>
              {isFirst ? posLabel : ""}
            </td>
            <td className="py-1.5 px-2 text-foreground/90">
              <div className="flex items-center gap-1">
                {name}
                {isTied && (
                  <button
                    onClick={() => onSplit(name)}
                    className="ml-1 text-amber-400/60 hover:text-amber-400 transition-colors"
                    title="Break tie — move to own position"
                  >
                    <Unlink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </td>
            <td className={`py-1.5 px-2 text-center tabular-nums font-medium ${scoreColorClass(player?.current_score ?? null)}`}>
              {formatScore(player?.current_score ?? null)}
            </td>
            <td className="py-1.5 px-2 text-center text-muted-foreground tabular-nums">
              {player?.thru ?? "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
