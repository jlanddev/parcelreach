'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LeadNotes({ leadId, currentUserId, teamMembers, teamId }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null);

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    if (!teamId) return;

    const { data, error } = await supabase
      .from('lead_notes')
      .select(`
        *,
        user:users(full_name, email)
      `)
      .eq('lead_id', leadId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (!error) setNotes(data || []);
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

  const handleReply = (note) => {
    setReplyingTo(note);
    const replyText = `Replying to ${note.user?.full_name || 'Unknown'}:\n> ${note.content.split('\n')[0]}...\n\n`;
    setNewNote(replyText);
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
        mentioned_users: mentionedUsers
      }])
      .select();

    if (!error && mentionedUsers.length > 0) {
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

  const renderNoteContent = (content) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('> ')) {
        return (
          <div key={i} className="border-l-4 border-blue-500/50 pl-3 py-1 mb-2 bg-blue-500/5 rounded">
            <p className="text-slate-400 italic text-sm">{line.substring(2)}</p>
          </div>
        );
      }
      if (line.startsWith('Replying to ')) {
        return <p key={i} className="text-blue-400 font-semibold text-sm mb-1">{line}</p>;
      }
      return <p key={i} className="text-slate-200">{line}</p>;
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="relative">
        {replyingTo && (
          <div className="mb-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-400 mb-1">Replying to {replyingTo.user?.full_name}</p>
                <p className="text-sm text-slate-300 line-clamp-2">{replyingTo.content}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setNewNote('');
                }}
                className="text-blue-400 hover:text-blue-300 ml-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <textarea
          value={newNote}
          onChange={handleNoteChange}
          placeholder="Add a note... Type @ to mention a teammate"
          rows={5}
          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-5 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 resize-none text-base"
        />

        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute z-10 mt-2 bg-slate-700 border border-slate-600 rounded-xl shadow-2xl max-h-60 overflow-y-auto w-80">
            {filteredMembers.map((member) => (
              <button
                key={member.users.id}
                type="button"
                onClick={() => insertMention(member.users)}
                className="w-full text-left px-4 py-3 hover:bg-slate-600 text-white text-sm flex items-center gap-3 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-semibold text-sm">
                  {member.users.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{member.users.full_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-3">
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-purple-600/20"
          >
            {replyingTo ? 'Post Reply' : 'Add Note'}
          </button>
          {replyingTo && (
            <button
              type="button"
              onClick={() => {
                setReplyingTo(null);
                setNewNote('');
              }}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-4">
        {notes.map((note) => (
          <div key={note.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg text-lg">
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
                    className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-slate-700/50 rounded-lg"
                    title="Delete note"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="text-base whitespace-pre-wrap leading-relaxed mb-4">
                {renderNoteContent(note.content)}
              </div>

              <div className="flex items-center gap-4 pt-3 border-t border-slate-700/50">
                <button
                  onClick={() => handleReply(note)}
                  className="text-slate-400 hover:text-purple-400 text-sm font-medium flex items-center gap-2 transition-colors hover:bg-slate-700/30 px-3 py-2 rounded-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reply
                </button>
              </div>
            </div>
          </div>
        ))}

        {notes.length === 0 && (
          <div className="text-center py-20 bg-slate-800/50 border border-slate-700 rounded-xl">
            <svg className="w-20 h-20 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-slate-400 text-lg font-medium">No notes yet</p>
            <p className="text-slate-500 text-sm mt-2">Start a conversation about this lead</p>
          </div>
        )}
      </div>
    </div>
  );
}
