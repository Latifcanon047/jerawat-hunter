"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import {
  createPickingEvent,
  updatePickingEvent,
  type PickingActionResult,
  type PickingEventData,
} from "@/actions/picking";
import {
  parseJakartaDateTimeInput,
  toJakartaDateTimeInput,
} from "@/lib/resistance-form-values";
import { createFormSnapshot } from "@/lib/form-snapshot";
import { notifyDashboardStatsRefresh } from "@/lib/dashboard-stats-refresh";
import { pickingOptions } from "@/lib/picking-options";
import { useToast } from "@/lib/toast-context";

type PickingFormProps =
  | {
      mode: "create";
      source: "pause";
      pauseSessionId: string;
      onCancel: () => void;
    }
  | {
      mode: "create";
      source: "manual";
      onCancel: () => void;
      onSaved: () => void;
    }
  | {
      mode: "edit";
      event: PickingEventData;
      onCancel: () => void;
      onUpdated: (event: PickingEventData) => void;
    };

export function PickingForm(props: PickingFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    props.mode === "create"
      ? toJakartaDateTimeInput(new Date())
      : props.event.occurredAt
        ? toJakartaDateTimeInput(new Date(props.event.occurredAt))
        : ""
  );
  const pendingRef = useRef(false);
  const isEditing = props.mode === "edit";
  const isManualCreate =
    props.mode === "create" && props.source === "manual";
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const initialOccurredAtRef = useRef(occurredAt);
  const initialFormSnapshotRef = useRef<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(isEditing);
  const [manualModalOpen, setManualModalOpen] = useState(isManualCreate);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] =
    useState(false);
  const discardConfirmedRef = useRef(false);
  const eventData = isEditing ? props.event : null;

  useLayoutEffect(() => {
    if ((!isEditing && !isManualCreate) || !formRef.current) return;

    const initialValues = Array.from(
      new FormData(formRef.current).entries(),
      ([name, value]) => [name, value.toString()] as const,
    );
    initialFormSnapshotRef.current = createFormSnapshot(
      initialValues,
      initialOccurredAtRef.current,
    );
  }, [isEditing, isManualCreate]);

  useEffect(() => {
    if (props.mode !== "create" || !saved || isManualCreate) return;

    const timeout = window.setTimeout(() => router.replace("/"), 1800);
    return () => window.clearTimeout(timeout);
  }, [isManualCreate, props.mode, router, saved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setError("");
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const details = {
      pickingType: form.get("pickingType"),
      triggers: form.getAll("triggers"),
      emotions: form.getAll("emotions"),
      urgeStrength: form.get("urgeStrength"),
      durationRange: form.get("durationRange"),
      reasons: form.getAll("reasons"),
      impacts: form.getAll("impacts"),
      context: form.get("context"),
    };

    try {
      if (props.mode === "create") {
        const occurredAtDate = parseJakartaDateTimeInput(occurredAt);
        if (!occurredAtDate) {
          setError("Masukkan waktu kejadian yang valid.");
          return;
        }
        const submissionKey =
          isManualCreate && !idempotencyKey
            ? crypto.randomUUID()
            : idempotencyKey;
        if (isManualCreate && !idempotencyKey) {
          setIdempotencyKey(submissionKey);
        }
        const result: PickingActionResult<{
          event: { id: string };
          alreadyRecorded: boolean;
        }> = await createPickingEvent({
          ...details,
          occurredAt: occurredAtDate.toISOString(),
          ...(props.source === "pause"
            ? { pauseSessionId: props.pauseSessionId }
            : { idempotencyKey: submissionKey }),
        });
        if (!result.success) {
          if (result.code === "DUPLICATE_EVENT" && isManualCreate) {
            setIdempotencyKey("");
          }
          setError(result.error);
          if (isManualCreate) showToast("error", result.error);
          return;
        }
        if (isManualCreate) {
          setSaved(true);
          setManualModalOpen(false);
          notifyDashboardStatsRefresh(result, props.onSaved);
        } else {
          setSaved(true);
        }
      } else {
        const occurredAtDate = parseJakartaDateTimeInput(occurredAt);
        if (!occurredAtDate) {
          setError("Masukkan waktu kejadian yang valid.");
          return;
        }
        const result = await updatePickingEvent({
          ...details,
          eventId: props.event.id,
          occurredAt: occurredAtDate.toISOString(),
        });
        if (!result.success) {
          setError(result.error);
          showToast("error", result.error);
          return;
        }
        setSaved(true);
        setEditModalOpen(false);
        props.onUpdated(result.data.event);
      }
    } catch {
      const message =
        "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";
      setError(message);
      if (props.mode === "edit" || isManualCreate) {
        showToast("error", message);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function requestEditClose() {
    if (pendingRef.current || !isEditing) return;

    const form = formRef.current;
    const initialSnapshot = initialFormSnapshotRef.current;
    if (!form || initialSnapshot === null) {
      setDiscardConfirmationOpen(true);
      return;
    }

    const currentValues = Array.from(
      new FormData(form).entries(),
      ([name, value]) => [name, value.toString()] as const,
    );
    const currentSnapshot = createFormSnapshot(currentValues, occurredAt);
    if (currentSnapshot !== initialSnapshot) {
      setDiscardConfirmationOpen(true);
      return;
    }
    setEditModalOpen(false);
  }

  function requestManualClose() {
    if (pendingRef.current || saved || !isManualCreate) return;

    const form = formRef.current;
    const initialSnapshot = initialFormSnapshotRef.current;
    if (!form || initialSnapshot === null) {
      setDiscardConfirmationOpen(true);
      return;
    }

    const currentValues = Array.from(
      new FormData(form).entries(),
      ([name, value]) => [name, value.toString()] as const,
    );
    if (
      createFormSnapshot(currentValues, occurredAt) !== initialSnapshot
    ) {
      setDiscardConfirmationOpen(true);
      return;
    }
    setManualModalOpen(false);
  }

  function editFooter() {
    return (
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
    );
  }

  const formFields = (
    <>
      {(props.mode === "create" || isEditing) && (
        <label className="block space-y-2 text-sm font-semibold">
          <span>Waktu kejadian</span>
          <input
            type="datetime-local"
            step="1"
            required
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.currentTarget.value)}
            disabled={pending || saved}
            className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 font-normal"
          />
        </label>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">
          Jenis picking <span className="text-rose-700">(wajib)</span>
        </legend>
        {pickingOptions.pickingTypes.map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 items-start gap-3 rounded-xl border border-neutral-200 p-3 text-sm leading-6"
          >
            <input
              type="radio"
              name="pickingType"
              value={option.value}
              required
              defaultChecked={eventData?.pickingType === option.value}
              className="mt-1 size-4 accent-teal-800"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <ChoiceGroup
        title="Pemicu (opsional)"
        name="triggers"
        options={pickingOptions.triggers}
        selectedValues={eventData?.triggers}
      />
      <ChoiceGroup
        title="Emosi (opsional)"
        name="emotions"
        options={pickingOptions.emotions}
        selectedValues={eventData?.emotions}
      />

      <div className="space-y-2">
        <label htmlFor="urge-strength" className="text-sm font-semibold">
          Kekuatan dorongan (opsional)
        </label>
        <select
          id="urge-strength"
          name="urgeStrength"
          defaultValue={eventData?.urgeStrength?.toString() ?? ""}
          className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3"
        >
          <option value="">Lewati</option>
          {[
            ["1", "1 — Sangat lemah"],
            ["2", "2 — Lemah"],
            ["3", "3 — Sedang"],
            ["4", "4 — Kuat"],
            ["5", "5 — Sangat kuat"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <ChoiceSelect
        title="Durasi picking (opsional)"
        name="durationRange"
        options={pickingOptions.durationRanges}
        selectedValue={eventData?.durationRange ?? ""}
      />
      <ChoiceGroup
        title="Alasan (opsional)"
        name="reasons"
        options={pickingOptions.reasons}
        selectedValues={eventData?.reasons}
      />
      <ChoiceGroup
        title="Dampak setelah picking (opsional)"
        name="impacts"
        options={pickingOptions.impacts}
        selectedValues={eventData?.impacts}
      />
      <ChoiceSelect
        title="Konteks (opsional)"
        name="context"
        options={pickingOptions.contexts}
        selectedValue={eventData?.context ?? ""}
      />

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950"
        >
          {isEditing
            ? "Perubahan catatan tersimpan."
            : isManualCreate
              ? "Catatan berhasil disimpan! Kamu akan kembali ke riwayat picking."
              : "Catatan berhasil disimpan! Kamu akan kembali ke dashboard."}
        </p>
      )}
    </>
  );

  function createFormContent() {
    return (
      <>
        <div>
          <p className="text-sm font-semibold text-teal-800">
            CATATAN PICKING
          </p>
          <h2 id="picking-form-title" className="mt-2 text-xl font-semibold">
            Apa yang terjadi?
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Pilih jenis kejadian dan waktu kejadian WIB. Detail lain boleh
            dilewati.
          </p>
        </div>
        {formFields}

        {!isManualCreate && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={pending || saved}
              className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
            >
              {pending
                ? "Menyimpan..."
                : saved
                  ? "Simpan perubahan"
                  : "Simpan catatan"}
            </button>
            <button
              type="button"
              onClick={props.onCancel}
              disabled={pending}
              className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
            >
              Kembali
            </button>
          </div>
        )}
      </>
    );
  }

  const form = (
    <form
      ref={formRef}
      id={isEditing || isManualCreate ? formId : undefined}
      onSubmit={submit}
      className={
        isEditing || isManualCreate
          ? "space-y-6"
          : "space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
      }
      aria-labelledby={isEditing || isManualCreate ? undefined : "picking-form-title"}
    >
      {isEditing || isManualCreate ? (
        <fieldset
          disabled={pending || saved}
          className="min-w-0 space-y-6 border-0 p-0"
        >
          {formFields}
        </fieldset>
      ) : (
        createFormContent()
      )}
    </form>
  );

  if (isEditing) {
    return (
      <>
        <Modal
          isOpen={editModalOpen}
          title="Edit catatan picking"
          description={
            !props.event.occurredAt
              ? "Catatan lama belum memiliki waktu kejadian. Isi waktu sebenarnya untuk melengkapi atau memperbarui catatan."
              : "Pilih jenis kejadian dan waktu kejadian WIB. Detail lain boleh dilewati."
          }
          closeDisabled={pending}
          onRequestClose={requestEditClose}
          onClosed={props.onCancel}
          footer={editFooter()}
        >
          {form}
        </Modal>
        <Modal
          isOpen={discardConfirmationOpen}
          title="Buang perubahan?"
          description="Perubahan yang belum disimpan akan hilang."
          onRequestClose={() => {
            setDiscardConfirmationOpen(false);
          }}
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

  if (props.mode === "create" && props.source === "manual") {
    return (
      <>
        <Modal
          isOpen={manualModalOpen}
          title="Catat kejadian picking"
          description="Pilih jenis kejadian dan waktu kejadian WIB. Detail lain boleh dilewati."
          closeDisabled={pending || saved}
          onRequestClose={requestManualClose}
          onClosed={() => {
            if (saved) {
              props.onSaved();
            } else {
              props.onCancel();
            }
          }}
          footer={
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={requestManualClose}
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
                {pending ? "Menyimpan..." : "Simpan catatan"}
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
              setManualModalOpen(false);
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

  return form;
}

function ChoiceGroup({
  title,
  name,
  options,
  selectedValues = [],
}: {
  title: string;
  name: string;
  options: readonly { readonly value: string; readonly label: string }[];
  selectedValues?: readonly string[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-2 text-sm leading-5 hover:bg-neutral-50"
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={selectedValues.includes(option.value)}
            className="mt-0.5 size-4 accent-teal-800"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ChoiceSelect({
  title,
  name,
  options,
  selectedValue = "",
}: {
  title: string;
  name: string;
  options: readonly { readonly value: string; readonly label: string }[];
  selectedValue?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-semibold">
        {title}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={selectedValue}
        className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3"
      >
        <option value="">Lewati</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
