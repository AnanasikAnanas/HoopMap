"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Header, MobileNav } from "@/components/header";
import { Card } from "@/components/ui";
import { gamesApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
export default function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-games"],
    queryFn: () => gamesApi.list("mine=true"),
  });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10 pb-24">
        <p className="text-xs font-bold uppercase tracking-widest text-orange">
          Профиль
        </p>
        <h1 className="display mt-2 text-3xl">Мои игры</h1>
        <div className="mt-7 space-y-3">
          {isLoading ? (
            <p>Загрузка…</p>
          ) : data?.results.length ? (
            data.results.map((g) => (
              <Link href={`/games/${g.id}`} key={g.id}>
                <Card className="mb-3 flex justify-between p-5">
                  <span className="font-bold">{g.title}</span>
                  <span className="text-sm text-muted">
                    {formatDate(g.starts_at)}
                  </span>
                </Card>
              </Link>
            ))
          ) : (
            <p className="text-muted">Вы пока не участвуете в играх.</p>
          )}
        </div>
      </main>
      <MobileNav />
    </>
  );
}
