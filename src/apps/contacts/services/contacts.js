// src/services/contacts.js
import { collection, getDocs } from 'firebase/firestore';
import { db, appId } from '../../../lib/firebase';
import { decryptData } from '../../../lib/crypto';
import createEncryptedCRUD from '../../../services/createEncryptedCRUD';

const crud = createEncryptedCRUD('contacts', {
    transformDecrypted: (raw, decrypted) => ({ ...raw, ...decrypted })
});

export const listenToContacts = (uid, cryptoKey, callback) =>
    crud.listen(uid, cryptoKey, (data) => {
        data.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
        callback(data);
    });

export const saveContact = async (uid, cryptoKey, contactData) =>
    crud.save(uid, cryptoKey, contactData);

export const deleteContact = async (uid, id) =>
    crud.remove(uid, id);

export const exportContacts = async (uid, cryptoKey) =>
    crud.exportAll(uid, cryptoKey);

export const importContacts = async (uid, cryptoKey, jsonData) =>
    crud.importAll(uid, cryptoKey, jsonData, null, (item) => {
        if (!(item.firstName || item.lastName || item.company)) return null;
        const { id, ...rest } = item;
        return rest;
    });


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
            if (c === '"' && text[i + 1] === '"') { currentCell += '"'; i++; }
            else if (c === '"') { inQuotes = false; }
            else { currentCell += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ',') { currentLine.push(currentCell); currentCell = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++; // Handle \r\n
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
    for (let i = 1; i <= maxP; i++) { headers.push(`Phone ${i} - Label`, `Phone ${i} - Value`); }
    for (let i = 1; i <= maxE; i++) { headers.push(`E-mail ${i} - Label`, `E-mail ${i} - Value`); }
    for (let i = 1; i <= maxA; i++) { headers.push(`Address ${i} - Label`, `Address ${i} - Formatted`); }
    for (let i = 1; i <= maxW; i++) { headers.push(`Website ${i} - Label`, `Website ${i} - Value`); }
    for (let i = 1; i <= maxC; i++) { headers.push(`Custom Field ${i} - Label`, `Custom Field ${i} - Value`); }

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

        for (let i = 0; i < maxP; i++) { row.push(escapeCSV(c.phones?.[i]?.label)); row.push(escapeCSV(c.phones?.[i]?.value)); }
        for (let i = 0; i < maxE; i++) { row.push(escapeCSV(c.emails?.[i]?.label)); row.push(escapeCSV(c.emails?.[i]?.value)); }
        for (let i = 0; i < maxA; i++) { row.push(escapeCSV(c.addresses?.[i]?.label)); row.push(escapeCSV(c.addresses?.[i]?.value)); }
        for (let i = 0; i < maxW; i++) { row.push(escapeCSV(c.websites?.[i]?.label)); row.push(escapeCSV(c.websites?.[i]?.value)); }
        for (let i = 0; i < maxC; i++) { row.push(escapeCSV(c.customFields?.[i]?.label)); row.push(escapeCSV(c.customFields?.[i]?.value)); }

        rows.push(row.join(','));
    });

    return rows.join('\n');
};

export const importContactsCSV = async (uid, cryptoKey, csvText) => {
    const lines = parseCSV(csvText);
    if (lines.length < 2) return 0;

    const headers = lines[0].map(h => h.trim());
    let count = 0;

    // Fetch existing contacts for deduplication
    const existingColRef = collection(db, 'artifacts', appId, 'users', uid, 'contacts');
    const existingSnap = await getDocs(existingColRef);
    const existingFingerprints = new Set();

    for (const d of existingSnap.docs) {
        try {
            const decrypted = await decryptData(d.data(), cryptoKey);
            if (decrypted) {
                const fingerprint = `${decrypted.firstName || ''}|${decrypted.lastName || ''}|${decrypted.phones?.[0]?.value || ''}`;
                existingFingerprints.add(fingerprint);
            }
        } catch (e) {
            // Ignore decryption errors
        }
    }

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
            if (pVal) contact.phones.push({ id: Date.now().toString() + Math.random(), label: getVal(`Phone ${j} - Label`) || 'Mobile', value: pVal });

            const eVal = getVal(`E-mail ${j} - Value`);
            if (eVal) contact.emails.push({ id: Date.now().toString() + Math.random(), label: getVal(`E-mail ${j} - Label`) || 'Personal', value: eVal });

            // Google addresses are mapped to 'Formatted' usually, fallback to 'Value'
            const aVal = getVal(`Address ${j} - Formatted`) || getVal(`Address ${j} - Value`);
            if (aVal) contact.addresses.push({ id: Date.now().toString() + Math.random(), label: getVal(`Address ${j} - Label`) || 'Home', value: aVal });

            const wVal = getVal(`Website ${j} - Value`);
            if (wVal) contact.websites.push({ id: Date.now().toString() + Math.random(), label: getVal(`Website ${j} - Label`) || 'Profile', value: wVal });

            const cVal = getVal(`Custom Field ${j} - Value`);
            const cLab = getVal(`Custom Field ${j} - Label`);
            if (cVal || cLab) contact.customFields.push({ id: Date.now().toString() + Math.random(), label: cLab || 'Custom', value: cVal || '' });
        }

        // Only save if it has valid data
        if (contact.firstName || contact.lastName || contact.company || contact.phones.length || contact.emails.length) {
            const fingerprint = `${contact.firstName || ''}|${contact.lastName || ''}|${contact.phones?.[0]?.value || ''}`;
            if (!existingFingerprints.has(fingerprint)) {
                existingFingerprints.add(fingerprint);
                await saveContact(uid, cryptoKey, contact);
                count++;
            }
        }
    }
    return count;
};


// --- VCARD (VCF) INTEGRATION ---

export const exportContactsVCF = async (uid, cryptoKey) => {
    const contacts = await exportContacts(uid, cryptoKey);
    const vcards = contacts.map(c => {
        let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
        vcard += `N:${c.lastName || ''};${c.firstName || ''};;;\n`;
        vcard += `FN:${[c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown'}\n`;
        if (c.company) vcard += `ORG:${c.company}\n`;
        if (c.jobTitle) vcard += `TITLE:${c.jobTitle}\n`;
        if (c.birthday) vcard += `BDAY:${c.birthday}\n`;
        if (c.notes) vcard += `NOTE:${c.notes.replace(/\n/g, '\\n')}\n`;
        if (c.photo) vcard += `PHOTO;VALUE=URI:${c.photo}\n`;
        (c.phones || []).forEach(p => { vcard += `TEL;TYPE=${(p.label || 'CELL').toUpperCase()}:${p.value}\n`; });
        (c.emails || []).forEach(e => { vcard += `EMAIL;TYPE=${(e.label || 'HOME').toUpperCase()}:${e.value}\n`; });
        (c.addresses || []).forEach(a => { vcard += `ADR;TYPE=${(a.label || 'HOME').toUpperCase()}:;;${a.value};;;;\n`; });
        (c.websites || []).forEach(w => { vcard += `URL:${w.value}\n`; });
        if (c.labels?.length) vcard += `CATEGORIES:${c.labels.join(',')}\n`;
        vcard += 'END:VCARD';
        return vcard;
    });
    return vcards.join('\n');
};

export const importContactsVCF = async (uid, cryptoKey, vcfText) => {
    const vcards = vcfText.split('END:VCARD').filter(v => v.includes('BEGIN:VCARD'));
    let count = 0;

    // Fetch existing contacts for deduplication
    const existingColRef = collection(db, 'artifacts', appId, 'users', uid, 'contacts');
    const existingSnap = await getDocs(existingColRef);
    const existingFingerprints = new Set();

    for (const d of existingSnap.docs) {
        try {
            const decrypted = await decryptData(d.data(), cryptoKey);
            if (decrypted) {
                const fingerprint = `${decrypted.firstName || ''}|${decrypted.lastName || ''}|${decrypted.phones?.[0]?.value || ''}`;
                existingFingerprints.add(fingerprint);
            }
        } catch (e) {
            // Ignore decryption errors
        }
    }

    for (const raw of vcards) {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const contact = {
            firstName: '', lastName: '', company: '', jobTitle: '', birthday: '', notes: '', isFavorite: false,
            phones: [], emails: [], addresses: [], websites: [], customFields: [], labels: []
        };

        for (const line of lines) {
            const [key, ...valParts] = line.split(':');
            const value = valParts.join(':');
            const keyUpper = key.toUpperCase();

            if (keyUpper.startsWith('N')) {
                const parts = value.split(';');
                contact.lastName = parts[0] || '';
                contact.firstName = parts[1] || '';
            } else if (keyUpper.startsWith('ORG')) {
                contact.company = value;
            } else if (keyUpper.startsWith('TITLE')) {
                contact.jobTitle = value;
            } else if (keyUpper.startsWith('BDAY')) {
                contact.birthday = value;
            } else if (keyUpper.startsWith('NOTE')) {
                contact.notes = value.replace(/\\n/g, '\n');
            } else if (keyUpper.startsWith('TEL')) {
                const label = (key.match(/TYPE=([^;:]+)/i) || ['', 'Mobile'])[1];
                contact.phones.push({ id: Date.now().toString() + Math.random(), label, value });
            } else if (keyUpper.startsWith('EMAIL')) {
                const label = (key.match(/TYPE=([^;:]+)/i) || ['', 'Personal'])[1];
                contact.emails.push({ id: Date.now().toString() + Math.random(), label, value });
            } else if (keyUpper.startsWith('ADR')) {
                const label = (key.match(/TYPE=([^;:]+)/i) || ['', 'Home'])[1];
                const addr = value.split(';').filter(Boolean).join(', ');
                if (addr) contact.addresses.push({ id: Date.now().toString() + Math.random(), label, value: addr });
            } else if (keyUpper.startsWith('URL')) {
                contact.websites.push({ id: Date.now().toString() + Math.random(), label: 'Website', value });
            } else if (keyUpper.startsWith('CATEGORIES')) {
                contact.labels = value.split(',').map(l => l.trim()).filter(Boolean);
            }
        }

        if (contact.firstName || contact.lastName || contact.company || contact.phones.length || contact.emails.length) {
            const fingerprint = `${contact.firstName || ''}|${contact.lastName || ''}|${contact.phones?.[0]?.value || ''}`;
            if (!existingFingerprints.has(fingerprint)) {
                existingFingerprints.add(fingerprint);
                await saveContact(uid, cryptoKey, contact);
                count++;
            }
        }
    }
    return count;
};