import {
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from "react";
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

    return () => {
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

  return (
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
      element.getAttribute("aria-hidden") !== "true"
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
