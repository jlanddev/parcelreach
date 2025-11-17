# Notification System Setup Guide

Complete notification system with @mentions, email alerts via SendGrid, and real-time updates.

## Features

✅ **@Mention Detection** - Tag team members in notes with @username
✅ **Email Notifications** - Automatic emails via SendGrid when mentioned
✅ **Real-time Updates** - Live notification bell with unread count
✅ **In-app Notifications** - Notification center with read/unread status
✅ **Team Invites** - Email invitations for new team members

---

## Setup Instructions

### 1. Database Setup

Run this SQL in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of supabase-notifications-schema.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```

### 2. SendGrid Configuration

1. **Get SendGrid API Key:**
   - Sign up at [SendGrid.com](https://sendgrid.com)
   - Navigate to Settings > API Keys
   - Create a new API key with "Mail Send" permissions
   - Copy the key (starts with `SG.`)

2. **Verify Sender Email:**
   - In SendGrid, go to Settings > Sender Authentication
   - Verify `notifications@parcelreach.ai` (or your domain)
   - OR use Single Sender Verification for quick setup

3. **Add to Environment Variables:**

Update `.env.local`:
```env
SENDGRID_API_KEY=SG.your_actual_key_here
SENDGRID_FROM_EMAIL=notifications@parcelreach.ai
```

Update **Netlify Environment Variables**:
- Go to Netlify Dashboard > Site Settings > Environment Variables
- Add `SENDGRID_API_KEY` with your key
- Add `SENDGRID_FROM_EMAIL` with your sender email

### 3. Add Notification Bell to Dashboard

In your dashboard layout (e.g., `app/dashboard/layout.js`):

```jsx
import NotificationBell from '@/components/NotificationBell';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  return (
    <div>
      <header className="flex items-center justify-between p-4">
        <h1>ParcelReach Dashboard</h1>
        {user && <NotificationBell userId={user.id} />}
      </header>
      {children}
    </div>
  );
}
```

### 4. Implement @Mentions in Notes

When a user saves a note with @mentions:

```jsx
import { processMentions } from '@/lib/mentions';
import { supabase } from '@/lib/supabase';

async function handleSaveNote(noteText, leadId) {
  const { data: { user } } = await supabase.auth.getUser();

  // Save the note to database
  const { data: note } = await supabase
    .from('lead_notes')
    .insert({
      lead_id: leadId,
      user_id: user.id,
      note: noteText
    })
    .select()
    .single();

  // Get team members
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, full_name, email')
    .eq('team_id', user.team_id);

  // Process mentions and send notifications
  await processMentions({
    noteText,
    fromUserId: user.id,
    leadId,
    link: `/dashboard/leads/${leadId}`,
    teamMembers
  });
}
```

---

## Usage Examples

### Basic @Mention in Note

```
"@john Can you follow up on this lead? Property looks promising!"
```

### Multiple Mentions

```
"Great find! @sarah and @mike should review this for the Austin market."
```

### Mention with Full Name

```
"@"John Smith" - this is in your territory, can you handle?"
```

---

## API Reference

### POST `/api/notifications/create`

Create a notification and optionally send email.

**Request Body:**
```json
{
  "userId": "uuid",
  "fromUserId": "uuid",
  "type": "mention",
  "title": "You were mentioned",
  "message": "Preview of the note...",
  "link": "/dashboard/leads/123",
  "notePreview": "Full note text...",
  "sendEmail": true
}
```

**Response:**
```json
{
  "success": true,
  "notification": { /* notification object */ },
  "emailSent": true
}
```

---

## Email Templates

### Mention Notification Email

Professional email with:
- ParcelReach branding
- Note preview
- Direct link to view
- Unsubscribe options

### Team Invite Email

Clean invitation with:
- Team name
- Inviter information
- Accept invitation CTA
- 7-day expiration notice

---

## Utilities

### `extractMentions(text)`

Extract all @mentions from text:
```js
import { extractMentions } from '@/lib/mentions';

const text = "@john check this @sarah";
const mentions = extractMentions(text);
// Returns: ['john', 'sarah']
```

### `findMentionedUserIds(mentions, teamMembers)`

Convert mentions to user IDs:
```js
import { findMentionedUserIds } from '@/lib/mentions';

const userIds = findMentionedUserIds(['john', 'sarah'], teamMembers);
// Returns: ['uuid1', 'uuid2']
```

### `processMentions(params)`

All-in-one: detect, notify, and email:
```js
import { processMentions } from '@/lib/mentions';

const result = await processMentions({
  noteText: "@john Follow up on this",
  fromUserId: currentUserId,
  leadId: '123',
  link: '/dashboard/leads/123',
  teamMembers: teamMembersList
});
// Returns: { success: true, notificationsSent: 1, totalMentions: 1 }
```

---

## React Hook

### `useNotifications(userId)`

Manage notifications in any component:

```jsx
import { useNotifications } from '@/hooks/useNotifications';

function MyComponent() {
  const {
    notifications,      // Array of notification objects
    unreadCount,        // Number of unread notifications
    loading,            // Loading state
    markAsRead,         // Mark single notification as read
    markAllAsRead,      // Mark all as read
    deleteNotification, // Delete a notification
    refresh             // Manually refresh notifications
  } = useNotifications(userId);

  return (
    <div>
      <h2>You have {unreadCount} unread notifications</h2>
      {notifications.map(notif => (
        <div key={notif.id} onClick={() => markAsRead(notif.id)}>
          {notif.title}
        </div>
      ))}
    </div>
  );
}
```

---

## Testing

### Test Email Sending

```bash
curl -X POST http://localhost:3001/api/notifications/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "fromUserId": "sender-user-id",
    "type": "mention",
    "title": "Test notification",
    "message": "This is a test",
    "link": "/dashboard",
    "notePreview": "Testing @mention notification",
    "sendEmail": true
  }'
```

### Check SendGrid Dashboard

- Go to SendGrid Dashboard > Activity
- View email delivery status
- Check bounce/spam reports

---

## Troubleshooting

### Emails Not Sending

1. **Check API Key**: Verify `SENDGRID_API_KEY` is set correctly
2. **Verify Sender**: Ensure sender email is verified in SendGrid
3. **Check Logs**: Look for SendGrid errors in console
4. **Test API Key**: Use SendGrid's API test endpoint

### Notifications Not Appearing

1. **Database**: Verify notifications table exists in Supabase
2. **RLS Policies**: Check Row Level Security policies are enabled
3. **Real-time**: Ensure Supabase real-time is enabled for notifications table
4. **User ID**: Verify correct user ID is being used

### Mentions Not Detected

1. **Format**: Ensure using `@username` format
2. **Team Members**: Verify team members list is loaded
3. **Matching**: Check username/email matches team member data

---

## Security Notes

- Email sending uses service role key (server-side only)
- RLS policies restrict users to their own notifications
- Mention detection requires team membership verification
- Rate limiting recommended for production

---

## Production Checklist

- [ ] SendGrid API key configured in Netlify
- [ ] Sender email verified in SendGrid
- [ ] Database schema deployed to production Supabase
- [ ] RLS policies enabled
- [ ] Real-time subscriptions enabled
- [ ] Email templates tested
- [ ] Notification bell added to dashboard
- [ ] Error logging configured
- [ ] Rate limiting implemented

---

## Next Steps

1. **Add to Settings**: Let users manage notification preferences
2. **Digest Emails**: Send daily/weekly notification summaries
3. **Push Notifications**: Add browser push notifications
4. **SMS**: Integrate Twilio for SMS alerts
5. **Slack**: Add Slack integration for team notifications

---

🎉 **Your notification system is ready!**

Users can now @mention teammates, get email alerts, and see real-time notifications with the bell icon.
