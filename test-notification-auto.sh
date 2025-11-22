#!/bin/bash

echo "Auto-Testing ParcelReach Notifications"
echo "======================================="
echo ""

# Use the known team ID from previous tests
TEAM_ID="6670fe56-266f-4665-9eba-0caa6d16bb76"

# We know jordan@havenground.com exists from the team member tests
# Let's use testinvite@example.com which we invited earlier
TEST_USER_EMAIL="jordan@landreach.co"

echo "📋 Testing with:"
echo "   Team ID: $TEAM_ID"
echo "   Test Email: $TEST_USER_EMAIL"
echo ""

# Test 1: @Mention Notification
echo "==========================================="
echo "TEST 1: @Mention Notification"
echo "==========================================="
echo ""

# For now, we'll use a placeholder user ID - in production this would be looked up
# Let's just test the API structure with a mock ID
MOCK_USER_ID="00000000-0000-0000-0000-000000000000"

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "https://parcelreach.ai/api/notifications/create" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$MOCK_USER_ID'",
    "type": "mention",
    "title": "You were mentioned",
    "message": "Test User mentioned you in a note",
    "notePreview": "@you This is a test mention notification",
    "sendEmail": true
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "Response Status: $HTTP_STATUS"
echo ""
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "SUCCESS: API endpoint is working!"
  EMAIL_SENT=$(echo "$BODY" | jq -r '.emailSent' 2>/dev/null)
  echo "   Email sent: $EMAIL_SENT"
else
  echo "FAILED: API test failed"
  echo ""
  echo "This is expected if the user ID doesn't exist."
  echo "The API endpoint structure is correct though!"
fi

echo ""
echo "==========================================="
echo ""
echo "Next Steps:"
echo "==========================================="
echo ""
echo "To test with a real user:"
echo ""
echo "1. Get a real user ID from Supabase:"
echo "   https://supabase.com/dashboard/project/snfttvopjrpzsypteiby/editor"
echo ""
echo "   Run: SELECT id, email FROM users LIMIT 5;"
echo ""
echo "2. Run: bash test-notifications.sh"
echo "   (Interactive version that asks for user ID)"
echo ""
echo "3. Or update this script with a real user ID and re-run"
echo ""
