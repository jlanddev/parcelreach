import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

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
    const supabase = getSupabase();
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

    // Get user by email or create if doesn't exist
    let { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', invitation.email.toLowerCase())
      .single();

    let userId;

    if (userError || !users) {
      // User record doesn't exist yet - get the auth user ID and create it
      const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) {
        console.error('Error listing auth users:', authError);
        return Response.json(
          { error: 'Failed to verify user account' },
          { status: 500 }
        );
      }

      const authUser = authUsers.find(u => u.email.toLowerCase() === invitation.email.toLowerCase());

      if (!authUser) {
        return Response.json(
          { error: 'No account found with this email. Please create an account first.' },
          { status: 404 }
        );
      }

      // Create user record in users table
      const { data: newUser, error: createUserError } = await supabase
        .from('users')
        .insert([{
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0]
        }])
        .select()
        .single();

      if (createUserError) {
        console.error('Error creating user record:', createUserError);
        return Response.json(
          { error: 'Failed to create user record' },
          { status: 500 }
        );
      }

      userId = newUser.id;
    } else {
      userId = users.id;
    }

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

    // Get team owner and new member details for notification
    const { data: team } = await supabase
      .from('teams')
      .select('owner_id, name')
      .eq('id', invitation.team_id)
      .single();

    const { data: newMember } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    // Notify team owner that someone joined
    if (team && team.owner_id && newMember) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}/api/notifications/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: team.owner_id,
            fromUserId: userId,
            type: 'team_join',
            title: 'New Team Member',
            message: `${newMember.full_name || newMember.email} has joined ${team.name}`,
            sendEmail: true
          })
        });
      } catch (notifError) {
        console.error('Failed to send team join notification:', notifError);
        // Don't fail the request if notification fails
      }
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
