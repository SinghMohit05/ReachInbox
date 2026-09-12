import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMessage(
      'Email/password sign-in is disabled in accordance with the assignment requirements. Please use "Login with Google".',
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] flex items-center justify-center p-4">
      {/* Centered Login Card exactly matching Figma Screenshot 1 */}
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200/75 p-10 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        {/* Large Heading */}
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-8 tracking-tight">
          Login
        </h1>

        {/* Global Error Notice if OAuth failed */}
        {(authError || infoMessage) && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1">{authError || infoMessage}</div>
          </div>
        )}

        {/* Google Login Button */}
        <button
          onClick={loginWithGoogle}
          type="button"
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#EAF5EC] hover:bg-[#E1F0E4] active:scale-[0.99] transition-all text-sm font-medium text-gray-800 border border-green-100"
        >
          {/* Google G Logo SVG */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Login with Google</span>
        </button>

        {/* Divider */}
        <div className="relative my-7 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <span className="relative px-3 bg-white text-xs text-gray-400 font-normal">
            or sign up through email
          </span>
        </div>

        {/* Email / Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email ID"
              className="w-full px-4 py-3 rounded-xl bg-[#F4F6F5] text-sm text-gray-800 placeholder-gray-400 border border-transparent focus:border-gray-300 focus:bg-white focus:outline-none transition-all"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl bg-[#F4F6F5] text-sm text-gray-800 placeholder-gray-400 border border-transparent focus:border-gray-300 focus:bg-white focus:outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-brand-green hover:bg-brand-green-hover active:scale-[0.99] transition-all text-sm font-semibold text-white shadow-sm"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};
