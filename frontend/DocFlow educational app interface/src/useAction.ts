import { useCallback, useState } from "react";

import { ApiError } from "./api";
import type { Feedback } from "./ui";

export interface ActionRunner {
  feedback: Feedback;
  pending: boolean;
  /**
   * Runs `task`; its return value (if any) becomes the success message.
   * Resolves to whether the call succeeded so callers can keep the user's
   * input on failure instead of clearing a form they have to resubmit.
   */
  run: (task: () => Promise<string | void>, pendingText?: string) => Promise<boolean>;
  /** Reports a client-side validation failure without touching the network. */
  fail: (message: string) => void;
  reset: () => void;
}

/**
 * Every form needs the same three states: in progress, done, failed. Keeping
 * them in one hook prevents each section from inventing its own error text.
 */
export function useAction(): ActionRunner {
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle", text: "" });
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (task: () => Promise<string | void>, pendingText = "Запрос к API…") => {
      setPending(true);
      setFeedback({ kind: "pending", text: pendingText });
      try {
        const message = await task();
        setFeedback({
          kind: "success",
          text: message && message.trim() !== "" ? message : "Операция выполнена",
        });
        return true;
      } catch (error) {
        const text =
          error instanceof ApiError
            ? error.message
            : error instanceof TypeError
              ? "Сервер недоступен"
              : error instanceof Error
                ? error.message
                : "Неизвестная ошибка";
        setFeedback({ kind: "error", text });
        return false;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => setFeedback({ kind: "idle", text: "" }), []);

  const fail = useCallback((message: string) => {
    setPending(false);
    setFeedback({ kind: "error", text: message });
  }, []);

  return { feedback, pending, run, fail, reset };
}