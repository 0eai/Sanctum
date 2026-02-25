// src/apps/settings/AccountTab.jsx
import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { LogOut, Trash2, User, ChevronDown } from 'lucide-react';
import { auth } from '../../../lib/firebase';
import { Button, Input } from '../../../components/ui';
import { rotateUserPasskey, deleteUserAccount } from '../../../services/settings';

const CollapsibleCard = ({ title, icon: Icon, children, defaultOpen = false, variant = 'default' }) => {
  const [open, setOpen] = useState(defaultOpen);
  const isRed = variant === 'danger';
  return (
    <div className={`rounded-2xl shadow-sm border overflow-hidden ${isRed ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full p-4 flex items-center gap-2 font-bold text-sm transition-colors ${isRed ? 'text-red-700' : 'text-gray-800'}`}
      >
        {Icon && <Icon size={18} className={isRed ? 'text-red-500' : 'text-[#4285f4]'} />}
        {title}
        <ChevronDown size={16} className={`ml-auto transition-transform duration-200 ${isRed ? 'text-red-400' : 'text-gray-400'} ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className={`px-4 pb-4 ${!isRed ? 'border-t border-gray-100' : 'border-t border-red-100'} pt-4`}>
          {children}
        </div>
      </div>
    </div>
  );
};

const AccountTab = ({ user, setLoading, setMessage }) => {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!oldPass || !newPass || !confirmPass) return setMessage({ type: 'error', text: "All fields are required." });
    if (newPass.length < 4) return setMessage({ type: 'error', text: "New passkey must be at least 4 characters." });
    if (newPass !== confirmPass) return setMessage({ type: 'error', text: "New passkeys do not match." });

    setLoading(true);
    try {
      await rotateUserPasskey(user.uid, oldPass, newPass);
      setMessage({ type: 'success', text: "Passkey updated successfully!" });
      setOldPass(""); setNewPass(""); setConfirmPass("");
    } catch (err) {
      setMessage({ type: 'error', text: err.message || "Update failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmStr = "DELETE ACCOUNT";
    const input = prompt(`CRITICAL: This will delete your account and ALL data immediately.\nType "${confirmStr}" to confirm:`);
    if (input !== confirmStr) return;

    setLoading(true);
    try {
      await deleteUserAccount(user);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: "Delete failed. You may need to re-login first." });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Profile Card — always open */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Profile</h2>
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="w-16 h-16 rounded-full object-cover border-2 border-gray-100"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <User size={28} />
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 text-lg">
              {user.displayName || 'Anonymous'}
            </p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Update Passkey — collapsed by default */}
      <CollapsibleCard title="Update Passkey" icon={User}>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <Input type="password" label="Current Passkey" value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
          <Input type="password" label="New Passkey" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <Input type="password" label="Confirm New Passkey" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
          <Button type="submit" className="w-full mt-2">Update Passkey</Button>
        </form>
      </CollapsibleCard>

      {/* Session — collapsed by default */}
      <CollapsibleCard title="Session" icon={LogOut}>
        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => window.confirm("Sign out?") && signOut(auth)} className="w-full min-h-[48px]">
            <LogOut size={18} /> Sign Out
          </Button>
        </div>
      </CollapsibleCard>

      {/* Delete Account — collapsed by default, danger style */}
      <CollapsibleCard title="Delete Account" icon={Trash2} variant="danger">
        <p className="text-xs text-red-600 mb-4">
          Permanently delete your account and ALL data. This cannot be undone.
        </p>
        <Button variant="danger" onClick={handleDeleteAccount} className="w-full min-h-[48px] bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700">
          <Trash2 size={18} /> Delete Account
        </Button>
      </CollapsibleCard>
    </div>
  );
};

export default AccountTab;