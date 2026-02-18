// src/apps/settings/AccountTab.jsx
import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { LogOut, Trash2 } from 'lucide-react';
import { auth } from '../../../lib/firebase';
import { Button, Input } from '../../../components/ui';
import { rotateUserPasskey, deleteUserAccount } from '../../../services/settings';

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
      // Auth listener in App.jsx will handle redirect
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: "Delete failed. You may need to re-login first." });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Update Passkey</h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <Input type="password" label="Current Passkey" value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
          <Input type="password" label="New Passkey" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <Input type="password" label="Confirm New Passkey" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
          <Button type="submit" className="w-full mt-2">Update Passkey</Button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Session</h2>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-gray-500 mb-2">Logged in as: <br /><span className="font-mono text-gray-800">{user.email}</span></div>
          <Button variant="secondary" onClick={() => window.confirm("Sign out?") && signOut(auth)} className="w-full">
            <LogOut size={18} /> Sign Out
          </Button>
          <div className="border-t border-gray-100 my-2"></div>
          <Button variant="danger" onClick={handleDeleteAccount} className="w-full bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:text-red-700">
            <Trash2 size={18} /> Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccountTab;