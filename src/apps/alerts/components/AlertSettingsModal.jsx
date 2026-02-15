import React from 'react';
import { CalendarDays, AlertTriangle, CheckCircle, Plus, Globe, X } from 'lucide-react';
import { Modal, Button, Input } from '../../../components/ui';

const AlertSettingsModal = ({ 
    isOpen, onClose, gcalSignedIn, gcalError, calendarIds, 
    onConnect, onDisconnect, onAddCalendar, onRemoveCalendar 
}) => {
  
  const handleAddSubmit = (e) => {
      e.preventDefault();
      onAddCalendar(e.target.calUrl.value);
      e.target.reset();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Alert Settings">
        <div className="flex flex-col gap-6">
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <div className="flex items-center gap-2 mb-2 text-orange-700 font-bold"><CalendarDays size={18} /> Google Calendar</div>
                {gcalError && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 mb-2"><AlertTriangle size={12} /> {gcalError}</div>}
                
                {!gcalSignedIn ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-orange-600">Connect to sync events.</p>
                        <Button onClick={onConnect} className="bg-orange-500 hover:bg-orange-600 text-white w-full">Connect Google Calendar</Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200">
                            <span className="text-xs font-bold text-orange-800 flex items-center gap-2"><CheckCircle size={12} /> Connected</span>
                            <button onClick={onDisconnect} className="text-xs text-orange-400 hover:text-red-500 underline">Disconnect</button>
                        </div>
                        
                        <div className="border-t border-orange-200 pt-3">
                            <p className="text-xs font-bold text-orange-800 mb-2">Add Public Calendars</p>
                            <form onSubmit={handleAddSubmit} className="flex gap-2 mb-2">
                                <Input name="calUrl" placeholder="Calendar ID or Embed URL" className="bg-white text-xs h-9" />
                                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 h-9 w-9 p-0 flex items-center justify-center"><Plus size={16} /></Button>
                            </form>
                            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                                {calendarIds.map(id => (
                                    <div key={id} className="flex items-center justify-between bg-white p-2 rounded border border-orange-100 text-[10px] text-orange-700">
                                        <span className="truncate flex-1 pr-2"><Globe size={10} className="inline mr-1" /> {id}</span>
                                        <button onClick={() => onRemoveCalendar(id)} className="text-orange-300 hover:text-red-500"><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </Modal>
  );
};

export default AlertSettingsModal;