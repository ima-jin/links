'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error';

interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * A minimal, self-contained toast notification provider. Replaces
 * `@imajin/ui`'s `ToastProvider`/`useToast` — this app deliberately drops
 * the shared cross-service UI package (see the PR's DECISION note) in favor
 * of an arms-length, dependency-free implementation with the same
 * `toast.success()`/`toast.error()` call shape.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, text: string) => {
      const id = Date.now() + Math.random();
      setMessages((current) => [...current, { id, type, text }]);
      globalThis.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text: string) => push('success', text),
      error: (text: string) => push('error', text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {messages.map((message) => (
          <output
            key={message.id}
            className={`rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
              message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {message.text}
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { toast: ToastApi } {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return { toast: api };
}
