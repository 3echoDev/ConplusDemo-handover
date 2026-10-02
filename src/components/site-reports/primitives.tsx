// Shared form pieces for the Site Reports tab. Every input carries a visible
// label (never placeholder-only), 16px text so phones don't zoom on focus, and
// a 44px minimum touch height for supervisors entering data on site.
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-base text-foreground outline-none " +
  "transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 " +
  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:text-muted-foreground " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15";

/** Press feedback for anything tappable: a 3% scale-down, 150ms. */
export const pressCls = "transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={errId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputCls, className)} {...rest} />;
});

/** Decimal keypad on phones; the value stays a string until it is saved. */
export const NumberInput = forwardRef<HTMLInputElement, TextInputProps>(function NumberInput(props, ref) {
  return <TextInput ref={ref} type="text" inputMode="decimal" autoComplete="off" {...props} />;
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(inputCls, "h-auto min-h-[88px] resize-y py-2.5 leading-relaxed", className)}
      {...rest}
    />
  );
});

export function SectionCard({ title, description, actions, children, className }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-heading text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/**
 * Small green text. Stock text-success (#10b77f) is 2.4:1 on its tint in light
 * mode; the 25% step is 5.2:1. Dark mode keeps text-success (6.3:1).
 */
export const successInk = "text-[hsl(160_84%_25%)] dark:text-success";

type Tone = "neutral" | "draft" | "submitted" | "warning" | "info";

const toneCls: Record<Tone, string> = {
  neutral: "border-border bg-secondary text-muted-foreground",
  draft: "border-warning/30 bg-warning/10 text-[hsl(38_80%_30%)] dark:text-warning",
  submitted: `border-success/30 bg-success/10 ${successInk}`,
  warning: "border-accent/30 bg-accent/10 text-[hsl(30_85%_32%)] dark:text-accent",
  info: "border-info/30 bg-info/10 text-[hsl(199_89%_30%)] dark:text-info",
};

/** Status pill. Colour is never the only signal — the label always says it. */
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", toneCls[tone], className)}>
      {children}
    </span>
  );
}

export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    secondary: "border border-border bg-card text-foreground hover:bg-secondary",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    danger: "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
  }[variant];
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        pressCls,
        v,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
