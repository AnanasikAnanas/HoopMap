"use client";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Button, Card } from "@/components/ui";
import { api, courtsApi } from "@/lib/api";
export default function ModerationPage() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["moderation"],
    queryFn: () => courtsApi.list("status=pending&page_size=100"),
  });
  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api(`/courts/${id}/moderate/`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["moderation"] }),
  });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-orange">
          Служебный раздел
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="display text-3xl">Модерация</h1>
          <Link
            href="/moderation/import"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-bold transition hover:border-orange hover:text-orange"
          >
            <FileUp size={18} /> Импорт площадок
          </Link>
        </div>
        {isError && (
          <p className="mt-6 rounded-xl bg-danger/10 p-4 text-danger">
            Раздел доступен только модераторам.
          </p>
        )}
        <div className="mt-7 space-y-3">
          {data?.results.map((c) => (
            <Card
              className="flex flex-col gap-4 p-5 md:flex-row md:items-center"
              key={c.id}
            >
              <div className="flex-1">
                <h2 className="font-bold">{c.name}</h2>
                <p className="text-sm text-muted">
                  {c.address} · {c.location.lat.toFixed(5)},{" "}
                  {c.location.lon.toFixed(5)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-success"
                  onClick={() =>
                    moderate.mutate({ id: c.id, status: "published" })
                  }
                >
                  Опубликовать
                </Button>
                <Button
                  className="bg-danger"
                  onClick={() =>
                    moderate.mutate({ id: c.id, status: "rejected" })
                  }
                >
                  Отклонить
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
