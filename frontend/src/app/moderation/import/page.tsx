"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import { Header } from "@/components/header";
import { Button, Card, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {
  parseCourtImport,
  type ImportedCourtPoint,
} from "@/lib/court-import";

type ImportResult = {
  received: number;
  imported: number;
  skipped: number;
  skipped_by_source: number;
  skipped_by_distance: number;
  status: "pending";
};

const fieldClass =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/15";

function messageFrom(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.payload &&
    typeof error.payload === "object" &&
    "detail" in error.payload
  ) {
    return String(error.payload.detail);
  }
  return error instanceof Error ? error.message : "Не удалось выполнить импорт";
}

export default function CourtImportPage() {
  const [points, setPoints] = useState<ImportedCourtPoint[]>([]);
  const [filename, setFilename] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Россия");
  const [courtType, setCourtType] = useState("outdoor");
  const [surface, setSurface] = useState("other");
  const [hoopsCount, setHoopsCount] = useState(2);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function selectFile(file?: File) {
    setError("");
    setResult(null);
    setPoints([]);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Файл больше 2 МБ. Разделите экспорт на несколько частей.");
      return;
    }
    try {
      const parsed = parseCourtImport(await file.text(), file.name);
      if (parsed.length > 200) {
        throw new Error(
          "За один раз можно импортировать не больше 200 точек. Разделите файл.",
        );
      }
      setFilename(file.name);
      setPoints(parsed);
    } catch (cause) {
      setFilename("");
      setError(messageFrom(cause));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!points.length) {
      setError("Сначала выберите CSV или GeoJSON-файл.");
      return;
    }
    if (!rightsConfirmed) {
      setError("Подтвердите право на импорт этих данных.");
      return;
    }
    setLoading(true);
    try {
      const imported = await api<ImportResult>("/courts/import/", {
        method: "POST",
        body: JSON.stringify({
          rights_confirmed: true,
          city,
          country,
          court_type: courtType,
          access_type: "free",
          surface,
          hoops_count: hoopsCount,
          courts: points,
        }),
      });
      setResult(imported);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Link
          href="/moderation"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-orange"
        >
          <ArrowLeft size={17} /> Назад к модерации
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-widest text-orange">
          Служебный раздел
        </p>
        <h1 className="display mt-2 text-3xl">Импорт из Яндекс Конструктора</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Экспортируйте собственную карту из «Мои карты → Конструктор карт» в
          CSV или GeoJSON. Все новые точки попадут в очередь модерации, а уже
          существующие площадки в радиусе 50 метров будут пропущены.
        </p>

        <form className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_.85fr]" onSubmit={submit}>
          <div className="space-y-6">
            <Card className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <FileUp className="mt-0.5 text-orange" />
                <div>
                  <h2 className="font-bold">1. Выберите файл</h2>
                  <p className="mt-1 text-sm text-muted">
                    Поддерживаются .csv, .json и .geojson, до 2 МБ и 200 точек.
                  </p>
                </div>
              </div>
              <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-4 text-center transition hover:border-orange">
                <FileUp className="mb-2 text-orange" />
                <span className="font-bold">
                  {filename || "Нажмите и выберите экспорт"}
                </span>
                {points.length > 0 && (
                  <span className="mt-1 text-sm text-muted">
                    Найдено точек: {points.length}
                  </span>
                )}
                <input
                  className="sr-only"
                  type="file"
                  accept=".csv,.json,.geojson,text/csv,application/geo+json,application/json"
                  onChange={(event) => void selectFile(event.target.files?.[0])}
                />
              </label>
            </Card>

            <Card className="p-5 md:p-6">
              <h2 className="font-bold">2. Общие параметры площадок</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Город
                  <Input
                    className="mt-2"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Например, Тольятти"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="text-sm font-bold">
                  Страна
                  <Input
                    className="mt-2"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="text-sm font-bold">
                  Тип площадки
                  <select
                    className={`${fieldClass} mt-2`}
                    value={courtType}
                    onChange={(event) => setCourtType(event.target.value)}
                  >
                    <option value="outdoor">Уличная</option>
                    <option value="full">Полная</option>
                    <option value="half">Половина поля</option>
                    <option value="single_hoop">Одно кольцо</option>
                    <option value="indoor">В помещении</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Покрытие
                  <select
                    className={`${fieldClass} mt-2`}
                    value={surface}
                    onChange={(event) => setSurface(event.target.value)}
                  >
                    <option value="other">Неизвестно</option>
                    <option value="asphalt">Асфальт</option>
                    <option value="rubber">Резиновое</option>
                    <option value="concrete">Бетон</option>
                    <option value="parquet">Паркет</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Количество колец
                  <Input
                    className="mt-2"
                    type="number"
                    min={1}
                    max={20}
                    value={hoopsCount}
                    onChange={(event) =>
                      setHoopsCount(Number(event.target.value))
                    }
                    required
                  />
                </label>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5 md:p-6">
              <h2 className="font-bold">Предпросмотр</h2>
              {!points.length ? (
                <p className="mt-4 text-sm text-muted">
                  После выбора файла здесь появятся первые площадки.
                </p>
              ) : (
                <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                  {points.slice(0, 20).map((point, index) => (
                    <div
                      className="rounded-2xl border border-line bg-canvas p-3"
                      key={`${point.lat}-${point.lon}-${index}`}
                    >
                      <p className="font-bold">{point.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {point.address || "Адрес не указан"} ·{" "}
                        {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                      </p>
                    </div>
                  ))}
                  {points.length > 20 && (
                    <p className="text-center text-xs text-muted">
                      И ещё {points.length - 20}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <Card className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-orange" />
                <div>
                  <h2 className="font-bold">Подтверждение</h2>
                  <p className="mt-1 text-sm text-muted">
                    Импорт предназначен только для созданных вами объектов.
                  </p>
                </div>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
                <input
                  className="mt-1 h-4 w-4 accent-orange"
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(event) => setRightsConfirmed(event.target.checked)}
                />
                <span>
                  Я подтверждаю, что имею право сохранять и использовать данные
                  из этого файла.
                </span>
              </label>
              <Button
                className="mt-5 w-full"
                type="submit"
                disabled={
                  loading ||
                  !points.length ||
                  !city.trim() ||
                  !rightsConfirmed
                }
              >
                {loading ? "Импортируем…" : `Импортировать ${points.length || ""}`}
              </Button>
            </Card>

            {error && (
              <p className="rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
                {error}
              </p>
            )}
            {result && (
              <Card className="border-success/40 bg-success/10 p-5">
                <div className="flex items-center gap-2 font-bold text-success">
                  <CheckCircle2 size={20} /> Импорт завершён
                </div>
                <p className="mt-3 text-sm">
                  Добавлено в модерацию: <b>{result.imported}</b>. Пропущено
                  дублей: <b>{result.skipped}</b>.
                </p>
                <Link
                  href="/moderation"
                  className="mt-4 inline-flex text-sm font-bold text-orange"
                >
                  Перейти к модерации
                </Link>
              </Card>
            )}
          </div>
        </form>
      </main>
    </>
  );
}
