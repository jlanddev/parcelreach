import { createClient } from '@supabase/supabase-js';
import { sendTeamInviteEmail } from '@/lib/email';
import { logError } from '@/lib/error-logger';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const { email, teamId, inviterName } = await request.json();

    if (!email || !teamId) {
      return Response.json(
        { error: 'Email and teamId required' },
        { status: 400 }
      );
    }

    // Get team details - if not found, create it automatically
    console.log('🔍 API DEBUG: Looking for team with ID:', teamId);

    let { data: team, error: teamError } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    console.log('🔍 API DEBUG: Team query result:', { team, teamError });

    // If team doesn't exist, create it automatically
    if (teamError || !team) {
      console.log('⚠️  Team not found, creating it automatically for team ID:', teamId);

      // Get ANY team member (not just owner) from team_members
      const { data: teamMembers, error: memberError } = await supabase
        .from('team_members')
        .select('user_id, role, users(email)')
        .eq('team_id', teamId)
        .limit(10);

      console.log('🔍 Found team members:', teamMembers, 'Error:', memberError);

      if (teamMembers && teamMembers.length > 0) {
        // Find owner or use first member
        const owner = teamMembers.find(m => m.role === 'owner') || teamMembers[0];

        console.log('👤 Using member as owner:', owner);

        // Create the missing team
        const { data: newTeam, error: createError } = await supabase
          .from('teams')
          .insert([{
            id: teamId,
            name: `${owner.users?.email || 'Team'}'s Team`,
            owner_id: owner.user_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (!createError && newTeam) {
          console.log('✅ Team created successfully:', newTeam);
          team = newTeam;
        } else {
          console.error('❌ Failed to create team:', createError);
          logError('TEAM_INVITE_CREATE_TEAM_FAILED', createError, {
            teamId,
            email,
            owner,
            url: '/api/team/invite',
            method: 'POST'
          });
          return Response.json(
            { error: 'Failed to create team',  details: createError?.message },
            { status: 500 }
          );
        }
      } else {
        console.error('❌ No team members found for team:', teamId);
        logError('TEAM_INVITE_NO_MEMBERS_FOUND', new Error('No team members found'), {
          teamId,
          email,
          memberError,
          url: '/api/team/invite',
          method: 'POST'
        });
        return Response.json(
          { error: 'Team has no members. Cannot create team automatically.' },
          { status: 500 }
        );
      }
    }

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
      logError('TEAM_INVITE_CREATE_FAILED', inviteError, {
        teamId,
        email,
        url: '/api/team/invite',
        method: 'POST'
      });
      return Response.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    // Send invitation email
    const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://parcelreach.ai'}/team/join?token=${inviteToken}`;

    const emailResult = await sendTeamInviteEmail({
      toEmail: email,
      teamName: team.name,
      inviterName: inviterName || 'A team member',
      inviteLink
    });

    return Response.json({
      success: true,
      invitation,
      emailSent: emailResult.success
    });

  } catch (error) {
    logError('TEAM_INVITE_UNEXPECTED_ERROR', error, {
      url: '/api/team/invite',
      method: 'POST'
    });
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
