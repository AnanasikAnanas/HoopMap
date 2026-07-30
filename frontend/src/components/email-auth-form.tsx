"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  ApiError,
  emailLogin,
  emailRegister,
  type EmailRegistrationResult,
} from "@/lib/api";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { detail?: unknown } | null;
    if (typeof payload?.detail === "string") return payload.detail;
  }
  return "Не удалось выполнить вход. Попробуйте ещё раз.";
}

export function EmailAuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const changeMode = (value: "login" | "register") => {
    setMode(value);
    setError("");
    setMessage("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "");
    const password = String(values.get("password") ?? "");
    try {
      let result: EmailRegistrationResult | undefined;
      if (mode === "register") {
        result = await emailRegister({
          email,
          password,
          name: String(values.get("name") ?? ""),
        });
      } else {
        await emailLogin({ email, password });
      }
      if (result?.requires_confirmation) {
        setMessage(result.message);
      } else {
        window.location.assign(next);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 rounded-xl bg-canvas p-1">
        <button
          type="button"
          aria-pressed={mode === "login"}
          onClick={() => changeMode("login")}
          className={`min-h-10 rounded-lg text-sm font-bold transition ${
            mode === "login" ? "bg-surface text-ink shadow-sm" : "text-muted"
          }`}
        >
          Вход
        </button>
        <button
          type="button"
          aria-pressed={mode === "register"}
          onClick={() => changeMode("register")}
          className={`min-h-10 rounded-lg text-sm font-bold transition ${
            mode === "register"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted"
          }`}
        >
          Регистрация
        </button>
      </div>

      <form className="mt-5 space-y-3 text-left" onSubmit={submit}>
        {mode === "register" && (
          <label className="grid gap-1.5 text-xs font-bold text-muted">
            Имя
            <Input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              placeholder="Как к вам обращаться"
            />
          </label>
        )}
        <label className="grid gap-1.5 text-xs font-bold text-muted">
          Email
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            required
            placeholder="you@example.com"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-muted">
          Пароль
          <Input
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={mode === "register" ? 10 : 1}
            maxLength={72}
            required
            placeholder={
              mode === "register"
                ? "Минимум 10 символов, буква и цифра"
                : "Ваш пароль"
            }
          />
        </label>
        {mode === "login" && (
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-bold text-orange hover:underline"
            >
              Забыли пароль?
            </Link>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-success/10 p-3 text-sm font-bold text-success">
            {message}
          </p>
        )}

        <Button type="submit" className="w-full gap-2" disabled={pending}>
          <Mail size={18} />
          {pending
            ? "Подождите…"
            : mode === "register"
              ? "Создать аккаунт"
              : "Войти по email"}
          {!pending && <ArrowRight size={18} />}
        </Button>
      </form>
    </div>
  );
}
