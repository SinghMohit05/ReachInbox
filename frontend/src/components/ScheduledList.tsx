import React, { useState } from 'react';
import { EmailItem } from '../api/client';
import { Clock, Search, RefreshCw, X, Ban } from 'lucide-react';

interface ScheduledListProps {
  emails: EmailItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onCancelEmail: (id: string) => Promise<void>;
  onSelectEmail: (email: EmailItem) => void;
  onOpenCompose: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const ScheduledList: React.FC<ScheduledListProps> = ({
  emails,
  isLoading,
  onRefresh,
  onCancelEmail,
  onSelectEmail,
  onOpenCompose,
  searchQuery,
  onSearchChange,
}) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const formatScheduledDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoDate;
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to cancel this scheduled email?')) return;
    setCancellingId(id);
    try {
      await onCancelEmail(id);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
      {/* Header Bar */}
      <header className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Scheduled Emails</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Showing {emails.length} scheduled email{emails.length === 1 ? '' : 's'} waiting in BullMQ queue
          </p>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search recipient, subject..."
              className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-56 focus:w-72 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#43A047] focus:border-[#43A047] transition-all duration-150"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh list"
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#43A047]' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {isLoading && emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin text-[#43A047] mb-2" />
            Loading scheduled emails...
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#43A047] flex items-center justify-center mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No scheduled emails</h3>
            <p className="text-xs text-gray-500 max-w-sm mt-1 mb-4">
              {searchQuery
                ? 'No scheduled emails matched your search. Try another query.'
                : 'All scheduled emails have been delivered or none have been queued yet.'}
            </p>
            <button
              onClick={onOpenCompose}
              className="bg-[#43A047] hover:bg-[#388E3C] text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm"
            >
              + Compose New Email
            </button>
          </div>
        ) : (
          emails.map((email) => (
            <div
              key={email.id}
              onClick={() => onSelectEmail(email)}
              className="p-4 sm:px-6 hover:bg-gray-50/80 cursor-pointer transition-colors flex items-start justify-between gap-4 group"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
                    <Clock className="w-3 h-3" />
                    <span>Scheduled</span>
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs font-semibold text-gray-900 truncate">
                    {email.recipient}
                  </span>
                  {email.sender && (
                    <>
                      <span className="text-xs text-gray-300">from</span>
                      <span className="text-xs text-gray-500 truncate">{email.sender.displayName || email.sender.email}</span>
                    </>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-gray-900 group-hover:text-[#43A047] transition-colors truncate">
                  {email.subject}
                </h4>

                <p className="text-xs text-gray-500 line-clamp-1">
                  {email.body.replace(/<[^>]+>/g, ' ').slice(0, 140)}
                </p>
              </div>

              {/* Right Side: Timestamp & Cancel Action */}
              <div className="flex flex-col items-end space-y-2 shrink-0">
                <div className="flex items-center space-x-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{formatScheduledDate(email.scheduledAt)}</span>
                </div>

                <div className="flex items-center space-x-2 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleCancel(e, email.id)}
                    disabled={cancellingId === email.id}
                    className="flex items-center space-x-1 text-[11px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    <Ban className="w-3 h-3" />
                    <span>{cancellingId === email.id ? 'Cancelling...' : 'Cancel'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
