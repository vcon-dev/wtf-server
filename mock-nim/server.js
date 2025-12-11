/**
 * Mock NVIDIA NIM ASR Server for Development
 * Simulates the NIM ASR API without requiring a GPU
 */

const http = require("http");

const PORT = 9000;

// Sample transcription responses
const sampleTranscriptions = [
  "Hello, thank you for calling. How may I assist you today?",
  "I understand you're experiencing an issue with your account. Let me help you with that.",
  "Your order has been processed and will be shipped within 2-3 business days.",
  "Is there anything else I can help you with today?",
];

function generateMockTranscription(audioDuration = 5.0) {
  const text =
    sampleTranscriptions[
      Math.floor(Math.random() * sampleTranscriptions.length)
    ];
  const words = text.split(/\s+/);
  const wordDuration = audioDuration / words.length;

  let currentTime = 0;
  const wordTimings = words.map((word, idx) => {
    const start = currentTime;
    const end = currentTime + wordDuration * 0.9;
    currentTime += wordDuration;
    return {
      word,
      start_time: parseFloat(start.toFixed(3)),
      end_time: parseFloat(end.toFixed(3)),
      confidence: 0.9 + Math.random() * 0.1,
    };
  });

  return {
    text,
    language: "en-US",
    duration: audioDuration,
    confidence: 0.92 + Math.random() * 0.08,
    segments: [
      {
        text,
        start_time: 0.0,
        end_time: audioDuration,
        confidence: 0.92 + Math.random() * 0.08,
        speaker: "0",
        words: wordTimings,
      },
    ],
    words: wordTimings,
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/v1/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        model: "mock-parakeet-tdt-1.1b",
        version: "1.0.0-mock",
      })
    );
    return;
  }

  // Transcription endpoint
  if (url.pathname === "/v1/asr/transcribe" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const request = JSON.parse(body);

        // Simulate processing time (100-500ms)
        const delay = 100 + Math.random() * 400;

        setTimeout(() => {
          // Estimate duration from audio size if provided
          let duration = 5.0;
          if (request.audio) {
            const audioSize = Buffer.from(request.audio, "base64").length;
            // Rough estimate: 16kHz, 16-bit mono = 32KB/s
            duration = Math.max(1.0, audioSize / 32000);
          }

          const response = generateMockTranscription(duration);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        }, delay);
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Invalid request",
            details: error.message,
          })
        );
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Mock NIM ASR server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/v1/health`);
  console.log(`Transcribe: http://localhost:${PORT}/v1/asr/transcribe`);
});
