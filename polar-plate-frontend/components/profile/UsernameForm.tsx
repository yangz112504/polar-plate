import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "react-toastify";
import { z } from "zod";
import ConfirmPrompt from "@/components/profile/ConfirmPrompt";
import { usernameSchema } from "@/lib/credentialRules";

const schema = z.object({ username: usernameSchema });
type Values = z.infer<typeof schema>;

interface UsernameFormProps {
  /** The name the account has now; the box starts with it and Save stays off until it differs. */
  currentUsername: string;
  /** Called with the new name after the server accepted it, so the page can update what it shows. */
  onChanged: (username: string) => void;
}

/**
 * Form to change the username. Checks the format in the browser (instant feedback, nothing sent
 * if it is wrong), then asks "Change your username to ...?" in place; only Confirm sends
 * PATCH /api/users/me. While asking, the box is read-only so the name shown is the name sent.
 * The server stays the authority: a taken name comes back as 409 "Username already taken" and is
 * shown under the form, with the box editable again.
 * Side effects: one network request per confirmed save; a success toast; the login token is NOT
 * changed (a rename does not revoke tokens).
 */
function UsernameForm({ currentUsername, onChanged }: UsernameFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  // The validated name waiting for the user's Confirm; null when not asking.
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;
  const { register, handleSubmit, watch, setFocus, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: currentUsername },
  });
  const unchanged = watch("username") === currentUsername;

  /** Runs after the format check passes: shows the question instead of sending anything. */
  const onSubmit = ({ username }: Values) => {
    setServerError(null);
    setPending(username);
  };

  /** Sends the pending name; on any outcome the prompt closes and the box becomes editable again. */
  const confirm = async () => {
    if (pending === null) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch(`${frontEndUrl}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("authToken")}` },
        body: JSON.stringify({ username: pending }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.message || "Something went wrong. Please try again.");
      } else {
        toast.success("Username updated.");
        onChanged(pending);
      }
    } catch (err) {
      console.error("Error changing username:", err instanceof Error ? err.message : err);
      setServerError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setPending(null);
      setFocus("username"); // the prompt just disappeared, so put keyboard focus somewhere sensible
    }
  };

  const cancel = () => {
    setPending(null);
    setFocus("username");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label htmlFor="username" className="mb-2 block text-sm font-medium text-ink">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          readOnly={pending !== null}
          {...register("username")}
          className={`w-full rounded-lg border bg-white px-4 py-2 transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brick
                      ${errors.username ? "border-red-500" : "border-line"}`}
          aria-invalid={errors.username ? "true" : "false"}
          aria-describedby="username-help"
        />
        <p id="username-help" className={`mt-1 text-xs ${errors.username ? "text-red-700" : "text-ink-soft"}`}>
          {errors.username?.message ?? "3-20 characters: letters, digits, _ or -."}
        </p>
      </div>

      {serverError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-100 p-2 text-sm text-red-700">
          {serverError}
        </p>
      )}

      {pending !== null ? (
        <ConfirmPrompt label="Confirm username change" busy={busy} onConfirm={confirm} onCancel={cancel}>
          Change your username to &ldquo;{pending}&rdquo;?
        </ConfirmPrompt>
      ) : (
        <button
          type="submit"
          disabled={unchanged}
          className="min-h-11 cursor-pointer rounded-md bg-brick px-5 font-medium text-cream transition-colors duration-300
                     hover:bg-brick-dark disabled:cursor-not-allowed disabled:opacity-60
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
        >
          Save username
        </button>
      )}
    </form>
  );
}

export default UsernameForm;
