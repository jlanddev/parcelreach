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
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [noteViews, setNoteViews] = useState({});

  // Track user presence
  useEffect(() => {
    if (!leadId || !currentUserId) return;

    const updatePresence = async () => {
      await supabase
        .from('user_presence')
        .upsert({
          user_id: currentUserId,
          lead_id: leadId,
          last_seen: new Date().toISOString(),
          status: 'online'
        });
    };

    // Update presence immediately
    updatePresence();

    // Update presence every 30 seconds
    const interval = setInterval(updatePresence, 30000);

    // Fetch online users
    const fetchOnlineUsers = async () => {
      const { data } = await supabase
        .from('user_presence')
        .select('user_id, status, users(id, full_name)')
        .eq('lead_id', leadId)
        .gte('last_seen', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // Last 10 minutes

      if (data) {
        setOnlineUsers(data);
      }
    };

    fetchOnlineUsers();
    const onlineInterval = setInterval(fetchOnlineUsers, 10000); // Refresh every 10 seconds

    return () => {
      clearInterval(interval);
      clearInterval(onlineInterval);
      // Mark as offline when leaving
      supabase
        .from('user_presence')
        .update({ status: 'offline' })
        .eq('user_id', currentUserId)
        .eq('lead_id', leadId);
    };
  }, [leadId, currentUserId]);

  // Mark notes as viewed
  useEffect(() => {
    if (!notes.length || !currentUserId) return;

    const markNotesAsViewed = async () => {
      for (const note of notes) {
        // Mark parent note as viewed
        await supabase
          .from('note_views')
          .upsert({
            note_id: note.id,
            user_id: currentUserId,
            viewed_at: new Date().toISOString()
          });

        // Mark replies as viewed
        if (note.replies) {
          for (const reply of note.replies) {
            await supabase
              .from('note_views')
              .upsert({
                note_id: reply.id,
                user_id: currentUserId,
                viewed_at: new Date().toISOString()
              });
          }
        }
      }
    };

    // Delay marking as viewed by 1 second (user must actually see it)
    const timeout = setTimeout(markNotesAsViewed, 1000);
    return () => clearTimeout(timeout);
  }, [notes, currentUserId]);

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

    // Sort replies within each thread chronologically (oldest to newest)
    if (data) {
      data.forEach(note => {
        if (note.replies) {
          note.replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
      });
    }

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

      // Fetch views (read receipts) for all notes
      const { data: viewsData } = await supabase
        .from('note_views')
        .select('note_id, user_id, users(id, full_name)')
        .in('note_id', allNoteIds);

      // Group views by note_id
      const viewsByNote = {};
      viewsData?.forEach(view => {
        if (!viewsByNote[view.note_id]) {
          viewsByNote[view.note_id] = [];
        }
        viewsByNote[view.note_id].push({
          user_id: view.user_id,
          full_name: view.users?.full_name
        });
      });

      setNoteViews(viewsByNote);

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
      (b.users?.full_name?.length || 0) - (a.users?.full_name?.length || 0)
    );

    // For each team member, check if their name is mentioned
    sortedMembers.forEach(member => {
      const fullName = member.users?.full_name;
      if (!fullName) return;

      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      // Check for @fullname, @firstname, or @lastname
      const patterns = [
        fullName, // "jordan harmon"
        firstName, // "jordan"
        lastName // "harmon"
      ].filter(Boolean).map(name =>
        new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      );

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          if (!mentions.includes(member.users.id)) {
            mentions.push(member.users.id);
            console.log(`✅ Found mention: ${fullName} (${member.users.id})`);
          }
          break;
        }
      }
    });

    console.log('📝 Total mentions found:', mentions);
    return mentions;
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);

    try {
      const uploadedFiles = [];

      for (const file of files) {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `note-attachments/${leadId}/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('lead-files')
          .upload(filePath, file);

        if (error) {
          console.error('Upload error:', error);
          throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('lead-files')
          .getPublicUrl(filePath);

        uploadedFiles.push({
          name: file.name,
          url: publicUrl,
          type: file.type,
          size: file.size,
          path: filePath
        });
      }

      setAttachments(prev => [...prev, ...uploadedFiles]);
    } catch (error) {
      console.error('Error uploading files:', error);
      alert(`Failed to upload files: ${error.message}\n\nMake sure the 'lead-files' Storage bucket exists in Supabase.`);
    } finally {
      setUploading(false);
      // Reset file input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newNote.trim() && attachments.length === 0) return;

    try {
      const mentionedUsers = extractMentions(newNote);
      console.log('📝 Mentioned users:', mentionedUsers);
      console.log('📝 Team members:', teamMembers);

      const { data, error } = await supabase
        .from('lead_notes')
        .insert([{
          lead_id: leadId,
          user_id: currentUserId,
          team_id: teamId,
          content: newNote,
          parent_id: replyingTo?.id || null,
          mentioned_users: mentionedUsers,
          attachments: attachments
        }])
        .select();

      console.log('📝 Note created:', data, 'Error:', error);

      if (error) {
        console.error('Failed to create note:', error);
        alert('Failed to post note. Please try again.');
        return;
      }

      if (mentionedUsers.length > 0) {
      // Build lead description for notification
      const leadName = lead?.name || 'Unknown';
      const leadLocation = lead?.county && lead?.state
        ? `${lead.county} County, ${lead.state}`
        : lead?.city && lead?.state
        ? `${lead.city}, ${lead.state}`
        : 'Unknown Location';
      const leadDescription = `${leadName} - ${leadLocation}`;

      for (const userId of mentionedUsers) {
        console.log('🔔 Creating notification for user:', userId);
        const response = await fetch('/api/notifications/create', {
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
          const result = await response.json();
          console.log('🔔 Notification created:', result);
        }
      }

      setNewNote('');
      setReplyingTo(null);
      setAttachments([]);
      await fetchNotes();
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('An error occurred. Please try again.');
    }
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

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

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

    // Get online status for this user
    const userPresence = onlineUsers.find(u => u.user_id === note.user_id);
    const statusColor = userPresence?.status === 'online' ? 'bg-green-500'
      : userPresence?.status === 'away' ? 'bg-yellow-500'
      : 'bg-gray-500';

    // Get views for this note
    const views = noteViews[note.id] || [];
    const viewCount = views.length;

    // Check if edited
    const wasEdited = note.edited_at && note.edited_at !== note.created_at;
    const editedTime = wasEdited ? new Date(note.edited_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) : null;

    return (
      <div key={note.id} className={`${isReply ? 'ml-12 mt-3' : 'mb-6'}`}>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600/50 transition-all">
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full ${isReply ? 'bg-gradient-to-br from-orange-500 to-red-500' : 'bg-gradient-to-br from-purple-600 to-blue-600'} flex items-center justify-center font-bold text-white shadow-lg text-sm`}>
                    {getInitials(note.user?.full_name)}
                  </div>
                  {/* Online status dot */}
                  <div className={`absolute bottom-0 right-0 w-3 h-3 ${statusColor} rounded-full border-2 border-slate-800`} />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">
                    {note.user?.full_name || 'Unknown User'}
                  </div>
                  <div className="text-slate-500 text-xs flex items-center gap-2">
                    <span>
                      {new Date(note.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                    {wasEdited && (
                      <span className="text-slate-600">
                        • Edited {editedTime}
                      </span>
                    )}
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
              className="text-slate-200 text-base leading-relaxed whitespace-pre-wrap mb-3"
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

            {/* Attachments */}
            {note.attachments && note.attachments.length > 0 && (
              <div className="mt-3 mb-3">
                <div className="flex flex-wrap gap-2">
                  {note.attachments.map((file, index) => (
                    <div key={index} className="relative group">
                      {file.type?.startsWith('image/') ? (
                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={file.url}
                            alt={file.name}
                            className="max-w-xs max-h-48 rounded-lg border border-slate-600 hover:border-purple-500 transition-all cursor-pointer object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-all" />
                        </a>
                      ) : (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-purple-500 rounded-lg px-3 py-2 transition-all group"
                        >
                          <svg className="w-5 h-5 text-slate-400 group-hover:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm text-slate-300 group-hover:text-white font-medium">{file.name}</span>
                          <span className="text-xs text-slate-500">
                            {file.size ? `(${(file.size / 1024).toFixed(1)}KB)` : ''}
                          </span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
                  // Always reply to the top-level parent (not nested)
                  const topParent = isReply ? { ...note, id: note.parent_id || note.id } : note;
                  setReplyingTo(topParent);
                  setNewNote(`@${note.user?.full_name} `);
                }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-purple-400 text-xs font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Reply
              </button>

              {/* Read receipts */}
              {viewCount > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-slate-500 text-xs" title={views.map(v => v.full_name).join(', ')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Seen by {viewCount}
                </div>
              )}
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
    <div className="flex flex-col w-full max-w-[750px] h-[650px]">
      {/* Currently Viewing Indicator */}
      {onlineUsers.length > 0 && (
        <div className="mb-4 px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            <span className="text-slate-400">
              Currently viewing: {' '}
              {onlineUsers
                .filter(u => u.user_id !== currentUserId)
                .map((u, i, arr) => (
                  <span key={u.user_id} className="text-white font-medium">
                    {u.users?.full_name}
                    {i < arr.length - 1 ? ', ' : ''}
                  </span>
                )) ||
                <span className="text-slate-500">Just you</span>
              }
            </span>
          </div>
        </div>
      )}

      {/* Notes List - Scrollable at TOP */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-2 mb-6" style={{ maxHeight: '65%' }}>
        {notes.length === 0 ? (
          <div className="text-center py-24 bg-slate-800/30 border border-slate-700/50 rounded-xl">
            <svg className="w-20 h-20 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-slate-400 text-lg font-medium">No notes yet</p>
            <p className="text-slate-500 text-base mt-2">Start the conversation below</p>
          </div>
        ) : (
          notes.map(note => renderNote(note))
        )}
      </div>

      {/* Reply indicator - Shows above input */}
      {replyingTo && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="text-blue-400 text-base font-medium">
              Replying to {replyingTo.user?.full_name}
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-blue-400 hover:text-blue-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* New Note Input - FIXED at BOTTOM */}
      <form onSubmit={handleSubmit} className="relative bg-slate-800/30 border-t-2 border-slate-700 pt-4">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center font-bold text-white shadow-lg flex-shrink-0 text-base">
            {getInitials(currentUserName)}
          </div>
          <div className="flex-1 relative">
            <textarea
              value={newNote}
              onChange={handleNoteChange}
              placeholder="Write a note and mention others with @"
              rows={4}
              className="w-full bg-slate-800/80 border-2 border-slate-600 rounded-xl px-5 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 resize-none text-base leading-relaxed"
            />

            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute z-10 bottom-full mb-2 bg-slate-700 border border-slate-600 rounded-lg shadow-2xl max-h-48 overflow-y-auto w-72">
                {filteredMembers.map((member) => (
                  <button
                    key={member.users.id}
                    type="button"
                    onClick={() => insertMention(member.users)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-600 text-white text-sm flex items-center gap-3 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-semibold text-sm">
                      {getInitials(member.users.full_name)}
                    </div>
                    <div className="font-medium">{member.users.full_name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="mt-3 ml-16 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div key={index} className="relative group bg-slate-700 rounded-lg p-2 flex items-center gap-2 pr-8">
                {file.type.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 bg-slate-600 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <span className="text-xs text-slate-300 max-w-[100px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-3 ml-16">
          <div className="flex items-center gap-3">
            <input
              type="file"
              id="file-upload"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label
              htmlFor="file-upload"
              className={`flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {uploading ? 'Uploading...' : 'Attach Files'}
            </label>
          </div>
          <button
            type="submit"
            disabled={(!newNote.trim() && attachments.length === 0) || uploading}
            className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-2.5 rounded-lg text-base font-semibold transition-colors shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {replyingTo ? 'Post Reply' : 'Post Note'}
          </button>
        </div>
      </form>
    </div>
  );
}
