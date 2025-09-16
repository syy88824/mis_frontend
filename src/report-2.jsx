import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min";
import jsPDF from "jspdf";

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

/** GitHub raw JSON URLs (fill these) */

const DATA_URLS = {
  labelList:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json",
  tsnePoints:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json",
  somUrls: [
    // "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_true_label_id.json",
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
  ],
};

const FIXED_LABEL_COLORS = {}; // optional: leave empty, we rely on assignColors for full control

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

export default function ReportPage() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "Analysis Report"; }, []);

  const graphRefs = { family: useRef(null), heatmap: useRef(null), apt30: useRef(null), tsne: useRef(null) };

  // (Keep your other demo values; can be replaced by JSON if you have)
  const familyScores = useMemo(() => [
    { label: "TROJAN.GENERIC", score: 0.62 },
    { label: "ADWARE.SCREENSAVER", score: 0.22 },
    { label: "GOODWARE", score: 0.16 },
  ], []);
  const apt30Prob = 0.78;
  const filename = "sample.exe";

  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (!DATA_URLS.labelList || !DATA_URLS.tsnePoints) return;
        const [labelsRes, pointsRes] = await Promise.all([fetch(DATA_URLS.labelList), fetch(DATA_URLS.tsnePoints)]);
        if (!labelsRes.ok) throw new Error(`labelList HTTP ${labelsRes.status}`);
        if (!pointsRes.ok) throw new Error(`tsnePoints HTTP ${pointsRes.status}`);
        const [labels, points] = await Promise.all([labelsRes.json(), pointsRes.json()]);
        setLabelList(labels);
        setTsneRows(points);
      } catch (e) { setLoadErr(String(e)); }
    })();
  }, []);

  const allLabelNames = useMemo(() => {
    const arr = Array.isArray(labelList) ? labelList.slice() : [];
    for (const fs of familyScores) if (!arr.includes(fs.label)) arr.push(fs.label);
    return arr;
  }, [labelList, familyScores]);

  const labelColors = useMemo(() => assignColors(allLabelNames), [allLabelNames]);

  const tsneTraces = useMemo(() => {
    if (!tsneRows) return [];
    const by = new Map();
    tsneRows.forEach((r) => {
      const k = r["true_label"] ?? r["pred_label"] ?? "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    });
    const order = allLabelNames.length ? allLabelNames : Array.from(by.keys());
    return order.filter(l => by.has(l)).map(lab => {
      const arr = by.get(lab);
      return {
        type: "scattergl", mode: "markers", name: lab,
        x: arr.map(d => d.x), y: arr.map(d => d.y),
        marker: { size: 4, color: labelColors[lab] },
        text: arr.map(d => `label: ${d["true_label"] ?? "-"}`),
        hoverinfo: "text",
      };
    });
  }, [tsneRows, allLabelNames, labelColors]);

  const summaryJson = useMemo(() => ({
    filename,
    top1_family: familyScores.reduce((a, b) => a.score >= b.score ? a : b).label,
    apt30: { probability: apt30Prob, is_APT30: apt30Prob >= 0.5 },
  }), [filename, familyScores, apt30Prob]);

  const SectionCard = ({ title, children }) => (
    <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-slate-800 font-semibold">{title}</h3></div>
      <div className="p-4">{children}</div>
    </section>
  );

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
  const [scatterRandPt, setScatterRandPt] = useState(null); // {x,y}，t-SNE 的黑點
  const [scatterPredLabel, setScatterPredLabel] = useState(null); // t-SNE 黑點的預測標籤

  // ==== kNN 小工具 ====
  // SOM：在 (row,col) 網格上做 kNN，對鄰近格子的 proportions 做距離加權投票
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

  // t-SNE/Scatter：在 2D 點雲上用 kNN 多數決
  function knnPredictScatter(points, qx, qy, k = 7) {
    if (!Array.isArray(points) || points.length === 0) return { label: "UNKNOWN" };
    const arr = points.map(p => ({ p, d: Math.hypot(qx - p.x, qy - p.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.min(k, points.length));
    const count = {};
    for (const { p } of arr) {
      const lab = p.label || "UNKNOWN";
      count[lab] = (count[lab] || 0) + 1;
    }
    let bestLab = "UNKNOWN", bestCnt = -1;
    for (const [lab, c] of Object.entries(count)) if (c > bestCnt) { bestCnt = c; bestLab = lab; }
    return { label: bestLab, votes: count };
  }


  function extractTitleDeep(obj, limit = 5) {
    const seen = new Set();
    function dfs(o, depth) {
      if (!o || typeof o !== "object" || depth > limit || seen.has(o)) return null;
      seen.add(o);
      if (typeof o.title === "string" && o.title.trim()) return o.title.trim();
      for (const v of Object.values(o)) {
        if (v && typeof v === "object") {
          const t = dfs(v, depth + 1);
          if (t) return t;
        }
      }
      return null;
    }
    return dfs(obj, 0);
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

    // 3) 深度搜尋：在任何鍵裡找「陣列」，且陣列元素像 cell（有 row/col 或有 proportions/counts）
    function looksLikeCell(x) {
      if (!x || typeof x !== "object") return false;
      const hasRowLike = ("row" in x) || ("r" in x) || ("i" in x) || ("y" in x);
      const hasColLike = ("col" in x) || ("column" in x) || ("c" in x) || ("j" in x) || ("x" in x);
      const hasDist = ("proportions" in x) || ("counts" in x);
      return (hasRowLike && hasColLike) || hasDist;
    }

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
      if (!DATA_URLS.somUrls || !DATA_URLS.somUrls.length) return;
      try {
        const resps = await Promise.all(
          DATA_URLS.somUrls.map(u => fetch(u, { cache: "no-store" }))
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

        // const titles = jsons.map((j, i) => {
        //   const t = extractTitleDeep(j);
        //   return t || `SOM #${i + 1}`;   // 以序號為後備，避免隨機碼
        // });
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

  useEffect(() => {
    if (!somDatasets.length) return;

    // ---- SOM：每張產生一顆黑點並推論 ----
    const newSomPts = somDatasets.map(arr => {
      let maxR = 0, maxC = 0;
      for (const c of arr) {
        if (Number.isFinite(c.row)) maxR = Math.max(maxR, c.row);
        if (Number.isFinite(c.col)) maxC = Math.max(maxC, c.col);
      }
      return { x: Math.random() * (maxC || 1), y: Math.random() * (maxR || 1) };
    });
    const somLabs = newSomPts.map((pt, i) => knnPredictSom(somDatasets[i], pt.x, pt.y, 5).label);
    setSomRandPts(newSomPts);
    setSomPredLabels(somLabs);

    // ---- t-SNE：用 tsneRows（原始點）來做 kNN，並在其邊界內生成一顆黑點 ----
    if (Array.isArray(tsneRows) && tsneRows.length) {
      const xs = tsneRows.map(r => r.x), ys = tsneRows.map(r => r.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rx = minX + Math.random() * (maxX - minX);
      const ry = minY + Math.random() * (maxY - minY);
      setScatterRandPt({ x: rx, y: ry });

      const points = tsneRows.map(r => ({
        x: r.x,
        y: r.y,
        label: r["true_label"] ?? r["pred_label"] ?? "other",
      }));
      const pred = knnPredictScatter(points, rx, ry, 7);
      setScatterPredLabel(pred.label);
    }
  }, [somDatasets, tsneRows]);


  // 依 proportions 畫多類扇形；每格圓固定半徑 r，不重疊
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
      const sum = props.reduce((a, [, v]) => a + v, 0) || 0;

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
      marker: { size: 5, color: "black" },
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




  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pad = 48;
    doc.setFontSize(18); doc.text("Malware Report", pad, 64);
    doc.setFontSize(11); doc.setTextColor(100); doc.text("Generated by (platform name)", pad, 84);
    const lines = [
      ["filename", String(summaryJson.filename)],
      ["malware family (top-1)", summaryJson.top1_family],
      ["is_APT30", `${summaryJson.apt30.is_APT30} (p=${summaryJson.apt30.probability})`],
    ];
    const y0 = 120; doc.setTextColor(20); doc.setFontSize(12);
    lines.forEach((row, i) => { doc.text(`${row[0]}:`, pad, y0 + i * 20); doc.text(String(row[1]), pad + 160, y0 + i * 20); });

    const items = [
      { key: "family", title: "Malware family scores" },
      { key: "heatmap", title: "Attention heatmap" },
      { key: "tsne", title: "t-SNE embedding" },
    ];

    let y = 220;
    for (const it of items) {
      const gd = graphRefs[it.key].current;
      if (!gd) continue;
      doc.setFontSize(12); doc.setTextColor(20); doc.text(it.title, pad, y); y += 14;
      try {
        const isTSNE = it.key === "tsne";
        const exportWidth = isTSNE ? 720 : 560;
        const exportHeight = isTSNE ? 480 : 320;
        const displayWidth = 520;
        const displayHeight = isTSNE ? 440 : 300;
        const img = await Plotly.toImage(gd, { format: "png", width: exportWidth, height: exportHeight, scale: 2 });
        if (y + displayHeight > 780) { doc.addPage(); y = 64; }
        doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
        y += displayHeight + 16;
      } catch { }
    }

    // ⬇️ 新增：逐一輸出所有 SOM（不受目前 somIndex 影響）
    if (somGraphRefs.current && somGraphRefs.current.length) {
      doc.addPage();
      y = 64;
      doc.setFontSize(14); doc.setTextColor(20); doc.text("Self-Organizing Maps", pad, y); y += 20;

      for (let i = 0; i < somGraphRefs.current.length; i++) {
        const gd = somGraphRefs.current[i];
        if (!gd) continue;
        const t = somTitles?.[i] || `SOM #${i + 1}`;
        doc.setFontSize(12); doc.setTextColor(20); doc.text(t, pad, y); y += 14;
        try {
          const exportWidth = 720, exportHeight = 480;
          const displayWidth = 520, displayHeight = 440;
          const img = await Plotly.toImage(gd, { format: "png", width: exportWidth, height: exportHeight, scale: 2 });
          if (y + displayHeight > 780) { doc.addPage(); y = 64; }
          doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
          y += displayHeight + 16;
        } catch { }
      }
    }
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(summaryJson, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-700"><span className="text-lg font-semibold">Analysis results</span></div>
          <div className="flex gap-3">
            <button onClick={() => navigate("/")} className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Back to Main</button>
            <button onClick={handlePDF} className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Export PDF</button>
          </div>
        </div>

        {/* 1. family (kept) */}
        <SectionCard title="malware family">
          <Plot
            data={[{
              type: "bar",
              x: familyScores.map(d => d.label),
              y: familyScores.map(d => d.score),
              marker: { color: familyScores.map(d => labelColors[d.label]) },
            }]}
            layout={{ margin: { t: 24, r: 16, b: 48, l: 40 }, yaxis: { range: [0, 1] } }}
            style={{ width: "100%", height: 320 }}
            config={{ responsive: true }}
            onInitialized={(fig, gd) => { graphRefs.family.current = gd; }}
            onUpdate={(fig, gd) => { graphRefs.family.current = gd; }}
          />
        </SectionCard>

        {/* 2. heatmap (kept) */}
        <SectionCard title="attention heatmap">
          <Plot
            data={[{ z: [[0.1, 0.3, 0.5, 0.2, 0.1], [0.2, 0.4, 0.7, 0.4, 0.2], [0.05, 0.2, 0.35, 0.3, 0.1]], type: "heatmap", colorscale: "YlOrRd" }]}
            layout={{ margin: { t: 24, r: 16, b: 40, l: 40 } }}
            style={{ width: "100%", height: 320 }}
            config={{ responsive: true }}
            onInitialized={(fig, gd) => { graphRefs.heatmap.current = gd; }}
            onUpdate={(fig, gd) => { graphRefs.heatmap.current = gd; }}
          />
        </SectionCard>

        {/* 3. SOM maps (替換原本 APT30 圖表) */}
        <SectionCard title={somTitles[somIndex] || "Self-Organizing Map"}>
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
                        ? { width: "100%", height: 360 }
                        : { position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }}
                    >
                      <Plot
                        data={traces}
                        layout={layout}
                        style={isActive ? { width: "100%", height: 360 } : { width: 1, height: 1 }}
                        config={{ responsive: true, displayModeBar: true }}
                        onInitialized={registerSomRef(i)}
                        onUpdate={registerSomRef(i)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>


        {/* 4. scatter (kept, unified colors via BASE_PALETTE) */}
        <SectionCard title="t-SNE embedding (from GitHub JSON)">
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!tsneRows ? <div>Loading…</div> : (
            <Plot
              data={[
                ...tsneTraces,
                ...(scatterRandPt ? [{
                  type: "scattergl",
                  mode: "markers",
                  x: [scatterRandPt.x],
                  y: [scatterRandPt.y],
                  marker: { size: 5, color: "black" },
                  name: "test point",
                  showlegend: false,
                  hoverinfo: "skip",
                }] : [])
              ]}
              layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h" } }}
              style={{ width: "100%", height: 360 }}
              config={{ responsive: true, displayModeBar: true }}
              onInitialized={(fig, gd) => { graphRefs.tsne.current = gd; }}
              onUpdate={(fig, gd) => { graphRefs.tsne.current = gd; }}
            />
          )}
        </SectionCard>

        {/* 5. json summary (kept) */}
        <SectionCard title="json data of this file">
          <div className="p-2 bg-slate-50 rounded-xl">
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(summaryJson, null, 2)}</pre>
            <button onClick={handleCopy} className={`mt-2 px-3 py-1 text-xs rounded transition-colors ${copied ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {copied ? "JSON copied" : "Copy JSON"}
            </button>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}
