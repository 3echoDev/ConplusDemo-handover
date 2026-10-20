// Building blocks for the Site Reports tab, one for each piece of the client's
// SitePulse mockup: topbar + iconbtn, field/label/input, chip, card with
// head/name/meta, note, banner, section label, kv rows, the vertical stage
// tracker, buttons and the btn-row, navbar, placeholder. The CSS lives in
// theme.css (ported from the mockup, prefixed sr-, scoped to .sr-app).
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** The mockup's input look; the pickers reuse it for their trigger buttons. */
export const inputCls = "sr-input";
export const labelCls = "sr-label";
/** Press feedback for custom tappables. */
export const pressCls = "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
export const successInk = "text-[var(--good)]";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** label.field from the mockup: uppercase muted caption over the control. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("sr-field", className)}>
      <label htmlFor={id} className="sr-label">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={errId} role="alert" className="sr-errmsg">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="sr-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Two fields side by side (.field-row). */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sr-field-row", className)}>{children}</div>;
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn("sr-input", className)} {...rest} />;
});

/** Decimal keypad on phones; the value stays a string until it is saved. */
export const NumberInput = forwardRef<HTMLInputElement, TextInputProps>(function NumberInput(props, ref) {
  return <TextInput ref={ref} type="text" inputMode="decimal" autoComplete="off" {...props} />;
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn("sr-input", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn("sr-input", className)} {...rest} />;
});

/** Small uppercase heading between groups (.section-lbl). */
export function SectionLabel({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cn("sr-section-lbl", right && "flex items-center justify-between gap-2", className)}>
      <span>{children}</span>
      {right}
    </div>
  );
}

export type ChipTone = "pending" | "progress" | "good" | "warn" | "bad";

/** Status chip: monospace, uppercase, a dot in the tone colour. The label always says the state; colour is never the only signal. */
export function Chip({ tone, children, className, dot = true }: { tone: ChipTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("sr-chip", `sr-chip-${tone}`, className)}>
      {dot && <span className="sr-chip-dot" aria-hidden />}
      {children}
    </span>
  );
}

/** .card — optionally tappable (renders a button). */
export function Card({ children, className, onClick, ariaLabel }: { children: ReactNode; className?: string; onClick?: () => void; ariaLabel?: string }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={cn("sr-card sr-card-tap", className)}>
        {children}
      </button>
    );
  }
  return <div className={cn("sr-card", className)}>{children}</div>;
}

/** The top of a card: name + meta on the left, chips / buttons on the right. */
export function CardHead({ name, meta, small, right }: { name: ReactNode; meta?: ReactNode; small?: boolean; right?: ReactNode }) {
  return (
    <div className="sr-head">
      <div className="min-w-0 flex-1">
        <div className={cn("sr-name", small && "sr-name-sm")}>{name}</div>
        {meta && <div className="sr-meta truncate">{meta}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sr-note", className)}>{children}</div>;
}

export function Banner({ tone, children, className, icon }: { tone: "warn" | "info" | "good"; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <div role="status" className={cn("sr-banner", `sr-banner-${tone}`, className)}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Key / value row (.kv). */
export function Kv({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("sr-kv", className)}>
      <span className="sr-k">{k}</span>
      <span className="sr-v">{v}</span>
    </div>
  );
}

export type StageState = "done" | "active" | "locked";
export interface TrackerStep {
  title: string;
  desc?: string;
  state: StageState;
  onClick?: () => void;
}

/** The mockup's stage tracker: a vertical rail of numbered nodes, done in green, the current one in orange. */
export function Tracker({ steps, small, className, label = "Progress" }: { steps: TrackerStep[]; small?: boolean; className?: string; label?: string }) {
  return (
    <ol className={cn(small ? "sr-otracker" : "sr-tracker", className)} aria-label={label}>
      {steps.map((s, i) => {
        const body = (
          <>
            <div className="sr-rail">
              <div className="sr-node">{s.state === "done" ? "✓" : i + 1}</div>
              <div className="sr-bar" />
            </div>
            <div className="sr-body">
              <div className="sr-ttl">{s.title}</div>
              {s.desc && <div className="sr-desc">{s.desc}</div>}
              <span className="sr-only">{s.state === "done" ? "done" : s.state === "active" ? "current" : "not started"}</span>
            </div>
          </>
        );
        const cls = cn("sr-tstep", small && "sr-tstep-sm", s.state);
        return (
          <li key={s.title} className="contents" aria-current={s.state === "active" ? "step" : undefined}>
            {s.onClick ? (
              <button type="button" onClick={s.onClick} className={cn(cls, "w-full cursor-pointer border-0 bg-transparent text-left font-[inherit] text-inherit")}>
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type Variant = "primary" | "ghost" | "line" | "danger";

export function Button({ variant = "ghost", className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" className={cn("sr-btn", `sr-btn-${variant}`, className)} {...rest}>
      {children}
    </button>
  );
}

/** The stacked button block at the foot of an edit screen (.btn-row). */
export function ButtonRow({ children, className, status }: { children: ReactNode; className?: string; status?: ReactNode }) {
  return (
    <div className={cn("sr-btn-row sticky bottom-0 z-30", className)}>
      {status && (
        <div className="sr-hint -mt-1 mb-0.5 min-h-[1em]" aria-live="polite">
          {status}
        </div>
      )}
      {children}
    </div>
  );
}

/** Full-width orange "＋ New …" button at the top of a list (.fab-new). */
export function FabNew({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("sr-fab-new", className)} {...rest}>
      {children}
    </button>
  );
}

/** 34px square top-bar button (.iconbtn); `text` makes it a pill with a label, like the mockup's "⬇ Excel". */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { text?: boolean }>(function IconButton({ className, children, text, ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={cn("sr-iconbtn", text && "sr-iconbtn-text", className)} {...rest}>
      {children}
    </button>
  );
});

export function TabButton({ active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} className={cn("sr-tab-btn", active && "active")} {...rest}>
      {children}
    </button>
  );
}

export function Placeholder({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sr-placeholder">
      <div className="sr-ic" aria-hidden>
        {icon}
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="mt-2 w-full max-w-[220px]">{action}</div>}
    </div>
  );
}

/** The page top bar: back button, title + sub, right-side controls. */
export function TopBar({ back, onBack, title, sub, right, block }: { back?: boolean; onBack?: () => void; title: ReactNode; sub?: ReactNode; right?: ReactNode; block?: ReactNode }) {
  return (
    <header className="sr-topbar sticky top-0 z-40 flex-col !items-stretch gap-0">
      <div className="flex items-center gap-3">
        {back && (
          <IconButton onClick={onBack} aria-label="Back">
            ←
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <h1>{title}</h1>
          {sub && <div className="sr-sub">{sub}</div>}
        </div>
        {right}
      </div>
      {block}
    </header>
  );
}
