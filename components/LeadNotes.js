'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LeadNotes({ leadId, currentUserId, teamMembers }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingNote, setEditingNote] = useState(null);

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('lead_notes')
      .select(`
        *,
        user:users(full_name, email),
        replies:lead_notes!parent_note_id(
          *,
          user:users(full_name, email)
        )
      `)
      .eq('lead_id', leadId)
      .is('parent_note_id', null)
      .order('created_at', { ascending: false });

    if (!error) setNotes(data || []);
  };

  const handleNoteChange = (e) => {
    const value = e.target.value;
    const position = e.target.selectionStart;

    setNewNote(value);
    setCursorPosition(position);

    // Check if @ was typed
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
    const mentionRegex = /@([^\s]+)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionedName = match[1];
      const user = teamMembers?.find(m => m.users.full_name === mentionedName);
      if (user) mentions.push(user.users.id);
    }

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
        content: newNote,
        mentioned_users: mentionedUsers,
        parent_note_id: replyingTo
      }])
      .select();

    if (!error && mentionedUsers.length > 0) {
      // Create notifications via API (sends email automatically)
      for (const userId of mentionedUsers) {
        await fetch('/api/notifications/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            fromUserId: currentUserId,
            type: 'mention',
            title: 'You were mentioned in a note',
            message: 'You were mentioned in a note on a lead',
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

  const filteredMembers = teamMembers?.filter(m =>
    m.users.full_name.toLowerCase().includes(mentionSearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* New Note Form */}
      <form onSubmit={handleSubmit} className="relative">
        {replyingTo && (
          <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-400">Replying to note...</span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-blue-400 hover:text-blue-300"
            >
              ✕
            </button>
          </div>
        )}

        <textarea
          value={newNote}
          onChange={handleNoteChange}
          placeholder="Add a note... Type @ to mention a teammate"
          rows={4}
          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-5 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-none text-base"
        />

        {/* @mention dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute z-10 mt-2 bg-slate-700 border border-slate-600 rounded-xl shadow-2xl max-h-60 overflow-y-auto w-80">
            {filteredMembers.map((member) => (
              <button
                key={member.users.id}
                type="button"
                onClick={() => insertMention(member.users)}
                className="w-full text-left px-4 py-3 hover:bg-slate-600 text-white text-sm flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-semibold">
                  {member.users.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{member.users.full_name}</div>
                  <div className="text-slate-400 text-xs">{member.users.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          type="submit"
          className="mt-3 bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-purple-600/20"
        >
          {replyingTo ? 'Post Reply' : 'Add Note'}
        </button>
      </form>

      {/* Notes List */}
      <div className="space-y-4">
        {notes.map((note) => (
          <div key={note.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg">
                    {note.user?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-base">
                      {note.user?.full_name || 'Unknown User'}
                    </div>
                    <div className="text-slate-400 text-sm">
                      {new Date(note.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>

                {note.user_id === currentUserId && (
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-slate-700 rounded-lg"
                    title="Delete note"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              <p className="text-slate-200 text-base whitespace-pre-wrap leading-relaxed">{note.content}</p>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => setReplyingTo(note.id)}
                  className="text-slate-400 hover:text-purple-400 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reply
                </button>
              </div>

              {/* Replies */}
              {note.replies && note.replies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                  {note.replies.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                        {reply.user?.full_name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white text-sm">{reply.user?.full_name || 'Unknown'}</span>
                          <span className="text-slate-500 text-xs">
                            {new Date(reply.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                          {reply.user_id === currentUserId && (
                            <button
                              onClick={() => handleDelete(reply.id)}
                              className="ml-auto text-slate-500 hover:text-red-400 transition-colors"
                              title="Delete reply"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{reply.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {notes.length === 0 && (
          <div className="text-center py-16 bg-slate-800/50 border border-slate-700 rounded-xl">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-slate-400 text-base font-medium">No notes yet</p>
            <p className="text-slate-500 text-sm mt-1">Start a conversation about this lead</p>
          </div>
        )}
      </div>
    </div>
  );
}
