// src/apps/counter/components/EntryModal.jsx 
import React, { useState, useEffect } from 'react';
import { MapPin, Tag, StickyNote } from 'lucide-react';
import { Modal, Button } from '../../../components/ui';
import { toDatetimeLocal } from '../../../lib/dateUtils';

const EntryModal = ({ isOpen, onClose, onSave, editingEntry, mode, useTags, useNotes }) => {
  const [location, setLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (isOpen && !editingEntry) {
      setLocation(null);
      setIsLocating(true);
      if (!navigator.geolocation) { setIsLocating(false); return; }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
            if (res.ok) {
                const data = await res.json();
                console.log(data);
                const locality = data.locality || '';
                const city = data.city || data.locality || '';
                const region = data.principalSubdivision || '';
                const country = data.countryName || '';
                if(locality && city && country && region) address = `${locality}, ${city}, ${region}, ${country}`;
                else if (city && country && region) address = `${city}, ${region}, ${country}`;
                else if (city && country) address = `${city}, ${country}`;
                else if (city && region) address = `${city}, ${region}`;
                else if (region && country) address = `${region}, ${country}`;
                else if (country) address = country;
                else if (locality) address = locality;
              }
            } catch (e) { console.warn("Geocoding failed", e); }
          setLocation({ lat: latitude, lng: longitude, address });
          setIsLocating(false);
        },
        () => setIsLocating(false),
        { timeout: 10000 }
      );
    }
  }, [isOpen, editingEntry]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        tags: formData.get('tags'),
        note: formData.get('note'),
    };
    onSave(data, location); // Pass location up
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingEntry ? 'Edit Entry' : (mode === 'range' ? 'Log Duration' : 'Log Date')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
           <label className="text-sm font-medium text-gray-700">{mode === 'range' ? 'Start Time' : 'Date & Time'}</label>
           <input name="startDate" type="datetime-local" defaultValue={toDatetimeLocal(editingEntry ? editingEntry.timestamp : Date.now())} className="p-3 border border-gray-300 rounded-lg outline-none w-full" required />
        </div>
        {mode === 'range' && (
          <div className="flex flex-col gap-1">
             <label className="text-sm font-medium text-gray-700">End Time</label>
             <input name="endDate" type="datetime-local" defaultValue={toDatetimeLocal(editingEntry ? editingEntry.endTimestamp : Date.now() + 3600000)} className="p-3 border border-gray-300 rounded-lg outline-none w-full" required />
          </div>
        )}
        
        {useTags && (
          <div className="flex flex-col gap-1">
             <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Tag size={14} /> Tags</label>
             <input name="tags" placeholder="e.g. gym, cardio" defaultValue={editingEntry?.tags?.join(', ') || ''} className="p-3 border border-gray-300 rounded-lg outline-none w-full" />
          </div>
        )}

        {useNotes && (
          <div className="flex flex-col gap-1">
             <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><StickyNote size={14} /> Note</label>
             <textarea name="note" placeholder="Add a note..." defaultValue={editingEntry?.note || ''} className="p-3 border border-gray-300 rounded-lg outline-none w-full resize-none h-20" />
          </div>
        )}
        
        {!editingEntry && (
          <div className="flex items-center gap-2 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200 mt-2">
            <div className={`p-1.5 rounded-full ${isLocating ? 'bg-yellow-100 text-yellow-600 animate-pulse' : location ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}><MapPin size={16} /></div>
            <div className="flex-1">{isLocating ? 'Locating...' : location ? location.address : 'Location unavailable'}</div>
          </div>
        )}

        <Button type="submit" className="w-full py-3 mt-2">{editingEntry ? 'Save Changes' : 'Add Entry'}</Button>
      </form>
    </Modal>
  );
};

export default EntryModal;