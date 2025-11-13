'use client';

import { useState } from 'react';
import type { Row } from '@/lib/csv';

export default function BulkEditor({
  rows,
  onUpdate
}: {
  rows: Row[];
  onUpdate: (updatedRows: Row[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<'prefix' | 'suffix' | 'find_replace' | 'add_keywords' | 'remove_keywords'>('prefix');
  const [value, setValue] = useState('');

  const handleSelectAll = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map(r => r.filename || '')));
    }
  };

  const handleApply = () => {
    const updated = rows.map(row => {
      if (!selectedRows.has(row.filename || '')) return row;
      
      const newRow = { ...row };
      
      switch (operation) {
        case 'prefix':
          if (newRow.title && !newRow.title.startsWith(value)) {
            newRow.title = `${value} ${newRow.title}`;
          }
          break;
        case 'suffix':
          if (newRow.title && !newRow.title.endsWith(value)) {
            newRow.title = `${newRow.title} ${value}`;
          }
          break;
        case 'find_replace':
          const [find, replace] = value.split('|');
          if (find && newRow.title) {
            // Allow empty replace string (to remove text)
            const replaceValue = replace !== undefined ? replace : '';
            newRow.title = newRow.title.replace(new RegExp(find, 'g'), replaceValue);
          }
          break;
        case 'add_keywords':
          const keywordsToAdd = value.split(',').map(k => k.trim()).filter(Boolean);
          const existing = new Set((newRow.keywords || []).map(k => k.toLowerCase()));
          const newKeywords = keywordsToAdd.filter(k => !existing.has(k.toLowerCase()));
          newRow.keywords = [...(newRow.keywords || []), ...newKeywords];
          break;
        case 'remove_keywords':
          const keywordsToRemove = value.split(',').map(k => k.trim().toLowerCase());
          newRow.keywords = (newRow.keywords || []).filter(k => !keywordsToRemove.includes(k.toLowerCase()));
          break;
      }
      
      return newRow;
    });
    
    onUpdate(updated);
    setShowModal(false);
    setValue('');
    setSelectedRows(new Set());
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm bg-ink/5 hover:bg-ink/10 rounded border border-ink/20"
      >
        Bulk Edit
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-paper rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Bulk Edit</h2>
                <button onClick={() => setShowModal(false)} className="text-ink/60 hover:text-ink">✕</button>
              </div>

              {/* Select Rows */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">Select Rows ({selectedRows.size} selected)</label>
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {selectedRows.size === rows.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto border border-ink/20 rounded p-2">
                  {rows.map((row, i) => (
                    <label key={i} className="flex items-center gap-2 p-1 hover:bg-ink/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.filename || '')}
                        onChange={(e) => {
                          const newSet = new Set(selectedRows);
                          if (e.target.checked) {
                            newSet.add(row.filename || '');
                          } else {
                            newSet.delete(row.filename || '');
                          }
                          setSelectedRows(newSet);
                        }}
                      />
                      <span className="text-sm">{row.filename}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Operation Type */}
              <div className="mb-4">
                <label className="block font-medium mb-2">Operation</label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as any)}
                  className="w-full px-3 py-2 border border-ink/20 rounded bg-paper"
                >
                  <option value="prefix">Add Prefix to Title</option>
                  <option value="suffix">Add Suffix to Title</option>
                  <option value="find_replace">Find &amp; Replace in Title</option>
                  <option value="add_keywords">Add Keywords</option>
                  <option value="remove_keywords">Remove Keywords</option>
                </select>
              </div>

              {/* Value Input */}
              <div className="mb-4">
                <label className="block font-medium mb-2">
                  {operation === 'find_replace' ? 'Find | Replace (separate with |)' : 'Value'}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    operation === 'find_replace' ? 'old text | new text' :
                    operation === 'add_keywords' || operation === 'remove_keywords' ? 'keyword1, keyword2, ...' :
                    'Enter value...'
                  }
                  className="w-full px-3 py-2 border border-ink/20 rounded bg-paper"
                />
              </div>

              <button
                onClick={handleApply}
                disabled={selectedRows.size === 0 || !value.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Apply to {selectedRows.size} Row(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

