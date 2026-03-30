// src/components/ui/PresenceDots.jsx
// Renders small avatar dots for each actively-present collaborator on a shared document.
const COLORS = [
    'bg-violet-500', 'bg-sky-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-teal-500',
];

const colorFor = (uid) => {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
    return COLORS[hash % COLORS.length];
};

const PresenceDots = ({ users }) => {
    if (!users || users.length === 0) return null;
    const visible = users.slice(0, 4);
    const overflow = users.length - visible.length;
    return (
        <div className="flex items-center -space-x-1.5 mr-2" title={`${users.length} other editor${users.length > 1 ? 's' : ''} active`}>
            {visible.map(u => (
                <div
                    key={u.uid}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white ${colorFor(u.uid)}`}
                >
                    {u.uid.slice(0, 2).toUpperCase()}
                </div>
            ))}
            {overflow > 0 && (
                <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white">
                    +{overflow}
                </div>
            )}
        </div>
    );
};

export default PresenceDots;
