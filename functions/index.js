const { onRequest } = require('firebase-functions/v2/https');
const busboy = require('busboy');

/**
 * POST /api/summarize
 * Body: { text: string }
 * Returns: { summary: string }
 *
 * This is a simple extractive summarizer (no external API key needed):
 * it scores sentences by word frequency and returns the top few.
 * Swap this out for a call to an AI API (Anthropic, OpenAI, etc.) for
 * higher quality summaries — see the commented block below.
 */
exports.summarizeText = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 40) {
    res.status(400).json({ error: 'Send at least a few sentences of text.' });
    return;
  }

  const summary = extractiveSummary(text, 3);
  res.status(200).json({ summary });

  // --- To use a real AI model instead, replace the two lines above with
  // something like this (add ANTHROPIC_API_KEY as a Cloud Functions secret):
  //
  // const response = await fetch('https://api.anthropic.com/v1/messages', {
  //   method: 'POST',
  //   headers: {
  //     'x-api-key': process.env.ANTHROPIC_API_KEY,
  //     'anthropic-version': '2023-06-01',
  //     'content-type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     model: 'claude-sonnet-4-6',
  //     max_tokens: 300,
  //     messages: [{ role: 'user', content: `Summarize in 3 sentences:\n\n${text}` }]
  //   })
  // });
  // const data = await response.json();
  // const summary = data.content[0].text;
  // res.status(200).json({ summary });
});

function extractiveSummary(text, sentenceCount) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+/g) || [text];

  if (sentences.length <= sentenceCount) return sentences.join(' ').trim();

  const stopWords = new Set(['the','a','an','and','or','but','is','are','was','were','of','to','in','on','for','with','this','that','it','as','at','by']);
  const wordFreq = {};
  text.toLowerCase().match(/[a-z']+/g)?.forEach(w => {
    if (!stopWords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
  });

  const scored = sentences.map(sentence => {
    const words = sentence.toLowerCase().match(/[a-z']+/g) || [];
    const score = words.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (words.length || 1);
    return { sentence: sentence.trim(), score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, sentenceCount)
    .map(s => s.sentence);

  // Re-order top sentences by their original position for readability
  const ordered = sentences
    .map(s => s.trim())
    .filter(s => top.includes(s));

  return ordered.join(' ');
}

/**
 * POST /api/convert
 * Body: multipart/form-data with `file` and `direction` ("pdf-to-word" | "word-to-pdf")
 *
 * NOTE: Real PDF <-> Word conversion needs either:
 *   1. A headless LibreOffice binary (works on Cloud Run, not standard Cloud Functions), or
 *   2. A third-party conversion API (e.g. CloudConvert, ConvertAPI) called from here.
 * This stub parses the upload and shows where to plug that in.
 */
exports.convertFile = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const bb = busboy({ headers: req.headers });
  let uploadedBuffer = null;
  let direction = 'pdf-to-word';

  bb.on('field', (name, val) => {
    if (name === 'direction') direction = val;
  });

  bb.on('file', (name, file) => {
    const chunks = [];
    file.on('data', (chunk) => chunks.push(chunk));
    file.on('end', () => { uploadedBuffer = Buffer.concat(chunks); });
  });

  bb.on('finish', () => {
    if (!uploadedBuffer) {
      res.status(400).json({ error: 'No file received.' });
      return;
    }

    // TODO: Replace this with a real conversion call, e.g.:
    // const converted = await callConversionApi(uploadedBuffer, direction);
    // res.set('Content-Type', direction === 'pdf-to-word'
    //   ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    //   : 'application/pdf');
    // res.send(converted);

    res.status(501).json({
      error: 'Conversion backend not wired up yet. Add a conversion API call in functions/index.js (convertFile).'
    });
  });

  bb.end(req.rawBody);
});
