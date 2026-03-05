import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './App';
import { VaultProvider } from './context/VaultContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <React.StrictMode>
        <VaultProvider>
            <AppWrapper />
        </VaultProvider>
    </React.StrictMode>
);
