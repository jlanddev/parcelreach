/**
 * Utility functions for detecting and handling @mentions in text
 */

/**
 * Extract all @mentions from text
 * Matches @username or @"User Name" or @userId
 * @param {string} text - Text to search for mentions
 * @returns {Array<string>} Array of mentioned usernames/IDs
 */
export function extractMentions(text) {
  if (!text) return [];

  // Match @username, @"Full Name", or @userId
  const mentionRegex = /@([a-zA-Z0-9_-]+|"[^"]+"|'[^']+')/g;
  const matches = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Remove quotes if present
    const mention = match[1].replace(/["']/g, '');
    matches.push(mention);
  }

  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Find user IDs from team members based on mentions
 * @param {Array<string>} mentions - Array of mentioned names/usernames
 * @param {Array<Object>} teamMembers - Array of team member objects with id, full_name, email
 * @returns {Array<string>} Array of user IDs
 */
export function findMentionedUserIds(mentions, teamMembers) {
  const userIds = [];

  mentions.forEach(mention => {
    const mentionLower = mention.toLowerCase();

    // Try to find user by name or email
    const user = teamMembers.find(member => {
      const fullName = member.full_name?.toLowerCase() || '';
      const email = member.email?.toLowerCase() || '';
      const emailUsername = email.split('@')[0];

      return (
        fullName === mentionLower ||
        email === mentionLower ||
        emailUsername === mentionLower ||
        member.id === mention // Direct ID match
      );
    });

    if (user && !userIds.includes(user.id)) {
      userIds.push(user.id);
    }
  });

  return userIds;
}

/**
 * Process mentions in note and create notifications
 * @param {Object} params
 * @param {string} params.noteText - The note text containing mentions
 * @param {string} params.fromUserId - ID of user creating the note
 * @param {string} params.leadId - ID of the lead (optional)
 * @param {string} params.link - Link to the note/lead
 * @param {Array<Object>} params.teamMembers - Array of team members
 */
export async function processMentions({ noteText, fromUserId, leadId, link, teamMembers }) {
  const mentions = extractMentions(noteText);

  if (mentions.length === 0) {
    return { success: true, notificationsSent: 0 };
  }

  const userIds = findMentionedUserIds(mentions, teamMembers);

  if (userIds.length === 0) {
    return { success: true, notificationsSent: 0 };
  }

  // Get a preview of the note (first 150 chars)
  const notePreview = noteText.length > 150
    ? noteText.substring(0, 150) + '...'
    : noteText;

  // Create notifications for each mentioned user
  const results = await Promise.allSettled(
    userIds.map(userId =>
      fetch('/api/notifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          fromUserId,
          type: 'mention',
          title: 'You were mentioned in a note',
          message: notePreview,
          link,
          notePreview,
          sendEmail: true
        })
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;

  return {
    success: true,
    notificationsSent: successful,
    totalMentions: userIds.length
  };
}

/**
 * Highlight @mentions in text for display
 * @param {string} text - Text containing mentions
 * @returns {string} HTML string with highlighted mentions
 */
export function highlightMentions(text) {
  if (!text) return '';

  return text.replace(
    /@([a-zA-Z0-9_-]+|"[^"]+"|'[^']+')/g,
    '<span class="mention">@$1</span>'
  );
}
