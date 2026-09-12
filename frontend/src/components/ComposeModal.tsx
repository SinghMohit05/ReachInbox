import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  X,
  Clock,
  Send,
  Upload,
  Paperclip,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { SenderItem, scheduleEmailBatch } from '../api/client';
import { SendLaterPopover } from './SendLaterPopover';

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  base64: string;
}

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderItem[];
  onScheduledSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  senders,
  onScheduledSuccess,
}) => {
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>(['alice@customer.io', 'bob@customer.io']);
  const [subject, setSubject] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(10);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showSendLater, setShowSendLater] = useState(false);
  const [csvBanner, setCsvBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected sender
  useEffect(() => {
    if (senders.length > 0 && !selectedSenderId) {
      setSelectedSenderId(senders[0].id);
    }
  }, [senders, selectedSenderId]);

  // Tiptap Rich Text Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your email here... Format with headings, quotes, bullet points.',
      }),
    ],
    content: `<p>Hi there,</p><p>I'm reaching out regarding our upcoming partnership initiative.</p><p>We would love to schedule a quick 15-minute call to discuss timelines and next steps.</p><p>Best regards,</p>`,
  });

  if (!isOpen) return null;

  const handleAddRecipient = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const email = recipientInput.trim().toLowerCase();
      if (email && email.includes('@') && !recipients.includes(email)) {
        setRecipients([...recipients, email]);
        setRecipientInput('');
      }
    }
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients(recipients.filter((r) => r !== emailToRemove));
  };

  // CSV Upload handler
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Extract all email addresses from CSV using regex
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = text.match(emailRegex) || [];
      const uniqueNew = Array.from(new Set(matches.map((m) => m.toLowerCase().trim())));

      if (uniqueNew.length > 0) {
        const combined = Array.from(new Set([...recipients, ...uniqueNew]));
        setRecipients(combined);
        setCsvBanner(`CSV uploaded: ${uniqueNew.length} valid email address${uniqueNew.length === 1 ? '' : 'es'} detected`);
      } else {
        setErrorMessage('No valid email addresses found in the uploaded file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage(`File "${file.name}" exceeds 10MB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (e.target) e.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async () => {
    if (!selectedSenderId) {
      setErrorMessage('Please select a sender profile.');
      return;
    }
    if (recipients.length === 0) {
      setErrorMessage('Please provide at least one recipient email.');
      return;
    }
    if (!subject.trim()) {
      setErrorMessage('Please provide an email subject line.');
      return;
    }

    const bodyHtml = editor?.getHTML() || '';

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await scheduleEmailBatch({
        senderId: selectedSenderId,
        recipients,
        subject,
        body: bodyHtml,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
        delaySeconds,
        attachments: attachments.map((a) => ({
          filename: a.name,
          content: a.base64,
          contentType: a.type,
        })),
      });

      onScheduledSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to schedule emails');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-base text-gray-900">Compose New Email</h3>
            {recipients.length > 1 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-[#2E7D32]">
                Batch: {recipients.length} recipients
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* CSV Detection Banner */}
          {csvBanner && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-[#2E7D32] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-[#43A047] shrink-0" />
                <span className="font-medium">{csvBanner}</span>
              </div>
              <button onClick={() => setCsvBanner(null)} className="text-emerald-700 hover:text-emerald-900">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* From Selector */}
          <div className="flex items-center space-x-3 text-xs">
            <label className="w-16 font-semibold text-gray-500">From:</label>
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-gray-800 bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#43A047] font-medium"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} &lt;{s.email}&gt;
                </option>
              ))}
            </select>
          </div>

          {/* To Field with Chips + CSV Upload Button */}
          <div className="flex items-start space-x-3 text-xs">
            <label className="w-16 font-semibold text-gray-500 pt-2">To:</label>
            <div className="flex-1 border border-gray-200 rounded-lg p-1.5 focus-within:ring-1 focus-within:ring-[#43A047] focus-within:border-[#43A047] bg-white flex flex-wrap items-center gap-1.5 min-h-[38px]">
              {recipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[#2E7D32] font-medium text-[11px]"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(email)}
                    className="hover:text-emerald-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleAddRecipient}
                placeholder={recipients.length === 0 ? 'Type email and hit Enter...' : 'Add recipient...'}
                className="flex-1 min-w-[140px] px-2 py-1 text-xs focus:outline-none bg-transparent"
              />

              {/* Upload CSV button */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.txt"
                onChange={handleCsvUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                title="Upload CSV of recipient emails"
              >
                <Upload className="w-3 h-3 text-gray-500" />
                <span>Upload CSV</span>
              </button>
            </div>
          </div>

          {/* Subject Field */}
          <div className="flex items-center space-x-3 text-xs">
            <label className="w-16 font-semibold text-gray-500">Subject:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Follow-up on partnership proposal"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#43A047] font-medium"
            />
          </div>

          {/* Tiptap Rich Text Editor */}
          <div className="border border-gray-200 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-[#43A047] focus-within:border-[#43A047]">
            {/* Toolbar */}
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-1 text-gray-600">
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor?.isActive('bold') ? 'bg-gray-200 text-gray-900' : ''}`}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor?.isActive('italic') ? 'bg-gray-200 text-gray-900' : ''}`}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-gray-300 mx-1" />

              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor?.isActive('bulletList') ? 'bg-gray-200 text-gray-900' : ''}`}
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor?.isActive('orderedList') ? 'bg-gray-200 text-gray-900' : ''}`}
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor?.isActive('blockquote') ? 'bg-gray-200 text-gray-900' : ''}`}
                title="Quote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-gray-300 mx-1" />

              <button
                type="button"
                onClick={() => editor?.chain().focus().undo().run()}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Undo"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => editor?.chain().focus().redo().run()}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Redo"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Canvas */}
            <div className="p-4 min-h-[160px] text-xs text-gray-800 focus:outline-none">
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Delay & Rate Limiter Configuration */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-gray-700 block">Delay between sends</label>
                <span className="text-[11px] text-gray-400">Min {delaySeconds}s (prevents bursts)</span>
              </div>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="2"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-14 px-2 py-1 text-xs border border-gray-200 rounded text-center font-bold text-gray-800"
                />
                <span className="text-xs text-gray-500">sec</span>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-gray-700 block">Hourly Limit</label>
                <span className="text-[11px] text-gray-400">Alerts Slack when reached</span>
              </div>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-2 py-1 text-xs border border-gray-200 rounded text-center font-bold text-gray-800"
                />
                <span className="text-xs text-gray-500">/hr</span>
              </div>
            </div>
          </div>

          {/* Scheduled Indicator if Send Later was chosen */}
          {scheduledAt && (
            <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-xl flex items-center justify-between text-xs text-[#92400E]">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#B45309]" />
                <span className="font-medium">
                  Scheduled for: <strong>{scheduledAt.toLocaleString()}</strong>
                </span>
              </div>
              <button
                onClick={() => setScheduledAt(null)}
                className="text-xs underline hover:text-[#78350F]"
              >
                Send Immediately Instead
              </button>
            </div>
          )}

          {/* Attached Files List */}
          {attachments.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center justify-between">
                <span>ATTACHED FILES ({attachments.length})</span>
                <span className="text-[10px] text-gray-400 font-normal">Max 10MB per file</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-800 shadow-sm"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-[#43A047]" />
                    <span className="font-medium max-w-[200px] truncate">{att.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ({(att.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                      title="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between relative">
          {/* Hidden File Input for Attachments */}
          <input
            type="file"
            ref={attachmentInputRef}
            onChange={handleAttachmentChange}
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            className="flex items-center space-x-1.5 text-xs font-medium text-gray-600 hover:text-[#43A047] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <Paperclip className="w-4 h-4 text-[#43A047]" />
            <span>Attach file</span>
            {attachments.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 text-[#2E7D32] rounded-full text-[10px] font-bold">
                {attachments.length}
              </span>
            )}
          </button>

          <div className="flex items-center space-x-3">
            {/* Send Later Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSendLater(!showSendLater)}
                className="flex items-center space-x-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-[#43A047]" />
                <span>Send Later</span>
              </button>

              {showSendLater && (
                <SendLaterPopover
                  onScheduleSelected={(date) => {
                    setScheduledAt(date);
                    setShowSendLater(false);
                  }}
                  onClose={() => setShowSendLater(false)}
                />
              )}
            </div>

            {/* Primary Submit Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center space-x-1.5 bg-[#43A047] hover:bg-[#388E3C] text-white font-semibold px-5 py-2 rounded-lg text-xs shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? 'Scheduling...'
                  : scheduledAt
                  ? 'Confirm Scheduled Send'
                  : 'Schedule Send'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
