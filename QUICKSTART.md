# WTF Server Quickstart

Get the WTF Server running in under 5 minutes.

## Prerequisites

- Node.js 22+
- At least one ASR provider configured (API key or local service)

## Setup

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
```

Edit `.env` with your provider credentials:

```bash
# Choose your default provider
ASR_PROVIDER=local-whisper  # or: openai, deepgram, groq, nvidia, mlx-whisper

# Configure at least one provider:

# OpenAI (get key: https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-key-here

# Deepgram (get key: https://console.deepgram.com/)
DEEPGRAM_API_KEY=your-deepgram-key

# Groq (get key: https://console.groq.com/keys)
GROQ_API_KEY=gsk_your-groq-key

# Local Whisper (no API key needed)
LOCAL_WHISPER_URL=http://localhost:9001

# MLX Whisper (Apple Silicon, no API key needed)
# Run vcon-mac-wtf sidecar: pip install vcon-mac-wtf && vcon-mac-wtf
MLX_WHISPER_URL=http://localhost:8000
MLX_WHISPER_MODEL=mlx-community/whisper-turbo
```

## Run

```bash
# Development mode (with hot reload)
npm run dev

# Or build and run production
npm run build && npm start
```

Server starts at http://localhost:3000

## Test It

```bash
# Run the test script
./scripts/test-transcribe.sh

# Or manually with curl
curl -X POST http://localhost:3000/transcribe \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/sample-vcon.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/ready` | GET | Readiness with provider status |
| `/health/providers` | GET | All configured providers health |
| `/transcribe` | POST | Transcribe a VCON |
| `/transcribe?provider=openai` | POST | Use specific provider |
| `/transcribe/batch` | POST | Batch transcribe multiple VCONs |
| `/docs` | GET | OpenAPI documentation |

## Example VCON Input

```json
{
  "vcon": "0.0.2",
  "uuid": "019371a4-1234-7000-8000-000000000001",
  "created_at": "2024-01-15T10:30:00.000Z",
  "parties": [
    { "name": "Agent", "role": "agent" },
    { "name": "Customer", "role": "customer" }
  ],
  "dialog": [
    {
      "type": "recording",
      "start": "2024-01-15T10:30:00.000Z",
      "duration": 5.0,
      "parties": [0, 1],
      "mediatype": "audio/wav",
      "body": "<base64-encoded-audio>",
      "encoding": "base64url"
    }
  ]
}
```

## Example Response

The response is the original VCON enriched with WTF transcription in the `analysis` array:

```json
{
  "vcon": "0.0.2",
  "uuid": "019371a4-1234-7000-8000-000000000001",
  "analysis": [
    {
      "type": "wtf_transcription",
      "dialog": 0,
      "vendor": "local-whisper",
      "schema": "wtf-1.0",
      "encoding": "json",
      "body": {
        "transcript": {
          "text": "Hello, how can I help you today?",
          "language": "en",
          "confidence": 0.95
        },
        "segments": [...],
        "metadata": {
          "provider": "local-whisper",
          "model": "base",
          "processingTime": 1234
        }
      }
    }
  ]
}
```

## Running Tests

```bash
# All tests
npm run test:run

# With local whisper integration
TEST_LOCAL_WHISPER=true npm run test:run

# With coverage
npm run test:coverage
```

## Providers

| Provider | API Key Required | Notes |
|----------|-----------------|-------|
| `openai` | Yes | OpenAI Whisper API |
| `deepgram` | Yes | Fast, accurate |
| `groq` | Yes | Very fast (Whisper on Groq hardware) |
| `nvidia` | No* | NVIDIA NIM Parakeet/Canary |
| `local-whisper` | No | Self-hosted faster-whisper-server |
| `mlx-whisper` | No | [vcon-mac-wtf](https://github.com/vcon-dev/vcon-mac-wtf) Python sidecar for Apple Silicon |

*NVIDIA NIM can require API key for cloud deployments
