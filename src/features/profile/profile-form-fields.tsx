import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
};

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${hint ? hintId : ""} ${errorId}` : hint ? hintId : undefined
        }
        className={cn(
          "border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 h-11 w-full rounded-xl border px-3 text-sm transition-shadow outline-none focus:ring-3",
          error && "border-destructive",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive mt-1 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextareaFieldProps = FieldProps & {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
};

export function TextareaField({
  label,
  hint,
  error,
  value,
  onChange,
  maxLength,
  placeholder,
}: TextareaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value.length}/{maxLength}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={6}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${hint ? hintId : ""} ${errorId}` : hint ? hintId : undefined
        }
        className={cn(
          "border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 min-h-36 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6 transition-shadow outline-none focus:ring-3",
          error && "border-destructive",
        )}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive mt-1 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type ChoiceGroupProps = FieldProps & {
  children: ReactNode;
};

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement>;

export function SelectInput({
  children,
  className,
  ...props
}: SelectInputProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "border-input bg-background focus:border-ring focus:ring-ring/30 h-11 w-full appearance-none rounded-xl border ps-3 pe-10 text-sm outline-none focus:ring-3",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export function ChoiceGroup({
  label,
  hint,
  error,
  children,
}: ChoiceGroupProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">{children}</div>
      {hint ? (
        <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-destructive mt-1 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type ChoiceProps = {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
};

export function Choice({
  type,
  name,
  value,
  checked,
  onChange,
  children,
}: ChoiceProps) {
  return (
    <label className="relative">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="border-input bg-background peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-ring/40 flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] peer-focus-visible:ring-3 peer-active:scale-[0.99]">
        {children}
      </span>
    </label>
  );
}
