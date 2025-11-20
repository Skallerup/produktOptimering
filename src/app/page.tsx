"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  permalink: string | null;
  price: string | null;
  sku: string | null;
  meta_title: string | null;
  meta_description: string | null;
  word_count: number | null;
};

type Analysis = {
  summary: string;
  missing_information_questions: string[];
  optimization_suggestions: string[];
  seo_notes: string[];
};

const STORAGE_KEY = "produktoptimering:lastStore";

export default function Home() {
  const [storeUrl, setStoreUrl] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(5);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [progress, setProgress] = useState<
    Record<string, "idle" | "running" | "done">
  >({});
  const [restoreStatus, setRestoreStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle");
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        storeId: string;
        storeUrl?: string;
      };
      if (!parsed.storeId) return;

      setRestoreStatus("loading");
      if (parsed.storeUrl) {
        setStoreUrl(parsed.storeUrl);
      }

      fetch(`/api/store?storeId=${parsed.storeId}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Kunne ikke hente tidligere scan.");
          }
          return response.json();
        })
        .then((data) => {
          setStoreId(data.store.id);
          setStoreUrl(data.store.base_url ?? "");
          setProducts(data.products ?? []);
          setLimit(Math.min(5, data.products?.length ?? 5));
          setRestoreStatus("success");
          setRestoreMessage("Tidligere scan er indlæst.");
        })
        .catch(() => {
          setRestoreStatus("error");
          setRestoreMessage("Kunne ikke indlæse tidligere scan.");
          window.localStorage.removeItem(STORAGE_KEY);
        });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const persistSession = (payload: { storeId: string; storeUrl: string }) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const clearSession = () => {
    setStoreId(null);
    setProducts([]);
    setSelectedIds([]);
    setAnalyses({});
    setProgress({});
    setStoreUrl("");
    setRestoreMessage(null);
    setRestoreStatus("idle");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const selectedProducts = useMemo(() => {
    if (selectedIds.length) {
      return products.filter((product) => selectedIds.includes(product.id));
    }
    return products.slice(0, limit);
  }, [products, selectedIds, limit]);

  const handleDiscover = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeUrl) return;

    setError(null);
    setIsDiscovering(true);
    setProducts([]);
    setStoreId(null);
    setAnalyses({});
    setSelectedIds([]);
    setProgress({});

    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Ukendt fejl ved scanning.");
        return;
      }

      setStoreId(data.storeId);
      setStoreUrl(data.storeUrl ?? storeUrl);
      setProducts(data.products ?? []);
      setLimit(Math.min(5, data.products.length));
      persistSession({
        storeId: data.storeId,
        storeUrl: data.storeUrl ?? storeUrl,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Uventet fejl ved scanning."
      );
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleSelection = (productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAnalyze = async () => {
    if (!storeId) {
      setError("Scan butikken først.");
      return;
    }
    if (!openAiKey) {
      setError("Indtast din OpenAI nøgle.");
      return;
    }

    const idsToAnalyze = selectedProducts.map((product) => product.id);
    if (!idsToAnalyze.length) {
      setError("Vælg mindst ét produkt.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setProgress(
      idsToAnalyze.reduce(
        (acc, id) => ({ ...acc, [id]: "running" as const }),
        {}
      )
    );

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          productIds: idsToAnalyze,
          limit: idsToAnalyze.length,
          openAiKey,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Fejl under analyse.");
        return;
      }

      const nextAnalyses = { ...analyses };
      const nextProgress = { ...progress };

      data.results?.forEach(
        (result: {
          productId: string;
          analysis: Analysis;
        }) => {
          nextAnalyses[result.productId] = result.analysis;
          nextProgress[result.productId] = "done";
        }
      );

      setAnalyses(nextAnalyses);
      setProgress(nextProgress);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Uventet fejl under analyse."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <header className="mb-12 space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Produktoptimering
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white">
            WooCommerce AI-rapport
          </h1>
          <p className="text-lg text-slate-300">
            Indtast din butik, vælg produkter og lad AI finde mangler,
            spørgsmål og konkrete forbedringer.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-8">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
              <div className="flex items-center gap-3">
                <ScanLine className="size-6 text-emerald-400" />
                <div>
                  <p className="text-sm uppercase tracking-widest text-slate-400">
                    Step 1
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Scan WooCommerce webshoppen
                  </h2>
                </div>
              </div>

              <form onSubmit={handleDiscover} className="mt-6 space-y-4">
                <label className="text-sm font-medium text-slate-200">
                  Webshop URL
                </label>
                <input
                  required
                  placeholder="https://example.com"
                  value={storeUrl}
                  onChange={(event) => setStoreUrl(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base text-white outline-none focus:border-emerald-400"
                />
                <button
                  type="submit"
                  disabled={isDiscovering}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isDiscovering ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Scanner...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-5" />
                      Scan webshop
                    </>
                  )}
                </button>
              </form>

              <div className="mt-3 space-y-2 text-sm text-slate-400">
                {products.length > 0 && (
                  <p>{products.length} produkter gemt i Supabase.</p>
                )}
                {restoreMessage && (
                  <p
                    className={
                      restoreStatus === "error"
                        ? "text-rose-300"
                        : "text-emerald-300"
                    }
                  >
                    {restoreMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearSession}
                className="mt-4 text-sm text-slate-400 underline underline-offset-4 hover:text-white"
              >
                Nulstil gemt scan
              </button>
            </div>

            {products.length > 0 && (
              <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-widest text-slate-400">
                      Step 2
                    </p>
                    <h2 className="text-xl font-semibold text-white">
                      Vælg produkter til AI-analysen
                    </h2>
                  </div>
                  <div className="text-right text-sm text-slate-400">
                    {selectedProducts.length} udvalgt
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <label className="text-sm text-slate-400">
                    Antal (top fra listen)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(50, products.length)}
                    value={limit}
                    onChange={(event) =>
                      setLimit(
                        Math.max(
                          1,
                          Math.min(
                            Number(event.target.value),
                            Math.min(50, products.length)
                          )
                        )
                      )
                    }
                    className="w-20 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-center text-white outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(products.slice(0, limit).map((p) => p.id))
                    }
                    className="rounded-xl border border-emerald-400/50 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
                  >
                    Vælg top {limit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-white/30"
                  >
                    Ryd valg
                  </button>
                </div>

                <div className="mt-6 max-h-[360px] space-y-3 overflow-y-auto pr-2">
                  {products.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-3 transition hover:border-white/15"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelection(product.id)}
                        className="mt-1 size-4 accent-emerald-400"
                      />
                      <div>
                        <p className="font-semibold text-white">
                          {product.name}
                        </p>
                        <p className="text-sm text-slate-400">
                          {product.short_description?.slice(0, 120) ??
                            "Ingen kort beskrivelse"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur">
              <div className="flex items-center gap-3">
                <Sparkles className="size-6 text-violet-300" />
                <div>
                  <p className="text-sm uppercase tracking-widest text-slate-400">
                    Step 3
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Kør AI-analysen
                  </h2>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <label className="text-sm font-medium text-slate-200">
                  Din OpenAI nøgle
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={openAiKey}
                  onChange={(event) => setOpenAiKey(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base text-white outline-none focus:border-violet-300"
                />

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !products.length}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-violet-300 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Analyserer...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-5" />
                      Start analyse
                    </>
                  )}
                </button>

                {error && (
                  <p className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    <AlertTriangle className="size-4" />
                    {error}
                  </p>
                )}
              </div>
            </div>

            {selectedProducts.length > 0 && (
              <div className="rounded-3xl border border-white/5 bg-slate-900/40 p-6 shadow-inner shadow-black/40">
                <h3 className="text-lg font-semibold text-white">
                  Status & rapporter
                </h3>
                <div className="mt-4 space-y-5">
                  {selectedProducts.map((product) => {
                    const state = progress[product.id] ?? "idle";
                    const analysis = analyses[product.id];
                    return (
                      <article
                        key={product.id}
                        className="rounded-2xl border border-white/5 bg-white/5 p-4"
                      >
                        <div className="flex items-center gap-2">
                          {state === "running" && (
                            <Loader2 className="size-5 animate-spin text-violet-200" />
                          )}
                          {state === "done" && (
                            <CheckCircle2 className="size-5 text-emerald-300" />
                          )}
                          {state === "idle" && (
                            <AlertTriangle className="size-5 text-slate-400" />
                          )}
                          <div>
                            <p className="font-semibold text-white">
                              {product.name}
                            </p>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              {state === "running"
                                ? "Analyserer"
                                : state === "done"
                                ? "Færdig"
                                : "Afventer"}
                            </p>
                          </div>
                        </div>

                        {analysis && (
                          <div className="mt-4 space-y-4 text-sm text-slate-200">
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                Resume
                              </p>
                              <p className="mt-1 text-base text-white">
                                {analysis.summary ?? "Ingen resume tilgængelig."}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                Manglende information
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {(analysis.missing_information_questions ?? []).map(
                                  (question, index) => (
                                    <li key={index}>{question}</li>
                                  )
                                )}
                              </ul>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                Optimeringsforslag
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {(analysis.optimization_suggestions ?? []).map(
                                  (suggestion, index) => (
                                    <li key={index}>{suggestion}</li>
                                  )
                                )}
                              </ul>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                SEO noter
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {(analysis.seo_notes ?? []).map((note, index) => (
                                  <li key={index}>{note}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
