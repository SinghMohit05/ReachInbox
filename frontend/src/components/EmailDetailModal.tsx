import React from 'react';
import { EmailItem } from '../api/client';
import {
  ArrowLeft,
  X,
  Clock,
  CheckCircle2,
  Paperclip,
  Calendar,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

interface EmailDetailModalProps {
  email: EmailItem | null;
  onClose: () => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, onClose }) => {
  if (!email) return null;

  const isSent = email.status === 'sent';
  const isScheduled = email.status === 'scheduled';

  const formatDate = (iso?: string | null) => {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Topbar */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <button
            onClick={onClose}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Inbox</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status & Timestamp Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              {isSent ? (
                <>
                  <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#EAF5EC] text-[#2E7D32] border border-[#C8E6C9]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Delivered via Ethereal SMTP</span>
                  </span>
                  {email.previewUrl && (
                    <a
                      href={email.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-[#43A047] text-white hover:bg-[#388E3C] shadow-sm transition-colors"
                    >
                      <span>View Live on Ethereal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </>
              ) : isScheduled ? (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Scheduled in BullMQ Queue</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                  <span>{email.status.toUpperCase()}</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-gray-500">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{isSent ? `Delivered: ${formatDate(email.sentAt)}` : `Scheduled: ${formatDate(email.scheduledAt)}`}</span>
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-snug">{email.subject}</h1>
          </div>

          {/* Sender & Recipient Card */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#2E7D32] font-bold text-sm flex items-center justify-center shrink-0 border border-emerald-200">
              {email.sender?.displayName?.slice(0, 2).toUpperCase() || email.recipient.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline space-x-2">
                <span className="font-bold text-sm text-gray-900 truncate">
                  {email.sender?.displayName || 'Sender'}
                </span>
                <span className="text-xs text-gray-500 font-normal truncate">
                  {email.sender?.email ? `<${email.sender.email}>` : ''}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                <span className="font-medium text-gray-400">To: </span>
                <span className="font-medium text-gray-700">{email.recipient}</span>
              </div>
            </div>
          </div>

          {/* Highlighted Yellow Offer Callout Box (Figma Style) */}
          <div className="p-4 rounded-xl bg-[#FFFBEB] border-l-4 border-[#F59E0B] text-xs text-[#92400E] space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-[#B45309]">
              <ShieldCheck className="w-4 h-4 text-[#F59E0B]" />
              <span>ReachInbox Special Proposal &amp; Terms Included</span>
            </div>
            <p>
              Exclusive terms and scheduled outreach configured with automated rate limiting and minimum delay guarantees.
            </p>
          </div>

          {/* Email Body Content */}
          <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed pt-2">
            <div
              dangerouslySetInnerHTML={{ __html: email.body }}
              className="space-y-3 font-normal"
            />
          </div>

          {/* Mock Attachments (as seen in Figma screen) */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center space-x-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attachments (2 files)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer text-xs transition-colors">
                <div className="w-5 h-5 rounded bg-red-100 text-red-700 font-bold text-[10px] flex items-center justify-center">
                  PDF
                </div>
                <span className="font-medium text-gray-700">q3_partnership_proposal.pdf</span>
                <span className="text-gray-400 text-[10px]">1.4 MB</span>
              </div>

              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer text-xs transition-colors">
                <div className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center">
                  XLS
                </div>
                <span className="font-medium text-gray-700">pricing_matrix_2026.xlsx</span>
                <span className="text-gray-400 text-[10px]">420 KB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Idempotency Key: <code className="bg-gray-200/70 px-1 py-0.5 rounded text-[11px]">{email.id.slice(0, 8)}...</code></span>
          {email.jobId && <span>BullMQ Job: <code className="bg-gray-200/70 px-1 py-0.5 rounded text-[11px]">{email.jobId}</code></span>}
        </div>
      </div>
    </div>
  );
};
