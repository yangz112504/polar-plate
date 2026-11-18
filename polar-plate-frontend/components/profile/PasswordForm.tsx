import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "react-toastify";
import { z } from "zod";
import ConfirmPrompt from "@/components/profile/ConfirmPrompt";
import { passwordSchema } from "@/lib/credentialRules";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
type Values = z.infer<typeof schema>;

/** The label, id and autocomplete hint of each box, so the three fields are rendered by one loop. */
const FIELDS = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
] as const;

/**
 * Form to change the password: current password, new password, and the new one again.
 * Checks the format and the confirmation in the browser, then asks "Change your password?" in place
 * (the boxes are read-only meanwhile); only Confirm sends PUT /api/users/me/password (the
 * confirmation box is never sent). A password change revokes every older login token on the
 * server, so the response carries a fresh one and this form stores it in localStorage straight away;
 * otherwise the user would be logged out right after changing their password.
 * Server refusals (wrong current password, rate limit) are shown under the form; the boxes keep
 * what was typed so only the wrong one needs retyping.
 * Side effects: one network request per confirmed change, a success toast, and replaces `authToken` on success.
 */
function PasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  // The validated values waiting for the user's Confirm; null when not asking.
  const [pending, setPending] = useState<{ currentPassword: string; newPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  /** Runs after the format check passes: shows the question instead of sending anything. */
  const onSubmit = ({ currentPassword, newPassword }: Values) => {
    setServerError(null);
    setPending({ currentPassword, newPassword });
  };

  /** Sends the pending change; on any outcome the prompt closes and the boxes become editable again. */
  const confirm = async () => {
    if (pending === null) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch(`${frontEndUrl}/api/users/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("authToken")}` },
        body: JSON.stringify(pending),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.message || "Something went wrong. Please try again.");
      } else {
        localStorage.setItem("authToken", data.token);
        reset();
        toast.success("Password changed.");
      }
    } catch (err) {
      console.error("Error changing password:", err instanceof Error ? err.message : err);
      setServerError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setPending(null);
      setFocus("currentPassword"); // the prompt just disappeared; the current password is the likeliest thing to fix
    }
  };

  const cancel = () => {
    setPending(null);
    setFocus("currentPassword");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {FIELDS.map(({ name, label, autoComplete }) => (
        <div key={name}>
          <label htmlFor={name} className="mb-2 block text-sm font-medium text-ink">
            {label}
          </label>
          <input
            id={name}
            type="password"
            autoComplete={autoComplete}
            readOnly={pending !== null}
            {...register(name)}
            className={`w-full rounded-lg border bg-white px-4 py-2 transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brick
                        ${errors[name] ? "border-red-500" : "border-line"}`}
            aria-invalid={errors[name] ? "true" : "false"}
            aria-describedby={`${name}-help`}
          />
          <p id={`${name}-help`} className="mt-1 text-xs text-red-700">
            {errors[name]?.message}
          </p>
        </div>
      ))}
      <p className="text-xs text-ink-soft">Use 8 or more characters. Changing it logs you out on your other devices.</p>

      {serverError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-100 p-2 text-sm text-red-700">
          {serverError}
        </p>
      )}

      {pending !== null ? (
        <ConfirmPrompt label="Confirm password change" busy={busy} onConfirm={confirm} onCancel={cancel}>
          Change your password? You will be logged out on your other devices.
        </ConfirmPrompt>
      ) : (
        <button
          type="submit"
          className="min-h-11 cursor-pointer rounded-md bg-brick px-5 font-medium text-cream transition-colors duration-300
                     hover:bg-brick-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
        >
          Change password
        </button>
      )}
    </form>
  );
}

export default PasswordForm;
