"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MapPin,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { CourtsMap } from "@/components/courts-map";
import {
  ActionSuccess,
  BasketballLoader,
} from "@/components/basketball-feedback";
import { Header } from "@/components/header";
import { useToast } from "@/components/toast";
import { Button, Card, Input } from "@/components/ui";
import { ApiError, courtsApi } from "@/lib/api";
import {
  hapticNotification,
  hapticSelection,
} from "@/lib/haptics";

const schema = z.object({
  name: z.string().min(3, "Минимум 3 символа"),
  address: z.string().min(5, "Укажите адрес"),
  city: z.string().min(2),
  country: z.string().min(2),
  court_type: z.string(),
  access_type: z.string(),
  surface: z.string(),
  hoops_count: z.coerce.number().min(1).max(20),
  has_lighting: z.boolean(),
  has_marking: z.boolean(),
  has_nets: z.boolean(),
  condition: z.string(),
  description: z.string().max(3000),
});
type FormValues = z.infer<typeof schema>;

export default function AddCourtPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState<{ lat: number; lon: number }>();
  const [photo, setPhoto] = useState<File>();
  const [error, setError] = useState("");
  const [createdCourtSlug, setCreatedCourtSlug] = useState("");
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      city: "Тольятти",
      country: "Россия",
      court_type: "outdoor",
      access_type: "free",
      surface: "asphalt",
      hoops_count: 2,
      has_lighting: false,
      has_marking: true,
      has_nets: true,
      condition: "good",
      description: "",
    },
  });
  const duplicates = useQuery({
    queryKey: ["duplicates", location],
    queryFn: () => courtsApi.nearby(location!.lat, location!.lon, 50),
    enabled: Boolean(location),
  });
  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!location) throw new Error("Выберите точку на карте");
      const court = await courtsApi.create({ ...values, location });
      if (photo) await courtsApi.uploadPhoto(court.id, photo);
      return court;
    },
    onSuccess: (court) => {
      hapticNotification("success");
      showToast("Площадка отправлена на модерацию", { tone: "success" });
      setCreatedCourtSlug(court.slug);
    },
    onError: (cause) => {
      hapticNotification("error");
      if (cause instanceof ApiError && cause.status === 401) {
        showToast("Войдите, чтобы добавить площадку", { tone: "info" });
        router.push("/login?next=/courts/add");
        return;
      }
      showToast("Не удалось отправить площадку", { tone: "error" });
      setError("Не удалось отправить площадку. Проверьте поля формы.");
    },
  });
  useEffect(() => {
    if (!createdCourtSlug) return;
    const timer = window.setTimeout(
      () => router.push(`/courts/${createdCourtSlug}`),
      1_350,
    );
    return () => window.clearTimeout(timer);
  }, [createdCourtSlug, router]);
  const values = useWatch({ control });
  const next = async () => {
    if (step === 0 && !location) {
      hapticNotification("warning");
      return setError("Нажмите на точку площадки на карте");
    }
    if (
      step === 1 &&
      !(await trigger(["name", "address", "city", "country", "hoops_count"]))
    )
      return;
    setError("");
    setStep((s) => Math.min(3, s + 1));
  };
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-orange">
            Новая площадка
          </p>
          <h1 className="display mt-2 text-3xl">Добавить на карту</h1>
          <div className="mt-6 grid grid-cols-4 gap-2">
            {["Точка", "Детали", "Фото", "Проверка"].map((label, i) => (
              <div key={label}>
                <div
                  className={`h-1 rounded ${i <= step ? "bg-orange" : "bg-line"}`}
                />
                <p className="mt-2 hidden text-xs md:block">
                  {i + 1}. {label}
                </p>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit((data) => create.mutate(data))}>
          {step === 0 && (
            <Card className="overflow-hidden">
              <div className="h-[55vh]">
                <CourtsMap
                  courts={[]}
                  pickLocation={(nextLocation) => {
                    hapticSelection();
                    setLocation(nextLocation);
                  }}
                  picked={location}
                />
              </div>
              <div className="flex items-center gap-3 p-4">
                <MapPin className="text-orange" />
                <div>
                  <p className="font-bold">
                    {location ? "Точка выбрана" : "Нажмите на площадку"}
                  </p>
                  <p className="text-sm text-muted">
                    {location
                      ? `${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}`
                      : "Координаты будут проверены сервером"}
                  </p>
                </div>
              </div>
              {duplicates.data?.results.length ? (
                <div className="border-t border-warning/30 bg-warning/10 p-4 text-sm">
                  <b>В радиусе 50 м уже есть:</b>{" "}
                  {duplicates.data.results.map((c) => c.name).join(", ")}.
                  Убедитесь, что это не дубликат.
                </div>
              ) : null}
            </Card>
          )}
          {step === 1 && (
            <Card className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Название" error={errors.name?.message}>
                <Input
                  {...register("name")}
                  placeholder="Площадка в Парке Победы"
                />
              </Field>
              <Field label="Адрес" error={errors.address?.message}>
                <Input
                  {...register("address")}
                  placeholder="Улица, дом или ориентир"
                />
              </Field>
              <Field label="Город">
                <Input {...register("city")} />
              </Field>
              <Field label="Страна">
                <Input {...register("country")} />
              </Field>
              <Field label="Тип">
                <select
                  {...register("court_type")}
                  className="h-12 w-full rounded-xl border border-line px-3"
                >
                  <option value="full">Полноценная</option>
                  <option value="half">Половина</option>
                  <option value="single_hoop">Одно кольцо</option>
                  <option value="outdoor">Уличная</option>
                  <option value="indoor">Крытая</option>
                </select>
              </Field>
              <Field label="Покрытие">
                <select
                  {...register("surface")}
                  className="h-12 w-full rounded-xl border border-line px-3"
                >
                  <option value="asphalt">Асфальт</option>
                  <option value="rubber">Резина</option>
                  <option value="concrete">Бетон</option>
                  <option value="parquet">Паркет</option>
                  <option value="other">Другое</option>
                </select>
              </Field>
              <Field
                label="Количество колец"
                error={errors.hoops_count?.message}
              >
                <Input type="number" {...register("hoops_count")} />
              </Field>
              <Field label="Состояние">
                <select
                  {...register("condition")}
                  className="h-12 w-full rounded-xl border border-line px-3"
                >
                  <option value="excellent">Отличное</option>
                  <option value="good">Хорошее</option>
                  <option value="fair">Удовлетворительное</option>
                  <option value="poor">Плохое</option>
                  <option value="unknown">Неизвестно</option>
                </select>
              </Field>
              <div className="flex flex-wrap gap-4 md:col-span-2">
                {[
                  ["has_lighting", "Есть освещение"],
                  ["has_marking", "Есть разметка"],
                  ["has_nets", "Есть сетки"],
                ].map(([name, label]) => (
                  <label key={name} className="rounded-xl bg-canvas px-4 py-3">
                    <input
                      type="checkbox"
                      {...register(name as "has_lighting")}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
              <Field label="Описание" className="md:col-span-2">
                <textarea
                  {...register("description")}
                  rows={4}
                  className="w-full rounded-xl border border-line p-4"
                  placeholder="Доступ, ориентиры и полезные детали"
                />
              </Field>
            </Card>
          )}
          {step === 2 && (
            <Card className="p-8 text-center">
              <label className="mx-auto flex min-h-64 max-w-xl cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line bg-canvas hover:border-orange">
                <ImagePlus size={42} className="text-orange" />
                <p className="mt-4 font-bold">
                  {photo?.name ?? "Выбрать фотографию"}
                </p>
                <p className="mt-2 text-sm text-muted">
                  JPEG, PNG или WebP, до 10 МБ
                </p>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0])}
                />
              </label>
            </Card>
          )}
          {step === 3 && (
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <Check />
                </span>
                <div>
                  <h2 className="font-bold">Готово к отправке</h2>
                  <p className="text-sm text-muted">
                    Площадка появится на карте после проверки модератором.
                  </p>
                </div>
              </div>
              <dl className="mt-6 grid gap-4 border-t border-line pt-6 md:grid-cols-2">
                <Preview label="Название" value={values.name ?? ""} />
                <Preview
                  label="Адрес"
                  value={`${values.address}, ${values.city}`}
                />
                <Preview label="Покрытие" value={values.surface ?? ""} />
                <Preview label="Колец" value={String(values.hoops_count)} />
                <Preview label="Фото" value={photo?.name ?? "Не добавлено"} />
                <Preview
                  label="Координаты"
                  value={
                    location
                      ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`
                      : "—"
                  }
                />
              </dl>
            </Card>
          )}
          {error && (
            <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-between">
            <Button
              type="button"
              className="bg-surface text-ink ring-1 ring-line"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              <ChevronLeft /> Назад
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={next}>
                Далее <ChevronRight />
              </Button>
            ) : (
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Отправляем…" : "На модерацию"}
              </Button>
            )}
          </div>
        </form>
      </main>
      {create.isPending && (
        <div className="fixed inset-0 z-[105] grid place-items-center bg-dark/60 p-5 backdrop-blur-sm">
          <BasketballLoader
            label={photo ? "Загружаем площадку и фото" : "Отправляем площадку"}
          />
        </div>
      )}
      {createdCourtSlug && (
        <ActionSuccess
          title="Точный бросок!"
          description="Площадка отправлена на модерацию. Сейчас откроем её страницу."
        />
      )}
    </>
  );
}

function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-bold">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-bold">{value || "—"}</dd>
    </div>
  );
}
