// src/apps/contacts/components/ContactEditor.jsx
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Check, User, Phone, Mail, MapPin, Briefcase, Calendar, StickyNote, Globe, Hash, Plus, X, Tag } from 'lucide-react';

// 1. MOVED OUTSIDE: This prevents React from unmounting/remounting the inputs on every keystroke
const DynamicFieldList = ({ data, update, fieldKey, icon: Icon, defaultLabel, labelOptions, type = "text", placeholder }) => {
    const items = data[fieldKey] || [];

    const addItem = () => {
        update({ [fieldKey]: [...items, { id: Date.now().toString() + Math.random(), label: defaultLabel, value: '' }] });
    };

    const updateItem = (id, key, val) => {
        update({ [fieldKey]: items.map(item => item.id === id ? { ...item, [key]: val } : item) });
    };

    const removeItem = (id) => {
        update({ [fieldKey]: items.filter(item => item.id !== id) });
    };

    return (
        <div className="flex flex-col gap-2 border-b border-gray-100 pb-4">
            {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-3">
                    <div className="text-gray-400 w-6 flex justify-center flex-shrink-0">
                        {index === 0 ? <Icon size={20} /> : null}
                    </div>
                    
                    {labelOptions ? (
                        <select 
                            value={item.label} 
                            onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-md px-2 py-1.5 outline-none w-24 flex-shrink-0"
                        >
                            {labelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    ) : (
                        <input 
                            value={item.label}
                            onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                            placeholder="Label"
                            className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-md px-2 py-1.5 outline-none w-24 flex-shrink-0 placeholder-gray-400"
                        />
                    )}

                    <input 
                        type={type}
                        value={item.value}
                        onChange={(e) => updateItem(item.id, 'value', e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-300 py-1.5 min-w-0"
                    />
                    
                    <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0">
                        <X size={16} />
                    </button>
                </div>
            ))}
            <div className="flex items-center gap-3 mt-1">
                <div className="w-6 flex-shrink-0" />
                <button onClick={addItem} className="text-xs font-bold text-[#4285f4] flex items-center gap-1 hover:underline">
                    <Plus size={14} /> Add {fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).slice(0, -1)}
                </button>
            </div>
        </div>
    );
};


const ContactEditor = ({ contact, allLabels = [], onSave, onBack }) => {
  const [data, setData] = useState({
    firstName: '', lastName: '', company: '', jobTitle: '', birthday: '', notes: '', isFavorite: false,
    phones: [], emails: [], addresses: [], websites: [], customFields: []
  });

  const [imgError, setImgError] = useState(false);

  const availableLabels = allLabels.filter(label => !(data.labels || []).includes(label));

  useEffect(() => {
      if (contact) {
          // Helper to split ":::" strings into proper separate fields
          const parseField = (arrayData, stringData, defaultLabel, idPrefix) => {
              let itemsToProcess = [];
              if (arrayData && arrayData.length > 0) itemsToProcess = arrayData;
              else if (stringData) itemsToProcess = [{ label: defaultLabel, value: stringData }];

              return itemsToProcess.flatMap((item, index) => {
                  if (item.value && String(item.value).includes(':::')) {
                      return String(item.value).split(':::').map((val, splitIndex) => ({
                          id: Date.now().toString() + idPrefix + index + '-' + splitIndex,
                          label: item.label || defaultLabel,
                          value: val.trim()
                      }));
                  }
                  return [{
                      ...item,
                      id: item.id || Date.now().toString() + idPrefix + index
                  }];
              });
          };

          setData({
              ...contact,
              phones: parseField(contact.phones, contact.phone, 'Mobile', 'p'),
              emails: parseField(contact.emails, contact.email, 'Personal', 'e'),
              addresses: parseField(contact.addresses, contact.address, 'Home', 'a'),
              websites: contact.websites || [],
              customFields: contact.customFields || [],
              labels: contact.labels || [],
          });
      } else {
          setData({
              firstName: '', lastName: '', company: '', jobTitle: '', birthday: '', notes: '', isFavorite: false,
              phones: [{ id: Date.now().toString(), label: 'Mobile', value: '' }],
              emails: [], addresses: [], websites: [], customFields: [], labels: [],
          });
      }
  }, [contact]);

  const update = (patch) => setData(prev => ({ ...prev, ...patch }));

  const handleSave = () => {
    if (!data.firstName && !data.lastName && !data.company) return;
    
    const cleanData = { ...data };
    cleanData.phones = (data.phones || []).filter(p => p.value?.trim());
    cleanData.emails = (data.emails || []).filter(e => e.value?.trim());
    cleanData.addresses = (data.addresses || []).filter(a => a.value?.trim());
    cleanData.websites = (data.websites || []).filter(w => w.value?.trim());
    cleanData.customFields = (data.customFields || []).filter(c => c.value?.trim() || c.label?.trim());

    onSave(cleanData);
  };

  const handleAddLabel = (e) => {
      if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const newLabel = e.target.value.trim();
          if (newLabel && !(data.labels || []).includes(newLabel)) {
              update({ labels: [...(data.labels || []), newLabel] });
          }
          e.target.value = ''; // Clear the input after adding
      }
  };

  const removeLabel = (labelToRemove) => {
      update({ labels: (data.labels || []).filter(l => l !== labelToRemove) });
  };

  const photoUrl = data.photo || data.customFields?.find(c => c.label?.toLowerCase() === 'photo')?.value;
  return (
    <div className="flex flex-col h-[100dvh] bg-white">
      <div className="border-b border-gray-100 flex-none z-20">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
              <h1 className="text-xl font-bold">{contact ? 'Edit Contact' : 'Create Contact'}</h1>
          </div>
          <button 
              onClick={handleSave}
              disabled={!data.firstName && !data.lastName && !data.company}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${data.firstName || data.lastName || data.company ? 'bg-[#4285f4] text-white shadow-md hover:shadow-lg' : 'bg-gray-100 text-gray-300'}`}
          >
              <Check size={16} /> Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div className="flex items-center gap-4 mb-4">
                <div className="w-20 h-20 bg-blue-100 text-[#4285f4] rounded-full flex items-center justify-center text-3xl font-bold flex-shrink-0 overflow-hidden">
                    {photoUrl && !imgError ? (
                        <img 
                            src={photoUrl} 
                            alt="Avatar" 
                            className="w-full h-full object-cover" 
                            onError={() => setImgError(true)} // Falls back to icon if 404
                        />
                    ) : (
                        data.firstName ? data.firstName.charAt(0).toUpperCase() : <User size={32} />
                    )}
                </div>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <input value={data.firstName} onChange={(e) => update({ firstName: e.target.value })} placeholder="First name" className="text-xl font-bold bg-transparent outline-none border-b border-transparent focus:border-blue-500 transition-colors py-1 w-full" autoFocus />
                    <input value={data.lastName} onChange={(e) => update({ lastName: e.target.value })} placeholder="Last name" className="text-xl font-bold bg-transparent outline-none border-b border-transparent focus:border-blue-500 transition-colors py-1 w-full" />
                </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                    <div className="text-gray-400 w-6 flex justify-center"><Briefcase size={20} /></div>
                    <input value={data.company} onChange={(e) => update({ company: e.target.value })} placeholder="Company" className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 py-2" />
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-6 flex justify-center" />
                    <input value={data.jobTitle} onChange={(e) => update({ jobTitle: e.target.value })} placeholder="Job Title" className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 py-2" />
                </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-start gap-3">
                    <div className="text-gray-400 w-6 flex justify-center mt-1"><Tag size={20} /></div>
                    <div className="flex-1 flex flex-col gap-2">
                        
                        {/* Selected Labels & Input */}
                        <div className="flex flex-wrap items-center gap-2 bg-transparent outline-none">
                            {(data.labels || []).map(label => (
                                <span key={label} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200">
                                    {label}
                                    <button onClick={() => removeLabel(label)} className="text-gray-400 hover:text-red-500 ml-1">
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                            <input 
                                type="text" 
                                list="label-suggestions"
                                placeholder={data.labels?.length ? "Add another..." : "Add labels (press Enter)"}
                                onKeyDown={handleAddLabel}
                                onChange={(e) => {
                                    // If user clicks a suggestion from the datalist dropdown, auto-add it instantly
                                    const val = e.target.value;
                                    if (availableLabels.includes(val)) {
                                        update({ labels: [...(data.labels || []), val] });
                                        e.target.value = '';
                                    }
                                }}
                                className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400 py-1"
                            />
                            {/* Datalist for native typing autocomplete */}
                            <datalist id="label-suggestions">
                                {availableLabels.map(label => (
                                    <option key={label} value={label} />
                                ))}
                            </datalist>
                        </div>

                        {/* Quick-add chips below the input */}
                        {availableLabels.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400 font-medium">Suggestions:</span>
                                {availableLabels.map(label => (
                                    <button 
                                        key={label}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            update({ labels: [...(data.labels || []), label] });
                                        }}
                                        className="text-xs text-[#4285f4] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 font-medium border border-blue-100/50"
                                    >
                                        <Plus size={12} /> {label}
                                    </button>
                                ))}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 mt-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contact Info</h3>
                {/* 2. ADDED PROPS: Passing `data` and `update` to the child component down here */}
                <DynamicFieldList data={data} update={update} fieldKey="phones" icon={Phone} defaultLabel="Mobile" type="tel" placeholder="Phone number" labelOptions={['Mobile', 'Work', 'Home', 'Main', 'Work Fax', 'Home Fax', 'Other']} />
                <DynamicFieldList data={data} update={update} fieldKey="emails" icon={Mail} defaultLabel="Personal" type="email" placeholder="Email address" labelOptions={['Personal', 'Work', 'Other']} />
                <DynamicFieldList data={data} update={update} fieldKey="addresses" icon={MapPin} defaultLabel="Home" placeholder="Street address" labelOptions={['Home', 'Work', 'Other']} />
                <DynamicFieldList data={data} update={update} fieldKey="websites" icon={Globe} defaultLabel="Profile" type="url" placeholder="https://" labelOptions={['Profile', 'Blog', 'Work', 'Portfolio', 'Other']} />
            </div>

            <div className="flex flex-col gap-4 mt-2 pb-32">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Additional Details</h3>
                
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                  <div className="text-gray-400 w-6 flex justify-center"><Calendar size={20} /></div>
                  <input type="date" value={data.birthday} onChange={(e) => update({ birthday: e.target.value })} className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 py-2" />
                </div>

                <DynamicFieldList data={data} update={update} fieldKey="customFields" icon={Hash} defaultLabel="Custom" placeholder="Value" />

                <div className="flex items-start gap-3 pt-2">
                    <div className="text-gray-400 w-6 flex justify-center mt-2"><StickyNote size={20} /></div>
                    <textarea 
                        value={data.notes}
                        onChange={(e) => update({ notes: e.target.value })}
                        placeholder="Notes"
                        className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 py-2 min-h-[100px] resize-none"
                    />
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default ContactEditor;