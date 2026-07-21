import {
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("button", `button-${variant}`, `button-${size}`, className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
}

export function IconButton({
  label,
  variant = "ghost",
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx("icon-button", `icon-button-${variant}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const previousActiveElement = document.activeElement;
    const focusable = getFocusableElements(dialogRef.current);
    const firstFormControl = getFirstFormControl(dialogRef.current);
    (firstFormControl ?? focusable[0])?.focus();

    // The Tab trap below only constrains the keyboard. A screen reader's
    // virtual cursor ignores it, and aria-modal is honoured unevenly, so the
    // page behind the dialog is marked inert as well — the modal is portalled
    // to <body>, so its own subtree is untouched by this.
    const backgroundRoots = Array.from(document.body.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !child.contains(dialogRef.current)
    );
    const previouslyInert = backgroundRoots.map((root) => root.inert);
    backgroundRoots.forEach((root) => {
      root.inert = true;
    });

    // Stop the page behind from scrolling under the dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      backgroundRoots.forEach((root, index) => {
        root.inert = previouslyInert[index];
      });
      document.body.style.overflow = previousOverflow;

      if (
        previousActiveElement instanceof HTMLElement &&
        document.contains(previousActiveElement)
      ) {
        previousActiveElement.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(dialogRef.current);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const overlay = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        aria-modal="true"
        className="modal"
        role="dialog"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );

  // Portal to the body so the modal escapes any local stacking context (e.g.
  // the daily-goal modal opened from the heatmap inside the library panel).
  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}

const getFocusableElements = (root: HTMLElement | null) => {
  if (!root) {
    return [];
  }

  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
      ].join(",")
    )
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      // Skip anything not actually rendered: a hidden control would otherwise
      // become a dead stop in the Tab cycle, or an unfocusable "first" element.
      element.offsetParent !== null
  );
};

const getFirstFormControl = (root: HTMLElement | null) => {
  if (!root) {
    return null;
  }

  return root.querySelector<HTMLElement>(
    [
      "[autofocus]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])"
    ].join(",")
  );
};

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  error?: ReactNode;
  onChange: (value: string) => void;
}

export function TextField({
  id,
  label,
  value,
  placeholder,
  required,
  multiline,
  rows,
  hint,
  error,
  onChange
}: TextFieldProps) {
  const descriptionId = error || hint ? `${id}-description` : undefined;

  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? <strong aria-hidden="true"> *</strong> : null}
      </span>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          rows={rows ?? 3}
        />
      ) : (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <small id={descriptionId} className="field-error">
          {error}
        </small>
      ) : hint ? (
        <small id={descriptionId} className="field-hint">
          {hint}
        </small>
      ) : null}
    </label>
  );
}
