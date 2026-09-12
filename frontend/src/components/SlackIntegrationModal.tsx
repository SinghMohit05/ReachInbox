import React, { useState } from 'react';
import { MessageSquare, X, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { disconnectSlack } from '../api/client';

interface SlackIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  slackConnected: boolean;
  slackDetails?: any;
  onStatusChange: () => void;
}

export const SlackIntegrationModal: React.FC<SlackIntegrationModalProps> = ({
  isOpen,
  onClose,
  slackConnected,
  slackDetails,
  onStatusChange,
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  if (!isOpen) return null;

  const handleConnect = () => {
    // Redirects to real backend Slack OAuth initiate endpoint
    window.location.href = 'http://localhost:4000/auth/slack';
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectSlack();
      onStatusChange();
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900">Slack Alerts Integration</h3>
              <p className="text-[11px] text-gray-500">Hourly rate limit alert webhooks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2 text-xs text-gray-600">
            <div className="flex items-center space-x-2 font-semibold text-gray-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Automated Rate Limit Monitoring</span>
            </div>
            <p>
              When any sender reaches the configured hourly email threshold, ReachInbox automatically:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-gray-500">
              <li>Reschedules excess emails into the next hour window (no lost emails)</li>
              <li>Sends an instant notification to your Slack channel</li>
              <li>Enforces Redis idempotency so you only get 1 alert per hour per sender</li>
            </ul>
          </div>

          {slackConnected ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800">
                <CheckCircle className="w-4 h-4 text-[#43A047]" />
                <span>Slack Connected &amp; Monitoring</span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>
                  Workspace: <strong>{slackDetails?.teamName || 'ReachInbox Workspace'}</strong>
                </p>
                <p>
                  Target Channel: <strong>{slackDetails?.channelName || '#email-alerts'}</strong>
                </p>
              </div>

              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="w-full mt-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 py-1.5 rounded-lg transition-colors border border-red-200"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect Slack'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <button
                onClick={handleConnect}
                className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-sm transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Connect Slack Workspace</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </button>
              <p className="text-[11px] text-center text-gray-400">
                Requires Slack OAuth App credentials in backend <code className="text-gray-600">.env</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
