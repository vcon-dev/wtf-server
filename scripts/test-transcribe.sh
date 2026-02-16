#!/bin/bash
#
# WTF Server Test Script
# Tests the transcription endpoint with sample data
#

set -e

BASE_URL="${WTF_SERVER_URL:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  WTF Server Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Server URL: ${YELLOW}$BASE_URL${NC}"
echo ""

# Check if server is running
echo -e "${BLUE}[1/4] Checking server health...${NC}"
HEALTH=$(curl -s "$BASE_URL/health" 2>/dev/null || echo '{"error":"Connection refused"}')
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}  Server is healthy${NC}"
else
    echo -e "${RED}  Server is not responding. Is it running?${NC}"
    echo -e "${YELLOW}  Start with: npm run dev${NC}"
    exit 1
fi

# Check provider readiness
echo ""
echo -e "${BLUE}[2/4] Checking provider readiness...${NC}"
READY=$(curl -s "$BASE_URL/health/ready")
PROVIDER=$(echo "$READY" | grep -o '"services":{[^}]*}' | head -1)
echo -e "  $PROVIDER"
if echo "$READY" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}  Provider is ready${NC}"
else
    echo -e "${YELLOW}  Warning: Provider may not be fully available${NC}"
fi

# Test transcription with sample VCON
echo ""
echo -e "${BLUE}[3/4] Testing transcription endpoint...${NC}"
echo -e "  Sending sample VCON to ${YELLOW}POST /transcribe${NC}"

# Use the sample with proper audio (1 second) if available
VCON_FILE="$PROJECT_DIR/tests/fixtures/sample-vcon-audio.json"
if [ ! -f "$VCON_FILE" ]; then
    VCON_FILE="$PROJECT_DIR/tests/fixtures/sample-vcon.json"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/transcribe" \
    -H "Content-Type: application/json" \
    -d @"$VCON_FILE")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}  Success! HTTP $HTTP_CODE${NC}"

    # Extract key info from response
    VENDOR=$(echo "$BODY" | grep -o '"vendor":"[^"]*"' | head -1 | cut -d'"' -f4)
    TEXT=$(echo "$BODY" | grep -o '"text":"[^"]*"' | head -1 | cut -d'"' -f4)
    PROVIDER_HEADER=$(curl -s -I -X POST "$BASE_URL/transcribe" \
        -H "Content-Type: application/json" \
        -d @"$VCON_FILE" 2>/dev/null | grep -i "x-provider" | tr -d '\r')

    echo ""
    echo -e "  ${BLUE}Results:${NC}"
    echo -e "    Provider: ${YELLOW}${VENDOR:-unknown}${NC}"
    echo -e "    Transcript: ${YELLOW}${TEXT:-<empty or silence>}${NC}"
else
    echo -e "${RED}  Failed! HTTP $HTTP_CODE${NC}"
    echo "$BODY" | head -5
fi

# Show available providers
echo ""
echo -e "${BLUE}[4/4] Checking all configured providers...${NC}"
PROVIDERS=$(curl -s "$BASE_URL/health/providers")
echo "$PROVIDERS" | grep -o '"configured":\[[^]]*\]' | sed 's/"configured":/  Configured: /'
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}  All tests passed!${NC}"
else
    echo -e "${RED}  Some tests failed${NC}"
fi
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "API Documentation: ${YELLOW}$BASE_URL/docs${NC}"
echo ""
