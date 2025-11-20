"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
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

type AnalysisSection = {
  missing_information_questions: string[];
  optimization_suggestions: string[];
};

type Analysis = {
  summary: string;
  short_text: AnalysisSection;
  long_text: AnalysisSection;
  customer_questions: string[];
  seo_notes: string[];
};

type OptimizationResult = {
  short_description: string;
  description: string;
  notes?: string[];
};

type ServerAnalysesMap = Record<
  string,
  {
    analysis?: Analysis;
    rewrite?: OptimizationResult | { result?: OptimizationResult };
  }
>;

const STORAGE_KEY = "produktoptimering:lastStore";
const INSTRUCTION_STORAGE_KEY = "produktoptimering:instructions";

type InstructionSettings = {
  ignoreSizes: boolean;
  ignoreReviews: boolean;
  separateTexts: boolean;
  questionFocus: boolean;
};

const DEFAULT_INSTRUCTIONS: InstructionSettings = {
  ignoreSizes: true,
  ignoreReviews: true,
  separateTexts: true,
  questionFocus: true,
};

const instructionOptions: {
  id: keyof InstructionSettings;
  label: string;
  description: string;
}[] = [
  {
    id: "ignoreSizes",
    label: "Ignorér størrelsesguides",
    description:
      "Skanneren kan ikke læse størrelsesguides – antag at de findes i butikken.",
  },
  {
    id: "ignoreReviews",
    label: "Ignorér anmeldelser",
    description: "Kundeanmeldelser håndteres separat.",
  },
  {
    id: "separateTexts",
    label: "Optimer kort og lang tekst separat",
    description:
      "Giv dedikerede forslag til både kort og lang beskrivelse i stedet for en samlet udgave.",
  },
  {
    id: "questionFocus",
    label: "Fokusér på spørgsmål og misforståelser",
    description:
      "Find uafdækkede funktioner, skader og fordele – stil spørgsmål som en potentiel kunde.",
  },
];

const depthLabels: Record<number, string> = {
  1: "Pitch (kort & punchy)",
  2: "Overblik (få detaljer)",
  3: "Standard (balanceret)",
  4: "Dybdegående (historier + bullets)",
  5: "Ekspert (meget detaljeret)",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1 text-xs text-slate-200 hover:border-white/30"
    >
      <Copy className="size-3" />
      {copied ? "Kopieret" : "Kopiér"}
    </button>
  );
}

function buildInstructionText(settings: InstructionSettings) {
  const parts: string[] = [];
  if (settings.ignoreSizes) {
    parts.push(
      "- Ignorér størrelsesguides, da de allerede findes på produktsiderne."
    );
  }
  if (settings.ignoreReviews) {
    parts.push("- Ignorér kundeanmeldelser helt.");
  }
  if (settings.separateTexts) {
    parts.push(
      "- Giv separate vurderinger og optimeringsforslag for både kort og lang tekst."
    );
  }
  if (settings.questionFocus) {
    parts.push(
      "- Opfør dig som en potentiel kunde: find spørgsmål, misforståelser og mangler i teksten, især omkring funktioner, skader og forebyggelse."
    );
  }
  return parts.join("\n");
}

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
  const [instructionSettings, setInstructionSettings] = useState<
    InstructionSettings
  >(() => {
    if (typeof window === "undefined") return DEFAULT_INSTRUCTIONS;
    try {
      const stored = window.localStorage.getItem(INSTRUCTION_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_INSTRUCTIONS, ...JSON.parse(stored) };
      }
    } catch {
      /* noop */
    }
    return DEFAULT_INSTRUCTIONS;
  });
  const [optimizations, setOptimizations] = useState<
    Record<string, OptimizationResult>
  >({});
  const [optimizing, setOptimizing] = useState<Record<string, boolean>>({});
  const [longDepth, setLongDepth] = useState(3);
  const createMarkup = (value: string) => ({
    __html: value || "",
  });
  const renderRankedList = (items: string[], emptyLabel: string) => {
    if (!items.length) {
      return <li>{emptyLabel}</li>;
    }
    return items.map((item, index) => (
      <li key={index}>
        <span className="mr-1 font-semibold text-emerald-300">
          #{index + 1}
        </span>
        {item}
      </li>
    ));
  };

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
          const analysesFromServer: ServerAnalysesMap = data.analyses ?? {};

          const restoredAnalyses: Record<string, Analysis> = {};
          const restoredOptimizations: Record<string, OptimizationResult> = {};
          const restoredProgress: Record<string, "idle" | "running" | "done"> = {};

          for (const product of data.products ?? []) {
            const entry = analysesFromServer[product.id];
            if (entry?.analysis) {
              restoredAnalyses[product.id] = entry.analysis as Analysis;
              restoredProgress[product.id] = "done";
            } else {
              restoredProgress[product.id] = "idle";
            }

            const rewritePayload =
              entry?.rewrite && typeof entry.rewrite === "object"
                ? ("result" in entry.rewrite
                    ? (entry.rewrite as { result?: OptimizationResult }).result
                    : (entry.rewrite as OptimizationResult))
                : undefined;

            if (rewritePayload) {
              restoredOptimizations[product.id] = rewritePayload;
            }
          }

          setAnalyses(restoredAnalyses);
          setOptimizations((prev) => ({ ...restoredOptimizations, ...prev }));
          setProgress((prev) => ({ ...prev, ...restoredProgress }));
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
    setInstructionSettings(DEFAULT_INSTRUCTIONS);
    setLongDepth(3);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(INSTRUCTION_STORAGE_KEY);
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
    setOptimizations({});
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
  const toggleInstruction = (key: keyof InstructionSettings) => {
    setInstructionSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          INSTRUCTION_STORAGE_KEY,
          JSON.stringify(next)
        );
      }
      return next;
    });
  };
  const currentInstructions = buildInstructionText(instructionSettings);

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
          instructions: currentInstructions,
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

  const handleOptimize = async (product: Product) => {
    if (!openAiKey) {
      setError("Indtast din OpenAI nøgle for at generere tekster.");
      return;
    }
    setError(null);
    setOptimizing((prev) => ({ ...prev, [product.id]: true }));
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          openAiKey,
          instructions: currentInstructions,
          depthLevel: longDepth,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Kunne ikke optimere teksten.");
        return;
      }
      setOptimizations((prev) => ({
        ...prev,
        [product.id]: data.rewrite,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Uventet fejl under optimering."
      );
    } finally {
      setOptimizing((prev) => ({ ...prev, [product.id]: false }));
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
                <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-sm font-semibold text-white">
                    Instruktioner til AI
                  </p>
                  <div className="space-y-2">
                    {instructionOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-900/30 p-3 text-left text-sm text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={instructionSettings[option.id]}
                          onChange={() => toggleInstruction(option.id)}
                          className="mt-1 size-4 accent-violet-400"
                        />
                        <div>
                          <p className="font-semibold text-white">
                            {option.label}
                          </p>
                          <p className="text-xs text-slate-400">
                            {option.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <p>Detaljeringsgrad for lang tekst</p>
                    <span className="font-semibold text-white">
                      {depthLabels[longDepth]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={longDepth}
                    onChange={(event) => setLongDepth(Number(event.target.value))}
                    className="w-full accent-violet-400"
                  />
                  <p className="text-xs text-slate-400">
                    Niveau {longDepth} · {depthLabels[longDepth]}
                  </p>
                </div>

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
                          <div className="mt-4 space-y-5 text-sm text-slate-200">
                            <div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                  Resume
                                </p>
                                <CopyButton text={analysis.summary} />
                              </div>
                              <p className="mt-1 text-base text-white">
                                {analysis.summary}
          </p>
        </div>

                            {[
                              { title: "Kort tekst", section: analysis.short_text },
                              { title: "Lang tekst", section: analysis.long_text },
                            ].map(({ title, section }) => {
                              const copyPayload = [
                                `${title} · Manglende info`,
                                ...section.missing_information_questions,
                                "",
                                `${title} · Optimeringsforslag`,
                                ...section.optimization_suggestions,
                              ]
                                .filter(Boolean)
                                .join("\n");
                              return (
                                <div
                                  key={title}
                                  className="rounded-2xl border border-white/5 bg-slate-900/20 p-3"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                      {title} · Manglende info
                                    </p>
                                    <CopyButton text={copyPayload} />
                                  </div>
                                  <ul className="mt-1 list-disc space-y-1 pl-4">
                                    {renderRankedList(
                                      section.missing_information_questions,
                                      "Ingen huller registreret."
                                    )}
                                  </ul>
                                  <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">
                                    {title} · Optimeringsforslag
                                  </p>
                                  <ul className="mt-1 list-disc space-y-1 pl-4">
                                    {renderRankedList(
                                      section.optimization_suggestions,
                                      "Ingen forslag i denne sektion."
                                    )}
                                  </ul>
                                </div>
                              );
                            })}

                            <div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                  Kundespørgsmål / potentiale
                                </p>
                                <CopyButton
                                  text={analysis.customer_questions.join("\n")}
                                />
                              </div>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {renderRankedList(
                                  analysis.customer_questions,
                                  "Ingen åbne spørgsmål."
                                )}
                              </ul>
                            </div>

                            <div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                  SEO noter
                                </p>
                                <CopyButton text={analysis.seo_notes.join("\n")} />
                              </div>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {renderRankedList(
                                  analysis.seo_notes,
                                  "Ingen noter i denne omgang."
                                )}
                              </ul>
                            </div>
                          </div>
                        )}

                        {analysis && (
                          <div className="mt-4 space-y-3 rounded-2xl border border-white/5 bg-slate-900/30 p-3">
                            <button
                              type="button"
                              onClick={() => handleOptimize(product)}
                              disabled={Boolean(optimizing[product.id])}
                              className="flex items-center gap-2 rounded-xl bg-emerald-400/90 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                            >
                              {optimizing[product.id] ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" />
                                  Optimerer...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="size-4" />
                                  Generér ny tekst
                                </>
                              )}
                            </button>

                            {optimizations[product.id] && (
                              <div className="space-y-3 text-sm text-slate-200">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                      Ny kort tekst
                                    </p>
                                    <CopyButton
                                      text={
                                        optimizations[product.id]
                                          .short_description ?? ""
                                      }
                                    />
                                  </div>
                                  <div
                                    className="mt-1 text-white whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={createMarkup(
                                      optimizations[product.id]
                                        .short_description ?? ""
                                    )}
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                      Ny lang tekst
                                    </p>
                                    <CopyButton
                                      text={
                                        optimizations[product.id].description ??
                                        ""
                                      }
                                    />
                                  </div>
                                  <div
                                    className="mt-1 text-white whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={createMarkup(
                                      optimizations[product.id].description ?? ""
                                    )}
                                  />
                                </div>
                                {optimizations[product.id].notes?.length ? (
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                        Noter
                                      </p>
                                      <CopyButton
                                        text={optimizations[
                                          product.id
                                        ].notes!.join("\n")}
                                      />
                                    </div>
                                    <ul className="mt-1 list-disc space-y-1 pl-4">
                                      {optimizations[product.id].notes!.map(
                                        (note, index) => (
                                          <li key={index}>{note}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            )}
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
