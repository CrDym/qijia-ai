"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./icon";

type Options = { title?: string; confirmLabel?: string; danger?: boolean };
type Confirm = (message: string, options?: Options) => Promise<boolean>;
const Context = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<({ message: string } & Options) | null>(
    null,
  );
  const pending = useRef<((value: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const id = useId();
  const confirm = useCallback<Confirm>((message, options) => {
    // 重复点击不替换正在核对的操作。
    if (pending.current) return Promise.resolve(false);
    trigger.current = document.activeElement as HTMLElement;
    return new Promise((resolve) => {
      pending.current = resolve;
      setPrompt({ message, ...options });
    });
  }, []);
  const finish = useCallback((value: boolean) => {
    dialog.current?.close();
    const resolve = pending.current;
    pending.current = null;
    setPrompt(null);
    if (trigger.current?.isConnected) trigger.current.focus();
    resolve?.(value);
  }, []);
  useEffect(() => {
    if (!prompt) return;
    dialog.current?.showModal();
    cancel.current?.focus();
  }, [prompt]);
  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );
  return (
    <Context.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        className={`confirmation-dialog ${prompt?.danger ? "is-danger" : ""}`}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
      >
        {prompt && (
          <>
            <div className="confirmation-body">
              <span className="confirmation-symbol">
                <Icon name={prompt.danger ? "trash" : "file"} size={23} />
              </span>
              <p className="confirmation-eyebrow">操作确认</p>
              <h2 id={`${id}-title`}>
                {prompt.title || "放弃尚未保存的内容？"}
              </h2>
              <p id={`${id}-message`} className="confirmation-message">
                {prompt.message}
              </p>
            </div>
            <footer>
              <button
                ref={cancel}
                type="button"
                className="button secondary"
                onClick={() => finish(false)}
              >
                取消
              </button>
              <button
                type="button"
                className={`button ${prompt.danger ? "confirmation-danger" : "primary"}`}
                onClick={() => finish(true)}
              >
                {prompt.confirmLabel || "确认放弃"}
              </button>
            </footer>
          </>
        )}
      </dialog>
    </Context.Provider>
  );
}
export function useConfirmation() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}
