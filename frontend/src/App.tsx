import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { ScheduledList } from './components/ScheduledList';
import { SentList } from './components/SentList';
import { ComposeModal } from './components/ComposeModal';
import { EmailDetailModal } from './components/EmailDetailModal';
import { SlackIntegrationModal } from './components/SlackIntegrationModal';
import {
  EmailItem,
  SenderItem,
  fetchScheduledEmails,
  fetchSentEmails,
  fetchSenders,
  searchEmails,
  cancelScheduledEmail,
  getSlackStatus,
} from './api/client';

function MainDashboard() {
  const { user, loading } = useAuth();

  const [currentTab, setCurrentTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<EmailItem[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailItem[]>([]);
  const [senders, setSenders] = useState<SenderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedEmails, setSearchedEmails] = useState<EmailItem[] | null>(null);

  // Modals state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackDetails, setSlackDetails] = useState<any>(null);

  // Load emails & data
  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [sched, sent, sendersList, slack] = await Promise.all([
        fetchScheduledEmails(),
        fetchSentEmails(),
        fetchSenders(),
        getSlackStatus(),
      ]);

      setScheduledEmails(sched);
      setSentEmails(sent);
      setSenders(sendersList);
      setSlackConnected(slack.connected);
      setSlackDetails(slack.connection);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
    // Auto-refresh every 5 seconds so background BullMQ worker sends reflect in real-time
    const interval = setInterval(() => {
      if (!searchQuery) {
        loadData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData, searchQuery]);

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchedEmails(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchEmails(searchQuery, currentTab);
        setSearchedEmails(results);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentTab]);

  // Handle Cancel Email
  const handleCancelEmail = async (id: string) => {
    try {
      await cancelScheduledEmail(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel email');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-[#43A047] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-gray-500 font-medium">Loading ReachInbox...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const displayedScheduled = searchedEmails !== null ? searchedEmails : scheduledEmails;
  const displayedSent = searchedEmails !== null ? searchedEmails : sentEmails;

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans antialiased text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setSearchQuery('');
          setSearchedEmails(null);
        }}
        onOpenCompose={() => setIsComposeOpen(true)}
        onOpenSlackModal={() => setIsSlackModalOpen(true)}
        scheduledCount={scheduledEmails.length}
        sentCount={sentEmails.length}
        slackConnected={slackConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {currentTab === 'scheduled' ? (
          <ScheduledList
            emails={displayedScheduled}
            isLoading={isLoading}
            onRefresh={loadData}
            onCancelEmail={handleCancelEmail}
            onSelectEmail={(email) => setSelectedEmail(email)}
            onOpenCompose={() => setIsComposeOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <SentList
            emails={displayedSent}
            isLoading={isLoading}
            onRefresh={loadData}
            onSelectEmail={(email) => setSelectedEmail(email)}
            onOpenCompose={() => setIsComposeOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}
      </main>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders}
        onScheduledSuccess={() => {
          loadData();
          setCurrentTab('scheduled');
        }}
      />

      {/* Email Detail Modal */}
      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />

      {/* Slack Integration Modal */}
      <SlackIntegrationModal
        isOpen={isSlackModalOpen}
        onClose={() => setIsSlackModalOpen(false)}
        slackConnected={slackConnected}
        slackDetails={slackDetails}
        onStatusChange={loadData}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}

export default App;
