/**
 * extensionGuard.js — detect browser extensions that can read page content.
 *
 * Content scripts from password managers, grammar checkers, and other extensions
 * inject detectable DOM artifacts or global window properties. This module checks
 * for known signatures and returns a list of detected extension names.
 *
 * This does NOT block extensions — it informs the user so they can make an
 * informed decision (e.g., use a clean profile for their vault).
 *
 * Important: extensions that bypass detection are still blocked from reading
 * TOTP codes and the recovery key via the SecureText canvas layer.
 */

const EXTENSION_SIGNALS = [
    {
        name: 'Grammarly',
        check: () =>
            document.querySelector('grammarly-extension') !== null ||
            document.querySelector('[data-grammarly-shadow-root]') !== null ||
            typeof window.__grammarly !== 'undefined',
    },
    {
        name: 'LastPass',
        check: () =>
            typeof window.LASTPASS_BROWSER_VERSION !== 'undefined' ||
            document.querySelector('[data-lastpass-root]') !== null ||
            document.getElementById('LASTPASS_TIPBOX_DIV') !== null,
    },
    {
        name: 'Dashlane',
        check: () =>
            document.querySelector('[data-dashlane-rid]') !== null ||
            document.querySelector('[data-dashlane-frameid]') !== null,
    },
    {
        name: '1Password',
        check: () =>
            document.querySelector('[data-1p-id]') !== null ||
            document.querySelector('[data-onepassword-fill]') !== null,
    },
    {
        name: 'Honey / PayPal Rewards',
        check: () =>
            document.getElementById('honey-extension-data') !== null ||
            typeof window.__HONEY_EXTENSION !== 'undefined',
    },
    {
        name: 'Bitwarden',
        check: () =>
            document.querySelector('[data-bwi-uuid]') !== null,
    },
    {
        name: 'McAfee / Intel Security',
        check: () =>
            typeof window.McAfeeToolbarManager !== 'undefined' ||
            document.getElementById('mcafee-wss-status') !== null,
    },
];

/**
 * Returns an array of detected extension name strings.
 * Safe to call at any time — never throws.
 */
export const detectSuspiciousExtensions = () => {
    const detected = [];
    for (const signal of EXTENSION_SIGNALS) {
        try {
            if (signal.check()) detected.push(signal.name);
        } catch {
            // Ignore errors from individual checks
        }
    }
    return detected;
};
