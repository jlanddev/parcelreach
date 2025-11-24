'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LeadNotes({ leadId, lead, currentUserId, currentUserName, teamMembers, teamId }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedNotes, setExpandedNotes] = useState(new Set());

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    if (!teamId) return;

    const { data, error } = await supabase
      .from('lead_notes')
      .select(`
        *,
        user:users(id, full_name, email),
        replies:lead_notes!parent_id(
          *,
          user:users(id, full_name, email)
        )
      `)
      .eq('lead_id', leadId)
      .eq('team_id', teamId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    if (!error) {
      // Fetch likes for all notes
      const allNoteIds = data?.flatMap(note => [
        note.id,
        ...(note.replies?.map(r => r.id) || [])
      ]) || [];

      const { data: likesData } = await supabase
        .from('note_likes')
        .select('note_id, user_id')
        .in('note_id', allNoteIds);

      // Group likes by note_id
      const likesByNote = {};
      likesData?.forEach(like => {
        if (!likesByNote[like.note_id]) {
          likesByNote[like.note_id] = [];
        }
        likesByNote[like.note_id].push(like.user_id);
      });

      // Add likes to notes
      const notesWithLikes = data?.map(note => ({
        ...note,
        likes: likesByNote[note.id] || [],
        replies: note.replies?.map(reply => ({
          ...reply,
          likes: likesByNote[reply.id] || []
        })) || []
      })) || [];

      setNotes(notesWithLikes);
    }
  };

  const handleNoteChange = (e) => {
    const value = e.target.value;
    const position = e.target.selectionStart;

    setNewNote(value);
    setCursorPosition(position);

    const textBeforeCursor = value.substring(0, position);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1 && lastAtIndex === position - 1) {
      setShowMentions(true);
      setMentionSearch('');
    } else if (lastAtIndex !== -1 && position > lastAtIndex) {
      const search = textBeforeCursor.substring(lastAtIndex + 1);
      if (!/\s/.test(search)) {
        setMentionSearch(search);
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (user) => {
    const textBeforeCursor = newNote.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textBeforeAt = newNote.substring(0, lastAtIndex);
    const textAfterCursor = newNote.substring(cursorPosition);

    const mention = `@${user.full_name} `;
    setNewNote(textBeforeAt + mention + textAfterCursor);
    setShowMentions(false);
  };

  const extractMentions = (text) => {
    if (!teamMembers || teamMembers.length === 0) return [];

    const mentions = [];

    // Sort team members by name length (longest first) to match longer names first
    const sortedMembers = [...teamMembers].sort((a, b) =>
      (b.users.full_name?.length || 0) - (a.users.full_name?.length || 0)
    );

    // For each team member, check if their name is mentioned
    sortedMembers.forEach(member => {
      const fullName = member.users.full_name;
      if (!fullName) return;

      // Check if @name appears in the text (case insensitive)
      const mentionPattern = new RegExp(`@${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (mentionPattern.test(text)) {
        if (!mentions.includes(member.users.id)) {
          mentions.push(member.users.id);
        }
      }
    });

    return mentions;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    const mentionedUsers = extractMentions(newNote);

    const { data, error } = await supabase
      .from('lead_notes')
      .insert([{
        lead_id: leadId,
        user_id: currentUserId,
        team_id: teamId,
        content: newNote,
        parent_id: replyingTo?.id || null,
        mentioned_users: mentionedUsers
      }])
      .select();

    if (!error && mentionedUsers.length > 0) {
      // Build lead description for notification
      const leadName = lead?.name || 'Unknown';
      const leadLocation = lead?.county && lead?.state
        ? `${lead.county} County, ${lead.state}`
        : lead?.city && lead?.state
        ? `${lead.city}, ${lead.state}`
        : 'Unknown Location';
      const leadDescription = `${leadName} - ${leadLocation}`;

      for (const userId of mentionedUsers) {
        await fetch('/api/notifications/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            fromUserId: currentUserId,
            type: 'mention',
            title: `${currentUserName || 'Someone'} mentioned you in a note`,
            message: `On lead: ${leadDescription}`,
            link: `/dashboard?lead=${leadId}`,
            notePreview: newNote,
            sendEmail: true
          })
        });
      }
    }

    setNewNote('');
    setReplyingTo(null);
    fetchNotes();
  };

  const handleDelete = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const { error } = await supabase
      .from('lead_notes')
      .delete()
      .eq('id', noteId);

    if (!error) fetchNotes();
  };

  const toggleLike = async (noteId, currentLikes) => {
    const hasLiked = currentLikes.includes(currentUserId);

    if (hasLiked) {
      // Unlike
      await supabase
        .from('note_likes')
        .delete()
        .eq('note_id', noteId)
        .eq('user_id', currentUserId);
    } else {
      // Like
      await supabase
        .from('note_likes')
        .insert([{
          note_id: noteId,
          user_id: currentUserId
        }]);
    }

    fetchNotes();
  };

  const filteredMembers = teamMembers?.filter(m =>
    m.users.full_name.toLowerCase().includes(mentionSearch.toLowerCase())
  ) || [];

  const highlightMentions = (text) => {
    if (!teamMembers) return text;

    let result = text;
    const sortedMembers = [...teamMembers].sort((a, b) =>
      (b.users.full_name?.length || 0) - (a.users.full_name?.length || 0)
    );

    sortedMembers.forEach(member => {
      const fullName = member.users.full_name;
      if (!fullName) return;

      const mentionPattern = new RegExp(`(@${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
      result = result.replace(mentionPattern, '<span class="text-blue-400 font-medium cursor-pointer hover:underline">$1</span>');
    });

    return result;
  };

  const toggleExpand = (noteId) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const renderNote = (note, isReply = false) => {
    const isExpanded = expandedNotes.has(note.id);
    const isLongContent = note.content.length > 300;
    const displayContent = isExpanded || !isLongContent
      ? note.content
      : note.content.substring(0, 300) + '...';

    const hasLiked = note.likes?.includes(currentUserId);
    const likeCount = note.likes?.length || 0;

    return (
      <div key={note.id} className={`${isReply ? 'ml-12 mt-3' : 'mb-6'}`}>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600/50 transition-all">
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${isReply ? 'bg-gradient-to-br from-orange-500 to-red-500' : 'bg-gradient-to-br from-purple-600 to-blue-600'} flex items-center justify-center font-bold text-white shadow-lg`}>
                  {note.user?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">
                    {note.user?.full_name || 'Unknown User'}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {new Date(note.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>

              {note.user_id === currentUserId && (
                <button
                  onClick={() => handleDelete(note.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  title="Delete note"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            {/* Content */}
            <div
              className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap mb-3"
              dangerouslySetInnerHTML={{ __html: highlightMentions(displayContent) }}
            />

            {isLongContent && (
              <button
                onClick={() => toggleExpand(note.id)}
                className="text-blue-400 hover:text-blue-300 text-xs font-medium mb-3"
              >
                {isExpanded ? 'See less' : '...See more'}
              </button>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-3 border-t border-slate-700/30">
              <button
                onClick={() => toggleLike(note.id, note.likes || [])}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  hasLiked ? 'text-blue-400' : 'text-slate-400 hover:text-blue-400'
                }`}
              >
                <svg className="w-4 h-4" fill={hasLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
                {likeCount > 0 ? `Like (${likeCount})` : 'Like'}
              </button>

              <button
                onClick={() => {
                  setReplyingTo(note);
                  setNewNote('');
                }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 text-xs font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Reply
              </button>
            </div>
          </div>
        </div>

        {/* Nested Replies */}
        {note.replies && note.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {note.replies.map(reply => renderNote(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Reply indicator */}
      {replyingTo && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="text-blue-400 text-sm font-medium">
              Replying to {replyingTo.user?.full_name}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-blue-400 hover:text-blue-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* New Note Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0">
            {currentUserName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 relative">
            <textarea
              value={newNote}
              onChange={handleNoteChange}
              placeholder="Write a note and mention others with @"
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-none text-sm"
            />

            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute z-10 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-2xl max-h-48 overflow-y-auto w-64">
                {filteredMembers.map((member) => (
                  <button
                    key={member.users.id}
                    type="button"
                    onClick={() => insertMention(member.users)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-600 text-white text-sm flex items-center gap-2 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center font-semibold text-xs">
                      {member.users.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-medium">{member.users.full_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!newNote.trim()}
            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {replyingTo ? 'Post Reply' : 'Post Note'}
          </button>
        </div>
      </form>

      {/* Notes List */}
      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-xl">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-slate-400 text-base font-medium">No notes yet</p>
            <p className="text-slate-500 text-sm mt-1">Start a conversation about this lead</p>
          </div>
        ) : (
          notes.map(note => renderNote(note))
        )}
      </div>
    </div>
  );
}
