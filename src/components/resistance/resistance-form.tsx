"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  createStandaloneResistance,
  updateResistance,
  type ResistanceHistoryItem,
} from "@/actions/resistance";
import { savePauseOutcome } from "@/actions/pause";
import {
  createSubmissionLock,
  type SubmissionLock,
} from "@/lib/resistance-service";
import {
  getPauseResistanceDefaults,
  parseJakartaDateTimeInput,
  toJakartaDateTimeInput,
} from "@/lib/resistance-form-values";
import { MAX_RESISTANCE_DURATION_SECS } from "@/lib/validations/resistance";

type ResistanceFormProps =
  | {
      mode: "standalone";
      onCancel: () => void;
    }
  | {
      mode: "pause";
      session: { id: string; startedAt: string; endedAt: string | null };
      onCancel: () => void;
      onSaved: (session: { id: string; outcome: "SUCCEEDED" }) => void;
    }
  | {
      mode: "edit";
      record: ResistanceHistoryItem;
      onCancel: () => void;
      onUpdated: (record: ResistanceHistoryItem) => void;
    };

export function ResistanceForm(props: ResistanceFormProps) {
  const [initialValues] = useState(() =>
    props.mode === "pause"
      ? getPauseResistanceDefaults(props.session.startedAt, props.session.endedAt)
      : props.mode === "edit"
        ? {
            occurredAt: props.record.occurredAt
              ? toJakartaDateTimeInput(new Date(props.record.occurredAt))
              : "",
            durationSecs:
              props.record.durationSecs === null
                ? ""
                : String(props.record.durationSecs),
          }
        : { occurredAt: toJakartaDateTimeInput(new Date()), durationSecs: "" }
  );
  const [occurredAt, setOccurredAt] = useState(initialValues.occurredAt);
  const [durationSecs, setDurationSecs] = useState(initialValues.durationSecs);
  const [note, setNote] = useState(
    props.mode === "edit" ? (props.record.note ?? "") : ""
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const isEditing = props.mode === "edit";
  const pendingRef = useRef(false);
  const lockRef = useRef<SubmissionLock | null>(null);
  if (lockRef.current === null) {
    lockRef.current = createSubmissionLock();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !lockRef.current!.tryAcquire()) return;

    const occurredAtDate = parseJakartaDateTimeInput(occurredAt);
    if (!occurredAtDate) {
      lockRef.current!.release();
      setError("Masukkan waktu kejadian yang valid.");
      return;
    }

    const input = {
      occurredAt: occurredAtDate.toISOString(),
      durationSecs: durationSecs.trim() === "" ? undefined : durationSecs,
      note,
    };

    pendingRef.current = true;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      if (props.mode === "standalone") {
        const result = await createStandaloneResistance(input);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setSaved(true);
      } else if (props.mode === "pause") {
        const result = await savePauseOutcome({
          sessionId: props.session.id,
          outcome: "SUCCEEDED",
          ...input,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        if (result.data.session.outcome !== "SUCCEEDED") {
          setError("Hasil sesi belum terkonfirmasi. Silakan coba lagi.");
          return;
        }
        props.onSaved({
          id: result.data.session.id,
          outcome: "SUCCEEDED",
        });
      } else {
        const result = await updateResistance({
          resistanceId: props.record.id,
          ...input,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setSaved(true);
        props.onUpdated(result.data.record);
      }
    } catch {
      setError(
        isEditing
          ? "Perubahan belum dapat disimpan. Silakan coba lagi."
          : "Keberhasilan belum dapat disimpan. Silakan coba lagi."
      );
    } finally {
      pendingRef.current = false;
      lockRef.current!.release();
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
      aria-labelledby="resistance-form-title"
    >
      <div>
        <p className="text-sm font-semibold text-teal-800">
          CATATAN KEBERHASILAN
        </p>
        <h2 id="resistance-form-title" className="mt-2 text-xl font-semibold">
          {isEditing ? "Edit catatan keberhasilan" : "Catat keberhasilanmu"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {isEditing && !props.record.occurredAt
            ? "Catatan lama belum memiliki waktu kejadian. Isi waktu sebenarnya untuk melengkapi atau memperbarui catatan."
            : "Waktu kejadian WIB wajib diisi. Durasi dan catatan boleh dikosongkan."}
        </p>
      </div>

      <label className="block space-y-2 text-sm font-medium">
        <span>Waktu kejadian</span>
        <input
          type="datetime-local"
          step="1"
          required
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.currentTarget.value)}
          disabled={pending || saved}
          className="min-h-12 w-full rounded-xl border border-neutral-300 px-3"
        />
      </label>

      <label className="block space-y-2 text-sm font-medium">
        <span>Durasi menahan dorongan (opsional, detik)</span>
        <input
          type="number"
          min="0"
          max={MAX_RESISTANCE_DURATION_SECS}
          step="1"
          inputMode="numeric"
          value={durationSecs}
          onChange={(event) => setDurationSecs(event.currentTarget.value)}
          disabled={pending || saved}
          className="min-h-12 w-full rounded-xl border border-neutral-300 px-3"
          aria-describedby="resistance-duration-help"
        />
        <span id="resistance-duration-help" className="block text-xs font-normal text-neutral-600">
          Maksimal 24 jam.
        </span>
      </label>

      <label className="block space-y-2 text-sm font-medium">
        <span>Catatan singkat (opsional)</span>
        <textarea
          maxLength={500}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          disabled={pending || saved}
          className="w-full rounded-xl border border-neutral-300 p-3"
        />
        <span className="block text-xs font-normal text-neutral-600">
          Maksimal 500 karakter.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm text-neutral-600">
          Menyimpan keberhasilan...
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          {isEditing
            ? "Perubahan catatan keberhasilan tersimpan."
            : "Keberhasilan berhasil dicatat."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {!saved && (
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Menyimpan..."
              : isEditing
                ? "Simpan perubahan"
                : "Konfirmasi & simpan"}
          </button>
        )}
        <button
          type="button"
          onClick={props.onCancel}
          disabled={pending}
          className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saved ? "Selesai" : "Batal"}
        </button>
      </div>
    </form>
  );
}
