// src/apps/bookmarks/components/AddBookmarkModal.jsx
import React from 'react';
import { Modal, Button, Input } from '../../../components/ui';

const AddBookmarkModal = ({ isOpen, onClose, onSave, editingItem, addType }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    const url = e.target.url?.value;
    onSave(title, url, editingItem ? editingItem.type : addType);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
          editingItem 
          ? (editingItem.type === 'folder' ? "Edit Folder" : "Edit Bookmark") 
          : (addType === 'folder' ? "New Folder" : "New Bookmark")
      }
    >
      <form onSubmit={handleSubmit} key={editingItem ? editingItem.id : 'new'} className="flex flex-col gap-4">
        <Input 
          name="title" 
          label="Title" 
          placeholder={addType === 'folder' ? "e.g. Work" : "Leave empty to use URL"} 
          defaultValue={editingItem?.title || ''}
          autoFocus 
        />
        {((editingItem && editingItem.type === 'bookmark') || (!editingItem && addType === 'bookmark')) && (
          <Input 
              name="url" 
              label="URL" 
              placeholder="https://example.com" 
              type="url" 
              defaultValue={editingItem?.url || ''}
              required 
          />
        )}
        <Button type="submit" className="w-full">
          {editingItem ? 'Update' : (addType === 'folder' ? 'Create Folder' : 'Save Bookmark')}
        </Button>
      </form>
    </Modal>
  );
};

export default AddBookmarkModal;