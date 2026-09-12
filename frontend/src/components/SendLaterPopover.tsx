import React, { useState } from 'react';
import { Clock, Calendar, Check, X } from 'lucide-react';

interface SendLaterPopoverProps {
  onScheduleSelected: (scheduledDate: Date) => void;
  onClose: () => void;
}

export const SendLaterPopover: React.FC<SendLaterPopoverProps> = ({
  onScheduleSelected,
  onClose,
}) => {
  const tomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  };

  const tomorrowAfternoon = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
  };

  const mondayMorning = () => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d;
  };

  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  const [customTime, setCustomTime] = useState('10:00');

  const handleConfirmCustom = () => {
    if (!customDate || !customTime) return;
    const [hours, minutes] = customTime.split(':').map(Number);
    const d = new Date(customDate);
    d.setHours(hours, minutes, 0, 0);
    onScheduleSelected(d);
  };

  return (
    <div className="absolute right-0 bottom-14 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs space-y-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex items-center space-x-1.5 font-bold text-gray-900">
          <Clock className="w-4 h-4 text-[#43A047]" />
          <span>Send Later Options</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Suggested Quick Times */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Suggested Times
        </p>

        <button
          onClick={() => onScheduleSelected(tomorrowMorning())}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-emerald-50 text-left text-gray-700 hover:text-[#2E7D32] transition-colors"
        >
          <span className="font-medium">Tomorrow morning</span>
          <span className="text-gray-400">9:00 AM</span>
        </button>

        <button
          onClick={() => onScheduleSelected(tomorrowAfternoon())}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-emerald-50 text-left text-gray-700 hover:text-[#2E7D32] transition-colors"
        >
          <span className="font-medium">Tomorrow afternoon</span>
          <span className="text-gray-400">2:00 PM</span>
        </button>

        <button
          onClick={() => onScheduleSelected(mondayMorning())}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-emerald-50 text-left text-gray-700 hover:text-[#2E7D32] transition-colors"
        >
          <span className="font-medium">Next Monday morning</span>
          <span className="text-gray-400">9:00 AM</span>
        </button>
      </div>

      {/* Custom Date & Time Picker */}
      <div className="pt-2 border-t border-gray-100 space-y-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center space-x-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>Custom Schedule</span>
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              value={customDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#43A047] text-gray-700"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Time</label>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#43A047] text-gray-700"
            />
          </div>
        </div>

        <button
          onClick={handleConfirmCustom}
          className="w-full mt-2 bg-[#43A047] hover:bg-[#388E3C] text-white font-semibold py-2 rounded-lg flex items-center justify-center space-x-1 shadow-sm transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Confirm Schedule</span>
        </button>
      </div>
    </div>
  );
};
