"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Header, MobileNav } from "@/components/header";
import { Button, Card, Input } from "@/components/ui";
import { ApiError, authApi } from "@/lib/api";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { detail?: unknown } | null;
    if (typeof payload?.detail === "string") return payload.detail;
  }
  return "Не удалось сменить пароль. Откройте новую ссылку из письма.";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    if (password !== String(values.get("confirmation") ?? "")) {
      setError("Пароли не совпадают");
      return;
    }
    setPending(true);
    try {
      await authApi.updatePassword(password);
      router.replace("/profile?password=updated");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-lg items-center px-4 py-10 pb-24">
        <Card className="w-full p-6 md:p-9">
          <p className="text-xs font-bold uppercase tracking-widest text-orange">
            Новый пароль
          </p>
          <h1 className="display mt-2 text-3xl">Защитите аккаунт</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Используйте минимум 10 символов, включая букву и цифру.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="grid gap-1.5 text-xs font-bold text-muted">
              Новый пароль
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={72}
                required
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted">
              Повторите пароль
              <Input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={72}
                required
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full gap-2" disabled={pending}>
              <KeyRound size={18} />
              {pending ? "Сохраняем…" : "Сохранить новый пароль"}
            </Button>
          </form>
        </Card>
      </main>
      <MobileNav />
    </>
  );
}
