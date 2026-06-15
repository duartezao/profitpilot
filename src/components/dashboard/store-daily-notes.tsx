import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { StoreDailyNoteView } from "@/lib/daily-notes";

const moodLabel: Record<string, string> = {
  good: "Bom",
  bad: "Mau",
  neutral: "Normal",
};

function NoteBody({ note }: { note: StoreDailyNoteView }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">{note.dateLabel}</span>
        {note.scope === "workspace" && (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            Workspace
          </span>
        )}
        {note.didScale && (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-accent">
            Scale
          </span>
        )}
        {note.mood && (
          <span className="text-xs text-muted-foreground">
            {moodLabel[note.mood] ?? note.mood}
          </span>
        )}
      </div>
      {note.text ? (
        <Sensitive as="p" className="whitespace-pre-wrap text-sm text-foreground">
          {note.text}
        </Sensitive>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sem observações escritas.
        </p>
      )}
    </div>
  );
}

export function StoreDailyNotes({
  notes,
  periodIsSingleDay,
  periodLabel,
}: {
  notes: StoreDailyNoteView[];
  periodIsSingleDay: boolean;
  periodLabel?: string;
}) {
  const hasNotes = notes.length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <NotebookPen className="h-4 w-4 text-muted-foreground" />
            Nota do dia
          </h2>
          <p className="text-sm text-muted-foreground">
            {periodIsSingleDay
              ? "Diário de operação para o dia selecionado."
              : `Notas registadas em ${periodLabel ?? "este período"}.`}
          </p>
        </div>
        <Link
          href="/notas"
          className="text-sm font-medium text-accent hover:underline"
        >
          Abrir Notas
        </Link>
      </div>

      <div className="p-5">
        {!hasNotes && (
          <p className="text-sm text-muted-foreground">
            {periodIsSingleDay
              ? "Ainda não há nota para este dia nesta loja."
              : "Nenhuma nota neste período para esta loja."}{" "}
            <Link href="/notas" className="font-medium text-accent hover:underline">
              Registar nota
            </Link>
          </p>
        )}

        {periodIsSingleDay && hasNotes && notes[0] && (
          <NoteBody note={notes[0]} />
        )}

        {!periodIsSingleDay && hasNotes && (
          <ul className="divide-y divide-border">
            {notes.map((note) => (
              <li key={note.date} className="py-4 first:pt-0 last:pb-0">
                <NoteBody note={note} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
