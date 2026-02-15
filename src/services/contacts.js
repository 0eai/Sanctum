// src/services/contacts.js
import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { db, appId } from '../lib/firebase';
import { encryptData, decryptData } from '../lib/crypto';

export const listenToContacts = (uid, cryptoKey, callback) => {
    const q = query(collection(db, 'artifacts', appId, 'users', uid, 'contacts'));
    
    return onSnapshot(q, async (snapshot) => {
        const data = await Promise.all(snapshot.docs.map(async d => {
            const raw = d.data();
            const decrypted = await decryptData(raw, cryptoKey);
            return { id: d.id, ...raw, ...decrypted };
        }));
        
        data.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
        callback(data);
    });
};

export const saveContact = async (uid, cryptoKey, contactData) => {
    const id = contactData.id || doc(collection(db, 'artifacts', appId, 'users', uid, 'contacts')).id;
    
    const payload = { ...contactData };
    delete payload.id;
    
    const now = new Date().toISOString();
    if (!contactData.id) payload.createdAt = now;
    payload.updatedAt = now;

    const encrypted = await encryptData(payload, cryptoKey);
    
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'contacts', id), {
        ...encrypted,
        updatedAt: now,
        createdAt: contactData.id ? contactData.createdAt : now
    });
    
    return id;
};

export const deleteContact = async (uid, id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'contacts', id));
};

// --- Legacy JSON Fallbacks ---
export const exportContacts = async (uid, cryptoKey) => {
    return new Promise((resolve) => listenToContacts(uid, cryptoKey, resolve)());
};

export const importContacts = async (uid, cryptoKey, jsonData) => {
    let count = 0;
    if (!Array.isArray(jsonData)) return count;
    for (const item of jsonData) {
        if (item.firstName || item.lastName || item.company) {
            await saveContact(uid, cryptoKey, { ...item, id: null });
            count++;
        }
    }
    return count;
};


// --- GOOGLE CONTACTS CSV INTEGRATION ---

// Helper: Escape CSV string values
const escapeCSV = (str) => {
    if (str == null) return '';
    const s = String(str);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
};

// Helper: Robust CSV parser to handle quotes and internal commas
const parseCSV = (text) => {
    const lines = [];
    let currentLine = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i+1] === '"') { currentCell += '"'; i++; }
            else if (c === '"') { inQuotes = false; }
            else { currentCell += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ',') { currentLine.push(currentCell); currentCell = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i+1] === '\n') i++; // Handle \r\n
                currentLine.push(currentCell);
                lines.push(currentLine);
                currentLine = []; 
                currentCell = '';
            } else { currentCell += c; }
        }
    }
    if (currentLine.length > 0 || currentCell !== '') {
        currentLine.push(currentCell);
        lines.push(currentLine);
    }
    return lines;
};

export const exportContactsCSV = async (uid, cryptoKey) => {
    const contacts = await exportContacts(uid, cryptoKey);
    
    // Find dynamic maximums for array fields
    let maxP = 1, maxE = 1, maxA = 1, maxW = 1, maxC = 1;
    contacts.forEach(c => {
        if (c.phones?.length > maxP) maxP = c.phones.length;
        if (c.emails?.length > maxE) maxE = c.emails.length;
        if (c.addresses?.length > maxA) maxA = c.addresses.length;
        if (c.websites?.length > maxW) maxW = c.websites.length;
        if (c.customFields?.length > maxC) maxC = c.customFields.length;
    });

    // Build standard Google Contacts Headers
    const headers = ['First Name', 'Last Name', 'Organization Name', 'Organization Title', 'Birthday', 'Notes', 'Labels'];
    for(let i=1; i<=maxP; i++) { headers.push(`Phone ${i} - Label`, `Phone ${i} - Value`); }
    for(let i=1; i<=maxE; i++) { headers.push(`E-mail ${i} - Label`, `E-mail ${i} - Value`); }
    for(let i=1; i<=maxA; i++) { headers.push(`Address ${i} - Label`, `Address ${i} - Formatted`); }
    for(let i=1; i<=maxW; i++) { headers.push(`Website ${i} - Label`, `Website ${i} - Value`); }
    for(let i=1; i<=maxC; i++) { headers.push(`Custom Field ${i} - Label`, `Custom Field ${i} - Value`); }

    const rows = [headers.join(',')];

    contacts.forEach(c => {
        const row = [];
        row.push(escapeCSV(c.firstName));
        row.push(escapeCSV(c.lastName));
        row.push(escapeCSV(c.company));
        row.push(escapeCSV(c.jobTitle));
        row.push(escapeCSV(c.birthday));
        row.push(escapeCSV(c.notes));
        row.push(escapeCSV(c.isFavorite ? '* starred' : '')); // Matches Google's Favorite tag

        for(let i=0; i<maxP; i++) { row.push(escapeCSV(c.phones?.[i]?.label)); row.push(escapeCSV(c.phones?.[i]?.value)); }
        for(let i=0; i<maxE; i++) { row.push(escapeCSV(c.emails?.[i]?.label)); row.push(escapeCSV(c.emails?.[i]?.value)); }
        for(let i=0; i<maxA; i++) { row.push(escapeCSV(c.addresses?.[i]?.label)); row.push(escapeCSV(c.addresses?.[i]?.value)); }
        for(let i=0; i<maxW; i++) { row.push(escapeCSV(c.websites?.[i]?.label)); row.push(escapeCSV(c.websites?.[i]?.value)); }
        for(let i=0; i<maxC; i++) { row.push(escapeCSV(c.customFields?.[i]?.label)); row.push(escapeCSV(c.customFields?.[i]?.value)); }

        rows.push(row.join(','));
    });

    return rows.join('\n');
};

export const importContactsCSV = async (uid, cryptoKey, csvText) => {
    const lines = parseCSV(csvText);
    if (lines.length < 2) return 0;
    
    const headers = lines[0].map(h => h.trim());
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        const contact = {
            firstName: '', lastName: '', company: '', jobTitle: '', birthday: '', notes: '', isFavorite: false,
            phones: [], emails: [], addresses: [], websites: [], customFields: []
        };

        const getVal = (colName) => {
            const idx = headers.indexOf(colName);
            return idx !== -1 ? row[idx] : null;
        };

        // Flat fields
        contact.firstName = getVal('First Name') || '';
        contact.lastName = getVal('Last Name') || '';
        contact.company = getVal('Organization Name') || '';
        contact.jobTitle = getVal('Organization Title') || '';
        contact.birthday = getVal('Birthday') || '';
        contact.notes = getVal('Notes') || '';
        
        const labels = getVal('Labels') || '';
        if (labels.toLowerCase().includes('* starred')) contact.isFavorite = true;

        // Dynamic array fields (scan up to 20 columns)
        for (let j = 1; j <= 20; j++) {
            const pVal = getVal(`Phone ${j} - Value`);
            if (pVal) contact.phones.push({ id: Date.now().toString()+Math.random(), label: getVal(`Phone ${j} - Label`) || 'Mobile', value: pVal });
            
            const eVal = getVal(`E-mail ${j} - Value`);
            if (eVal) contact.emails.push({ id: Date.now().toString()+Math.random(), label: getVal(`E-mail ${j} - Label`) || 'Personal', value: eVal });

            // Google addresses are mapped to 'Formatted' usually, fallback to 'Value'
            const aVal = getVal(`Address ${j} - Formatted`) || getVal(`Address ${j} - Value`);
            if (aVal) contact.addresses.push({ id: Date.now().toString()+Math.random(), label: getVal(`Address ${j} - Label`) || 'Home', value: aVal });

            const wVal = getVal(`Website ${j} - Value`);
            if (wVal) contact.websites.push({ id: Date.now().toString()+Math.random(), label: getVal(`Website ${j} - Label`) || 'Profile', value: wVal });

            const cVal = getVal(`Custom Field ${j} - Value`);
            const cLab = getVal(`Custom Field ${j} - Label`);
            if (cVal || cLab) contact.customFields.push({ id: Date.now().toString()+Math.random(), label: cLab || 'Custom', value: cVal || '' });
        }

        // Only save if it has valid data
        if (contact.firstName || contact.lastName || contact.company || contact.phones.length || contact.emails.length) {
            await saveContact(uid, cryptoKey, contact);
            count++;
        }
    }
    return count;
};