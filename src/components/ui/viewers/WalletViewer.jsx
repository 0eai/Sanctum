// src/components/ui/viewers/WalletViewer.jsx
import React from 'react';
import { X, Download, CreditCard, Landmark, StickyNote } from 'lucide-react';

const TYPE_META = {
    card: { icon: CreditCard, label: 'Card', bg: 'bg-violet-50', color: 'text-violet-500' },
    account: { icon: Landmark, label: 'Account', bg: 'bg-emerald-50', color: 'text-emerald-500' },
    note: { icon: StickyNote, label: 'Note', bg: 'bg-amber-50', color: 'text-amber-500' },
};

const InfoRow = ({ label, value }) => value ? (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-sm text-gray-800 font-medium text-right max-w-[60%] break-all">{value}</span>
    </div>
) : null;

const WalletViewer = ({ artifact, onClose, onImport, isMe }) => {
    const data = artifact?.data || {};
    const meta = TYPE_META[data.type] || TYPE_META.note;
    const TypeIcon = meta.icon;

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-gray-100 shrink-0">
                    <div className={`p-2 rounded-xl ${meta.bg} ${meta.color} shrink-0`}>
                        <TypeIcon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wallet · {meta.label}</p>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5 break-words">
                            {data.name || data.title || data.cardName || data.accountName || `${meta.label} Entry`}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <InfoRow label="Bank" value={data.bank || data.bankName} />
                        <InfoRow label="Card Number" value={data.cardNumber} />
                        <InfoRow label="Account Number" value={data.accountNumber} />
                        <InfoRow label="Routing Number" value={data.routingNumber} />
                        <InfoRow label="IFSC" value={data.ifsc} />
                        <InfoRow label="Expiry" value={data.expiry} />
                        <InfoRow label="CVV" value={data.cvv} />
                        <InfoRow label="Type" value={data.cardType || data.accountType} />
                    </div>

                    {data.notes && (
                        <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isMe && onImport && (
                    <div className="shrink-0 border-t border-gray-100 p-3">
                        <button onClick={() => { onImport(artifact); onClose(); }} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                            <Download size={14} /> Save to Wallet
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WalletViewer;
