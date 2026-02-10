import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, doc, deleteDoc 
} from 'firebase/firestore';
import { 
  ChevronLeft, Plus, Search, Key, Copy, Eye, EyeOff, Trash2, 
  Globe, Check, RefreshCw, Shield, Lock, X, User, FileText,
  ChevronDown, ChevronRight, History, Clock, FileUp, Download 
} from 'lucide-react';

import { db, appId } from './firebase'; 
import { Modal, Button, Input, LoadingSpinner } from './components'; 
import { encryptData, decryptData } from './crypto';

// --- HELPERS ---
const generateStrongPassword = (length = 16) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
};

const useClipboard = () => {
  const [copiedId, setCopiedId] = useState(null);
  const copy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  return { copy, copiedId };
};

const formatDate = (isoString) => {
  if (!isoString) return "Unknown date";
  const date = new Date(isoString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  if (diffDays === 1) return "Today";
  if (diffDays === 2) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

// --- SUB-COMPONENTS ---

const PasswordCard = ({ item, onEdit, onDelete, copyUtils, isGrouped = false }) => {
  const { copy, copiedId } = copyUtils;

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onEdit(item); }}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 group active:scale-[0.99] transition-all cursor-pointer hover:border-blue-200 ${isGrouped ? 'ml-8 border-l-4 border-l-blue-100' : ''}`}
    >
      {!isGrouped && (
        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 font-bold text-lg">
          {item.service ? item.service[0].toUpperCase() : <Key size={20} />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isGrouped && <h3 className="font-bold text-gray-800 truncate">{item.service || "Untitled"}</h3>}
        <p className="text-sm font-medium text-gray-700 truncate">{item.username || "No username"}</p>
        <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Clock size={10} /> Updated: {formatDate(item.updatedAt || item.createdAt)}
            </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={(e) => { e.stopPropagation(); copy(item.username, `user-${item.id}`); }}
          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
        >
          {copiedId === `user-${item.id}` ? <Check size={16} className="text-green-500" /> : <User size={16} />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); copy(item.password, `pass-${item.id}`); }}
          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
        >
          {copiedId === `pass-${item.id}` ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
};

const ServiceGroup = ({ serviceName, items, onEdit, onDelete, copyUtils }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="bg-gray-50/80 hover:bg-blue-50/50 rounded-xl border border-gray-200 p-4 flex items-center gap-4 cursor-pointer select-none transition-colors"
            >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0 font-bold text-lg shadow-sm">
                    {serviceName[0].toUpperCase()}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800">{serviceName}</h3>
                    <p className="text-xs text-gray-500">{items.length} accounts</p>
                </div>
                <div className="text-gray-400">
                    {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
            </div>
            
            {isOpen && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                    {items.map(item => (
                        <PasswordCard 
                            key={item.id} 
                            item={item} 
                            onEdit={onEdit} 
                            onDelete={onDelete} 
                            copyUtils={copyUtils} 
                            isGrouped={true}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const PasswordEditor = ({ item, onSave, onClose, onDelete, copyUtils }) => {
  const [data, setData] = useState({ 
    service: '', username: '', password: '', url: '', notes: '', history: [], ...item 
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const saveChanges = (patch) => {
    let newData = { ...data, ...patch };
    
    // If password changed, archive the old one
    if (patch.password && patch.password !== data.password && data.password) {
        const historyEntry = {
            password: data.password,
            date: new Date().toISOString()
        };
        const newHistory = [historyEntry, ...(data.history || [])]; 
        newData = { ...newData, history: newHistory, updatedAt: new Date().toISOString() };
    } 
    else if (!patch.password) {
        newData = { ...newData, updatedAt: new Date().toISOString() };
    }

    setData(newData);
    onSave(newData);
  };

  const handleClose = () => {
      onClose(data);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto w-full h-full flex flex-col bg-white shadow-xl md:my-6 md:rounded-2xl md:h-[calc(100vh-3rem)] overflow-hidden relative z-10">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-none bg-white z-20">
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft /></button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-green-600 uppercase tracking-wider flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                <Shield size={10} /> Encrypted
            </span>
            <button onClick={() => onDelete(data)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full">
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Service</label>
            <input 
              value={data.service}
              onChange={(e) => saveChanges({ service: e.target.value })}
              placeholder="e.g. Google"
              className="text-2xl font-bold bg-transparent outline-none w-full placeholder-gray-300 text-gray-800"
            />
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><User size={12} /> Username</label>
                <div className="flex items-center gap-2">
                    <input 
                        value={data.username}
                        onChange={(e) => saveChanges({ username: e.target.value })}
                        placeholder="username"
                        className="flex-1 bg-transparent outline-none text-sm text-gray-700 font-medium"
                    />
                    <button onClick={() => copyUtils.copy(data.username, 'editor-user')} className="text-gray-400 hover:text-blue-500">
                        {copyUtils.copiedId === 'editor-user' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                </div>
            </div>

            <div className="h-px bg-gray-200 w-full" />

            <div className="flex flex-col gap-1 relative">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2"><Key size={12} /> Password</span>
                    {data.updatedAt && <span className="text-[10px] font-normal text-gray-400">Updated {formatDate(data.updatedAt)}</span>}
                </label>
                <div className="flex items-center gap-2">
                    <input 
                        type={showPassword ? "text" : "password"}
                        value={data.password}
                        onChange={(e) => saveChanges({ password: e.target.value })}
                        placeholder="Required"
                        className={`flex-1 bg-transparent outline-none text-sm text-gray-700 font-medium ${!showPassword ? 'font-mono tracking-widest' : ''}`}
                    />
                    <button onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-blue-500">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button onClick={() => setShowHistory(!showHistory)} className={`text-gray-400 hover:text-blue-500 ${showHistory ? 'text-blue-500' : ''}`} title="History">
                        <History size={16} />
                    </button>
                    <button onClick={() => copyUtils.copy(data.password, 'editor-pass')} className="text-gray-400 hover:text-blue-500">
                        {copyUtils.copiedId === 'editor-pass' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                </div>

                {showHistory && (
                    <div className="mt-4 bg-white rounded-lg border border-gray-200 p-3 animate-in slide-in-from-top-2">
                        <h4 className="text-xs font-bold text-gray-500 mb-2">Previous Passwords</h4>
                        {!data.history || data.history.length === 0 ? (
                            <p className="text-xs text-gray-300 italic">No history available.</p>
                        ) : (
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {data.history.map((h, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <span className="font-mono text-gray-600 bg-gray-50 px-1 rounded">{h.password}</span>
                                        <span className="text-gray-400 text-[10px]">{new Date(h.date).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end pt-2">
                <button 
                    onClick={() => saveChanges({ password: generateStrongPassword() })}
                    className="text-xs flex items-center gap-1 text-blue-500 hover:text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                >
                    <RefreshCw size={10} /> Generate Strong Password
                </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Globe size={12} /> Website URL</label>
            <input 
              value={data.url}
              onChange={(e) => saveChanges({ url: e.target.value })}
              placeholder="https://..."
              className="bg-transparent outline-none text-sm text-blue-500 underline-offset-2"
            />
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><FileText size={12} /> Notes</label>
            <textarea 
              value={data.notes}
              onChange={(e) => saveChanges({ notes: e.target.value })}
              placeholder="Notes..."
              className="w-full h-full min-h-[150px] bg-gray-50 border-none rounded-xl p-4 text-sm text-gray-700 outline-none resize-none"
            />
          </div>

        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---
const PasswordsApp = ({ user, cryptoKey, onExit }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [editorItem, setEditorItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importing, setImporting] = useState(false);
  
  const fileInputRef = useRef(null);
  const copyUtils = useClipboard();

  useEffect(() => {
    if (!user || !cryptoKey) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'passwords'), orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, async (snapshot) => {
      const decrypted = await Promise.all(snapshot.docs.map(async d => {
        const raw = d.data();
        const decryptedData = await decryptData(raw, cryptoKey);
        return { id: d.id, ...decryptedData };
      }));
      setItems(decrypted);
      setLoading(false);
    });
  }, [user, cryptoKey]);

  // --- Grouping Logic ---
  const groupedItems = useMemo(() => {
    let filtered = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = items.filter(i => 
        i.service?.toLowerCase().includes(q) || 
        i.username?.toLowerCase().includes(q)
      );
    }

    const groups = {};
    filtered.forEach(item => {
        const key = (item.service || "Untitled").trim();
        const normalizedKey = key.toLowerCase();
        if (!groups[normalizedKey]) {
            groups[normalizedKey] = { name: key, items: [] };
        }
        groups[normalizedKey].items.push(item);
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchQuery]);

  const handleSave = async (itemData) => {
    try {
      const payload = {
        service: itemData.service || "",
        username: itemData.username || "",
        password: itemData.password || "",
        url: itemData.url || "",
        notes: itemData.notes || "",
        history: itemData.history || [],
        updatedAt: itemData.updatedAt || new Date().toISOString()
      };

      const encrypted = await encryptData(payload, cryptoKey);

      if (itemData.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'passwords', itemData.id), { ...encrypted });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'passwords'), {
          ...encrypted, createdAt: serverTimestamp()
        });
      }
    } catch (e) { console.error("Save failed", e); }
  };

  const handleAddNew = async () => {
    const initialData = { service: '', username: '', password: '', url: '', notes: '', history: [] };
    const encrypted = await encryptData(initialData, cryptoKey);
    const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'passwords'), {
        ...encrypted, createdAt: serverTimestamp()
    });
    setEditorItem({ ...initialData, id: docRef.id });
  };

  const handleCloseEditor = (finalData) => {
      if (finalData && !finalData.service && !finalData.username && !finalData.password && !finalData.notes) {
          deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'passwords', finalData.id));
      }
      setEditorItem(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'passwords', deleteConfirm.id));
      setDeleteConfirm(null);
      if (editorItem?.id === deleteConfirm.id) setEditorItem(null);
    } catch (e) { console.error("Delete failed", e); }
  };

  // --- EXPORT ---
  const handleExport = () => {
    if (items.length === 0) return alert("No passwords to export.");
    const headers = ['name', 'url', 'username', 'password', 'note'];
    const csvRows = [headers.join(',')];

    items.forEach(item => {
      const row = [
        escapeCSV(item.service),
        escapeCSV(item.url),
        escapeCSV(item.username),
        escapeCSV(item.password),
        escapeCSV(item.notes)
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `passwords_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // --- IMPORT ---
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/);
        const dataStart = lines[0].startsWith('name') ? 1 : 0;
        
        let importedCount = 0;
        
        for (let i = dataStart; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple parser for quoted values
            const row = [];
            let inQuote = false;
            let currentToken = '';
            for(let charIndex = 0; charIndex < line.length; charIndex++) {
                const char = line[charIndex];
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    row.push(currentToken);
                    currentToken = '';
                    continue;
                }
                currentToken += char;
            }
            row.push(currentToken);

            const cleanRow = row.map(cell => {
                let val = cell.trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.slice(1, -1).replace(/""/g, '"');
                }
                return val;
            });

            // Map: name, url, username, password, note
            const [name, url, username, password, note] = cleanRow;
            
            if (!name && !username && !password) continue;

            const payload = {
                service: name || "",
                url: url || "",
                username: username || "",
                password: password || "",
                notes: note || "",
                history: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const encrypted = await encryptData(payload, cryptoKey);
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'passwords'), {
                ...encrypted, createdAt: serverTimestamp()
            });
            importedCount++;
        }
        alert(`Successfully imported ${importedCount} passwords.`);
      } catch (err) {
        console.error("Import failed:", err);
        alert("Import failed. Check file format.");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative">
      
      {/* RENDER VIEW: Either Editor or List */}
      {editorItem ? (
        <PasswordEditor 
          item={editorItem}
          onSave={handleSave}
          onClose={handleCloseEditor}
          onDelete={(item) => setDeleteConfirm(item)}
          copyUtils={copyUtils}
        />
      ) : (
        /* LIST VIEW */
        <>
          <header className="flex-none bg-[#4285f4] text-white shadow-md z-10">
            <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={onExit} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <ChevronLeft />
                  </button>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    <Lock size={20} /> Passwords
                  </h1>
                </div>
                
                <div className="flex items-center gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImport} 
                        className="hidden" 
                        accept=".csv"
                    />
                    <button 
                        onClick={() => fileInputRef.current.click()} 
                        disabled={importing}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
                        title="Import CSV"
                    >
                        {importing ? <LoadingSpinner size="sm" color="white" /> : <FileUp size={20} />}
                    </button>
                    <button 
                        onClick={handleExport} 
                        className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
                        title="Export CSV"
                    >
                        <Download size={20} />
                    </button>
                </div>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-blue-200 pointer-events-none" />
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Search logins..." 
                  className="w-full pl-9 pr-4 py-2.5 bg-blue-600/50 text-white placeholder-blue-200 rounded-xl border-none outline-none focus:bg-blue-600 transition-colors text-sm" 
                />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-blue-200 hover:text-white"><X size={16} /></button>}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto scroll-smooth p-4">
            <div className="max-w-3xl mx-auto pb-32 space-y-3">
              {loading && <div className="flex justify-center py-10"><LoadingSpinner /></div>}
              
              {!loading && items.length === 0 && (
                 <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
                   <div className="bg-white p-4 rounded-full shadow-sm"><Shield size={32} className="opacity-50" /></div>
                   <p>No passwords found.</p>
                 </div>
              )}

              {groupedItems.map((group) => {
                 if (group.items.length === 1) {
                     return (
                        <PasswordCard 
                            key={group.items[0].id} 
                            item={group.items[0]} 
                            onEdit={setEditorItem}
                            onDelete={setDeleteConfirm}
                            copyUtils={copyUtils}
                        />
                     );
                 }
                 return (
                     <ServiceGroup 
                        key={group.name} 
                        serviceName={group.name} 
                        items={group.items}
                        onEdit={setEditorItem}
                        onDelete={setDeleteConfirm}
                        copyUtils={copyUtils}
                     />
                 );
              })}
            </div>
          </main>

          <div className="fixed inset-x-0 bottom-6 z-30 pointer-events-none">
              <div className="max-w-3xl mx-auto px-6 flex justify-end gap-3 pointer-events-auto">
                 <button onClick={handleAddNew} className="h-14 w-14 rounded-full bg-[#4285f4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={28} /></button>
              </div>
          </div>
        </>
      )}

      {/* GLOBAL MODAL - Always rendered */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Password" zIndex={100}>
        <div className="flex flex-col gap-4">
          <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm">
            Are you sure you want to delete <b>{deleteConfirm?.service || "this entry"}</b>?
            <span className="block mt-1 text-xs opacity-75">This cannot be undone.</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default PasswordsApp;