import React, { useEffect, useRef } from 'react';

const RecipientDropdown = ({ show, results, onSelect, onClose }) => {
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!show || results.length === 0) {
    return null;
  }

   return (
     <div
       ref={dropdownRef}
       className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-2xl border border-gray-200 z-[100] max-h-64 overflow-y-auto"
     >
      <div className="py-1">
        {results.map((user, index) => (
          <button
            key={user.user_id}
            onClick={() => onSelect(user)}
            className="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center space-x-3 border-b border-gray-100 last:border-0"
          >
            {/* User avatar placeholder */}
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{user.name}</div>
              <div className="text-xs text-gray-500">{user.upi_id}</div>
            </div>
          </button>
        ))}
        
        {results.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            No users found for this search
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipientDropdown;