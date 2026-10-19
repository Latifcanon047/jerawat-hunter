"use client";

import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";

type ModalProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  closeDisabled?: boolean;
  onRequestClose: () => void;
  onClosed?: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({
  isOpen,
  title,
  description,
  closeDisabled = false,
  onRequestClose,
  onClosed,
  children,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onRequestCloseRef = useRef(onRequestClose);
  const onClosedRef = useRef(onClosed);
  const closeDisabledRef = useRef(closeDisabled);
  const closeTimerRef = useRef<number | null>(null);
  const releaseScrollLockRef = useRef<(() => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
    onClosedRef.current = onClosed;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClosed, onRequestClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (isOpen) {
      if (!releaseScrollLockRef.current) {
        const htmlOverflow = document.documentElement.style.overflow;
        const bodyOverflow = document.body.style.overflow;
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        releaseScrollLockRef.current = () => {
          document.documentElement.style.overflow = htmlOverflow;
          document.body.style.overflow = bodyOverflow;
        };
      }
      if (!dialog.open) dialog.showModal();
      titleRef.current?.focus();
      return;
    }

    if (!dialog.open) return;
    closeTimerRef.current = window.setTimeout(() => {
      dialog.close();
      closeTimerRef.current = null;
      releaseScrollLockRef.current?.();
      releaseScrollLockRef.current = null;
      onClosedRef.current?.();
    }, 150);
  }, [isOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (dialogRef.current?.open) dialogRef.current.close();
      releaseScrollLockRef.current?.();
      releaseScrollLockRef.current = null;
    },
    [],
  );

  function requestClose() {
    if (closeDisabledRef.current) return;
    onRequestCloseRef.current();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-open={isOpen}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={handleBackdropClick}
      className="app-modal fixed inset-0 m-auto flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden rounded-2xl bg-white p-0 text-neutral-900 shadow-2xl transition-[opacity,transform] duration-150 ease-out data-[open=false]:translate-y-2 data-[open=false]:scale-[0.99] data-[open=false]:opacity-0 sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] motion-reduce:transition-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-6">
        <div>
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="text-lg font-semibold focus:outline-none sm:text-xl"
          >
            {title}
          </h2>
          {description && (
            <p
              id={descriptionId}
              className="mt-1 text-sm leading-6 text-neutral-600"
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Tutup dialog"
          disabled={closeDisabled}
          onClick={requestClose}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-neutral-200 bg-white p-4 sm:px-6">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
