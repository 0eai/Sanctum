// src/apps/contacts/components/ContactDetail.jsx
import React, { useState } from 'react';
import { ChevronLeft, Edit2, Trash2, Star, Phone, Mail, MapPin, Briefcase, Calendar, StickyNote, Globe, Hash, Tag } from 'lucide-react';
import { Button } from '../../../components/ui';

const ContactDetail = ({ contact, onBack, onEdit, onDelete, onToggleFavorite }) => {
  const [imgError, setImgError] = useState(false);
  if (!contact) return null;

  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Unnamed Contact';
  const initial = contact.firstName ? contact.firstName.charAt(0).toUpperCase() : (contact.company ? contact.company.charAt(0).toUpperCase() : '#');

  const parseField = (arrayData, stringData, defaultLabel) => {
      let itemsToProcess = [];
      if (arrayData && arrayData.length > 0) itemsToProcess = arrayData;
      else if (stringData) itemsToProcess = [{ label: defaultLabel, value: stringData }];

      return itemsToProcess.flatMap(item => {
          if (item.value && String(item.value).includes(':::')) {
              return String(item.value).split(':::').map(val => ({
                  label: item.label || defaultLabel,
                  value: val.trim()
              }));
          }
          return [item];
      });
  };

  const phones = parseField(contact.phones, contact.phone, 'Mobile');
  const emails = parseField(contact.emails, contact.email, 'Personal');
  const addresses = parseField(contact.addresses, contact.address, 'Home');
  const websites = contact.websites || [];
  const rawCustomFields = contact.customFields || [];
  const photoUrl = contact.photo || rawCustomFields.find(c => c.label?.toLowerCase() === 'photo')?.value;
  
  // Filter out the "Photo" text row so it doesn't show up at the bottom
  const customFields = rawCustomFields.filter(c => c.label?.toLowerCase() !== 'photo');

  const ActionButton = ({ icon: Icon, label, href, onClick }) => {
      if (!href && !onClick) return null;
      const content = (
          <div className="flex flex-col items-center gap-2 group cursor-pointer">
              <div className="w-12 h-12 bg-blue-50 text-[#4285f4] rounded-full flex items-center justify-center group-hover:bg-[#4285f4] group-hover:text-white transition-colors">
                  <Icon size={20} />
              </div>
              <span className="text-xs font-medium text-[#4285f4]">{label}</span>
          </div>
      );
      return href ? <a href={href} target={href.startsWith('http') ? '_blank' : '_self'} rel="noreferrer">{content}</a> : <div onClick={onClick}>{content}</div>;
  };

  const InfoRow = ({ icon: Icon, label, value, href }) => {
      if (!value) return null;
      return (
          <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
              <div className="text-gray-400 flex-shrink-0"><Icon size={24} /></div>
              <div className="flex-1 min-w-0">
                  {href ? <a href={href} target={href.startsWith('http') ? '_blank' : '_self'} className="text-gray-900 font-medium text-base hover:underline break-words block truncate">{value}</a> : <p className="text-gray-900 font-medium text-base break-words">{value}</p>}
                  <p className="text-xs text-gray-500">{label}</p>
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <div className="flex-none z-20">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto w-full">
          <button onClick={onBack} className="p-2 hover:bg-black/5 rounded-full text-gray-600"><ChevronLeft /></button>
          <div className="flex items-center gap-1">
              <button onClick={() => onToggleFavorite(contact)} className={`p-2 rounded-full transition-colors ${contact.isFavorite ? 'text-yellow-500 hover:bg-yellow-50' : 'text-gray-400 hover:bg-black/5'}`}>
                  <Star size={20} fill={contact.isFavorite ? "currentColor" : "none"} />
              </button>
              <button onClick={() => onEdit(contact)} className="p-2 hover:bg-black/5 rounded-full text-gray-600"><Edit2 size={20} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-2xl mx-auto flex flex-col items-center pb-32">
            
            {/* Avatar & Name */}
            <div className="w-28 h-28 bg-gradient-to-br from-blue-400 to-blue-600 text-white rounded-full flex items-center justify-center text-5xl font-bold shadow-md mb-4 mt-2 flex-shrink-0 overflow-hidden border-2 border-gray-50">
                {photoUrl && !imgError ? (
                    <img 
                        src={photoUrl} 
                        alt={fullName} 
                        className="w-full h-full object-cover" 
                        onError={() => setImgError(true)} // Falls back to initial if 404
                    />
                ) : (
                    initial
                )}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 text-center px-4 break-words w-full">{fullName}</h1>
            {contact.jobTitle && <p className="text-gray-500 mt-1 text-center px-4">{contact.jobTitle} {contact.company && `at ${contact.company}`}</p>}
            {!contact.jobTitle && contact.company && <p className="text-gray-500 mt-1 text-center px-4">{contact.company}</p>}
            
            {/* Labels / Tags */}
            {contact.labels && contact.labels.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-3 px-4 w-full">
                    {contact.labels.map(label => (
                        <span key={label} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            <Tag size={12} className="text-gray-400" />
                            {label}
                        </span>
                    ))}
                </div>
            )}

            {/* Quick Actions (Pulls from first available item in arrays) */}
            <div className="flex justify-center gap-6 mt-6 w-full px-4 border-b border-gray-200 pb-6">
                {phones.length > 0 && <ActionButton icon={Phone} label="Call" href={`tel:${phones[0].value}`} />}
                {emails.length > 0 && <ActionButton icon={Mail} label="Email" href={`mailto:${emails[0].value}`} />}
                {addresses.length > 0 && <ActionButton icon={MapPin} label="Map" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0].value)}`} />}
            </div>

            {/* Contact Details Card */}
            <div className="w-full px-4 mt-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    
                    {/* Map through arrays */}
                    {phones.map((p, i) => <InfoRow key={`phone-${i}`} icon={i === 0 ? Phone : () => <div className="w-6"/>} label={p.label || 'Phone'} value={p.value} href={`tel:${p.value}`} />)}
                    {emails.map((e, i) => <InfoRow key={`email-${i}`} icon={i === 0 ? Mail : () => <div className="w-6"/>} label={e.label || 'Email'} value={e.value} href={`mailto:${e.value}`} />)}
                    {addresses.map((a, i) => <InfoRow key={`addr-${i}`} icon={i === 0 ? MapPin : () => <div className="w-6"/>} label={a.label || 'Address'} value={a.value} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.value)}`} />)}
                    {websites.map((w, i) => <InfoRow key={`web-${i}`} icon={i === 0 ? Globe : () => <div className="w-6"/>} label={w.label || 'Website'} value={w.value} href={w.value.startsWith('http') ? w.value : `https://${w.value}`} />)}
                    
                    <InfoRow icon={Calendar} label="Birthday" value={contact.birthday ? new Date(contact.birthday).toLocaleDateString([], { timeZone: 'UTC', month: 'long', day: 'numeric' }) : null} />
                    
                    {customFields.map((c, i) => <InfoRow key={`custom-${i}`} icon={i === 0 ? Hash : () => <div className="w-6"/>} label={c.label || 'Custom'} value={c.value} />)}

                    {contact.notes && (
                        <div className="flex items-start gap-4 p-4">
                            <div className="text-gray-400 mt-0.5 flex-shrink-0"><StickyNote size={24} /></div>
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-900 text-sm whitespace-pre-wrap break-words">{contact.notes}</p>
                                <p className="text-xs text-gray-500 mt-1">Notes</p>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="mt-6 flex justify-center">
                    <Button 
                        variant="outline" // Changed from "danger"
                        onClick={() => onDelete(contact)} 
                        className="bg-white border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 flex items-center justify-center"
                    >
                        <Trash2 size={16} className="mr-2" /> Delete Contact
                    </Button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default ContactDetail;