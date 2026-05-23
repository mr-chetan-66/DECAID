import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(username, password);
        // After registration, log in
        await login(username, password);
      } else {
        await login(username, password);
      }
      // AuthContext will handle the state change, which will switch to AppContent
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-md">
        <div className="bg-[#0b1220]/86 backdrop-blur-xl rounded-lg border border-cyan-100/10 p-8 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400/10 ring-1 ring-cyan-300/25 text-cyan-200 font-bold">
              DC
            </div>
            <h1 className="text-3xl font-bold tracking-wide text-cyan-50 mb-2">DECAID</h1>
            <p className="text-slate-400">Decentralized Credential Verification</p>
          </div>

          <div className="flex mb-6 bg-[#060a12]/70 rounded-lg p-1 ring-1 ring-cyan-100/10">
            <button
              onClick={() => setIsRegister(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                !isRegister
                  ? 'bg-cyan-100 text-slate-950 shadow-lg shadow-cyan-950/20'
                  : 'text-slate-400 hover:text-cyan-100'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsRegister(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                isRegister
                  ? 'bg-cyan-100 text-slate-950 shadow-lg shadow-cyan-950/20'
                  : 'text-slate-400 hover:text-cyan-100'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950/70 border border-slate-700/70 rounded-lg text-white placeholder-slate-500 focus:outline-none transition-all"
                placeholder={isRegister ? 'STU001, TSI001, FOR001...' : 'Enter your username'}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950/70 border border-slate-700/70 rounded-lg text-white placeholder-slate-500 focus:outline-none transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            {isRegister && (
              <div className="rounded-lg bg-cyan-400/5 border border-cyan-300/15 p-3 text-xs text-slate-300">
                Role is detected from the first 3 letters: STU student, TSI teacher-student incharge, FOR forum, NPT NPTEL/TNP, III internship, EMP employer, ADM admin.
              </div>
            )}

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg p-3 text-rose-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : isRegister ? 'Register' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {isRegister ? (
              <p>
                Already have an account?{' '}
                <button
                  onClick={() => setIsRegister(false)}
                  className="text-cyan-300 hover:text-cyan-200 transition-colors"
                >
                  Login
                </button>
              </p>
            ) : (
              <p>
                Don't have an account?{' '}
                <button
                  onClick={() => setIsRegister(true)}
                  className="text-cyan-300 hover:text-cyan-200 transition-colors"
                >
                  Register
                </button>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
