"use client";

import { useState, useRef } from "react";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadPicks, confirmUpload } from "@/lib/api";
import type { UploadPreviewResponse } from "@/lib/schemas";

interface UploadSheetProps {
  eventId: number;
  poolType: string;
  onSuccess: () => void;
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "preview"; preview: UploadPreviewResponse }
  | { kind: "confirming" }
  | { kind: "done"; committed: number }
  | { kind: "error"; message: string };

export function UploadSheet({ eventId, poolType, onSuccess }: UploadSheetProps) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isOpen, setIsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ kind: "uploading" });
    try {
      const preview = await uploadPicks(eventId, poolType, file);
      setState({ kind: "preview", preview });
      setIsOpen(true);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
      setIsOpen(true);
    }
  }

  async function handleConfirm() {
    if (state.kind !== "preview") return;
    setState({ kind: "confirming" });
    try {
      const result = await confirmUpload(eventId, state.preview.upload_token);
      setState({ kind: "done", committed: result.committed });
      setTimeout(() => {
        setIsOpen(false);
        setState({ kind: "idle" });
        onSuccess();
      }, 1500);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Confirm failed",
      });
    }
  }

  function handleClose() {
    setIsOpen(false);
    setState({ kind: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <label className="cursor-pointer">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={state.kind === "uploading"}
        >
          <Upload className="w-3.5 h-3.5" />
          {state.kind === "uploading" ? "Parsing..." : "Upload Picks"}
        </Button>
      </label>

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {state.kind === "preview" && `Preview — ${state.preview.entrant_count} entrants`}
              {state.kind === "confirming" && "Saving picks..."}
              {state.kind === "done" && "Picks saved"}
              {state.kind === "error" && "Upload error"}
            </DialogTitle>
          </DialogHeader>

          {state.kind === "preview" && (
            <PreviewContent preview={state.preview} />
          )}

          {state.kind === "done" && (
            <div className="flex items-center gap-2 text-primary py-4">
              <CheckCircle2 className="w-5 h-5" />
              <span>Saved {state.committed} entrants successfully</span>
            </div>
          )}

          {state.kind === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          {(state.kind === "preview" || state.kind === "error") && (
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              {state.kind === "preview" && (
                <Button size="sm" onClick={handleConfirm}>
                  Save Picks
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewContent({ preview }: { preview: UploadPreviewResponse }) {
  return (
    <div className="space-y-3">
      {preview.warnings.length > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <AlertDescription className="text-yellow-200/80 text-xs mt-1">
            <div className="font-medium mb-1">
              {preview.warnings.length} warning{preview.warnings.length > 1 ? "s" : ""}
            </div>
            <ul className="space-y-0.5">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        {preview.entrant_count} entrants parsed. Review picks below, then click Save.
      </p>

      <div className="rounded border border-border/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground border-b border-border/40">
              <th className="py-2 px-3 text-left font-medium">Entrant</th>
              <th className="py-2 px-3 text-left font-medium">Picks</th>
            </tr>
          </thead>
          <tbody>
            {preview.entrants.map((entrant) => (
              <tr
                key={entrant.name}
                className="border-b border-border/20 last:border-0"
              >
                <td className="py-1.5 px-3 font-medium whitespace-nowrap">
                  {entrant.name}
                </td>
                <td className="py-1.5 px-3 text-muted-foreground">
                  {entrant.picks.map((p, i) => (
                    <span key={i}>
                      {p.group_label && (
                        <span className="text-muted-foreground/50 mr-0.5">
                          {p.group_label}:
                        </span>
                      )}
                      {p.golfer_name}
                      {i < entrant.picks.length - 1 && (
                        <span className="mx-1 text-border">·</span>
                      )}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
