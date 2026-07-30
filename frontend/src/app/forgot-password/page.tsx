"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Header, MobileNav } from "@/components/header";
import { Button, Card, Input } from "@/components/ui";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const values = new FormData(event.currentTarget);
      const result = await authApi.requestPasswordReset(
        String(values.get("email") ?? ""),
      );
      setMessage(result.message);
    } catch {
      setError("Не удалось отправить письмо. Попробуйте немного позже.");
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
            Восстановление доступа
          </p>
          <h1 className="display mt-2 text-3xl">Сменить пароль</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Укажите email аккаунта. Ссылка из письма откроет защищённую форму
            создания нового пароля.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="grid gap-1.5 text-xs font-bold text-muted">
              Email
              <Input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </label>
            {message && (
              <p className="rounded-xl bg-success/10 p-3 text-sm font-bold text-success">
                {message}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full gap-2" disabled={pending}>
              <Mail size={18} />
              {pending ? "Отправляем…" : "Отправить ссылку"}
            </Button>
          </form>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-orange"
          >
            <ArrowLeft size={16} />
            Вернуться ко входу
          </Link>
        </Card>
      </main>
      <MobileNav />
    </>
  );
}
