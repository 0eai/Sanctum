// src/apps/research/components/PaperModals.jsx
import React from 'react';
import { Edit2 } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';
import PromptEditor from '../../../components/ui/PromptEditor';

const PaperModals = ({
    // Delete modal
    isDeleteModalOpen, setIsDeleteModalOpen, handleDelete,
    // AI config modal
    isPromptModalOpen, setIsPromptModalOpen,
    aiService, setAiService, aiModel, setAiModel,
    aiPrompts, selectedPromptId, setSelectedPromptId,
    // Prompt editor
    isEditingPrompt, setIsEditingPrompt,
    handleSavePrompt,
    isSavingPrompt, isPromptSaved
}) => (
    <>
        <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Paper">
            <div className="space-y-4">
                <p className="text-gray-600">
                    Are you sure you want to delete this paper? This will also permanently delete its linked notes, AI reviews, and the uploaded PDF. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-700 text-white"
                    >
                        Delete Paper
                    </Button>
                </div>
            </div>
        </Modal>

        <Modal isOpen={isPromptModalOpen} onClose={() => setIsPromptModalOpen(false)} title="Configure AI Review">
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">AI Service</label>
                    <select
                        value={aiService}
                        onChange={(e) => setAiService(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    >
                        <option value="gemini">Google Gemini</option>
                    </select>
                </div>
                {aiService === 'gemini' && (
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">Model Selection</label>
                        <select
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Coming soon)</option>
                        </select>
                    </div>
                )}
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">AI Prompt</label>
                    <select
                        value={selectedPromptId || ''}
                        onChange={(e) => setSelectedPromptId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm mb-2"
                    >
                        {aiPrompts.map(p => (
                            <option value={p.id} key={p.id}>{p.title || 'Untitled Prompt'}</option>
                        ))}
                    </select>
                    <Button
                        variant="google"
                        onClick={() => setIsEditingPrompt(true)}
                        className="w-full justify-center"
                        disabled={!selectedPromptId}
                    >
                        <Edit2 size={16} className="mr-2" /> Edit Selected Prompt
                    </Button>
                    <p className="text-xs text-gray-500 mt-1">This prompt controls what the AI extracts from the PDF document.</p>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                    <Button variant="ghost" onClick={() => setIsPromptModalOpen(false)}>Close</Button>
                </div>
            </div>
        </Modal>

        {isEditingPrompt && (
            <div className="fixed inset-0 z-[100]">
                <PromptEditor
                    prompt={aiPrompts.find(p => p.id === selectedPromptId) || { title: 'New Prompt', content: '' }}
                    saveStatus={isSavingPrompt ? 'saving' : isPromptSaved ? 'saved' : ''}
                    onSave={handleSavePrompt}
                    onBack={() => setIsEditingPrompt(false)}
                />
            </div>
        )}
    </>
);

export default PaperModals;
