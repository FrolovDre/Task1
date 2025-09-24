// --------- Constants ---------
// Local TSV path. Place reviews_test.tsv alongside index.html on GitHub Pages.
const TSV_URL = 'reviews_test.tsv';

// Hugging Face Inference API endpoint for the specified free model
const HF_MODEL_URL = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';

// --------- Element references ---------
const els = {
  token: document.getElementById('token'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  review: document.getElementById('review'),
  sentiment: document.getElementById('sentiment'),
  score: document.getElementById('score'),
  icon: document.getElementById('icon'),
  loadStatus: document.getElementById('loadStatus'),
  tsvInfo: document.getElementById('tsvInfo'),
  error: document.getElementById('error'),
};

// In-memory array of review texts loaded from the TSV
let reviews = [];

// --------- UI helpers ---------

/**
 * Show or hide an error message in the UI
 * @param {string} msg - error text; pass empty/undefined to hide
 */
function setError(msg) {
  els.error.textContent = msg || '';
  els.error.classList.toggle('hidden', !msg);
}

/**
 * Update the big icon according to sentiment state
 * @param {'positive'|'negative'|'neutral'} state
 */
function setIcon(state) {
  // Reset classes and apply state-specific ones
  els.icon.className = 'icon ' + (state === 'positive' ? 'ok' : state === 'negative' ? 'bad' : 'neutral');
  const i = els.icon.querySelector('i');
  // Switch Font Awesome icon
  i.className = state === 'positive' ? 'fa-solid fa-thumbs-up'
            : state === 'negative' ? 'fa-solid fa-thumbs-down'
            : 'fa-solid fa-question';
}

/**
 * Toggle TSV loading indicator with optional label
 * @param {boolean} loading
 * @param {string=} label
 */
function setLoadingTSV(loading, label) {
  els.loadStatus.classList.toggle('hidden', !loading);
  if (label) els.loadStatus.querySelector('span').textContent = label;
}

/**
 * Disable/enable the analyze button and reflect "busy" state
 * @param {boolean} busy
 */
function setBusy(busy) {
  els.analyzeBtn.disabled = busy;
  els.analyzeBtn.innerHTML = busy
    ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Analyzing…</span>'
    : '<i class="fa-solid fa-shuffle"></i><span>Analyze Random Review</span>';
}

// --------- Data loading (Papa Parse) ---------

/**
 * Fetch and parse the TSV file using Papa Parse (as required).
 * Expects a header named "text" containing review strings.
 */
async function loadTSV() {
  setLoadingTSV(true, 'Loading TSV…');
  setError('');
  try {
    // Fetch raw TSV text from the same repo/branch
    const res = await fetch(TSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch TSV (${res.status})`);

    const text = await res.text();

    // Parse with Papa (header mode, TSV delimiter, skip blank lines)
    const parsed = Papa.parse(text, { header: true, delimiter: '\t', skipEmptyLines: true });

    // If Papa provides any parsing errors, surface the first one
    if (parsed.errors && parsed.errors.length) {
      throw new Error(parsed.errors[0].message || 'TSV parse error');
    }

    // Extract and sanitize the 'text' column
    reviews = (parsed.data || [])
      .map(r => (r && typeof r.text === 'string' ? r.text.trim() : ''))
      .filter(Boolean);

    // Display a small meta hint in the footer
    els.tsvInfo.textContent = reviews.length
      ? `Loaded ${reviews.length} reviews from reviews_test.tsv.`
      : 'No reviews found in TSV.';
  } catch (e) {
    setError(e.message || 'Error loading TSV');
  } finally {
    setLoadingTSV(false);
  }
}

// --------- Utilities ---------

/**
 * Pick a random element from an array
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --------- Hugging Face Inference API ---------

/**
 * Call Hugging Face Inference API for sentiment analysis.
 * Required response format: [[{label: 'POSITIVE'|'NEGATIVE', score: number}]]
 * Decision rule:
 *   - if label === 'POSITIVE' and score > 0.5 => positive
 *   - else if label === 'NEGATIVE' and score > 0.5 => negative
 *   - else => neutral
 *
 * @param {string} reviewText
 * @param {string} token - optional Bearer token
 * @returns {{state:'positive'|'negative'|'neutral', label:string, score:number}}
 */
async function analyzeSentiment(reviewText, token) {
  // Build headers (Authorization is optional)
  const headers = { 'Content-Type': 'application/json' };
  if (token && token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;

  // Make POST request using fetch (no server-side code)
  const res = await fetch(HF_MODEL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: reviewText }),
  });

  // Parse JSON regardless of http status to retrieve helpful error messages
  const data = await res.json();

  // If HTTP is not OK, show the API's error or status code
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  // Expected nested array response: [[{ label, score }]]
  let top = null;
  try {
    top = data?.[0]?.[0] || null;
  } catch (_) {
    top = null;
  }

  if (!top || typeof top.label !== 'string' || typeof top.score !== 'number') {
    throw new Error('Unexpected API response format');
  }

  // Normalize/guard values
  const label = String(top.label).toUpperCase();
  const score = Number(top.score);

  // Apply decision rule precisely as specified
  let state = 'neutral';
  if (label === 'POSITIVE' && score > 0.5) state = 'positive';
  else if (label === 'NEGATIVE' && score > 0.5) state = 'negative';

  return { state, label, score };
}

// --------- Event handlers ---------

/**
 * On click:
 *  - Ensure TSV is loaded
 *  - Choose a random review
 *  - Display the text
 *  - Call Hugging Face API and render result icon/labels
 */
async function onAnalyzeClick() {
  setError('');

  // Guard: TSV not loaded or empty
  if (!reviews.length) {
    setError('No reviews available. Ensure reviews_test.tsv is present and has a "text" column.');
    return;
  }

  // Pick and display a random review
  const text = pickRandom(reviews);
  els.review.classList.remove('muted');
  els.review.textContent = text;

  // Reset UI state while analyzing
  els.sentiment.textContent = 'Analyzing…';
  els.score.textContent = '';
  setIcon('neutral');
  setBusy(true);

  try {
    const token = els.token.value || '';
    const result = await analyzeSentiment(text, token);

    // Reflect final state (thumbs-up/down or question)
    setIcon(result.state);
    if (result.state === 'positive') els.sentiment.textContent = 'Positive';
    else if (result.state === 'negative') els.sentiment.textContent = 'Negative';
    else els.sentiment.textContent = 'Neutral';

    // Show raw label + numeric score for transparency
    els.score.textContent = `Label: ${result.label} • Score: ${result.score.toFixed(3)}`;
  } catch (e) {
    // Handle network, auth, model loading, or rate-limit errors gracefully
    setIcon('neutral');
    els.sentiment.textContent = 'Analysis failed';
    setError(e.message || 'Analysis error');
  } finally {
    setBusy(false);
  }
}

// --------- Boot ---------

// Wire button click and load TSV at startup
els.analyzeBtn.addEventListener('click', onAnalyzeClick);
loadTSV();
