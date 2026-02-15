// src/apps/contacts/Contacts.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Search, Plus, X, Star, Settings, User, Users, Tag } from 'lucide-react'; // Added Tag

import { Modal, Button, LoadingSpinner } from '../../components/ui';
import Fab from '../../components/ui/Fab';
import ImportExportModal from '../../components/ui/ImportExportModal';

import { 
    listenToContacts, saveContact, deleteContact, 
    exportContactsCSV, importContactsCSV, importContacts 
} from '../../services/contacts';

import ContactEditor from './components/ContactEditor';
import ContactDetail from './components/ContactDetail';

const TABS = [
    { id: 'all', label: 'All Contacts', icon: Users },
    { id: 'favorites', label: 'Favorites', icon: Star }
];

const ContactsApp = ({ user, cryptoKey, onExit, route, navigate }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [processing, setProcessing] = useState(false);

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const MIN_SWIPE_DISTANCE = 50;

  // --- URL-Driven State ---
  const view = route.resource === 'edit' ? 'editor' : route.resource === 'view' ? 'detail' : 'list';
  const isSettingsOpen = route.query?.modal === 'settings';
  
  // 1. Determine active tab (can be 'all', 'favorites', or a dynamically extracted label name)
  let activeTab = 'all';
  if (route.resource === 'label' && route.resourceId) {
      activeTab = decodeURIComponent(route.resourceId);
  } else if (['favorites', 'all'].includes(route.resource)) {
      activeTab = route.resource;
  }
  
  const currentBasePath = route.resource === 'label' ? `#contacts/label/${encodeURIComponent(activeTab)}` : `#contacts/${activeTab}`;
  
  const selectedContactId = route.resourceId !== 'new' ? route.resourceId : null;
  const selectedContact = selectedContactId ? contacts.find(c => c.id === selectedContactId) : null;
  const editingData = view === 'editor' && selectedContactId ? selectedContact : null;

  useEffect(() => {
    if (!user || !cryptoKey) return;
    const unsub = listenToContacts(user.uid, cryptoKey, (data) => {
        setContacts(data);
        setLoading(false);
    });
    return () => unsub();
  }, [user, cryptoKey]);

  useEffect(() => {
      // Safely scroll to whichever tab is active (system or label)
      const safeId = activeTab.replace(/[^a-zA-Z0-9-_\s]/g, '');
      const tabEl = document.getElementById(`tab-${safeId}`);
      if(tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  // 2. Extract all unique labels from contacts to generate the label tabs
  const allLabels = useMemo(() => {
      const labels = new Set();
      contacts.forEach(c => {
          if (c.labels) c.labels.forEach(l => labels.add(l));
      });
      return Array.from(labels).sort();
  }, [contacts]);

  const groupedContacts = useMemo(() => {
      let filtered = contacts;
      
      if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = contacts.filter(c => 
              (c.firstName?.toLowerCase().includes(q)) || 
              (c.lastName?.toLowerCase().includes(q)) ||
              (c.company?.toLowerCase().includes(q)) ||
              (c.phone?.includes(q)) || (c.phones?.some(p => p.value.includes(q))) ||
              (c.email?.toLowerCase().includes(q)) || (c.emails?.some(e => e.value.toLowerCase().includes(q)))
          );
      } else {
          // 3. Apply filtering based on the currently selected tab
          if (activeTab === 'favorites') {
              filtered = contacts.filter(c => c.isFavorite);
          } else if (activeTab !== 'all') {
              filtered = contacts.filter(c => c.labels && c.labels.includes(activeTab));
          }
      }

      const groups = {};
      filtered.forEach(contact => {
          const nameToUse = contact.firstName || contact.lastName || contact.company || '#';
          let firstLetter = nameToUse.charAt(0).toUpperCase();
          if (!/[A-Z]/.test(firstLetter)) firstLetter = '#';
          
          if (!groups[firstLetter]) groups[firstLetter] = [];
          groups[firstLetter].push(contact);
      });

      return Object.keys(groups).sort().map(letter => ({
          letter,
          items: groups[letter]
      }));
  }, [contacts, searchQuery, activeTab]);

  const handleSave = async (data) => {
      try {
          const savedId = await saveContact(user.uid, cryptoKey, data);
          navigate(`#contacts/view/${savedId}`);
      } catch (error) {
          console.error("Failed to save contact:", error);
          alert("Failed to save contact. Please try again.");
      }
  };

  const handleDelete = async () => {
      if (!deleteConfirm) return;
      await deleteContact(user.uid, deleteConfirm.id);
      setDeleteConfirm(null);
      navigate(currentBasePath); 
  };

  const handleToggleFavorite = async (contact) => {
      await saveContact(user.uid, cryptoKey, { ...contact, isFavorite: !contact.isFavorite });
  };

  // 4. Update swipe logic to combine both standard tabs and dynamic label tabs
  const onTouchStart = (e) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
      if (!touchStart || !touchEnd || view !== 'list') return;
      const distance = touchStart - touchEnd;
      
      const combinedTabs = [
          ...TABS.map(t => ({ id: t.id, path: `#contacts/${t.id}` })),
          ...allLabels.map(l => ({ id: l, path: `#contacts/label/${encodeURIComponent(l)}` }))
      ];
      
      const currentIndex = combinedTabs.findIndex(t => t.id === activeTab);
      if (currentIndex === -1) return;
      
      if (distance > MIN_SWIPE_DISTANCE && currentIndex < combinedTabs.length - 1) {
          navigate(combinedTabs[currentIndex + 1].path);
      } else if (distance < -MIN_SWIPE_DISTANCE && currentIndex > 0) {
          navigate(combinedTabs[currentIndex - 1].path);
      }
  };

  const handleExport = async () => {
    setProcessing(true);
    try {
      const csvText = await exportContactsCSV(user.uid, cryptoKey);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `google_contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert("Export failed."); }
    setProcessing(false);
    navigate(currentBasePath);
  };

  const handleImport = async (file) => {
    if (!file) return;
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        let count = 0;
        if (file.name.toLowerCase().endsWith('.csv')) {
            count = await importContactsCSV(user.uid, cryptoKey, text);
        } else {
            const json = JSON.parse(text);
            count = await importContacts(user.uid, cryptoKey, json);
        }
        alert(`Imported ${count} contacts.`);
        navigate(currentBasePath);
      } catch (e) { alert("Import failed."); }
      setProcessing(false);
    };
    reader.readAsText(file);
  };

  if (view === 'detail' && selectedContact) {
      return (
          <>
              <ContactDetail 
                  contact={selectedContact} 
                  onBack={() => navigate(currentBasePath)}
                  onEdit={(c) => navigate(`#contacts/edit/${c.id}`)}
                  onDelete={(c) => setDeleteConfirm(c)}
                  onToggleFavorite={handleToggleFavorite}
              />
              
              {/* Added the Modal here so it correctly overlays the Detail view */}
              <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Contact" zIndex={100}>
                  <div className="flex flex-col gap-4">
                      <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this contact?</div>
                      <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                          <Button variant="danger" onClick={handleDelete}>Delete</Button>
                      </div>
                  </div>
              </Modal>
          </>
      );
  }

  if (view === 'editor') {
      return <ContactEditor 
          contact={editingData}
          allLabels={allLabels}
          onSave={handleSave}
          onBack={() => editingData ? navigate(`#contacts/view/${editingData.id}`) : navigate(currentBasePath)}
      />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white relative">
      <header className="flex-none bg-[#4285f4] text-white shadow-md z-10 pb-0">
        <div className="max-w-4xl mx-auto px-4 pt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24} /></button>
                    <h1 className="text-xl font-bold flex items-center gap-2">Contacts</h1>
                </div>
                <button onClick={() => navigate(`${currentBasePath}?modal=settings`)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <Settings size={20} />
                </button>
            </div>

            <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                <input 
                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search contacts..." 
                    className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" 
                />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
            </div>

            {/* 5. Render standard tabs AND label tabs inline, exactly like Tasks folders */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0 mt-1">
                {TABS.map(tab => (
                    <button 
                        key={tab.id}
                        id={`tab-${tab.id}`}
                        onClick={() => navigate(`#contacts/${tab.id}`)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                    >
                        <tab.icon size={16} fill={activeTab === tab.id && tab.id === 'favorites' ? "currentColor" : "none"} /> 
                        {tab.label}
                    </button>
                ))}

                {allLabels.length > 0 && (
                    <div className="w-px h-6 bg-blue-400/50 mx-1 flex-shrink-0" />
                )}

                {allLabels.map(label => {
                    // Safe ID for scroll logic stripping out spaces/special chars
                    const safeId = label.replace(/[^a-zA-Z0-9-_\s]/g, '');
                    return (
                        <button
                            key={label}
                            id={`tab-${safeId}`}
                            onClick={() => navigate(`#contacts/label/${encodeURIComponent(label)}`)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === label ? 'bg-white text-[#4285f4]' : 'text-blue-100 hover:bg-white/10'}`}
                        >
                            <Tag size={14} fill={activeTab === label ? "currentColor" : "none"} /> 
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
      </header>

      <main 
        className="flex-1 overflow-y-auto scroll-smooth"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="max-w-3xl mx-auto pb-24">
            {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : contacts.length === 0 ? (
                <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-3">
                    <div className="bg-gray-50 p-4 rounded-full shadow-sm"><User size={32} /></div>
                    <p>No contacts yet.</p>
                </div>
            ) : groupedContacts.length === 0 ? (
                <div className="text-center py-20 text-gray-400">No matching contacts.</div>
            ) : (
                <div className="flex flex-col">
                    {groupedContacts.map((group) => (
                        <div key={group.letter} className="flex flex-col">
                            <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-6 py-2 border-b border-gray-100 z-10 font-bold text-[#4285f4]">
                                {group.letter}
                            </div>
                            <div className="divide-y divide-gray-100">
                                {group.items.map(contact => {
                                    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company;
                                    const initial = name ? name.charAt(0).toUpperCase() : '#';
                                    
                                    const displayPhone = contact.phones?.[0]?.value || contact.phone;
                                    const displayEmail = contact.emails?.[0]?.value || contact.email;

                                    return (
                                        <div 
                                            key={contact.id} 
                                            onClick={() => navigate(`#contacts/view/${contact.id}`)}
                                            className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                                        >
                                            <div className="w-10 h-10 bg-blue-100 text-[#4285f4] rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0">
                                                {initial}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-gray-900 truncate">{name}</h3>
                                                {contact.jobTitle && contact.company ? (
                                                    <p className="text-xs text-gray-500 truncate">{contact.jobTitle}, {contact.company}</p>
                                                ) : (displayPhone || displayEmail) ? (
                                                    <p className="text-xs text-gray-500 truncate">{displayPhone || displayEmail}</p>
                                                ) : null}
                                            </div>
                                            {contact.isFavorite && <Star size={16} fill="currentColor" className="text-yellow-400 flex-shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </main>

      <Fab 
          onClick={() => navigate(`#contacts/edit/new`)} 
          icon={<Plus size={28} />}
          maxWidth="max-w-4xl"
          ariaLabel="Add Contact"
      />

      <ImportExportModal 
          isOpen={isSettingsOpen}
          onClose={() => navigate(currentBasePath)}
          onImport={handleImport}
          onExport={handleExport}
          isImporting={processing}
          title="Manage Contacts"
          accept=".csv,.json"
          importLabel="Import Google CSV (or JSON)"
          exportLabel="Export as Google CSV"
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Contact">
          <div className="flex flex-col gap-4">
              <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">Are you sure you want to delete this contact?</div>
              <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                  <Button variant="danger" onClick={handleDelete}>Delete</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};

export default ContactsApp;