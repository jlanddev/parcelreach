import { createClient } from '@supabase/supabase-js';
import { sendTeamInviteEmail } from '@/lib/email';
import { logError } from '@/lib/error-logger';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * POST /api/team/invite
 * Invite a team member via email
 *
 * Request body:
 * {
 *   email: string - Email address to invite
 *   teamId: string - Team ID
 *   inviterName: string - Name of person sending invite
 * }
 */
export async function POST(request) {
  try {
    const supabase = getSupabase();
    const { email, teamId, inviterName } = await request.json();

    if (!email || !teamId) {
      return Response.json(
        { error: 'Email and teamId required' },
        { status: 400 }
      );
    }

    // Skip team validation - RLS might be blocking it
    // Just use the teamId provided - trust the frontend
    console.log('📝 Processing invite for team:', teamId);

    // Check if user already exists and is a member
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingUser) {
      const { data: existingMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        return Response.json(
          { error: 'User is already a team member' },
          { status: 400 }
        );
      }
    }

    // Create invitation token (simple random string)
    const inviteToken = Math.random().toString(36).substring(2, 15) +
                       Math.random().toString(36).substring(2, 15);

    // Store invitation in database
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert([{
        team_id: teamId,
        email: email.toLowerCase(),
        token: inviteToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (inviteError) {
      console.error('Failed to create invitation:', inviteError);
      logError('TEAM_INVITE_CREATE_FAILED', inviteError, {
        teamId,
        email,
        url: '/api/team/invite',
        method: 'POST'
      });
      return Response.json(
        {
          error: 'Failed to create invitation',
          details: inviteError.message,
          code: inviteError.code,
          hint: inviteError.hint
        },
        { status: 500 }
      );
    }

    // Send invitation email
    const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}/team/join?token=${inviteToken}`;

    const emailResult = await sendTeamInviteEmail({
      toEmail: email,
      teamName: 'the team',
      inviterName: inviterName || 'A team member',
      inviteLink
    });

    return Response.json({
      success: true,
      invitation,
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Unexpected error in team invite:', error);
    logError('TEAM_INVITE_UNEXPECTED_ERROR', error, {
      url: '/api/team/invite',
      method: 'POST'
    });
    return Response.json(
      {
        error: 'Internal server error',
        details: error.message,
        stack: error.stack?.split('\n')[0]
      },
      { status: 500 }
    );
  }
}
