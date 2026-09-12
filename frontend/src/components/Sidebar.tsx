import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  Send,
  Plus,
  LogOut,
  Activity,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';

interface SidebarProps {
  currentTab: 'scheduled' | 'sent';
  onSelectTab: (tab: 'scheduled' | 'sent') => void;
  onOpenCompose: () => void;
  onOpenSlackModal: () => void;
  scheduledCount: number;
  sentCount: number;
  slackConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenCompose,
  onOpenSlackModal,
  scheduledCount,
  sentCount,
  slackConnected,
}) => {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#43A047] flex items-center justify-center text-white font-bold text-base shadow-sm">
            OM
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-none text-base">ReachInbox</h1>
            <span className="text-[11px] text-gray-500 font-medium">Email Scheduler</span>
          </div>
        </div>
      </div>

      {/* User Profile Card */}
      {user && (
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center justify-center text-xs shrink-0">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-gray-500 truncate leading-tight">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Compose Pill Button */}
      <div className="p-4">
        <button
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center space-x-2 bg-[#43A047] hover:bg-[#388E3C] text-white font-semibold px-4 py-2.5 rounded-full shadow-sm hover:shadow transition-all duration-150 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="text-sm">Compose</span>
        </button>
      </div>

      {/* Core Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
          Core
        </div>

        {/* Scheduled Tab */}
        <button
          onClick={() => onSelectTab('scheduled')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === 'scheduled'
              ? 'bg-[#EAF5EC] text-[#2E7D32] font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Clock className={`w-4 h-4 ${currentTab === 'scheduled' ? 'text-[#2E7D32]' : 'text-gray-400'}`} />
            <span>Scheduled</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              currentTab === 'scheduled'
                ? 'bg-[#2E7D32]/15 text-[#2E7D32]'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {scheduledCount}
          </span>
        </button>

        {/* Sent Tab */}
        <button
          onClick={() => onSelectTab('sent')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentTab === 'sent'
              ? 'bg-[#EAF5EC] text-[#2E7D32] font-semibold'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Send className={`w-4 h-4 ${currentTab === 'sent' ? 'text-[#2E7D32]' : 'text-gray-400'}`} />
            <span>Sent</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              currentTab === 'sent'
                ? 'bg-[#2E7D32]/15 text-[#2E7D32]'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {sentCount}
          </span>
        </button>

        <div className="pt-4 px-3 py-1.5 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
          Integrations
        </div>

        {/* Slack Alerts */}
        <button
          onClick={onOpenSlackModal}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span>Slack Alerts</span>
          </div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              slackConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {slackConnected ? 'Active' : 'Setup'}
          </span>
        </button>

        {/* BullMQ Dashboard */}
        <a
          href="http://localhost:4000/admin/queues"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <Activity className="w-4 h-4 text-amber-600" />
            <span>BullMQ Live Board</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
        </a>
      </nav>

      {/* Footer System Status */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-500 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-medium text-gray-700">BullMQ Redis Queue</span>
        </div>
        <span className="text-gray-400">v1.0.0</span>
      </div>
    </aside>
  );
};
