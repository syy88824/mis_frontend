import React, { useEffect, useMemo, useState, useRef } from "react";
import Plot from "react-plotly.js";

/** GitHub raw JSON URLs (fill these) */
const EMBEDDING_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/data_w_time_finetuned_cut.json";  // e.g. points with x, y, "true label" | "pred label", "time period"
const LABEL_LIST_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json"; // e.g. ["TROJAN.GENERIC", ...] or { "labels": [...] }
const somUrls = [
  "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
  "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
]

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

function tsToDateStr(ts) {
  const n = Number(ts);
  const ms = n < 1e12 ? n * 1000 : n; // 秒→毫秒（若已是毫秒則不變）
  const d = new Date(ms);
  return isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800"><a href="/"> Malvec</a></div>
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
      <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-400 rounded" style={{ left: `${left}%`, width: `${right - left}%` }} />
      <input type="range" min={min} max={max} value={valueMin} onChange={handleMin} onInput={handleMin} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }} />
      <input type="range" min={min} max={max} value={valueMax} onChange={handleMax} onInput={handleMax} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }} />
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
  // ===== SOM state =====
  const [somDatasets, setSomDatasets] = useState([]);
  const [somTitles, setSomTitles] = useState([]);
  // 每個元素是一張 SOM 的原始 JSON（array of cells）
  const [somErr, setSomErr] = useState("");
  const [somIndex, setSomIndex] = useState(0);              // 當前顯示哪一張
  const somGraphRefs = useRef([]);                          // 每張 SOM 的 Plotly graph div 參照
  somGraphRefs.current = [];

  // 將 ref 存入陣列的小工具
  const registerSomRef = (idx) => (fig, gd) => { somGraphRefs.current[idx] = gd; };

  // ==== Random test point state ====
  const [somRandPts, setSomRandPts] = useState([]);        // [{x,y}]，每張 SOM 一個
  const [somPredLabels, setSomPredLabels] = useState([]);   // ["ADWARE.GATOR", ...]，每張 SOM 一個

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
        // 1) 先看原始長度
        console.log("[EMB] raw pts.length =", Array.isArray(pts) ? pts.length : -1);

        // 需要 time 欄位（數字）；若缺少，預設為 1..N
        const hasTime = pts.length && typeof pts[0].first_submission_date !== "undefined";
        let enriched = hasTime
          ? pts.map(r => ({ ...r, time_period: Number(r.first_submission_date) })) // ←重點
          : pts.map((r, i) => ({ ...r, time_period: i + 1 }));

        // 3) 去重（以 x|y|pred_label|time_period 當 key；可按你的欄位調）
        const keyOf = (r) => `${r.x}|${r.y}|${r.pred_label ?? ""}|${r.time_period ?? ""}`;
        enriched = Array.from(new Map(enriched.map(r => [keyOf(r), r])).values());
        console.log("[EMB] enriched & dedup length =", enriched.length);

        // 4) 覆寫，不要 append
        setAllPoints(() => enriched);

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

  function buildSomPlotPieMulti(somArray, labelColorsFromAll, opts = {}, extraPoints = []) {
    const {
      radius = 0.35,      // 每格圓半徑（座標單位）
      k = 3,              // 每格最多幾片（其餘合併到 OTHER）
      showOther = true,   // 是否顯示 OTHER 楔形
      outlineColor = "#333",
      outlineWidth = 0.6,
    } = opts;

    if (!Array.isArray(somArray) || somArray.length === 0) {
      return { traces: [], layout: { title: "Empty SOM" } };
    }

    let maxRow = 0, maxCol = 0;
    for (const c of somArray) {
      if (Number.isFinite(c.row)) maxRow = Math.max(maxRow, c.row);
      if (Number.isFinite(c.col)) maxCol = Math.max(maxCol, c.col);
    }

    // 底層透明散點：提供 hover 與座標定位
    const baseTrace = {
      type: "scatter",
      mode: "markers",
      x: somArray.map(c => c.col),
      y: somArray.map(c => c.row),
      marker: { size: 0.1, opacity: 0 },
      hoverinfo: "text",
      text: somArray.map(c => formatPropsForHover(c.proportions, 3)), // 已四捨五入到小數第3位
      hoverlabel: { align: "left" },
      showlegend: false,
    };

    // 產生 shapes：每格一個外框圓 + 多個扇形 path
    const shapes = [];
    const OTHER_KEY = "OTHER";

    for (const c of somArray) {
      const x = c.col, y = c.row;
      const props = Object.entries(c.proportions || {}).map(([lab, v]) => [lab, Number(v) || 0]);

      // 依比例排序
      props.sort((a, b) => b[1] - a[1]);
      const top = props.slice(0, k);
      const rest = props.slice(k);

      let otherVal = 0;
      if (showOther && rest.length) {
        otherVal = rest.reduce((a, [, v]) => a + v, 0);
        top.push([OTHER_KEY, otherVal]);
      }

      // 正規化到 1（避免總和不是 1）
      const total = top.reduce((a, [, v]) => a + v, 0) || 1;
      // 先畫外框圓（淡灰背景，顯示邊界）
      shapes.push({
        type: "circle",
        xref: "x", yref: "y",
        x0: x - radius, x1: x + radius, y0: y - radius, y1: y + radius,
        line: { width: outlineWidth, color: outlineColor },
        fillcolor: "#ffffff",
        layer: "below",
        opacity: 1
      });

      // 由 0 角開始順時針畫扇形
      let acc = 0;
      for (const [lab, val] of top) {
        const frac = (val || 0) / total;
        if (frac <= 0) continue;
        const start = acc * 2 * Math.PI;
        const end = (acc + frac) * 2 * Math.PI;
        acc += frac;

        // 近似弧：切成多段線
        const segs = Math.max(10, Math.floor((end - start) / (Math.PI / 16)));
        const pts = [];
        for (let s = 0; s <= segs; s++) {
          const t = start + (end - start) * (s / segs);
          pts.push([x + radius * Math.cos(t), y + radius * Math.sin(t)]);
        }
        const path = [
          `M ${x} ${y}`,
          `L ${x + radius * Math.cos(start)} ${y + radius * Math.sin(start)}`,
          ...pts.slice(1).map(([px, py]) => `L ${px} ${py}`),
          "Z",
        ].join(" ");

        shapes.push({
          type: "path",
          path,
          line: { width: 0 },
          fillcolor:
            lab === OTHER_KEY ? "#e5e7eb" : (labelColorsFromAll[lab] || "#7f7f7f"),
          layer: "below",
          opacity: 0.98,
        });
      }
    }

    // ★ 新增：蒐集本圖出現的 labels，建立 legend 專用 traces
    const labelsInThisSom = collectLabelsFromSom(somArray, 30);
    const legendTraces = makeLegendTraces(
      labelsInThisSom,
      labelColorsFromAll,
      maxCol + 5,   // 放在軸外（不會出現在視區）
      maxRow + 5
    );

    const layout = {
      margin: { t: 24, r: 40, b: 40, l: 40 },
      xaxis: { range: [-0.8, maxCol + 0.8], dtick: 1, title: "col", domain: [0, 0.82] },
      yaxis: { range: [maxRow + 0.8, -0.8], dtick: 1, title: "row" },
      hovermode: "closest",
      showlegend: true,  // ★ 新增：開啟 legend
      legend: {
        x: 0.86, y: 1, xanchor: "left", yanchor: "top",    // ★ 圖內靠右上角
        orientation: "v",
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "rgba(0,0,0,0.1)",
        borderwidth: 1,
        itemwidth: 60
      },
      shapes,
    };

    // 尾端回傳前
    const testPointTrace = extraPoints?.length ? {
      type: "scatter",
      mode: "markers",
      x: extraPoints.map(p => p.x),
      y: extraPoints.map(p => p.y),
      marker: { size: 10, color: "black" },
      name: "test point",
      showlegend: false,
      hoverinfo: "skip",
    } : null;

    return {
      traces: testPointTrace ? [baseTrace, ...legendTraces, testPointTrace]
        : [baseTrace, ...legendTraces],
      layout
    };
  }

  function formatPropsForHover(props, digits = 3, topK = 10) {
    const arr = Object.entries(props || {})
      .map(([k, v]) => [k, Number(v) || 0])
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);
    if (!arr.length) return "(no proportions)";
    return arr.map(([k, v]) => `${k}: ${v.toFixed(digits)}`).join("<br>");
  }

  function collectLabelsFromSom(somArray, maxLabels = 20) {
    const set = new Set();
    for (const c of somArray) {
      for (const lab of Object.keys(c.proportions || {})) set.add(lab);
      if (set.size >= maxLabels) break;
    }
    return [...set];
  }

  function makeLegendTraces(labels, labelColors, offX, offY) {
    // 在圖外放 1 個點，用來出現在 legend 裡
    return labels.map((lab) => ({
      type: "scatter",
      mode: "markers",
      x: [offX], y: [offY],           // 放到軸域外，不會看到點
      marker: { size: 10, color: labelColors[lab] || "#7f7f7f" },
      name: lab,
      showlegend: true,
      hoverinfo: "skip",
    }));
  }

  // ---- 新增：把各種 JSON 形狀規格化成「[{row, col, counts, proportions}, ...]」----
  // 在任何形狀的 JSON 裡，把 "像 cell 的東西" 全部抓出來
  function normalizeSomJson(root) {
    // 1) 若是陣列，直接走 map
    const tryArray = (arr) => Array.isArray(arr) ? arr : null;

    // 2) 若是物件，但長得像 { "0": {...}, "1": {...} }，先轉成陣列
    const objectValuesIfIndexObject = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      const keys = Object.keys(obj);
      if (keys.length === 0) return null;
      // 全是連號數字鍵？
      const isIndexLike = keys.every(k => /^\d+$/.test(k));
      return isIndexLike ? keys.sort((a, b) => a - b).map(k => obj[k]) : null;
    };

    function deepFindArray(node, depth = 0, limit = 6) {
      if (depth > limit || node == null) return null;

      // a) 本身就是陣列
      const arr = tryArray(node);
      if (arr) return arr;

      // b) { "0": {...}, "1": {...} } 類型
      const asIndexArr = objectValuesIfIndexObject(node);
      if (asIndexArr) return asIndexArr;

      // c) 在屬性裡找
      if (typeof node === "object") {
        for (const v of Object.values(node)) {
          // 先嘗試直接當陣列
          const a = tryArray(v);
          if (a) {
            // 試著判斷是不是 cell 陣列
            const first = a.find(e => e != null);
            if (first && typeof first === "object") return a;
          }
        }
        // 再遞迴往下找
        for (const v of Object.values(node)) {
          const found = deepFindArray(v, depth + 1, limit);
          if (found) return found;
        }
      }
      return null;
    }

    // 先找出「最可能的陣列」
    let cells = deepFindArray(root) || [];
    if (!Array.isArray(cells)) cells = [];

    // 做欄位別名與型別修正
    const out = cells.map((c) => {
      // row/col 多種命名；可能是字串
      const rowRaw = c?.row ?? c?.r ?? c?.i ?? c?.y;
      const colRaw = c?.col ?? c?.column ?? c?.c ?? c?.j ?? c?.x;

      const row = Number(rowRaw);
      const col = Number(colRaw);
      const counts = c?.counts ?? {};
      const proportions = c?.proportions ?? {};

      return {
        ...c,
        row: Number.isFinite(row) ? row : 0,
        col: Number.isFinite(col) ? col : 0,
        counts: counts && typeof counts === "object" ? counts : {},
        proportions: proportions && typeof proportions === "object" ? proportions : {},
      };
    });

    // 過濾掉完全沒有資訊的元素（避免空物害 range 變 NaN）
    return out.filter(
      (c) =>
        Number.isFinite(c.row) && Number.isFinite(c.col) &&
        (Object.keys(c.proportions).length > 0 || Object.keys(c.counts).length > 0)
    );
  }

  // ---- 載入多個 SOM JSON（支援各種殼與欄位別名）----
  useEffect(() => {
    (async () => {
      if (!somUrls || !somUrls.length) return;
      try {
        const resps = await Promise.all(
          somUrls.map(u => fetch(u, { cache: "no-store" }))
        );
        resps.forEach((r, i) => {
          if (!r.ok) throw new Error(`SOM[${i}] HTTP ${r.status}`);
        });

        // 部分伺服器會傳奇怪 content-type；保守做法：先 text 再 JSON.parse
        const texts = await Promise.all(resps.map(r => r.text()));
        const jsons = texts.map((t, i) => {
          try {
            return JSON.parse(t);
          } catch (e) {
            console.error(`[SOM] JSON parse failed @${i}`, e, t?.slice(0, 200));
            throw new Error(`SOM[${i}] JSON parse failed`);
          }
        });

        const norm = jsons.map((j, i) => {
          const arr = normalizeSomJson(j);
          console.log(`[SOM] dataset #${i} raw keys:`, j && typeof j === "object" ? Object.keys(j) : typeof j);
          console.log(`[SOM] dataset #${i} normalized length:`, arr.length);
          // 額外印出前 2 筆供你核對
          if (arr.length) console.log(`[SOM] sample[${i}]:`, arr.slice(0, 2));
          return arr;
        });
        const titles = ['SOM-APT30', 'SOM-dropper']
        setSomDatasets(norm);
        setSomTitles(titles);
        setSomErr("");
      } catch (e) {
        console.error(e);
        setSomErr(String(e?.message || e));
        setSomDatasets([]);
      }
    })();
  }, []);

  function knnPredictSom(somArray, qx, qy, k = 5) {
    if (!Array.isArray(somArray) || somArray.length === 0) return { label: "UNKNOWN", scores: {} };
    const eps = 1e-6;
    const distList = somArray.map(c => {
      const dx = qx - Number(c.col || 0);
      const dy = qy - Number(c.row || 0);
      return { cell: c, d: Math.hypot(dx, dy) };
    }).sort((a, b) => a.d - b.d).slice(0, Math.min(k, somArray.length));

    const scores = {};
    for (const { cell, d } of distList) {
      const w = 1 / (d + eps);
      for (const [lab, p] of Object.entries(cell.proportions || {})) {
        const val = Number(p) || 0;
        scores[lab] = (scores[lab] || 0) + w * val;
      }
    }
    let bestLab = "UNKNOWN", bestVal = -Infinity;
    for (const [lab, s] of Object.entries(scores)) if (s > bestVal) { bestVal = s; bestLab = lab; }
    return { label: bestLab, scores };
  }

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
      const k = r["pred_label"] || "other";
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
        text: arr.map(d => {
          const lab = d["pred_label"] ?? "-";
          return `${lab}${d.time_period ? `<br>${tsToDateStr(d.time_period)}` : ""}`;
        })
      };
    });
  }, [filteredPoints, labelList, labelColors]);

  const classCounts = useMemo(() => {
    if (!filteredPoints) return null;
    const m = new Map();
    for (const r of filteredPoints) {
      const k = r["pred_label"] || "other";
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
                <label className="text-xs text-slate-500 mb-1">下限 (first_submission_date)</label>
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
                    ? `選取 ${tsToDateStr(selMin)} ~ ${tsToDateStr(selMax)}（${rangeInfo.sel}/${rangeInfo.total}, 約 ${rangeInfo.pct}%）`
                    : "讀取中…"}
                </div>
              </div>

              {/* 右數字框：上限 */}
              <div className="flex flex-col w-32">
                <label className="text-xs text-slate-500 mb-1">上限 (first_submission_date)</label>
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
        <Section title="Embedding 降維圖（本月新增 & 完成分析）">
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!filteredPoints ? <div>Loading…</div> : (
            <Plot data={embeddingTraces} layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h" } }} style={{ width: "100%", height: 420 }} config={{ responsive: true, displayModeBar: true }} />
          )}
        </Section>

        {/* Class proportion (kept) */}
        <Section title="類別比例統計（這個月）">
          {!classCounts ? <div>Loading…</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Plot data={[{ type: "bar", x: classCounts.labels, y: classCounts.counts, marker: { color: classCounts.colors } }]} layout={{ margin: { t: 24, r: 16, b: 80, l: 40 } }} style={{ width: "100%", height: 320 }} config={{ responsive: true }} />
              <Plot data={[{ type: "pie", labels: classCounts.labels, values: classCounts.counts, marker: { colors: classCounts.colors }, hole: 0.3 }]} layout={{ margin: { t: 24, r: 16, b: 24, l: 16 } }} style={{ width: "100%", height: 320 }} config={{ responsive: true }} />
            </div>
          )}
        </Section>

        {/* 3. SOM maps (替換原本 APT30 圖表) */}
        <Section title={somTitles[somIndex] || "Self-Organizing Map"}>
          {somErr && <div className="text-red-600 text-sm mb-2">SOM load error: {somErr}</div>}
          {!somDatasets.length ? (
            <div>Loading SOM…（請在 DATA_URLS.somUrls 放入你的 GitHub raw JSON）</div>
          ) : (
            <div className="relative">
              {/* 左右切換 */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setSomIndex((somIndex - 1 + somDatasets.length) % somDatasets.length)}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                >
                  ←
                </button>
                <div className="text-sm text-slate-600">{somIndex + 1} / {somDatasets.length}</div>
                <button
                  onClick={() => setSomIndex((somIndex + 1) % somDatasets.length)}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                >
                  →
                </button>
              </div>

              {/* 點點指示器 */}
              <div className="flex items-center justify-center gap-2 mb-3">
                {somDatasets.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSomIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full ${i === somIndex ? "bg-blue-600" : "bg-slate-300"}`}
                    aria-label={`go to SOM ${i + 1}`}
                  />
                ))}
              </div>

              {/* 重要：同一個 section 中「同時渲染所有 SOM」，
                  只有當前索引那張顯示在視口；其餘放到螢幕外且很小，
                  但仍然初始化，才能在 PDF 匯出時逐一輸出所有圖 */}
              <div className="relative">
                {somDatasets.map((somArray, i) => {
                  // 在渲染 SOM 的 map 迴圈裡（i 是索引）
                  const extraPt = somRandPts[i] ? [somRandPts[i]] : [];
                  const { traces, layout } = buildSomPlotPieMulti(
                    somArray,
                    labelColors,
                    { radius: 0.35, k: 3, showOther: true },
                    extraPt // ← 新增的參數：額外點
                  );

                  const isActive = i === somIndex;
                  return (
                    <div
                      key={i}
                      style={isActive
                        ? { width: "100%", height: 500 }
                        : { position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }}
                    >
                      <div style={{ width: '100%', maxWidth: 800, aspectRatio: '1 / 1' }}>
                        <Plot
                          data={traces}
                          layout={layout}
                          style={isActive ? { width: "100%", height: 500 } : { width: 1, height: 1 }}
                          config={{ responsive: true, displayModeBar: true }}
                          onInitialized={registerSomRef(i)}
                          onUpdate={registerSomRef(i)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}
