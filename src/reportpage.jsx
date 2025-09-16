// ReportPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min"; // 🔧 保留：用 Plotly.toImage 匯出圖片到 PDF
import jsPDF from "jspdf";

// 🔧 這裡的 LABEL_COLORS 僅保留少數常見類別（作為固定色優先級）
// 其他 label 將由「動態產色器」自動分配
const FIXED_LABEL_COLORS = {
  "TROJAN.GENERIC": "#1f77b4",
  "ADWARE.SCREENSAVER": "#ff7f0e",
  GOODWARE: "#2ca02c",
  APT30: "#d62728",
  other: "#9467bd",
};

// ✨ 新增：你的 GitHub RAW 資料來源（法一）
const DATA_URLS = {
  labelList:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json",
  tsnePoints:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_points.json",
};

// ✨ 新增：內建一組較長的離散色盤（先用這些，再用 HSL 均分）
// 參考 plotly/d3 常見調色盤擴充到 ~24 色
const BASE_PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#669775", "#756bb1", "#636363", "#9c9ede",
  "#e7ba52", "#ffa87c", "#88afaf", "#d352e7",
  "#ff1493", "#00ced1", "#ffd700", "#ff6347", "#6a5acd"
]

// ✨ 新增：依 labelList 產生顏色對照表（優先使用 FIXED，其次 Base Palette，再來 HSL）
function buildLabelColors(labels) {
  const result = {};
  // 1) 先放入固定色（如果該 label 出現在 labels 中）
  labels.forEach((lab) => {
    if (FIXED_LABEL_COLORS[lab]) result[lab] = FIXED_LABEL_COLORS[lab];
  });

  // 2) 其餘尚未分配的 label，依序分配 BASE_PALETTE
  let paletteIdx = 0;
  labels.forEach((lab) => {
    if (result[lab]) return; // 已有固定色
    if (paletteIdx < BASE_PALETTE.length) {
      result[lab] = BASE_PALETTE[paletteIdx++];
    }
  });
  return result;
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800"><a href="/"> Platform name</a></div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li>
            <a href="#about" className="hover:text-blue-500">
              About us
            </a>
          </li>
          <li>
            <a href="./evaluation" className="hover:text-blue-500">
              Evaluation
            </a>
          </li>
          <li>
            <a href="#tech" className="hover:text-blue-500">
              Techniques
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default function ReportPage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "Analysis Report";
  }, []);

  // 各圖的 graphDiv 參照：匯出 PDF 時會用
  const graphRefs = {
    family: useRef(null),
    heatmap: useRef(null),
    apt30: useRef(null),
    tsne: useRef(null),
  };

  // ==== 假資料（示範用，可改接你的主流程結果）====
  const familyScores = useMemo(
    () => [
      { label: "TROJAN.GENERIC", score: 0.62 },
      { label: "ADWARE.SCREENSAVER", score: 0.22 },
      { label: "GOODWARE", score: 0.16 },
    ],
    []
  );
  const apt30Prob = 0.78;
  const filename = "sample.exe";

  // 從 GitHub RAW 載入 label_list + tsne_points
  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [labelsRes, pointsRes] = await Promise.all([
          fetch(DATA_URLS.labelList),
          fetch(DATA_URLS.tsnePoints),
        ]);
        if (!labelsRes.ok) throw new Error(`labelList HTTP ${labelsRes.status}`);
        if (!pointsRes.ok) throw new Error(`tsnePoints HTTP ${pointsRes.status}`);
        const [labels, points] = await Promise.all([
          labelsRes.json(),
          pointsRes.json(),
        ]);
        setLabelList(labels);
        setTsneRows(points);
      } catch (e) {
        setLoadErr(String(e));
      }
    })();
  }, []);

  // ✨ 新增：由 labelList 產出「動態顏色表」
  const labelColors = useMemo(() => {
    if (!labelList) return {};
    // 確保是陣列且去重
    const uniq = Array.from(new Set(labelList)).filter(Boolean);
    return buildLabelColors(uniq);
  }, [labelList]);

  // t-SNE traces：依 true_label 分組；顏色由 labelColors 控制
  const tsneTraces = useMemo(() => {
    if (!tsneRows) return [];
    const by = new Map();
    tsneRows.forEach((r) => {
      const k = r.true_label || "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    });
    // 盡量按 labelList 順序呈現；若沒有 labelList，就用 by.keys()
    const labelsInOrder =
      labelList && Array.isArray(labelList) ? labelList : Array.from(by.keys());

    return labelsInOrder
      .filter((lab) => by.has(lab))
      .map((lab) => {
        const arr = by.get(lab);
        return {
          type: "scattergl",
          mode: "markers",
          name: lab,
          x: arr.map((d) => d.x),
          y: arr.map((d) => d.y),
          marker: { size: 4, color: labelColors[lab] || FIXED_LABEL_COLORS.other },
          text: arr.map(
            (d) =>
              `label: ${d.true_label}`
          ),
          hoverinfo: "text",
        };
      });
  }, [tsneRows, labelList, labelColors]);

  // JSON 摘要（動態）
  const topFamily = useMemo(
    () =>
      familyScores.reduce((a, b) => (a.score >= b.score ? a : b)).label,
    [familyScores]
  );
  const isMalware = topFamily !== "GOODWARE";
  const summaryJson = useMemo(
    () => ({
      filename,
      is_malware: isMalware,
      top1_family: topFamily,
      apt30: {
        probability: apt30Prob,
        is_APT30: apt30Prob >= 0.5,
      },
    }),
    [filename, isMalware, topFamily, apt30Prob]
  );

  const SectionCard = ({ title, children }) => (
    <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-slate-800 font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );

  // 匯出 PDF（會把四張圖依序嵌入）
  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pad = 48;

    doc.setFontSize(18);
    doc.text("Malware Report", pad, 64);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("Generated by (platform name)", pad, 84);

    const y0 = 120;
    doc.setTextColor(20);
    doc.setFontSize(12);
    const lines = [
      ["filename", String(summaryJson.filename)],
      ["is_malware", String(summaryJson.is_malware)],
      ["malware family (top-1)", summaryJson.top1_family],
      [
        "is_APT30",
        `${summaryJson.apt30.is_APT30} (p=${summaryJson.apt30.probability})`,
      ],
    ];
    lines.forEach((row, i) => {
      doc.text(`${row[0]}:`, pad, y0 + i * 20);
      doc.text(String(row[1]), pad + 160, y0 + i * 20);
    });

    const items = [
      { key: "family", title: "Malware family scores" },
      { key: "heatmap", title: "Attention heatmap" },
      { key: "apt30", title: "APT30 probability" },
      { key: "tsne", title: "t-SNE embedding (from GitHub JSON)" },
    ];

    let y = 220;
    for (const it of items) {
      const gd = graphRefs[it.key].current;
      if (!gd) continue;

      doc.setFontSize(12);
      doc.setTextColor(20);
      doc.text(it.title, pad, y);
      y += 14;

      try {
        const isTSNE = it.key === "tsne";

        // 根據是否為 tsne 圖，使用不同的圖尺寸
        const exportWidth = isTSNE ? 720 : 560;
        const exportHeight = isTSNE ? 480 : 320;
        const displayWidth = 520;
        const displayHeight = isTSNE ? 440 : 300;

        const img = await Plotly.toImage(gd, {
          format: "png",
          width: exportWidth,
          height: exportHeight,
          scale: 2,
        });

        if (y + displayHeight > 780) {
          doc.addPage();
          y = 64;
        }

        doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
        y += displayHeight + 16;

      } catch (e) {
        console.error(`Export ${it.key} failed:`, e);
      }
    }

    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(summaryJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // 2 秒後恢復原樣
  };

  // 隨機產生一個新(x, y) <-假設為新文件分析出的資料點
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const dist2 = (a, b) => {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  // k-NN 分類（用 useCallback 固定參考）
  const classifyKNN = React.useCallback((point, rows, k = 11) => {
    if (!rows || rows.length === 0) return null;
    const neighbors = rows
      .map((r) => ({ label: r.true_label || "other", d2: dist2(point, r) }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, Math.min(k, rows.length));

    const tally = new Map();
    const sumD2 = new Map();
    for (const n of neighbors) {
      tally.set(n.label, (tally.get(n.label) || 0) + 1);
      sumD2.set(n.label, (sumD2.get(n.label) || 0) + n.d2);
    }
    let best = null;
    for (const [label, count] of tally.entries()) {
      const score = { label, count, sum: sumD2.get(label) };
      if (!best || count > best.count || (count === best.count && score.sum < best.sum)) {
        best = score;
      }
    }
    return best?.label || null;
  }, []);

  // ---------- New point 狀態（Hook：必須在頂層） ----------
  const [newPoint, setNewPoint] = React.useState(null);
  const [newPointLabel, setNewPointLabel] = React.useState(null);

  // 所有點的邊界（方便產生圖內亂數點）
  const bounds = React.useMemo(() => {
    if (!tsneRows || tsneRows.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of tsneRows) {
      if (r.x < minX) minX = r.x;
      if (r.x > maxX) maxX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.y > maxY) maxY = r.y;
    }
    return { minX, maxX, minY, maxY };
  }, [tsneRows]);

  // 產生亂數點 + 立即分類
  const generateRandomPoint = React.useCallback(() => {
    if (!bounds || !tsneRows) return;
    const x = round3(bounds.minX + Math.random() * (bounds.maxX - bounds.minX));
    const y = round3(bounds.minY + Math.random() * (bounds.maxY - bounds.minY));
    const p = { x, y };
    const label = classifyKNN(p, tsneRows, 11); // k 可調
    setNewPoint(p);
    setNewPointLabel(label);
  }, [bounds, tsneRows, classifyKNN]);

  // 把新點疊在既有 traces 上
  const tsneTracesWithNewPoint = React.useMemo(() => {
    if (!newPoint) return tsneTraces;
    console.log('New point:', newPoint, 'label:', newPointLabel);
    const highlight = {
      type: "scattergl",
      mode: "markers",
      name: newPointLabel ? `new point (${newPointLabel})` : "new point",
      x: [newPoint.x],
      y: [newPoint.y],
      marker: {
        size: 5,
        color: newPointLabel
          ? (labelColors[newPointLabel] || FIXED_LABEL_COLORS.other)
          : "#ffffff",                 // 內填白色
        line: { color: "#000000", width: 5 }, // 黑邊
      },
      hoverinfo: "text",
      text: [
        `x: ${newPoint.x}, y: ${newPoint.y}${newPointLabel ? `<br>pred: ${newPointLabel}` : ""}`,
      ],
    };
    return [...tsneTraces, highlight];
  }, [tsneTraces, newPoint, newPointLabel, labelColors]);


  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-700">
            <span className="text-lg font-semibold">Analysis results</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50"
            >
              Back to Main
            </button>
            <button
              onClick={handlePDF}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* 區塊 1：Malware family */}
        <SectionCard title="malware family">
          <Plot
            data={[
              {
                type: "bar",
                x: familyScores.map((d) => d.label),
                y: familyScores.map((d) => d.score),
                marker: {
                  color: familyScores.map(
                    (d) => labelColors[d.label] || FIXED_LABEL_COLORS.other
                  ),
                },
              },
            ]}
            layout={{ margin: { t: 24, r: 16, b: 48, l: 40 }, yaxis: { range: [0, 1] } }}
            style={{ width: "100%", height: 320 }}
            config={{ responsive: true }}
            onInitialized={(fig, gd) => {
              graphRefs.family.current = gd;
            }}
            onUpdate={(fig, gd) => {
              graphRefs.family.current = gd;
            }}
          />
        </SectionCard>

        {/* 區塊 2：Attention heatmap（示例） */}
        <SectionCard title="attention heatmap">
          <Plot
            data={[
              {
                z: [
                  [0.1, 0.3, 0.5, 0.2, 0.1],
                  [0.2, 0.4, 0.7, 0.4, 0.2],
                  [0.05, 0.2, 0.35, 0.3, 0.1],
                ],
                type: "heatmap",
                colorscale: "YlOrRd",
              },
            ]}
            layout={{ margin: { t: 24, r: 16, b: 40, l: 40 } }}
            style={{ width: "100%", height: 320 }}
            config={{ responsive: true }}
            onInitialized={(fig, gd) => {
              graphRefs.heatmap.current = gd;
            }}
            onUpdate={(fig, gd) => {
              graphRefs.heatmap.current = gd;
            }}
          />
        </SectionCard>

        {/* 區塊 3：APT30 probability */}
        <SectionCard title="is APT30">
          <Plot
            data={[
              {
                type: "bar",
                orientation: "h",
                x: [apt30Prob],
                y: ["APT30 probability"],
                marker: { color: FIXED_LABEL_COLORS.APT30 },
              },
              {
                type: "bar",
                orientation: "h",
                x: [1 - apt30Prob],
                y: ["APT30 probability"],
                marker: { color: "#e5e7eb" },
              },
            ]}
            layout={{
              barmode: "stack",
              xaxis: { range: [0, 1] },
              margin: { t: 24, r: 16, b: 40, l: 160 },
            }}
            style={{ width: "100%", height: 200 }}
            config={{ responsive: true }}
            onInitialized={(fig, gd) => {
              graphRefs.apt30.current = gd;
            }}
            onUpdate={(fig, gd) => {
              graphRefs.apt30.current = gd;
            }}
          />
        </SectionCard>

        {/* 區塊 4：t-SNE from GitHub JSON（法一）＋ 隨機點 & k-NN 分類 */}
        <SectionCard title="t-SNE embedding (from GitHub JSON)">
          {loadErr && (
            <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>
          )}

          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">
              {newPoint
                ? `new point: (${newPoint.x}, ${newPoint.y}) → ${newPointLabel || "classifying..."}`
                : "Click to add a random point and classify by k-NN"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={generateRandomPoint}
                className="px-3 py-1 text-xs rounded bg-slate-800 text-white hover:bg-slate-700"
              >
                Add random point
              </button>
              {newPoint && (
                <button
                  onClick={() => { setNewPoint(null); setNewPointLabel(null); }}
                  className="px-3 py-1 text-xs rounded bg-white border border-slate-300 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {!tsneRows ? (
            <div>Loading…</div>
          ) : (
            <Plot
              data={tsneTracesWithNewPoint}   // ← 用帶新點的 traces
              layout={{
                margin: { t: 24, r: 16, b: 40, l: 40 },
                legend: { orientation: "h" },
              }}
              style={{ width: "100%", height: 360 }}
              config={{ responsive: true, displayModeBar: true }}
              onInitialized={(fig, gd) => { graphRefs.tsne.current = gd; }}
              onUpdate={(fig, gd) => { graphRefs.tsne.current = gd; }}
            />
          )}
        </SectionCard>



        {/* 區塊 5：JSON（動態產生，不寫死） */}
        <SectionCard title="json data of this file">
          <div className="p-2 bg-slate-50 rounded-xl">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(summaryJson, null, 2)}
            </pre>
            <button
              onClick={handleCopy}
              className={`mt-2 px-3 py-1 text-xs rounded transition-colors ${copied
                ? "bg-slate-200 text-slate-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
            >
              {copied ? "JSON copied" : "Copy JSON"}
            </button>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}
