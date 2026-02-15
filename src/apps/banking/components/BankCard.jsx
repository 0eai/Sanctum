import React, { useState } from 'react';
import { Edit2, Trash2, Eye, Copy } from 'lucide-react';
import { useClipboard } from '../../../hooks/useClipboard';

// --- HELPERS ---
const formatCardNumber = (num) => num ? num.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim() : '';
const getCardBrand = (num) => {
  if (!num) return '';
  if (num.startsWith('4')) return 'Visa';
  if (num.startsWith('5')) return 'Mastercard';
  if (num.startsWith('3')) return 'Amex';
  return '';
};

const BankCard = ({ data, onDelete, onEdit }) => {
  const [showSensitive, setShowSensitive] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const { copy } = useClipboard();
  const brand = getCardBrand(data.cardNumber);
  
  const bgClass = brand === 'Visa' ? 'bg-gradient-to-br from-[#1a1f71] to-[#005da3]' : 
                  brand === 'Mastercard' ? 'bg-gradient-to-br from-[#eb001b] to-[#f79e1b]' : 
                  'bg-gradient-to-br from-slate-800 to-black';

  return (
    <div className={`relative w-full aspect-[1.586/1] rounded-2xl p-4 sm:p-5 md:p-6 text-white shadow-2xl transform transition-all ${bgClass} flex flex-col justify-between overflow-hidden group hover:scale-[1.01]`}>
      <div className="absolute top-0 right-0 w-48 h-48 md:w-72 md:h-72 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
      
      <div className="flex flex-col gap-1 z-10">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 max-w-[75%]">
              <h3 className="font-bold tracking-wider opacity-90 text-xs sm:text-sm md:text-lg uppercase truncate">{data.bankName}</h3>
              <span className="text-[7px] sm:text-[9px] font-bold bg-white/20 px-1.5 py-0.5 rounded text-white/90 uppercase tracking-widest backdrop-blur-sm shadow-sm flex-shrink-0">
                  {data.cardType || 'Debit'}
              </span>
          </div>
          <div className="flex gap-1.5">
              <button onClick={() => onEdit(data)} className="p-1.5 bg-black/20 hover:bg-black/40 rounded-full text-white/90 backdrop-blur-md transition-colors"><Edit2 size={14} className="md:w-4 md:h-4" /></button>
              <button onClick={() => onDelete(data)} className="p-1.5 bg-red-500/20 hover:bg-red-500/80 rounded-full text-white/90 backdrop-blur-md transition-colors"><Trash2 size={14} className="md:w-4 md:h-4" /></button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 md:mt-2">
          <div className="w-8 h-6 md:w-11 md:h-8 bg-gradient-to-tr from-yellow-200 to-yellow-500 rounded sm:rounded-md shadow-inner relative flex items-center justify-center opacity-90 overflow-hidden border border-yellow-600/30">
              <div className="w-full h-[1px] bg-black/20 absolute top-1.5"></div>
              <div className="w-full h-[1px] bg-black/20 absolute bottom-1.5"></div>
              <div className="h-full w-[1px] bg-black/20 absolute left-1/3"></div>
              <div className="h-full w-[1px] bg-black/20 absolute right-1/3"></div>
          </div>
          <span className="font-bold italic opacity-80 text-[10px] sm:text-xs md:text-sm">{brand}</span>
        </div>
      </div>

      <div className="flex flex-col justify-center z-10 my-auto w-full">
        <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-sm sm:text-xl md:text-2xl tracking-widest leading-tight shadow-black/30 drop-shadow-md break-words w-full mt-1">
              {showSensitive ? formatCardNumber(data.cardNumber) : `•••• •••• •••• ${data.cardNumber?.slice(-4)}`}
            </span>
            <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                <button onClick={() => setShowSensitive(!showSensitive)} className="p-1 hover:bg-white/10 rounded text-white/80"><Eye size={12} className="md:w-4 md:h-4" /></button>
                <button onClick={() => copy(data.cardNumber)} className="p-1 hover:bg-white/10 rounded text-white/80"><Copy size={12} className="md:w-4 md:h-4" /></button>
            </div>
        </div>

        <div className="flex items-center justify-end gap-3 md:gap-5 mt-1.5 md:mt-1">
            <div className="flex items-center gap-1.5 md:gap-2">
                <span className="text-[7px] md:text-[9px] uppercase opacity-70 font-bold tracking-wider">Expires</span>
                <span className="font-mono text-xs sm:text-sm md:text-base shadow-black/20 drop-shadow-sm">{data.expiry}</span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
                <span className="text-[7px] md:text-[9px] uppercase opacity-70 font-bold tracking-wider">CVV</span>
                <span className="font-mono text-xs sm:text-sm md:text-base shadow-black/20 drop-shadow-sm">{showSensitive ? data.cvv : '•••'}</span>
            </div>
        </div>
      </div>

      <div className="flex justify-between items-end z-10 mt-auto">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[6px] sm:text-[8px] md:text-[9px] uppercase opacity-60 tracking-wider">Card Holder</span>
          <span className="font-medium tracking-wide uppercase truncate text-[10px] sm:text-xs md:text-sm shadow-black/20 drop-shadow-sm max-w-[140px] md:max-w-[220px]">{data.holderName}</span>
        </div>
        
        {data.pin && (
            <button 
                onClick={(e) => { e.stopPropagation(); setShowPin(!showPin); }}
                className="flex items-center gap-1 bg-black/30 hover:bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm transition-colors border border-white/5"
            >
                <span className="text-[7px] md:text-[8px] uppercase opacity-70 font-bold">ATM PIN</span>
                <span className="font-mono text-[10px] sm:text-xs md:text-sm min-w-[24px] text-center text-yellow-300">{showPin ? data.pin : '****'}</span>
            </button>
        )}
      </div>
    </div>
  );
};

export default BankCard;