"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Header } from "@/components/header";
import { Button, Card, Input } from "@/components/ui";
import { courtsApi, gamesApi } from "@/lib/api";

const schema = z
  .object({
    court: z.coerce.number().positive(),
    title: z.string().min(3),
    description: z.string().max(3000),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    skill_level: z.string(),
    max_players: z.coerce.number().min(2).max(100),
  })
  .refine((v) => new Date(v.starts_at) > new Date(), {
    message: "Начало должно быть в будущем",
    path: ["starts_at"],
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "Окончание должно быть позже начала",
    path: ["ends_at"],
  });
type Values = z.infer<typeof schema>;

export default function CreateGamePage() {
  const router = useRouter();
  const courts = useQuery({
    queryKey: ["court-options"],
    queryFn: () => courtsApi.list("city=Тольятти&page_size=100"),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", skill_level: "any", max_players: 10 },
  });
  const mutation = useMutation({
    mutationFn: (v: Values) => gamesApi.create(v),
    onSuccess: (g) => router.push(`/games/${g.id}`),
  });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-orange">
          Новая встреча
        </p>
        <h1 className="display mt-2 text-3xl">Создать игру</h1>
        <Card className="mt-8 p-6">
          <form
            className="space-y-5"
            onSubmit={handleSubmit((v) => mutation.mutate(v))}
          >
            <Field label="Площадка" error={errors.court?.message}>
              <select
                {...register("court")}
                className="h-12 w-full rounded-xl border border-line px-3"
              >
                <option value="">Выберите площадку</option>
                {courts.data?.results.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.address}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Название" error={errors.title?.message}>
              <Input {...register("title")} placeholder="Вечерний 3×3" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Начало" error={errors.starts_at?.message}>
                <Input type="datetime-local" {...register("starts_at")} />
              </Field>
              <Field label="Окончание" error={errors.ends_at?.message}>
                <Input type="datetime-local" {...register("ends_at")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Уровень">
                <select
                  {...register("skill_level")}
                  className="h-12 w-full rounded-xl border border-line px-3"
                >
                  <option value="any">Любой</option>
                  <option value="beginner">Новичок</option>
                  <option value="intermediate">Средний</option>
                  <option value="advanced">Опытный</option>
                </select>
              </Field>
              <Field label="Игроков">
                <Input type="number" {...register("max_players")} />
              </Field>
            </div>
            <Field label="Описание">
              <textarea
                {...register("description")}
                rows={4}
                className="w-full rounded-xl border border-line p-4"
              />
            </Field>
            {mutation.isError && (
              <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                Не удалось создать игру. Проверьте данные и авторизацию.
              </p>
            )}
            <Button className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Создаём…" : "Создать игру"}
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-bold">{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
