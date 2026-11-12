const MIN_WIDTH = 0.6;
const MAX_WIDTH = 4;
const MIN_STRENGTH = 1;
const MAX_STRENGTH = 50;

const NODE_RADIUS = 7;
const LABEL_FONT_SIZE = 12;
const LABEL_GAP = 5;
const DIM_ALPHA = 0.12;

const PALETTE = [
  "#4f8cff",
  "#4ade80",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#a3e635",
  "#e879f9",
  "#38bdf8",
];

const LINK_IDLE = "rgba(92, 106, 132, 0.30)";
const LINK_FADED = "rgba(92, 106, 132, 0.07)";
const LINK_ACTIVE = "#8ab4ff";

let hoverId = null;
let neighborIds = new Set();

function linkWidth(value) {
  const strength = Math.min(Math.max(value, MIN_STRENGTH), MAX_STRENGTH);
  const ratio = (strength - MIN_STRENGTH) / (MAX_STRENGTH - MIN_STRENGTH);
  return MIN_WIDTH + ratio * (MAX_WIDTH - MIN_WIDTH);
}

function baseColor(node) {
  const id = typeof node.id === "number" ? node.id : 0;
  return PALETTE[Math.abs(id) % PALETTE.length];
}

function lighten(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((value >> 16) & 255) + 70);
  const g = Math.min(255, ((value >> 8) & 255) + 70);
  const b = Math.min(255, (value & 255) + 70);
  return `rgb(${r}, ${g}, ${b})`;
}

function isDim(node) {
  return hoverId !== null && node.id !== hoverId && !neighborIds.has(node.id);
}

function linkIsActive(link) {
  return link.source.id === hoverId || link.target.id === hoverId;
}

function linkColor(link) {
  if (hoverId === null) {
    return LINK_IDLE;
  }
  return linkIsActive(link) ? LINK_ACTIVE : LINK_FADED;
}

function paintNode(node, ctx, globalScale) {
  ctx.globalAlpha = isDim(node) ? DIM_ALPHA : 1;

  ctx.beginPath();
  ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = node.id === hoverId ? lighten(baseColor(node)) : baseColor(node);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0f1115";
  ctx.stroke();

  const fontSize = LABEL_FONT_SIZE / globalScale;
  ctx.font = `500 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const labelY = node.y + NODE_RADIUS + LABEL_GAP / globalScale;
  ctx.lineWidth = 3 / globalScale;
  ctx.strokeStyle = "rgba(15, 17, 21, 0.92)";
  ctx.strokeText(node.name, node.x, labelY);
  ctx.fillStyle = "#e7e9ee";
  ctx.fillText(node.name, node.x, labelY);

  ctx.globalAlpha = 1;
}

function paintPointerArea(node, color, ctx) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
  ctx.fill();
}

function setHover(node) {
  const nextId = node ? node.id : null;
  if (nextId === hoverId) {
    return;
  }

  hoverId = nextId;
  neighborIds = new Set();

  if (node) {
    graph.graphData().links.forEach((link) => {
      if (link.source.id === hoverId) {
        neighborIds.add(link.target.id);
      } else if (link.target.id === hoverId) {
        neighborIds.add(link.source.id);
      }
    });
  }
}

function fit() {
  graph.width(window.innerWidth).height(window.innerHeight);
}

let resizeTimer = null;

function onResize() {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => graph.zoomToFit(300, 40), 200);
}

function showError(message) {
  const el = document.createElement("p");
  el.className = "status";
  el.textContent = `Failed to load graph: ${message}`;
  document.body.appendChild(el);
}

const graph = new ForceGraph()(document.getElementById("graph"))
  .width(window.innerWidth)
  .height(window.innerHeight)
  .backgroundColor("#0f1115")
  .autoPauseRedraw(false)
  .nodeId("id")
  .nodeLabel(() => "")
  .nodeCanvasObject(paintNode)
  .nodeCanvasObjectMode(() => "replace")
  .nodePointerAreaPaint(paintPointerArea)
  .linkWidth((link) => linkWidth(link.value))
  .linkColor(linkColor)
  .linkLabel((link) => `${link.source.name} — ${link.target.name}: ${link.value}`)
  .linkDirectionalParticles(0)
  .cooldownTicks(200)
  .warmupTicks(60)
  .d3AlphaDecay(0.02)
  .d3VelocityDecay(0.35)
  .onNodeHover(setHover);

graph.d3Force("charge").strength(-260);
graph.d3Force("link").distance((link) => 60 + linkWidth(link.value) * 10);

fetch("/api/graph")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  })
  .then((data) => {
    graph.graphData(data);
    [300, 1200, 3000].forEach((delay) => setTimeout(() => graph.zoomToFit(500, 40), delay));
  })
  .catch((error) => showError(error.message));

graph.onEngineStop(() => graph.zoomToFit(500, 40));

fit();

window.addEventListener("resize", onResize);

//Damn im so cool
//Wonder if anyone will ever read this
