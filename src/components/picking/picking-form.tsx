"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { pickingOptions } from "@/lib/picking-options";

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
  const eventData = isEditing ? props.event : null;

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
          return;
        }
        if (isManualCreate) {
          props.onSaved();
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
          return;
        }
        setSaved(true);
        props.onUpdated(result.data.event);
      }
    } catch {
      setError(
        "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi."
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
      aria-labelledby="picking-form-title"
    >
      <div>
        <p className="text-sm font-semibold text-teal-800">CATATAN PICKING</p>
        <h2 id="picking-form-title" className="mt-2 text-xl font-semibold">
          {isEditing ? "Edit catatan picking" : "Apa yang terjadi?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {isEditing && !props.event.occurredAt
            ? "Catatan lama belum memiliki waktu kejadian. Isi waktu sebenarnya untuk melengkapi atau memperbarui catatan."
            : "Pilih jenis kejadian dan waktu kejadian WIB. Detail lain boleh dilewati."}
        </p>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          disabled={pending || (props.mode === "create" && saved)}
          className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
        >
          {pending
            ? "Menyimpan..."
            : saved
              ? "Simpan perubahan"
              : isEditing
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
    </form>
  );
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
