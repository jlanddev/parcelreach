import { createClient } from '@supabase/supabase-js';
import { sendMentionNotification } from '@/lib/email';

// Initialize Supabase with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/notifications/create
 * Create a notification and send email
 *
 * Request body:
 * {
 *   userId: string - User ID to notify
 *   fromUserId: string - User ID who triggered the notification
 *   type: string - Notification type ('mention', 'lead_assigned', etc.)
 *   title: string - Notification title
 *   message: string - Notification message
 *   link: string - Link to relevant page
 *   notePreview: string - (Optional) Preview text for mentions
 *   sendEmail: boolean - Whether to send email (default true)
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      userId,
      fromUserId,
      type,
      title,
      message,
      link,
      notePreview,
      sendEmail = true
    } = body;

    // Validation
    if (!userId || !type || !title || !message) {
      return Response.json(
        { error: 'Missing required fields: userId, type, title, message' },
        { status: 400 }
      );
    }

    // Create notification in database
    const { data: notification, error: notifError} = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        from_user_id: fromUserId,
        type,
        title,
        message,
        read: false
      }])
      .select()
      .single();

    if (notifError) {
      console.error('Error creating notification:', notifError);
      return Response.json(
        { error: 'Failed to create notification', details: notifError.message },
        { status: 500 }
      );
    }

    // Send email if requested
    let emailResult = null;
    if (sendEmail && (type === 'mention' || type === 'lead_assigned')) {
      try {
        // Get user details
        const { data: toUser } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('id', userId)
          .single();

        if (toUser && toUser.email) {
          if (type === 'mention') {
            const { data: fromUser } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', fromUserId)
              .single();

            emailResult = await sendMentionNotification({
              toEmail: toUser.email,
              toName: toUser.full_name || 'there',
              fromName: fromUser?.full_name || 'A team member',
              notePreview: notePreview || message,
              link: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}${link}`
            });
          } else if (type === 'lead_assigned') {
            const { sendLeadAssignmentNotification } = await import('@/lib/email');
            // Parse lead details from message (format: "Name - Acres in Location")
            const parts = message.split(' - ');
            const leadName = parts[0] || 'Property';
            const acresAndLocation = parts[1] || '';
            const [acres, ...locationParts] = acresAndLocation.split(' in ');
            const location = locationParts.join(' in ') || 'Unknown';

            emailResult = await sendLeadAssignmentNotification({
              toEmail: toUser.email,
              toName: toUser.full_name || 'there',
              leadName,
              location,
              acres: acres || 'N/A',
              link: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}${link}`
            });
          }
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Don't fail the request if email fails
      }
    }

    return Response.json({
      success: true,
      notification,
      emailSent: emailResult?.success || false
    });

  } catch (error) {
    console.error('Error in /api/notifications/create:', error);
    return Response.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
