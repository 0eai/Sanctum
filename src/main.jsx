import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './App';
import { VaultProvider } from './context/VaultContext';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <React.StrictMode>
        <VaultProvider>
            <ToastProvider>
                <AppWrapper />
            </ToastProvider>
        </VaultProvider>
    </React.StrictMode>
);
