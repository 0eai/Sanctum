import React from 'react';
import { Modal, Button, Input } from '../../../components/ui';

const FinanceFormModal = ({ isOpen, onClose, onSave, editingItem, activeTab, viewCurrency, categories }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    onSave(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${editingItem ? 'Edit' : 'Add'} ${activeTab}`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            {activeTab === 'income' && (
                <>
                  <Input name="source" label="Source" placeholder="e.g. Salary" defaultValue={editingItem?.source || ''} required autoFocus />
                  <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                  <Input name="date" label="Date" type="date" defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]} required />
                  <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                      <select name="category" defaultValue={editingItem?.category || ''} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                          {(categories.income || ['Salary']).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                  </div>
                </>
            )}

            {activeTab === 'expenses' && (
                <>
                  <Input name="title" label="Title" placeholder="e.g. Lunch" defaultValue={editingItem?.title || ''} required autoFocus />
                  <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                  <Input name="date" label="Date" type="date" defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]} required />
                  <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                      <select name="category" defaultValue={editingItem?.category || ''} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                          {(categories.expenses || ['General']).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                  </div>
                </>
            )}

            {activeTab === 'investments' && (
                <>
                  <Input name="name" label="Asset Name" placeholder="e.g. Bitcoin" defaultValue={editingItem?.name || ''} required autoFocus />
                  <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                      <select name="type" defaultValue={editingItem?.type || 'Stock'} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                          {(categories.investments || ['Stock']).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                  </div>
                  <div className="flex gap-4">
                      <Input name="investedAmount" label={`Invested (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.investedAmount || ''} required className="w-1/2" />
                      <Input name="currentValue" label={`Current (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.currentValue || ''} required className="w-1/2" />
                  </div>
                </>
            )}

            {activeTab === 'subscriptions' && (
                <>
                  <Input name="name" label="Service Name" placeholder="e.g. Netflix" defaultValue={editingItem?.name || ''} required autoFocus />
                  <Input name="amount" label={`Cost (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                  <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Cycle</label>
                      <select name="cycle" defaultValue={editingItem?.cycle || 'Monthly'} className="w-full p-3 border border-gray-300 rounded-lg bg-white">
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly</option>
                      </select>
                  </div>
                  <Input name="nextDate" label="Next Billing Date" type="date" defaultValue={editingItem?.nextDate || ''} required />
                </>
            )}

            {activeTab === 'debts' && (
                <>
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-2">
                      <label className="flex-1 cursor-pointer text-center py-2 text-sm font-bold text-gray-500 rounded-md transition-all has-[:checked]:bg-green-100 has-[:checked]:text-green-700">
                          <input type="radio" name="subType" value="lent" defaultChecked={!editingItem || editingItem?.subType === 'lent'} className="hidden" /> I Lent
                      </label>
                      <label className="flex-1 cursor-pointer text-center py-2 text-sm font-bold text-gray-500 rounded-md transition-all has-[:checked]:bg-orange-100 has-[:checked]:text-orange-700">
                          <input type="radio" name="subType" value="borrowed" defaultChecked={editingItem?.subType === 'borrowed'} className="hidden" /> I Borrowed
                      </label>
                  </div>
                  <Input name="person" label="Person Name" placeholder="Who?" defaultValue={editingItem?.person || ''} required />
                  <Input name="amount" label={`Amount (${viewCurrency})`} placeholder="0.00" type="number" step="0.01" defaultValue={editingItem?.amount || ''} required />
                  <Input name="dueDate" label="Due Date" type="date" defaultValue={editingItem?.dueDate || ''} />
                </>
            )}

            <Button type="submit" className="w-full mt-2 bg-[#4285f4] hover:bg-blue-600">Save</Button>
        </form>
    </Modal>
  );
};

export default FinanceFormModal;