#!/bin/bash

echo "Testing ParcelReach Notifications API"
echo "======================================"
echo ""

# Configuration
URL="https://parcelreach.ai/api/notifications/create"

# Get a real user ID from the database first
echo "First, let's get a user to test with..."
echo ""
echo "Go to: https://supabase.com/dashboard/project/snfttvopjrpzsypteiby/editor"
echo "Run: SELECT id, email, full_name FROM users LIMIT 5;"
echo ""
read -p "Enter USER_ID to notify: " USER_ID
read -p "Enter FROM_USER_ID (optional, press enter to skip): " FROM_USER_ID

if [ -z "$USER_ID" ]; then
  echo "ERROR: USER_ID is required!"
  exit 1
fi

echo ""
echo "Select notification type to test:"
echo "1) @Mention"
echo "2) Team Join"
echo "3) Lead Assigned"
echo "4) Lead Added"
echo ""
read -p "Enter choice (1-4): " CHOICE

case $CHOICE in
  1)
    TYPE="mention"
    TITLE="You were mentioned"
    MESSAGE="John Doe mentioned you in a note on the Smith Property"
    NOTE_PREVIEW="@you Check out this amazing parcel! We should make an offer."
    ;;
  2)
    TYPE="team_join"
    TITLE="New Team Member"
    MESSAGE="Jane Smith has joined your team"
    NOTE_PREVIEW=""
    ;;
  3)
    TYPE="lead_assigned"
    TITLE="New Lead Assigned"
    MESSAGE="Johnson Ranch - 45 acres in Travis County, TX"
    NOTE_PREVIEW=""
    ;;
  4)
    TYPE="lead_added"
    TITLE="New Lead Available"
    MESSAGE="New property added: Anderson Farm - 120 acres in Williamson County, TX"
    NOTE_PREVIEW=""
    ;;
  *)
    echo "ERROR: Invalid choice!"
    exit 1
    ;;
esac

echo ""
echo "Sending notification..."
echo "   Type: $TYPE"
echo "   To User: $USER_ID"
if [ ! -z "$FROM_USER_ID" ]; then
  echo "   From User: $FROM_USER_ID"
fi
echo ""

# Build JSON payload
if [ -z "$FROM_USER_ID" ]; then
  JSON_DATA="{
    \"userId\": \"$USER_ID\",
    \"type\": \"$TYPE\",
    \"title\": \"$TITLE\",
    \"message\": \"$MESSAGE\",
    \"notePreview\": \"$NOTE_PREVIEW\",
    \"sendEmail\": true
  }"
else
  JSON_DATA="{
    \"userId\": \"$USER_ID\",
    \"fromUserId\": \"$FROM_USER_ID\",
    \"type\": \"$TYPE\",
    \"title\": \"$TITLE\",
    \"message\": \"$MESSAGE\",
    \"notePreview\": \"$NOTE_PREVIEW\",
    \"sendEmail\": true
  }"
fi

# Send request
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "Response Status: $HTTP_STATUS"
echo ""
echo "Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  EMAIL_SENT=$(echo "$BODY" | jq -r '.emailSent' 2>/dev/null)
  NOTIF_ID=$(echo "$BODY" | jq -r '.notification.id' 2>/dev/null)

  echo "SUCCESS! Notification created!"
  echo ""
  echo "   Notification ID: $NOTIF_ID"
  echo "   Email Sent: $EMAIL_SENT"
  echo ""

  if [ "$EMAIL_SENT" = "true" ]; then
    echo "Email was sent! Check the user's inbox."
  else
    echo "WARNING: Email was NOT sent. Check SendGrid configuration."
  fi

  echo ""
  echo "Check these places:"
  echo "   1. User's email inbox for notification email"
  echo "   2. Dashboard bell icon at: https://parcelreach.ai/dashboard"
  echo "   3. Database: SELECT * FROM notifications WHERE id = '$NOTIF_ID';"
else
  echo "FAILED with status $HTTP_STATUS"
  echo ""
  echo "Troubleshooting:"
  echo "   1. Check error message above"
  echo "   2. Verify user ID exists in database"
  echo "   3. Check API logs in Netlify"
fi
echo ""
