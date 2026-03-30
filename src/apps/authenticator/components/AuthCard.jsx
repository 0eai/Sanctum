import React, { useState, useEffect, useRef } from 'react';
import { Copy, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import * as OTPAuth from 'otpauth';
import SecureText from '../../../components/ui/SecureText';

const AuthCard = ({ item, onEdit, onDelete }) => {
    const [token, setToken] = useState('');
    const [progress, setProgress] = useState(100);
    const [isCopied, setIsCopied] = useState(false);
    const [isWarning, setIsWarning] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef(null);

    useEffect(() => {
        let totp;
        try {
            totp = new OTPAuth.TOTP({
                issuer: item.service,
                label: item.account,
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(item.secret.replace(/\s+/g, '').toUpperCase())
            });
        } catch (e) {
            setToken('Invalid Secret');
            return;
        }

        const updateToken = () => {
            try {
                setToken(totp.generate());
                const timeRemaining = totp.period - (Math.floor(Date.now() / 1000) % totp.period);
                setProgress((timeRemaining / totp.period) * 100);
                setIsWarning(timeRemaining <= 5);
            } catch (e) {
                setToken('Error');
            }
        };

        updateToken();
        const interval = setInterval(updateToken, 1000);
        return () => clearInterval(interval);
    }, [item]);

    const handleCopy = (e) => {
        e.stopPropagation();
        if (!token || token === 'Invalid Secret' || token === 'Error') return;

        navigator.clipboard.writeText(token);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);

        // Security: clear actual clipboard after 30s
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            navigator.clipboard.writeText('');
        }, 30000);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // Format token as 123 456
    const formattedToken = token.length === 6 ? `${token.slice(0, 3)} ${token.slice(3)}` : token;

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 group relative overflow-hidden transition-all hover:shadow-md">

            {/* Progress Bar Background */}
            <div
                className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 linear ${isWarning ? 'bg-red-500' : 'bg-[#4285f4]'}`}
                style={{ width: `${progress}%` }}
            />

            <div className="flex justify-between items-start">
                <div className="flex flex-col min-w-0">
                    <h3 className="font-bold text-gray-800 text-lg truncate">{item.service || 'Unknown Service'}</h3>
                    <p className="text-sm text-gray-500 truncate">{item.account}</p>
                </div>

                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                        className="p-1.5 text-gray-400 hover:text-[#4285f4] hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between mt-2">
                <div
                    className="cursor-pointer select-none flex items-center gap-3"
                    onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
                    title="Click to reveal/hide"
                >
                    {isVisible ? (
                        /* Canvas rendering prevents extension DOM scrapers from reading the TOTP code */
                        <SecureText
                            value={formattedToken}
                            font={`bold 30px monospace`}
                            color={isWarning ? '#ef4444' : '#4285f4'}
                            height={40}
                            ariaLabel="TOTP code — use Copy button to copy"
                        />
                    ) : (
                        <span className="text-3xl font-mono font-bold tracking-widest text-gray-300 blur-sm">
                            ••• •••
                        </span>
                    )}
                </div>

                <button
                    onClick={handleCopy}
                    className={`p-2.5 rounded-full transition-all ${isCopied ? 'bg-green-100 text-green-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                >
                    {isCopied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                </button>
            </div>
        </div>
    );
};

export default AuthCard;
