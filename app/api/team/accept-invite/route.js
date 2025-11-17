import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/team/accept-invite
 * Accept a team invitation and add user to team
 *
 * Request body:
 * {
 *   token: string - Invitation token
 * }
 */
export async function POST(request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return Response.json(
        { error: 'Token required' },
        { status: 400 }
      );
    }

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      return Response.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      );
    }

    // Check if already accepted
    if (invitation.accepted) {
      return Response.json(
        { error: 'Invitation already accepted' },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return Response.json(
        { error: 'Invitation has expired' },
        { status: 400 }
      );
    }

    // Get user by email
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', invitation.email.toLowerCase())
      .single();

    if (userError || !users) {
      return Response.json(
        { error: 'User not found. Please create an account first.' },
        { status: 404 }
      );
    }

    const userId = users.id;

    // Check if user is already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', invitation.team_id)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      // Mark invitation as accepted anyway
      await supabase
        .from('team_invitations')
        .update({ accepted: true })
        .eq('id', invitation.id);

      return Response.json(
        { error: 'You are already a member of this team' },
        { status: 400 }
      );
    }

    // Add user to team
    const { error: memberError } = await supabase
      .from('team_members')
      .insert([{
        team_id: invitation.team_id,
        user_id: userId,
        role: 'member'
      }]);

    if (memberError) {
      console.error('Error adding team member:', memberError);
      return Response.json(
        { error: 'Failed to add team member' },
        { status: 500 }
      );
    }

    // Mark invitation as accepted
    const { error: updateError } = await supabase
      .from('team_invitations')
      .update({ accepted: true })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
    }

    return Response.json({
      success: true,
      message: 'Successfully joined team'
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
