import React, { useState } from 'react';
import { useAuth } from './auth.jsx';

export default function Onboarding() {
  const [role, setRole] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { completeOnboarding, logout } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const roleData = { role };
    
    if (role === 'institution') {
      if (!issuerId.trim()) {
        setError('Issuer ID is required for institution role');
        setLoading(false);
        return;
      }
      roleData.issuerId = issuerId.trim();
    }
    
    if (role === 'student') {
      if (!studentId.trim()) {
        setError('Student ID is required for student role');
        setLoading(false);
        return;
      }
      roleData.studentId = studentId.trim();
    }

    try {
      const result = await completeOnboarding(roleData);
      
      if (result.success) {
        // Onboarding completed successfully
        console.log('Onboarding completed');
      } else {
        setError(result.error || 'Failed to complete onboarding');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during onboarding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to DECAID</h2>
          <p className="text-slate-300 text-sm">Choose your role to get started</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              I am a...
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-3 border border-slate-600 rounded-md cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="student"
                  checked={role === 'student'}
                  onChange={(e) => setRole(e.target.value)}
                  className="mr-3"
                />
                <div>
                  <div className="text-white font-medium">Student</div>
                  <div className="text-slate-400 text-xs">Verify my credentials and generate proofs</div>
                </div>
              </label>
              
              <label className="flex items-center p-3 border border-slate-600 rounded-md cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="institution"
                  checked={role === 'institution'}
                  onChange={(e) => setRole(e.target.value)}
                  className="mr-3"
                />
                <div>
                  <div className="text-white font-medium">Institution</div>
                  <div className="text-slate-400 text-xs">Issue credentials to students</div>
                </div>
              </label>
              
              <label className="flex items-center p-3 border border-slate-600 rounded-md cursor-pointer hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="employer"
                  checked={role === 'employer'}
                  onChange={(e) => setRole(e.target.value)}
                  className="mr-3"
                />
                <div>
                  <div className="text-white font-medium">Employer</div>
                  <div className="text-slate-400 text-xs">Verify candidate credentials</div>
                </div>
              </label>
            </div>
          </div>

          {role === 'institution' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Institution ID
              </label>
              <input
                type="text"
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., UNIVERSITY-2024"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                This will be your unique identifier for issuing credentials
              </p>
            </div>
          )}

          {role === 'student' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., STUDENT-2024-001"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                This will be your unique identifier in the system
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-md p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={!role || loading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Setting up...' : 'Continue'}
            </button>
            
            <button
              type="button"
              onClick={logout}
              className="flex-1 bg-slate-600 text-white py-2 px-4 rounded-md hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
