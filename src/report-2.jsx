import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min";
import jsPDF from "jspdf";
import heatmap from "./heatmap.png";
import heatmap_sim from "./heatmap_similar.png";

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
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
  ],
};

const FIXED_LABEL_COLORS = {}; // optional: leave empty, we rely on assignColors for full control

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

export default function ReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location?.state || {};
  const searchParams = new URLSearchParams(location?.search || "");

  const incomingFilename =
    state.filename ||
    searchParams.get("file") ||
    null;

  const incomingPredLabelRaw =
    state.predLabel ||
    state.predictedLabel ||
    searchParams.get("label") ||
    null;

  // 正規化（去頭尾空白、小寫），方便比對
  const incomingPredLabel = incomingPredLabelRaw
    ? String(incomingPredLabelRaw).trim()
    : null;

  console.log("[report] incomingFilename:", incomingFilename, "incomingPredLabel:", incomingPredLabel);

  useEffect(() => { document.title = "Analysis Report"; }, []);

  const graphRefs = { family: useRef(null), heatmap: useRef(null), apt30: useRef(null), tsne: useRef(null) };
  const apt30Prob = 0.00;
  const dropperProb = 0.00;
  const filename = "Dogwaffle_Install_1_2_free.exe";
  const SIMILAR_NAME = 'SimpleDataBackup88.exe';

  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const familyScores = useMemo(
    () => [
      { label: "TROJAN.GENERIC", score: 0.16 },
      { label: "ADWARE.SCREENSAVER", score: 0.22 },
      { label: "GOODWARE", score: 0.62 },
    ],
    []
  );

  // 從 tsneRows 找一個屬於 label 的點（或 centroid + jitter）
  function pickScatterPointForLabel(tsneRows, label, jitter = 0.02) {
    console.log("[pickScatter] called with label:", label);
    if (!Array.isArray(tsneRows) || !tsneRows.length || !label) {
      console.log("[pickScatter] no rows or no label -> null");
      return null;
    }
    const pts = tsneRows.filter(r => {
      const lab = r["true_label"] ?? r["pred_label"] ?? "other";
      return String(lab) === String(label);
    });
    console.log("[pickScatter] found pts for label:", label, "count:", pts.length);
    if (pts.length === 0) return null;
    // 隨機取一個實際點（更自然），或改成 centroid：
    const chosen = pts[Math.floor(Math.random() * pts.length)];
    // 若要 jitter（在原點周圍微調），可用以下：
    const jx = (Math.random() - 0.5) * jitter * (Math.max(...tsneRows.map(r => r.x)) - Math.min(...tsneRows.map(r => r.x)) || 1);
    const jy = (Math.random() - 0.5) * jitter * (Math.max(...tsneRows.map(r => r.y)) - Math.min(...tsneRows.map(r => r.y)) || 1);
    const out = { x: chosen.x + jx, y: chosen.y + jy, base: chosen };
    console.log("[pickScatter] chosen:", out);
    return out;
  }

  // 從單一 somArray 中根據 label 選一個 cell，再在 cell 中放點（row/col + jitter）
  function pickSomPointForLabel(somArray, label, jitter = 0.25) {
    if (!Array.isArray(somArray) || !somArray.length || !label) return null;
    // collect candidates with positive proportion
    const candidates = somArray
      .map(c => ({ cell: c, p: Number((c.proportions && c.proportions[label]) || 0) }))
      .filter(o => o.p > 0);

    if (candidates.length === 0) return null;
    // weighted random by p
    const total = candidates.reduce((s, c) => s + c.p, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.p;
      if (r <= 0) {
        const cx = c.cell.col + (Math.random() - 0.5) * jitter;
        const cy = c.cell.row + (Math.random() - 0.5) * jitter;
        return { x: cx, y: cy };
      }
    }
    // fallback to the first
    const c = candidates[0];
    return { x: c.cell.col, y: c.cell.row };
  }


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
        text: arr.map(d => `${d["true_label"] ?? "-"}`),
        hoverinfo: "text",
      };
    });
  }, [tsneRows, allLabelNames, labelColors]);

  const summaryJson = useMemo(() => ({
    filename,
    top1_family: familyScores.reduce((a, b) => a.score >= b.score ? a : b).label,
    similar_file: SIMILAR_NAME,
    apt30: { probability: apt30Prob, is_APT30: apt30Prob >= 0.5 },
    dropper: { probability: dropperProb, is_dropper: dropperProb >= 0.5 },
  }), [filename, familyScores, SIMILAR_NAME, apt30Prob, dropperProb]);

  const SectionCard = ({ title, subtitle, children }) => (
    <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between"><h3 className="text-slate-800 font-semibold">{title}</h3><div className="text-sm text-slate-600 text-right">{subtitle}</div></div>
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
    console.log("[useEffect:genPoints] somDatasets.length:", somDatasets.length, "tsneRows:", tsneRows ? tsneRows.length : 0, "incomingPredLabel:", incomingPredLabel, "incomingFilename:", incomingFilename);
    if (!somDatasets.length) return;

    // ---- SOM：每張產生一顆黑點並推論 ----
    const newSomPts = somDatasets.map((arr, i) => {
      // 優先依 incomingPredLabel（或 incomingFilename 推斷）找 cell
      const labelToUse = incomingPredLabel || incomingFilename || null;
      if (labelToUse) {
        const pt = pickSomPointForLabel(arr, labelToUse, 0.25);
        if (pt) return pt;
      }
      // fallback: 原本的全域隨機
      let maxR = 0, maxC = 0;
      for (const c of arr) {
        if (Number.isFinite(c.row)) maxR = Math.max(maxR, c.row);
        if (Number.isFinite(c.col)) maxC = Math.max(maxC, c.col);
      }
      return { x: Math.random() * (maxC || 1), y: Math.random() * (maxR || 1) };
    });

    // 用 knnPredictSom 取得 labels（不變）
    const somLabs = newSomPts.map((pt, i) => knnPredictSom(somDatasets[i], pt.x, pt.y, 5).label);
    setSomRandPts(newSomPts);
    setSomPredLabels(somLabs);

    // ---- t-SNE：若有 incomingPredLabel，優先在該 label 點集合中抽一點 ----
    if (Array.isArray(tsneRows) && tsneRows.length) {
      let chosen = null;
      if (incomingPredLabel) {
        chosen = pickScatterPointForLabel(tsneRows, incomingPredLabel, 0.02);
      }
      if (!chosen) {
        // fallback to bounding-box random
        const xs = tsneRows.map(r => r.x), ys = tsneRows.map(r => r.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const rx = minX + Math.random() * (maxX - minX);
        const ry = minY + Math.random() * (maxY - minY);
        chosen = { x: rx, y: ry };
      }
      setScatterRandPt(chosen);
      console.log("[useEffect] set scatterRandPt:", chosen);

      const points = tsneRows.map(r => ({
        x: r.x,
        y: r.y,
        label: r["true_label"] ?? r["pred_label"] ?? "other",
      }));
      const pred = knnPredictScatter(points, chosen.x, chosen.y, 7);
      setScatterPredLabel(pred.label);
      console.log("[useEffect] scatter kNN pred:", pred);
    }
  }, [somDatasets, tsneRows, incomingPredLabel, incomingFilename]);



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
      marker: { size: 1, color: "black" },
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

  // === Heatmap URLs（改成你的檔案或 URL；放 public/ 下可用 "/images/xxx.png"）===
  const HEATMAP_IMG_TOP = heatmap;
  const HEATMAP_IMG_BOTTOM = heatmap_sim;

  // refs
  const topWrapRef = useRef(null);
  const bottomWrapRef = useRef(null);
  const barRef = useRef(null);
  const topImgRef = useRef(null);
  const bottomImgRef = useRef(null);

  // 由兩張圖 naturalWidth 推得的「共同內容寬度」
  const [contentW, setContentW] = useState(2000);

  // 兩張圖載入後，取最大寬度，並把三者 scrollLeft 對齊
  const updateContentWidth = useCallback(() => {
    const tw = topImgRef.current?.naturalWidth || 0;
    const bw = bottomImgRef.current?.naturalWidth || 0;
    const maxW = Math.max(tw, bw, 1200); // 至少 1200，避免太小
    setContentW(maxW);

    const cur = barRef.current?.scrollLeft || 0;
    if (topWrapRef.current) topWrapRef.current.scrollLeft = cur;
    if (bottomWrapRef.current) bottomWrapRef.current.scrollLeft = cur;
  }, []);

  // 拖曳 bar → 同步兩張圖
  const onBarScroll = useCallback((e) => {
    const x = e.currentTarget.scrollLeft;
    if (topWrapRef.current) topWrapRef.current.scrollLeft = x;
    if (bottomWrapRef.current) bottomWrapRef.current.scrollLeft = x;
  }, []);

  // 直接捲動任一張圖 → 同步另外一張與下方 bar
  const onImgScroll = useCallback((e) => {
    const x = e.currentTarget.scrollLeft;
    if (barRef.current && barRef.current.scrollLeft !== x) {
      barRef.current.scrollLeft = x;
    }
    if (e.currentTarget === topWrapRef.current) {
      if (bottomWrapRef.current?.scrollLeft !== x) bottomWrapRef.current.scrollLeft = x;
    } else if (e.currentTarget === bottomWrapRef.current) {
      if (topWrapRef.current?.scrollLeft !== x) topWrapRef.current.scrollLeft = x;
    }
  }, []);




  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pad = 48;
    doc.setFontSize(18); doc.text("Malware Report", pad, 64);
    const lines = [
      ["filename", String(summaryJson.filename)],
      ["malware family (top-1)", summaryJson.top1_family],
      ["similar attention heatmap", String(summaryJson.similar_file)],
      ["is_APT30", `${summaryJson.apt30.is_APT30} (p=${summaryJson.apt30.probability})`],
      ["is_dropper", `${summaryJson.dropper.is_dropper} (p=${summaryJson.dropper.probability})`],
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

        {/* 1. scatter (kept, unified colors via BASE_PALETTE) */}
        <SectionCard title="t-SNE embedding" subtitle={`label = ${summaryJson.top1_family}`}>
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
                  marker: { size: 10, color: "black" },
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

        {/* 2. attention heatmaps (synced, vertical stack) */}
        <SectionCard title="attention heatmaps">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium text-slate-700">
              Attention heatmap of this file
            </div>
            {/* 上圖容器（固定高度，垂直可捲動；水平以下方 bar 為主，也可直接拖圖） */}
            <div
              ref={topWrapRef}
              className="relative w-full h-50 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white"
              onScroll={onImgScroll}
            >
              {/* 內容寬度對齊 contentW，確保與下方 bar 一致 */}
              <div style={{ width: contentW }}>
                <img
                  ref={topImgRef}
                  src={HEATMAP_IMG_TOP}
                  alt="attention heatmap (top)"
                  className="block max-w-none"
                  onLoad={updateContentWidth}
                />
              </div>
            </div>

            <div className="text-xs font-medium text-slate-700">
              The most similar attention heatmap : file{" "}
              <span className="font-semibold">"{SIMILAR_NAME}"</span>
            </div>

            {/* 下圖容器 */}
            <div
              ref={bottomWrapRef}
              className="relative w-full h-50 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white"
              onScroll={onImgScroll}
            >
              <div style={{ width: contentW }}>
                <img
                  ref={bottomImgRef}
                  src={HEATMAP_IMG_BOTTOM}
                  alt="attention heatmap (bottom)"
                  className="block max-w-none"
                  onLoad={updateContentWidth}
                />
              </div>
            </div>

            {/* 共同水平拖曳條（拖它即可左右同步兩張圖） */}
            <div
              ref={barRef}
              className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50 h-5"
              onScroll={onBarScroll}
              aria-label="Horizontal scroller for both heatmaps"
            >
              {/* 用一個長條元素撐出可拖的寬度 */}
              <div style={{ width: contentW, height: 0.5 }} />
            </div>
          </div>
        </SectionCard>




        {/* 3. SOM maps (替換原本 APT30 圖表) */}
        <SectionCard title={somTitles[somIndex] || "Self-Organizing Map"}
        subtitle={
          somIndex === 0
            ? "This file is not attributed to APT30."
            : somIndex === 1
            ? "This file is not classified as a dropper."
            : ""
        }>
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
              <div className="relative justify-center items-center">
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
