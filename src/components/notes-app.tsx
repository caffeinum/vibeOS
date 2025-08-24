"use client";

import React, { useState, useEffect } from 'react';
import { GlassEffect } from '@/components/ui/glass-effect';
import { Plus, Trash2, Folder, Search, MoreHorizontal } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  count: number;
}

export const NotesApp: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([
    {
      id: '1',
      title: 'Welcome to Notes',
      content: 'This is your first note. Start writing your thoughts, ideas, and important information here.\n\nYou can create new notes, organize them in folders, and search through your notes easily.',
      folder: 'All Notes',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      title: 'Shopping List',
      content: '- Milk\n- Bread\n- Eggs\n- Bananas\n- Coffee\n- Paper towels',
      folder: 'All Notes',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000)
    },
    {
      id: '3',
      title: 'Meeting Notes',
      content: 'Team Meeting - Q4 Planning\n\nAgenda:\n1. Review Q3 results\n2. Plan Q4 objectives\n3. Budget allocation\n4. Resource planning\n\nAction items:\n- John: Prepare Q3 report\n- Sarah: Create budget proposal\n- Mike: Schedule follow-up meeting',
      folder: 'Work',
      createdAt: new Date(Date.now() - 172800000),
      updatedAt: new Date(Date.now() - 172800000)
    }
  ]);

  const [folders] = useState<Folder[]>([
    { id: 'all', name: 'All Notes', color: '#007AFF', count: 3 },
    { id: 'work', name: 'Work', color: '#FF9500', count: 1 },
    { id: 'personal', name: 'Personal', color: '#34C759', count: 2 },
    { id: 'ideas', name: 'Ideas', color: '#AF52DE', count: 0 }
  ]);

  const [selectedNote, setSelectedNote] = useState<Note | null>(notes[0]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const filteredNotes = notes.filter(note => {
    const matchesFolder = selectedFolder === 'all' || note.folder === folders.find(f => f.id === selectedFolder)?.name;
    const matchesSearch = searchQuery === '' || 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const createNewNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      folder: folders.find(f => f.id === selectedFolder)?.name || 'All Notes',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
    setIsEditing(true);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(notes.map(note => 
      note.id === id 
        ? { ...note, ...updates, updatedAt: new Date() }
        : note
    ));
    if (selectedNote?.id === id) {
      setSelectedNote({ ...selectedNote, ...updates, updatedAt: new Date() });
    }
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(note => note.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(filteredNotes.find(note => note.id !== id) || null);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex bg-white/90 backdrop-blur-sm rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50/80 border-r border-gray-200/50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200/50">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-800">Notes</h1>
            <button
              onClick={createNewNote}
              className="p-2 hover:bg-gray-200/50 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/70 border border-gray-200/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* Folders */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                  selectedFolder === folder.id 
                    ? 'bg-blue-100/50 text-blue-700' 
                    : 'hover:bg-gray-100/50 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-sm"
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="font-medium">{folder.name}</span>
                </div>
                <span className="text-sm text-gray-500">{folder.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Note List */}
      <div className="w-80 bg-white/50 border-r border-gray-200/50 flex flex-col">
        <div className="p-4 border-b border-gray-200/50">
          <h2 className="font-semibold text-gray-800">
            {folders.find(f => f.id === selectedFolder)?.name}
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No notes found</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className={`p-4 border-b border-gray-100/50 cursor-pointer transition-colors ${
                  selectedNote?.id === note.id 
                    ? 'bg-blue-50/50 border-l-4 border-l-blue-500' 
                    : 'hover:bg-gray-50/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 truncate mb-1">
                      {note.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {note.content}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(note.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(note.id);
                    }}
                    className="p-1 hover:bg-red-100/50 rounded opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Note Editor */}
      <div className="flex-1 flex flex-col bg-white/30">
        {selectedNote ? (
          <>
            {/* Editor Header */}
            <div className="p-4 border-b border-gray-200/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => updateNote(selectedNote.id, { title: e.target.value })}
                  className="text-lg font-semibold bg-transparent border-none outline-none text-gray-800 min-w-0 flex-1"
                  placeholder="Note title..."
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {formatDate(selectedNote.updatedAt)}
                </span>
                <button className="p-2 hover:bg-gray-100/50 rounded-lg transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 p-4">
              <textarea
                value={selectedNote.content}
                onChange={(e) => updateNote(selectedNote.id, { content: e.target.value })}
                className="w-full h-full bg-transparent border-none outline-none resize-none text-gray-700 leading-relaxed"
                placeholder="Start writing your note..."
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Note Selected</p>
              <p className="text-sm">Select a note from the list or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
