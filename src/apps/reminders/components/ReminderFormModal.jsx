import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '../../../components/ui';

const ReminderFormModal = ({ isOpen, onClose, onSave, editingItem }) => {
    const [title, setTitle] = useState('');
    const [datetime, setDatetime] = useState('');
    const [repeat, setRepeat] = useState('none');

    // Sync state when modal opens/changes
    useEffect(() => {
        if (isOpen) {
            setTitle(editingItem?.title || '');
            setDatetime(editingItem?.datetime || '');
            setRepeat(editingItem?.repeat || 'none');
        }
    }, [isOpen, editingItem]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ 
            id: editingItem?.id, 
            title: title.trim(), 
            datetime, 
            repeat,
            isActive: editingItem ? editingItem.isActive : true // Default new to active
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editingItem ? 'Edit Reminder' : 'New Reminder'}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input 
                    name="title" 
                    label="Remind me to..." 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="e.g. Call the dentist" 
                    autoFocus 
                    required 
                />
                
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">When</label>
                        <input 
                            type="datetime-local" 
                            value={datetime}
                            onChange={(e) => setDatetime(e.target.value)}
                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]" 
                            required
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">Repeat</label>
                        <select 
                            value={repeat}
                            onChange={(e) => setRepeat(e.target.value)}
                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#4285f4]"
                        >
                            <option value="none">No Repeat</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </div>
                </div>

                <Button type="submit" className="w-full mt-2 bg-[#4285f4] hover:bg-blue-600">
                    Save Reminder
                </Button>
            </form>
        </Modal>
    );
};

export default ReminderFormModal;