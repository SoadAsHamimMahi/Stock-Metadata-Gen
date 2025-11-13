'use client';

import { useState, useEffect } from 'react';
import { getTemplates, saveTemplate, deleteTemplate, createDefaultTemplates, type Template } from '@/lib/templates';
import type { FormState } from '@/lib/types';

export default function TemplateManager({
  currentForm,
  onApplyTemplate
}: {
  currentForm: FormState;
  onApplyTemplate: (template: FormState) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  useEffect(() => {
    const loaded = getTemplates();
    if (loaded.length === 0) {
      // Create default templates on first load
      createDefaultTemplates();
      setTemplates(getTemplates());
    } else {
      setTemplates(loaded);
    }
  }, []);

  const handleSave = () => {
    if (!templateName.trim()) return;
    
    const newTemplate = saveTemplate({
      name: templateName.trim(),
      description: templateDesc.trim() || undefined,
      formState: currentForm
    });
    
    setTemplates(getTemplates());
    setTemplateName('');
    setTemplateDesc('');
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this template?')) {
      deleteTemplate(id);
      setTemplates(getTemplates());
    }
  };

  const handleApply = (template: Template) => {
    onApplyTemplate(template.formState);
    setShowModal(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm bg-ink/5 hover:bg-ink/10 rounded border border-ink/20"
      >
        Templates
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-paper rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Template Manager</h2>
                <button onClick={() => setShowModal(false)} className="text-ink/60 hover:text-ink">✕</button>
              </div>

              {/* Save Current Settings */}
              <div className="mb-6 p-4 bg-ink/5 rounded border border-ink/20">
                <h3 className="font-medium mb-2">Save Current Settings</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Template name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3 py-2 border border-ink/20 rounded bg-paper"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={templateDesc}
                    onChange={(e) => setTemplateDesc(e.target.value)}
                    className="w-full px-3 py-2 border border-ink/20 rounded bg-paper"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!templateName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save Template
                  </button>
                </div>
              </div>

              {/* Load Templates */}
              <div>
                <h3 className="font-medium mb-3">Saved Templates</h3>
                {templates.length === 0 ? (
                  <p className="text-ink/60">No templates saved yet.</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div key={template.id} className="p-3 bg-ink/5 rounded border border-ink/20 flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">{template.name}</div>
                          {template.description && (
                            <div className="text-sm text-ink/60 mt-1">{template.description}</div>
                          )}
                          <div className="text-xs text-ink/50 mt-1">
                            Platform: {template.formState.platform} | 
                            Title: {template.formState.titleLen} chars | 
                            Keywords: {template.formState.keywordCount}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleApply(template)}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => handleDelete(template.id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

