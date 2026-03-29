// src/components/system/AppErrorBoundary.jsx
import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

class AppErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('App chunk failed to load:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-[#09090b] text-white gap-4 p-6">
                    <div className="w-14 h-14 bg-red-900/40 rounded-2xl flex items-center justify-center">
                        <AlertTriangle size={28} className="text-red-400" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-lg mb-1">Failed to load app</p>
                        <p className="text-sm text-gray-400">This may be a temporary network issue.</p>
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                        <RotateCcw size={14} /> Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default AppErrorBoundary;
