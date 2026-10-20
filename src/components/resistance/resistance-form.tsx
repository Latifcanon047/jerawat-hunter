"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
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
import { createFormSnapshot } from "@/lib/form-snapshot";
import { notifyDashboardStatsRefresh } from "@/lib/dashboard-stats-refresh";
import { MAX_RESISTANCE_DURATION_SECS } from "@/lib/validations/resistance";
import { useToast } from "@/lib/toast-context";

type ResistanceFormProps =
  | {
      mode: "standalone";
      onCancel: () => void;
      onSaved: () => void;
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
  const { showToast } = useToast();
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
  const initialNote =
    props.mode === "edit" ? (props.record.note ?? "") : "";
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const isEditing = props.mode === "edit";
  const isStandalone = props.mode === "standalone";
  const isPause = props.mode === "pause";
  const formId = useId();
  const initialFormSnapshotRef = useRef(
    createFormSnapshot(
      [
        ["durationSecs", initialValues.durationSecs],
        ["note", initialNote],
      ],
      initialValues.occurredAt,
    ),
  );
  const [editModalOpen, setEditModalOpen] = useState(isEditing);
  const [standaloneModalOpen, setStandaloneModalOpen] = useState(isStandalone);
  const [pauseModalOpen, setPauseModalOpen] = useState(isPause);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] =
    useState(false);
  const discardConfirmedRef = useRef(false);
  const savedNotifiedRef = useRef(false);
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
          showToast("error", result.error);
          return;
        }
        setSaved(true);
        setStandaloneModalOpen(false);
        savedNotifiedRef.current = true;
        notifyDashboardStatsRefresh(result, props.onSaved);
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
          showToast("error", result.error);
          return;
        }
        setSaved(true);
        setEditModalOpen(false);
        props.onUpdated(result.data.record);
      }
    } catch {
      const message = isEditing
        ? "Perubahan belum dapat disimpan. Silakan coba lagi."
        : "Keberhasilan belum dapat disimpan. Silakan coba lagi.";
      setError(message);
      if (isEditing || isStandalone) showToast("error", message);
    } finally {
      pendingRef.current = false;
      lockRef.current!.release();
      setPending(false);
    }
  }

  function requestEditClose() {
    if (pendingRef.current || !isEditing) return;

    const currentSnapshot = createFormSnapshot(
      [
        ["durationSecs", durationSecs],
        ["note", note],
      ],
      occurredAt,
    );
    if (currentSnapshot !== initialFormSnapshotRef.current) {
      setDiscardConfirmationOpen(true);
      return;
    }
    setEditModalOpen(false);
  }

  function requestStandaloneClose() {
    if (pendingRef.current || saved || !isStandalone) return;

    const currentSnapshot = createFormSnapshot(
      [
        ["durationSecs", durationSecs],
        ["note", note],
      ],
      occurredAt,
    );
    if (currentSnapshot !== initialFormSnapshotRef.current) {
      setDiscardConfirmationOpen(true);
      return;
    }
    setStandaloneModalOpen(false);
  }

  const form = (
    <form
      id={isEditing || isStandalone || isPause ? formId : undefined}
      onSubmit={submit}
      className={
        isEditing || isStandalone || isPause
          ? "space-y-5"
          : "space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
      }
      aria-labelledby={
        isEditing || isStandalone || isPause
          ? undefined
          : "resistance-form-title"
      }
    >
      {!isStandalone && !isPause && (
        <div>
          <p className="text-sm font-semibold text-teal-800">
            CATATAN KEBERHASILAN
          </p>
          {!isEditing && (
            <h2 id="resistance-form-title" className="mt-2 text-xl font-semibold">
              Catat keberhasilanmu
            </h2>
          )}
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {isEditing && !props.record.occurredAt
              ? "Catatan lama belum memiliki waktu kejadian. Isi waktu sebenarnya untuk melengkapi atau memperbarui catatan."
              : "Waktu kejadian WIB wajib diisi. Durasi dan catatan boleh dikosongkan."}
          </p>
        </div>
      )}

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

    </form>
  );

  if (isEditing) {
    return (
      <>
        <Modal
          isOpen={editModalOpen}
          title="Edit catatan keberhasilan"
          description={
            !props.record.occurredAt
              ? "Catatan lama belum memiliki waktu kejadian. Isi waktu sebenarnya untuk melengkapi atau memperbarui catatan."
              : "Waktu kejadian WIB wajib diisi. Durasi dan catatan boleh dikosongkan."
          }
          closeDisabled={pending}
          onRequestClose={requestEditClose}
          onClosed={props.onCancel}
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={requestEditClose}
                disabled={pending}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                form={formId}
                disabled={pending || saved}
                className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending ? "Menyimpan..." : "Simpan perubahan"}
              </button>
            </div>
          }
        >
          {form}
        </Modal>
        <Modal
          isOpen={discardConfirmationOpen}
          title="Buang perubahan?"
          description="Perubahan yang belum disimpan akan hilang."
          onRequestClose={() => setDiscardConfirmationOpen(false)}
          onClosed={() => {
            if (discardConfirmedRef.current) {
              discardConfirmedRef.current = false;
              setEditModalOpen(false);
            }
          }}
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDiscardConfirmationOpen(false)}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
              >
                Tetap mengedit
              </button>
              <button
                type="button"
                onClick={() => {
                  discardConfirmedRef.current = true;
                  setDiscardConfirmationOpen(false);
                }}
                className="min-h-12 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-800"
              >
                Buang perubahan
              </button>
            </div>
          }
        >
          <p className="text-sm leading-6 text-neutral-700">
            Apakah kamu yakin ingin menutup form edit ini?
          </p>
        </Modal>
      </>
    );
  }

  if (isStandalone) {
    return (
      <>
        <Modal
          isOpen={standaloneModalOpen}
          title="Catat keberhasilan"
          description="Waktu kejadian WIB wajib diisi. Durasi dan catatan boleh dikosongkan."
          closeDisabled={pending || saved}
          onRequestClose={requestStandaloneClose}
          onClosed={() => {
            if (saved) {
              if (!savedNotifiedRef.current) {
                savedNotifiedRef.current = true;
                props.onSaved();
              }
            } else {
              props.onCancel();
            }
          }}
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={requestStandaloneClose}
                disabled={pending || saved}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                form={formId}
                disabled={pending || saved}
                className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending ? "Menyimpan..." : "Konfirmasi & simpan"}
              </button>
            </div>
          }
        >
          {form}
        </Modal>
        <Modal
          isOpen={discardConfirmationOpen}
          title="Buang perubahan?"
          description="Perubahan yang belum disimpan akan hilang."
          onRequestClose={() => setDiscardConfirmationOpen(false)}
          onClosed={() => {
            if (discardConfirmedRef.current) {
              discardConfirmedRef.current = false;
              setStandaloneModalOpen(false);
            }
          }}
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDiscardConfirmationOpen(false)}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
              >
                Tetap mengisi
              </button>
              <button
                type="button"
                onClick={() => {
                  discardConfirmedRef.current = true;
                  setDiscardConfirmationOpen(false);
                }}
                className="min-h-12 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-800"
              >
                Buang perubahan
              </button>
            </div>
          }
        >
          <p className="text-sm leading-6 text-neutral-700">
            Apakah kamu yakin ingin menutup form catatan ini?
          </p>
        </Modal>
      </>
    );
  }

  if (props.mode === "pause") {
    return (
      <Modal
        isOpen={pauseModalOpen}
        title="Catat keberhasilan"
        description="Waktu kejadian WIB wajib diisi. Durasi dan catatan boleh dikosongkan."
        closeDisabled={pending}
        onRequestClose={() => setPauseModalOpen(false)}
        onClosed={props.onCancel}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPauseModalOpen(false)}
              disabled={pending}
              className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              form={formId}
              disabled={pending || saved}
              className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
            >
              {pending ? "Menyimpan..." : "Konfirmasi & simpan"}
            </button>
          </div>
        }
      >
        {form}
      </Modal>
    );
  }

  return form;
}
