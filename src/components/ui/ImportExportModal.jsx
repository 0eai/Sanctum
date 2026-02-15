import React, { useRef } from 'react';
import { FileUp, Download, X } from 'lucide-react';
import { Modal, Button, LoadingSpinner } from '../ui';

/**
 * Generic Modal for Import/Export actions
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {function} onImport - Callback receiving the selected File object
 * @param {function} onExport - Callback for export action
 * @param {boolean} isImporting - Loading state
 * @param {string} title - Modal title
 * @param {string} accept - File types (e.g. ".csv, .json")
 * @param {string} importLabel
 * @param {string} exportLabel
 */
const ImportExportModal = ({ 
  isOpen, 
  onClose, 
  onImport, 
  onExport, 
  isImporting = false,
  title = "Manage Data",
  accept = "*",
  importLabel = "Import File",
  exportLabel = "Export Data"
}) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset value so same file can be selected again if needed
      e.target.value = '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-6">
        
        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-[#4285f4]">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <FileUp size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm">Data Transfer</h4>
              <p className="text-xs text-blue-400">Backup or restore your data</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Import Button */}
            <Button 
              onClick={() => fileInputRef.current.click()} 
              variant="secondary" 
              className="flex flex-col items-center justify-center py-6 h-auto gap-2 bg-white border-transparent hover:border-blue-200 shadow-sm"
              disabled={isImporting}
            >
              {isImporting ? <LoadingSpinner size="sm" /> : <FileUp size={24} className="text-gray-600" />}
              <span className="text-xs font-semibold text-gray-700">{importLabel}</span>
            </Button>

            {/* Export Button */}
            <Button 
              onClick={onExport} 
              variant="secondary" 
              className="flex flex-col items-center justify-center py-6 h-auto gap-2 bg-white border-transparent hover:border-blue-200 shadow-sm"
            >
              <Download size={24} className="text-gray-600" />
              <span className="text-xs font-semibold text-gray-700">{exportLabel}</span>
            </Button>
          </div>
        </div>

        {/* Hidden Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept={accept} 
          className="hidden" 
        />

        <div className="text-center">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 font-medium">
                Close
            </button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportExportModal;