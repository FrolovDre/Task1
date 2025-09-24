<!DOCTYPE js>
const TOKEN_INPUT = document.getElementById("token");
const ANALYZE_BTN = document.getElementById("analyzeBtn");
const LOADED_COUNT = document.getElementById("loadedCount");
const REVIEW_TEXT = document.getElementById("reviewText");
const SENTIMENT_ICON = document.getElementById("sentimentIcon");
const SENTIMENT_LABEL = document.getElementById("sentimentLabel");
const SENTIMENT_SCORE = document.getElementById("sentimentScore");
const STATUS = document.getElementById("status");

const HF_URL = "https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english";

let reviews = [];
let isLoading = false;

function setStatus(message, kind = "info") {
  STATUS.className = "status";
  if (kind === "error") STATUS.classList.add("error");
  else if (kind === "ok") STATUS.classList.add("ok");
  else if (kind === "warn") STATUS.classList.add("warn");
  STATUS.innerHTML = "";
  const icon = document.createElement("i");
  icon.className =
    kind === "error" ? "fa-solid fa-triangle-exclamation" :
    kind === "ok" ? "fa-regular fa-circle-check" :
    kind === "warn" ? "fa-regular fa-circle-question" :
    "fa-regular fa-circle-question";
  const span = document.createElement("span");
  span.textContent = message;
  STATUS.append(icon, span);
}

function sanitizeText(s) {
  if (typeof s !== "string") return "";
  return s.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function updateCount() {
  if (reviews.length > 0) {
    LOADED_COUNT.innerHTML = `<span class="count">${reviews.length}</span> reviews loaded`;
  } else {
    LOADED_COUNT.textContent = "No reviews loaded";
  }
}

async function loadTSV() {
  try {
    isLoading = true;
    setStatus("Loading TSV…");
    const resp = await fetch("reviews_test.tsv", { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Failed to load TSV (${resp.status})`);
    }
    const text = await resp.text();
    Papa.parse(text, {
      header: true,
      delimiter: "\t",
      skipEmptyLines: true,
      complete: (results
