// Shared form pieces for the Site Reports tab. Every input carries a visible
// label (never placeholder-only), 16px text so phones don't zoom on focus, and
// a 44px minimum touch height for supervisors entering data on site.
//
// Look: the client's SitePulse mockup — uppercase muted labels, inputs on the
// warm surface-2 tint, condensed card titles, monospace status chips with a
// dot, one orange primary. Tokens live in theme.css (scoped to .sr-app).
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-11 w-full rounded-[10px] border border-border bg-secondary px-3 text-base text-foreground outline-none " +
  "transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/70 " +
  "focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:text-muted-foreground " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15";

/** Press feedback for anything tappable: a 3% scale-down, 150ms. */
export const pressCls = "transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

/** Uppercase field / section label, as the mockup draws them. */
export const labelCls = "block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted-foreground";

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
      <label htmlFor={id} className={labelCls}>
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

/** Small uppercase heading between groups of cards ("ACTIVE PROJECTS"). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground", className)}>{children}</p>;
}

export function SectionCard({ title, description, actions, children, className }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(33,29,25,0.06),0_6px_16px_-8px_rgba(33,29,25,0.18)]", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-heading text-[19px] font-bold leading-tight tracking-[0.01em] text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Green ink for small text; the theme's --success is already 4.6:1 on white. */
export const successInk = "text-success";

type Tone = "neutral" | "draft" | "submitted" | "warning" | "info";

const toneCls: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  draft: "bg-warning/15 text-warning",
  submitted: "bg-success/15 text-success",
  warning: "bg-destructive/10 text-destructive",
  info: "bg-info/15 text-info",
};

/** Status chip: monospace, uppercase, a dot in the tone colour. Colour is never the only signal — the label always says it. */
export function Pill({ tone, children, className, dot = true }: { tone: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("sr-mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em]", toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "line" }) {
  const v = {
    primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    secondary: "border border-border bg-secondary text-foreground hover:bg-card",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    danger: "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
    line: "border border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground",
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

/** 34px square icon button for the top bar. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function IconButton({ className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-secondary text-foreground outline-none",
        "hover:bg-card focus-visible:ring-2 focus-visible:ring-primary/40",
        pressCls,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export type StageState = "done" | "active" | "todo";

/**
 * The mockup's stage tracker, laid flat: numbered nodes joined by a bar, done
 * in green, the current one in orange. Three steps fit a phone width.
 */
export function StageTracker({ steps, className }: { steps: { title: string; desc?: string; state: StageState }[]; className?: string }) {
  return (
    <ol className={cn("flex items-start", className)} aria-label="Report progress">
      {steps.map((s, i) => (
        <li key={s.title} className={cn("flex min-w-0 flex-1 flex-col items-center text-center", s.state === "todo" && "opacity-60")} aria-current={s.state === "active" ? "step" : undefined}>
          <div className="flex w-full items-center">
            <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : steps[i - 1].state === "done" ? "bg-success" : "bg-border")} aria-hidden />
            <span
              className={cn(
                "sr-mono flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                s.state === "done" && "border-success bg-success text-success-foreground",
                s.state === "active" && "border-primary bg-primary text-primary-foreground",
                s.state === "todo" && "border-border bg-card text-muted-foreground",
              )}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : s.state === "done" ? "bg-success" : "bg-border")} aria-hidden />
          </div>
          <span className="mt-1.5 text-[12.5px] font-semibold leading-tight text-foreground">{s.title}</span>
          {s.desc && <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{s.desc}</span>}
          <span className="sr-only">{s.state === "done" ? "done" : s.state === "active" ? "current" : "not started"}</span>
        </li>
      ))}
    </ol>
  );
}
