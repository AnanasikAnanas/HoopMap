"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Heart,
  Lightbulb,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Header, MobileNav } from "@/components/header";
import { Badge, Button, Card } from "@/components/ui";
import { courtsApi, gamesApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function CourtPage() {
  const { slug } = useParams<{ slug: string }>();
  const client = useQueryClient();
  const {
    data: court,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["court", slug],
    queryFn: () => courtsApi.one(slug),
  });
  const games = useQuery({
    queryKey: ["court-games", court?.id],
    queryFn: () => gamesApi.list(`court=${court!.id}&status=scheduled`),
    enabled: Boolean(court),
  });
  const favorite = useMutation({
    mutationFn: () => courtsApi.favorite(court!.id, !court!.is_favorite),
    onSuccess: () => client.invalidateQueries({ queryKey: ["court", slug] }),
  });
  const verify = useMutation({
    mutationFn: () => courtsApi.verify(court!.id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["court", slug] }),
  });
  if (isLoading)
    return (
      <>
        <Header />
        <main className="p-10 text-center">Загружаем площадку…</main>
      </>
    );
  if (error || !court)
    return (
      <>
        <Header />
        <main className="p-10 text-center">Площадка не найдена</main>
      </>
    );
  const photo = court.photos[0]?.image;
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
          <section>
            <div className="relative h-72 overflow-hidden rounded-3xl bg-dark md:h-[460px]">
              {photo ? (
                <Image
                  src={photo}
                  alt={court.name}
                  fill
                  priority
                  className="object-cover"
                />
              ) : (
                <div className="court-lines h-full" />
              )}
              <Badge className="absolute left-4 top-4 bg-white">
                {court.status === "published" ? "Опубликована" : "На модерации"}
              </Badge>
            </div>
            <div className="py-6">
              <p className="flex items-center gap-2 text-sm text-muted">
                <MapPin size={16} />
                {court.address}, {court.city}
              </p>
              <h1 className="display mt-3 text-3xl md:text-4xl">
                {court.name}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge>
                  <Star className="fill-warning text-warning" size={14} />
                  {court.average_rating?.toFixed(1) ?? "Нет оценок"}
                </Badge>
                <Badge>{court.hoops_count} кольца</Badge>
                <Badge>{court.surface}</Badge>
                {court.has_lighting && (
                  <Badge>
                    <Lightbulb size={14} />
                    Освещение
                  </Badge>
                )}
              </div>
              {court.description && (
                <p className="mt-6 leading-7 text-muted">{court.description}</p>
              )}
            </div>
            <Card className="p-6">
              <h2 className="display text-lg">Ближайшие игры</h2>
              <div className="mt-4 space-y-3">
                {games.data?.results.length ? (
                  games.data.results.map((game) => (
                    <a
                      key={game.id}
                      href={`/games/${game.id}`}
                      className="flex justify-between rounded-xl bg-canvas p-4"
                    >
                      <span className="font-bold">{game.title}</span>
                      <span className="text-sm text-muted">
                        {formatDate(game.starts_at)}
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted">
                    Пока нет запланированных игр. Создайте первую!
                  </p>
                )}
              </div>
            </Card>
          </section>
          <aside className="space-y-4">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Актуальность
              </p>
              <div className="mt-4 flex items-start gap-3">
                <CheckCircle2 className="text-success" />
                <div>
                  <p className="font-bold">
                    {court.last_verified_at
                      ? `Подтверждено ${formatDate(court.last_verified_at)}`
                      : "Требует подтверждения"}
                  </p>
                  <p className="text-sm text-muted">
                    Подтверждений: {court.verifications_count}
                  </p>
                </div>
              </div>
              <Button
                className="mt-5 w-full bg-success"
                onClick={() => verify.mutate()}
                disabled={verify.isPending}
              >
                Информация актуальна
              </Button>
            </Card>
            <a
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-dark px-5 font-bold text-white"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${court.location.lat},${court.location.lon}`}
            >
              <Navigation size={18} />
              Построить маршрут
            </a>
            <Button
              className="w-full bg-white text-ink ring-1 ring-line"
              onClick={() => favorite.mutate()}
            >
              <Heart
                className={court.is_favorite ? "fill-danger text-danger" : ""}
              />
              {court.is_favorite ? "В избранном" : "В избранное"}
            </Button>
            <Card className="p-5">
              <h2 className="font-bold">Характеристики</h2>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ["Тип", court.court_type],
                  ["Доступ", court.access_type],
                  ["Покрытие", court.surface],
                  ["Разметка", court.has_marking ? "Есть" : "Нет"],
                  ["Сетки", court.has_nets ? "Есть" : "Нет"],
                  ["Состояние", court.condition],
                ].map(([l, v]) => (
                  <div className="flex justify-between" key={l}>
                    <dt className="text-muted">{l}</dt>
                    <dd className="font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </aside>
        </div>
      </main>
      <MobileNav />
    </>
  );
}
