#!/bin/bash

echo "🧪 Testing ParcelReach Invite API"
echo "=================================="
echo ""

# Test against production
URL="https://parcelreach.ai/api/team/invite"
TEAM_ID="6670fe56-266f-4665-9eba-0caa6d16bb76"
TEST_EMAIL="testinvite@example.com"

echo "📤 Sending invite to: $TEST_EMAIL"
echo "🏢 Team ID: $TEAM_ID"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"teamId\": \"$TEAM_ID\",
    \"inviterName\": \"Test User\"
  }")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "📊 Response Status: $HTTP_STATUS"
echo ""
echo "📄 Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ SUCCESS! Invite API is working!"
else
  echo "❌ FAILED with status $HTTP_STATUS"

  # Check error log
  echo ""
  echo "🔍 Checking error log..."
  curl -s "https://parcelreach.ai/api/debug/errors" | jq '.errors[0]' 2>/dev/null
fi
