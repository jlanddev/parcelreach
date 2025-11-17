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

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const fetchNotes = async () => {
    const { data, error } = await supabase
      .from('lead_notes')
      .select(`
        *,
        user:users(full_name, email)
      `)
      .eq('lead_id', leadId)
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
        mentioned_users: mentionedUsers
      }])
      .select();

    if (!error && mentionedUsers.length > 0) {
      // Create notifications
      for (const userId of mentionedUsers) {
        await supabase.from('notifications').insert([{
          user_id: userId,
          type: 'mention',
          title: 'You were mentioned',
          message: `You were mentioned in a note`,
          lead_id: leadId,
          note_id: data[0].id,
          from_user_id: currentUserId
        }]);
      }
    }

    setNewNote('');
    fetchNotes();
  };

  const filteredMembers = teamMembers?.filter(m =>
    m.users.full_name.toLowerCase().includes(mentionSearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      {/* New Note Form */}
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={newNote}
          onChange={handleNoteChange}
          placeholder="Add a note... Type @ to mention a teammate"
          rows={3}
          className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 resize-none"
        />

        {/* @mention dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute z-10 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {filteredMembers.map((member) => (
              <button
                key={member.users.id}
                type="button"
                onClick={() => insertMention(member.users)}
                className="w-full text-left px-4 py-2 hover:bg-slate-700 text-white text-sm"
              >
                {member.users.full_name}
                <span className="text-slate-400 text-xs ml-2">{member.users.email}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="submit"
          className="mt-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-500"
        >
          Add Note
        </button>
      </form>

      {/* Notes List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {notes.map((note) => (
          <div key={note.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white text-sm">
                {note.user?.full_name || 'Unknown User'}
              </span>
              <span className="text-slate-500 text-xs">
                {new Date(note.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-slate-300 text-sm whitespace-pre-wrap">{note.content}</p>
          </div>
        ))}

        {notes.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">No notes yet</p>
        )}
      </div>
    </div>
  );
}
