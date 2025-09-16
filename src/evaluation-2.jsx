import React, { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

/** GitHub raw JSON URLs (fill these) */
const EMBEDDING_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json";  // e.g. points with x, y, "true label" | "pred label", "time period"
const LABEL_LIST_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json"; // e.g. ["TROJAN.GENERIC", ...] or { "labels": [...] }

/** Palette (provided) */
const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];

function assignColors(labels) {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800"><a href="/"> Platform name</a></div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li><a href="#about" className="hover:text-blue-500">About us</a></li>
          <li><a href="./evaluation" className="hover:text-blue-500">Evaluation</a></li>
          <li><a href="#tech" className="hover:text-blue-500">Techniques</a></li>
        </ul>
      </nav>
    </header>
  );
}

const Section = ({ title, children, right }) => (
  <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
      <h3 className="text-slate-800 font-semibold">{title}</h3>
      {right}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

/** Double range without external deps */
function RangeBar({ min, max, valueMin, valueMax, onChange }) {
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const handleMin = (e) => {
    const v = Number(e.target.value);
    const newMin = Math.min(v, valueMax);
    onChange({ min: clamp(newMin, min, max), max: valueMax });
  };
  const handleMax = (e) => {
    const v = Number(e.target.value);
    const newMax = Math.max(v, valueMin);
    onChange({ min: valueMin, max: clamp(newMax, min, max) });
  };
  const pct = (v) => ((v - min) * 100) / (max - min);
  const left = pct(valueMin);
  const right = pct(valueMax);
  return (
    <div className="w-full relative h-8">
      <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded bg-slate-200" />
      <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-400 rounded" style={{ left: `${left}%`, width: `${right - left}%` }}/>
      <input type="range" min={min} max={max} value={valueMin} onChange={handleMin} onInput={handleMin} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }}/>
      <input type="range" min={min} max={max} value={valueMax} onChange={handleMax} onInput={handleMax} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }}/>
    </div>
  );
}

export default function EvaluationPage() {
  useEffect(() => { document.title = "Periodic Evaluation"; }, []);

  const [labelList, setLabelList] = useState(null);
  const [allPoints, setAllPoints] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const [timeMin, setTimeMin] = useState(1);
  const [timeMax, setTimeMax] = useState(1);
  const [selMin, setSelMin] = useState(1);
  const [selMax, setSelMax] = useState(1);

  useEffect(() => {
          (async () => {
              try {
                  const [labRes, ptRes] = await Promise.all([
                      fetch(LABEL_LIST_URL),
                      fetch(EMBEDDING_URL),
                  ]);
                  if (!labRes.ok) throw new Error(`label_list HTTP ${labRes.status}`);
                  if (!ptRes.ok) throw new Error(`embedding points HTTP ${ptRes.status}`);
                  const [labs, pts] = await Promise.all([labRes.json(), ptRes.json()]);
                  setLabelList(labs);
  
                  // 需要 time 欄位（數字）；若缺少，預設為 1..N
                  const hasTime = pts.length && typeof pts[0].time_period !== "undefined";
                  const enriched = hasTime
                      ? pts
                      : pts.map((r, i) => ({ ...r, time_period: i + 1 }));
  
                  setAllPoints(enriched);
  
                  const tMin = Math.max(1, Math.min(...enriched.map((r) => Number(r.time_period) || 1)));
                  const tMax = Math.max(...enriched.map((r) => Number(r.time_period) || 1));
                  setTimeMin(tMin);
                  setTimeMax(tMax);
                  setSelMin(tMin);
                  setSelMax(tMax);
              } catch (e) {
                  setLoadErr(String(e));
              }
          })();
      }, []);

  const labelColors = useMemo(() => {
    if (!labelList) return {};
    const uniq = Array.isArray(labelList) ? Array.from(new Set(labelList)).filter(Boolean) : [];
    return assignColors(uniq);
  }, [labelList]);

  const filteredPoints = useMemo(() => {
    if (!allPoints) return null;
    const lo = Math.max(timeMin, Math.min(selMin, selMax));
    const hi = Math.min(timeMax, Math.max(selMin, selMax));
    return allPoints.filter(r => {
      const t = Number(r["time_period"]) || 0;
      return t >= lo && t <= hi;
    });
  }, [allPoints, timeMin, timeMax, selMin, selMax]);

  const embeddingTraces = useMemo(() => {
    if (!filteredPoints) return [];
    const by = new Map();
    for (const r of filteredPoints) {
      const k = r["true_label"] || r["pred_label"] || "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    const order = Array.isArray(labelList) ? labelList : Array.from(by.keys());
    return order.filter(lab => by.has(lab)).map(lab => {
      const arr = by.get(lab);
      return {
        type: "scattergl",
        mode: "markers",
        name: lab,
        x: arr.map(d => d.x),
        y: arr.map(d => d.y),
        marker: { size: 5, color: labelColors[lab] },
        hoverinfo: "text",
        text: arr.map(d => `true: ${d["true_label"] ?? "-"}${d["pred_label"] ? `<br>pred: ${d["pred_label"]}` : ""}`),
      };
    });
  }, [filteredPoints, labelList, labelColors]);

  const classCounts = useMemo(() => {
    if (!filteredPoints) return null;
    const m = new Map();
    for (const r of filteredPoints) {
      const k = r["true_label"] || "other";
      m.set(k, (m.get(k) || 0) + 1);
    }
    const labels = Array.from(m.keys());
    const counts = labels.map(l => m.get(l));
    const colors = labels.map(l => labelColors[l]);
    return { labels, counts, colors };
  }, [filteredPoints, labelColors]);

  const [edits, setEdits] = useState({}); // kept if you still use annotation elsewhere
  useEffect(() => { setEdits({}); }, [selMin, selMax]);

  const rangeInfo = useMemo(() => {
    if (!allPoints || !filteredPoints) return null;
    const total = allPoints.length;
    const sel = filteredPoints.length;
    const pct = total ? Math.round((sel / total) * 100) : 0;
    return { sel, total, pct };
  }, [allPoints, filteredPoints]);

  const commitMin = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMin(Math.max(timeMin, Math.min(n, selMax))); };
  const commitMax = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMax(Math.min(timeMax, Math.max(n, selMin))); };

  return (
    <div className="min-h-screen">
      <TopBar />

      {/* Filters */}
      <div className="sticky top-[56px] z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <div className="mx-auto max-w-6xl px-4 py-4">
                    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-4">
                        <div className="flex items-center gap-4">
                            {/* 左數字框：下限 */}
                            <div className="flex flex-col w-32">
                                <label className="text-xs text-slate-500 mb-1">下限 (time_period)</label>
                                <input
                                    type="number"
                                    min={timeMin}
                                    max={selMax}
                                    value={selMin}
                                    onChange={(e) => commitMin(e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>

                            {/* 中間：雙滑桿 + 比例 */}
                            <div className="flex-1">
                                <RangeBar
                                    min={timeMin}
                                    max={timeMax}
                                    valueMin={selMin}
                                    valueMax={selMax}
                                    onChange={({ min, max }) => {
                                        setSelMin(min);
                                        setSelMax(max);
                                    }}
                                />
                                <div className="mt-1 text-xs text-slate-600">
                                    {rangeInfo
                                        ? `選取 ${selMin} ~ ${selMax}（${rangeInfo.sel}/${rangeInfo.total}, 約 ${rangeInfo.pct}%）`
                                        : "讀取中…"}
                                </div>
                            </div>

                            {/* 右數字框：上限 */}
                            <div className="flex flex-col w-32">
                                <label className="text-xs text-slate-500 mb-1">上限 (time_period)</label>
                                <input
                                    type="number"
                                    min={selMin}
                                    max={timeMax}
                                    value={selMax}
                                    onChange={(e) => commitMax(e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Scatter (kept) */}
        <Section title="Embedding 降維圖（本月新增 & 完成分析）" right={<span className="text-sm text-slate-500">來源：<code>EMBEDDING_URL</code></span>}>
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!filteredPoints ? <div>Loading…</div> : (
            <Plot data={embeddingTraces} layout={{ margin:{t:24,r:16,b:40,l:40}, legend:{orientation:"h"} }} style={{width:"100%",height:420}} config={{responsive:true,displayModeBar:true}}/>
          )}
        </Section>

        {/* Class proportion (kept) */}
        <Section title="類別比例統計（這個月）" right={<span className="text-sm text-slate-500">來源：<code>EMBEDDING_URL</code></span>}>
          {!classCounts ? <div>Loading…</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Plot data={[{type:"bar", x:classCounts.labels, y:classCounts.counts, marker:{color:classCounts.colors}}]} layout={{margin:{t:24,r:16,b:80,l:40}}} style={{width:"100%",height:320}} config={{responsive:true}}/>
              <Plot data={[{type:"pie", labels:classCounts.labels, values:classCounts.counts, marker:{colors:classCounts.colors}, hole:0.3}]} layout={{margin:{t:24,r:16,b:24,l:16}}} style={{width:"100%",height:320}} config={{responsive:true}}/>
            </div>
          )}
        </Section>

        {/* ⚠ 移除：accuracy 由低到高排序的 table（依你的指示） */}
      </main>
    </div>
  );
}
