import React from 'react';
import AppLandingPageHeader from './headers/AppLandingPageHeader';
import Fab from './Fab';
import MultiFab from './MultiFab';

const StandardAppLayout = ({ children, headerConfig, fabConfig, bottomBar, mainProps }) => {
    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 relative">

            {/* 1. Delegate all header logic to AppLandingPageHeader */}
            <AppLandingPageHeader {...headerConfig} />

            {/* 2. Standardized scrolling main content area */}
            <main className="flex-1 overflow-y-auto scroll-smooth p-4" {...mainProps}>
                <div className="max-w-3xl mx-auto pb-32">
                    {children}
                </div>
            </main>

            {/* 2.5. Optional bottom bar (e.g. Checklist add-item form) */}
            {bottomBar}

            {/* 3. Smart FAB Injection */}
            {fabConfig && (
                fabConfig.actions ? (
                    // Render MultiFab if 'actions' array is provided
                    <MultiFab
                        actions={fabConfig.actions}
                        maxWidth="max-w-4xl"
                    />
                ) : (
                    // Render standard Fab for single actions
                    <Fab
                        onClick={fabConfig.onClick}
                        icon={fabConfig.icon}
                        maxWidth="max-w-4xl"
                        ariaLabel={fabConfig.ariaLabel || "Action"}
                    />
                )
            )}
        </div>
    );
};

export default StandardAppLayout;