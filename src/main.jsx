import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './App'; // This is your existing App export
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));


// Default to the Drive App
root.render(
    <React.StrictMode>
        <AppWrapper />
    </React.StrictMode>
);
