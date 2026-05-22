import React, { useState, useRef } from 'react';
import { useAppStore } from '../store';
import { api } from '../services/api';
import { toast } from 'sonner';
import { Eye, EyeOff, Image as ImageIcon, Loader2, Fingerprint } from 'lucide-react';
import BiometricScanner from './BiometricScanner';

function PasswordInput({ value, onChange, placeholder, className, disabled }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${className || ''}`}>
      <input 
        disabled={disabled}
        className="w-full bg-[#21262d] border border-[#30363d] rounded-lg p-3 text-sm focus:outline-none pr-10 disabled:opacity-50 transition-opacity" 
        placeholder={placeholder} 
        type={show ? "text" : "password"}
        value={value} 
        onChange={onChange}
      />
      <button 
        type="button" 
        disabled={disabled}
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const compressImage = (file: File, maxWidth = 256, maxHeight = 256, quality = 0.7): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = img.width;
        const height = img.height;

        const size = Math.min(width, height);
        const xOffset = (width - size) / 2;
        const yOffset = (height - size) / 2;

        canvas.width = maxWidth;
        canvas.height = maxHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, maxWidth, maxHeight);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};

export default function AuthModal({ mode, setMode, close }: any) {
  const store = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [regForm, setRegForm] = useState({ fullname: '', username: '', email: '', password: '', confirm: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [resetForm, setResetForm] = useState({ code: '', newPassword: '', confirm: '' });

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState('');

  const [showBioScanner, setShowBioScanner] = useState(false);
  const [bioInputMode, setBioInputMode] = useState(false);
  const [bioSearchLogin, setBioSearchLogin] = useState('');
  const [scannedBioUser, setScannedBioUser] = useState<any>(null);
  const [cachedBioUser, setCachedBioUser] = useState<any>(null);

  const handleBiometricLogin = async () => {
    const stored = localStorage.getItem('biometric_linked_user');
    if (stored) {
      try {
        const userObj = JSON.parse(stored);
        if (userObj && userObj.username) {
          const checkRes = await api.checkBiometrics(userObj.username);
          if (checkRes.success && checkRes.registered) {
            setScannedBioUser(checkRes.user);
            setCachedBioUser(checkRes.user);
            return;
          }
        }
      } catch (err) {
        console.warn("Cached local biometric check error, fallback to prompt", err);
      }
    }
    // Fallback if no local signature found: let them search on the centralized Node database
    setBioSearchLogin('');
    setBioInputMode(true);
    setCachedBioUser(null);
  };

  const handleVerifyNodeBiometrics = async () => {
    if (!bioSearchLogin.trim()) {
      return toast.error("Please enter a username or email node address.");
    }
    const checkToast = toast.loading("Polling secure biometric terminal registries...");
    try {
      const res = await api.checkBiometrics(bioSearchLogin.trim());
      if (res.success && res.registered) {
        toast.dismiss(checkToast);
        toast.success("Security signature detected! Prepare biometric touch sensory...");
        setScannedBioUser(res.user);
        setBioInputMode(false);
        setShowBioScanner(true);
      } else {
        toast.dismiss(checkToast);
        toast.error("No registered bio keys found on this node cluster.", {
          description: "Sign in with password to first register biometrics in settings."
        });
      }
    } catch (err: any) {
      toast.dismiss(checkToast);
      toast.error("Endpoint connect signature mismatch.");
    }
  };

  const handleBiometricLoginSuccess = async (userData: any, selectedKeyIndex?: number, devicePin?: string, assertionId?: string, faceImage?: string, localScore?: number) => {
    if (!userData || !userData.username) {
      return toast.error("Verification failed: User telemetry matrix corrupted.");
    }
    
    const keyIndex = selectedKeyIndex !== undefined ? Number(selectedKeyIndex) : 0;
    const loginToast = toast.loading("Decrypting node access permissions...");
    
    try {
      const fullRes = await api.loginBiometrics(userData.username, keyIndex, devicePin, assertionId, faceImage, localScore);
      if (fullRes.success && fullRes.user) {
        toast.dismiss(loginToast);
        toast.success("Identity decrypted! Node access granted.");
        store.login({
          id: String(fullRes.user.id),
          token: fullRes.user.token,
          username: fullRes.user.username,
          email: fullRes.user.email,
          fullname: fullRes.user.fullname || '',
          avatarUrl: fullRes.user.avatarUrl || ''
        });
        // Save local reference for fast next session
        localStorage.setItem('biometric_linked_user', JSON.stringify(fullRes.user));
        setShowBioScanner(false);
        close();
      } else {
        toast.dismiss(loginToast);
        toast.error("Access Denied: Biometric signature mismatch.", {
          description: "The selected loop core design did not match the registered user's profile."
        });
        setShowBioScanner(false);
      }
    } catch (err: any) {
      toast.dismiss(loginToast);
      toast.error("Access Denied: Biometric signature mismatch.", {
        description: "The selected loop core design did not match the registered user's profile."
      });
      setShowBioScanner(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    const loginToast = toast.loading("Verifying credentials and protocols...");
    try {
      const res = await api.login(loginForm.login, loginForm.password);
      if (res.success) {
        store.login({
          id: String(res.user_id),
          token: res.token,
          username: res.username,
          email: res.email,
          fullname: res.fullname || '',
          avatarUrl: res.avatar_url || ''
        });
        toast.dismiss(loginToast);
        toast.success(`Welcome back, ${res.username}!`);
        close();
      } else {
        toast.dismiss(loginToast);
        toast.error(res.message || "Login failed");
      }
    } catch (e: any) {
      toast.dismiss(loginToast);
      toast.error(e.message || "Login connection failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const loadingToast = toast.loading("Optimizing profile photo...");
    try {
      const compressed = await compressImage(file);
      setAvatarFile(compressed);
      
      const reader = new FileReader();
      reader.onload = (e) => setAvatarPreview(e.target?.result as string);
      reader.readAsDataURL(compressed);
      toast.dismiss(loadingToast);
      toast.success("Profile photo optimized!");
    } catch (err) {
      toast.dismiss(loadingToast);
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setAvatarPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async () => {
    if (regForm.username.trim() === '' || regForm.email.trim() === '' || regForm.password.trim() === '') {
      return toast.error("Username, Email, and Password are required");
    }
    if (regForm.password !== regForm.confirm) return toast.error("Passwords don't match");
    if (regForm.password.length < 4) return toast.error("Password must be at least 4 characters");
    
    setIsRegistering(true);
    setRegisterStatus("Initializing Uplink Connection...");
    const loadingToast = toast.loading("Configuring registration protocol...");
    
    try {
      setRegisterStatus("Database creation in progress...");
      toast.loading("Creating user database entry...", { id: loadingToast });
      const res = await api.register(regForm.fullname, regForm.username, regForm.email, regForm.password);
      console.log('Register response:', res);
      
      if (res.success) {
        let finalAvatarUrl = '';
        
        if (avatarFile) {
          try {
            setRegisterStatus("Uploading and binding profile avatar...");
            toast.loading("Uploading and binding profile avatar...", { id: loadingToast });
            const formData = new FormData();
            formData.append('user_id', String(res.user_id));
            formData.append('token', res.token);
            formData.append('avatar', avatarFile, 'avatar.jpg');
            
            const uploadRes = await fetch('/api/proxy/php/upload_avatar.php', {
              method: 'POST',
              body: formData,
            });
            const uploadResult = await uploadRes.json();
            if (uploadResult.success) {
              finalAvatarUrl = uploadResult.avatar_url;
            }
          } catch (e) {
            console.error('Avatar upload failed', e);
          }
        }
        
        setRegisterStatus("Synchronizing identity status...");
        toast.loading("Synchronizing session authorization...", { id: loadingToast });
        store.login({
          id: String(res.user_id),
          token: res.token,
          username: res.username || regForm.username,
          email: res.email || regForm.email,
          fullname: res.fullname || regForm.fullname || '',
          avatarUrl: finalAvatarUrl
        });
        toast.dismiss(loadingToast);
        toast.success(`Welcome, ${res.username || regForm.username}! Account created.`);
        close();
      } else {
        toast.dismiss(loadingToast);
        toast.error(res.message || "Registration failed");
      }
    } catch (e: any) {
      console.error('Register error:', e);
      toast.dismiss(loadingToast);
      toast.error(e.message || "Connection failed");
    } finally {
      setIsRegistering(false);
      setRegisterStatus('');
    }
  };

  const handleForgot = async () => {
    if (!forgotForm.email) return toast.error("Please enter your email");
    try {
       const res = await api.requestPasswordReset(forgotForm.email);
       if (res.success) {
         setResetForm(prev => ({ ...prev, code: res.reset_token || '' }));
         
         toast(
           <div className="flex flex-col gap-2">
             <div className="font-bold">Reset Code Generated</div>
             <div className="text-sm">Your reset code is:</div>
             <div className="bg-black/50 p-2 rounded text-center font-mono font-bold tracking-widest">{res.reset_token}</div>
             <div className="text-xs text-[#8b949e]">Use this code to reset your password.</div>
           </div>,
           { duration: 10000 }
         );
         
         setMode('reset');
       } else {
         toast.error(res.message || "Email not found");
       }
    } catch (e: any) {
       toast.error("Connection failed");
    }
  };

  const handleReset = async () => {
    if (!resetForm.code || !resetForm.newPassword || !resetForm.confirm) {
      return toast.error("All fields required");
    }
    if (resetForm.newPassword.length < 4) {
      return toast.error("Password must be at least 4 characters");
    }
    if (resetForm.newPassword !== resetForm.confirm) {
      return toast.error("Passwords don't match");
    }
    try {
      const res = await api.confirmPasswordReset(forgotForm.email, resetForm.code, resetForm.newPassword);
      if (res.success) {
        toast.success("Password reset! Please login.");
        setMode('login');
      } else {
        toast.error(res.message || "Reset failed");
      }
    } catch (e: any) {
      toast.error("Connection failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="bg-[#0d1117] border border-[#30363d] rounded-2xl w-full max-w-sm flex flex-col relative max-h-[90vh] overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#388bfd] via-[#8957e5] to-[#388bfd]" />
        
        <div className="overflow-y-auto p-6 flex flex-col pt-8">
          {mode === 'login' && (
            <>
              {cachedBioUser ? (
                <>
                  <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8957e5] to-[#d3bcf6] mb-2 text-center uppercase tracking-wider font-mono">
                    Biometric Gateway
                  </h2>
                  <p className="text-xs text-[#8b949e] mb-6 text-center leading-relaxed">
                    Found secure biometric locks linked on this device.
                  </p>

                  <div className="flex flex-col items-center mb-6 bg-[#161b22] border border-[#30363d] p-4 rounded-xl">
                    <img 
                      src={cachedBioUser.avatarUrl || "https://my-angge.x10.mx/uploads/blue.jpg"} 
                      alt="Cached User Avatar" 
                      className="w-12 h-12 rounded-full object-cover border border-[#388bfd]/30 mb-2"
                    />
                    <div className="text-xs font-bold text-[#e6edf3] font-mono">
                      {cachedBioUser.username.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-[#8b949e] mt-1 flex flex-wrap gap-1 justify-center">
                      {cachedBioUser.credId && (
                        <span className="px-1.5 py-0.5 bg-[#8957e5]/10 border border-[#8957e5]/20 text-[8px] text-[#8957e5] font-bold rounded-full uppercase">Fingerprint</span>
                      )}
                      {cachedBioUser.hasFaceImage && (
                        <span className="px-1.5 py-0.5 bg-[#388bfd]/10 border border-[#388bfd]/20 text-[8px] text-[#388bfd] font-bold rounded-full uppercase">Face ID</span>
                      )}
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      setScannedBioUser(cachedBioUser);
                      setShowBioScanner(true);
                    }}
                    className="w-full bg-[#8957e5] text-white rounded-lg py-3 font-bold text-sm mb-3 hover:bg-[#8957e5]/90 transition shadow-lg shadow-[#8957e5]/20 flex items-center justify-center gap-2 cursor-pointer border-0 font-mono tracking-wider animate-pulse"
                  >
                    <Fingerprint className="w-4 h-4 animate-pulse" />
                    <span>VERIFY BIOMETRICS</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => {
                      setCachedBioUser(null);
                      setScannedBioUser(null);
                      setBioSearchLogin('');
                      setBioInputMode(false);
                    }}
                    className="w-full bg-transparent border border-[#388bfd]/30 text-[#388bfd] hover:bg-[#388bfd]/10 rounded-lg py-3 font-bold text-sm mb-3 transition cursor-pointer font-mono text-xs text-center border-0"
                  >
                    SWITCH ACCOUNT
                  </button>

                  <button 
                    type="button"
                    onClick={() => {
                      setCachedBioUser(null);
                      setBioInputMode(false);
                    }}
                    className="w-full bg-transparent border border-[#30363d] text-[#8b949e] hover:text-white rounded-lg py-2 font-bold text-sm mb-1 transition cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                </>
              ) : bioInputMode ? (
                <>
                  <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8957e5] to-[#d3bcf6] mb-2 text-center uppercase tracking-wider font-mono">
                    Query Fingerprint Node
                  </h2>
                  <p className="text-xs text-[#8b949e] mb-6 text-center leading-relaxed">
                    Enter the Username or Email associated with your biometric matrix to download the secure hardware session key from the node.
                  </p>
                  
                  <input 
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-4 focus:outline-none focus:border-[#8957e5]/50 font-mono text-center text-[#e6edf3]" 
                    placeholder="USERNAME OR EMAIL" 
                    value={bioSearchLogin} 
                    onChange={e => setBioSearchLogin(e.target.value)}
                  />

                  <button 
                    type="button"
                    onClick={handleVerifyNodeBiometrics}
                    className="w-full bg-[#8957e5] text-white rounded-lg py-3 font-bold text-sm mb-3 hover:bg-[#8957e5]/90 transition shadow-lg shadow-[#8957e5]/20 flex items-center justify-center gap-2 cursor-pointer border-0 font-mono tracking-wider"
                  >
                    <Fingerprint className="w-4 h-4 animate-pulse" />
                    <span>QUERY SECURITY MATRIX</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setBioInputMode(false)}
                    className="w-full bg-transparent border border-[#30363d] text-[#8b949e] hover:text-white rounded-lg py-3 font-bold text-sm mb-3 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#e6edf3] to-[#8b949e] mb-6 text-center">Sign In</h2>
                  <input 
                    disabled={isLoggingIn}
                    className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-3 focus:outline-none focus:border-[#388bfd]/50 transition-colors disabled:opacity-50" 
                    placeholder="Username or Email" 
                    value={loginForm.login} onChange={e => setLoginForm({...loginForm, login: e.target.value})}
                  />
                  <PasswordInput 
                    disabled={isLoggingIn}
                    placeholder="Password"
                    value={loginForm.password} 
                    onChange={(e: any) => setLoginForm({...loginForm, password: e.target.value})}
                    className="mb-2"
                  />
                  <div className="flex justify-end mb-6">
                     <button disabled={isLoggingIn} className="text-xs text-[#388bfd] hover:underline disabled:opacity-50 cursor-pointer" onClick={() => setMode('forgot')}>Forgot Password?</button>
                  </div>
                  <button 
                    disabled={isLoggingIn}
                    onClick={handleLogin} 
                    className="w-full bg-[#388bfd] text-white rounded-lg py-3 font-bold text-sm mb-3 hover:bg-[#388bfd]/90 transition shadow-lg shadow-[#388bfd]/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border-0"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <span>Sign In</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isLoggingIn}
                    onClick={handleBiometricLogin}
                    className="w-full bg-[#8957e5]/10 border border-[#8957e5]/30 text-[#8957e5] hover:text-[#d3bcf6] hover:border-[#8957e5] rounded-lg py-3 font-bold text-sm mb-3 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Fingerprint className="w-4 h-4 animate-pulse" />
                    <span>Biometric Node Sign In</span>
                  </button>
                  <button disabled={isLoggingIn} onClick={() => setMode('register')} className="w-full bg-transparent border border-[#8957E5]/50 text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8957E5] rounded-lg py-3 font-bold text-sm mb-3 transition disabled:opacity-50 cursor-pointer">Create Account</button>
                </>
              )}
            </>
          )}

          {mode === 'register' && (
            <>
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#e6edf3] to-[#8b949e] mb-6 text-center">Create Account</h2>
              
              <div className="flex flex-col items-center mb-6">
                <div 
                  className={`relative group ${isRegistering ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} w-20 h-20 rounded-full border-2 border-[#30363d] overflow-hidden bg-[#161b22] flex items-center justify-center p-0.5`}
                  onClick={() => !isRegistering && fileInputRef.current?.click()}
                >
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-[#0d1117]">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-[#8b949e]" />
                    )}
                  </div>
                  {!isRegistering && (
                    <div className="absolute inset-0 bg-black/50 rounded-full items-center justify-center hidden group-hover:flex">
                      <span className="text-[10px] text-white text-center font-medium">Upload<br/>Photo</span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={isRegistering}
                />
              </div>

              <input disabled={isRegistering} className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-3 focus:outline-none focus:border-[#388bfd]/50 transition-colors disabled:opacity-50" placeholder="Full Name (optional)" value={regForm.fullname} onChange={e => setRegForm({...regForm, fullname: e.target.value})} />
              <input disabled={isRegistering} className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-3 focus:outline-none focus:border-[#388bfd]/50 transition-colors disabled:opacity-50" placeholder="Username *" value={regForm.username} onChange={e => setRegForm({...regForm, username: e.target.value})} />
              <input disabled={isRegistering} className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-3 focus:outline-none focus:border-[#388bfd]/50 transition-colors disabled:opacity-50" placeholder="Email *" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} type="email" />
              <PasswordInput 
                disabled={isRegistering}
                placeholder="Password *"
                value={regForm.password}
                onChange={(e: any) => setRegForm({...regForm, password: e.target.value})}
                className="mb-3"
              />
              <PasswordInput 
                disabled={isRegistering}
                placeholder="Confirm Password *"
                value={regForm.confirm}
                onChange={(e: any) => setRegForm({...regForm, confirm: e.target.value})}
                className="mb-6"
              />

              {isRegistering && (
                <div className="mb-4 p-3 bg-[#161b22]/75 border border-[#8957e5]/30 rounded-lg flex flex-col gap-2 animate-pulse">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8957E5]" />
                    <span className="text-[10px] font-bold text-[#e6edf3] font-mono uppercase tracking-wider">Configuring Uplink Protocol</span>
                  </div>
                  <div className="text-[10px] text-[#8b949e] font-mono">
                    Task: <span className="text-[#8957E5] font-semibold">{registerStatus || "Registering..."}</span>
                  </div>
                  <div className="w-full bg-[#21262d] h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#8957e5] to-[#388bfd] transition-all duration-300"
                      style={{ 
                        width: registerStatus.toLowerCase().includes('avatar') ? '70%' : 
                               registerStatus.toLowerCase().includes('synchroniz') ? '90%' : 
                               registerStatus.toLowerCase().includes('database') ? '40%' : '20%' 
                      }}
                    />
                  </div>
                </div>
              )}

              <button 
                disabled={isRegistering}
                onClick={handleRegister} 
                className="w-full bg-[#8957E5] text-white rounded-lg py-3 font-bold text-sm mb-3 hover:bg-[#8957E5]/90 transition shadow-lg shadow-[#8957e5]/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border-0"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Synchronizing Profile...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>
              <button disabled={isRegistering} onClick={() => setMode('login')} className="text-[#8b949e] text-xs hover:text-white transition disabled:opacity-50 cursor-pointer bg-transparent border-0">Back to Login</button>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#e6edf3] to-[#8b949e] mb-4 text-center">Reset</h2>
              <p className="text-xs text-[#8b949e] mb-6 text-center leading-relaxed">
                Enter your email address. A reset code will be generated.
              </p>
              <input 
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-6 focus:outline-none focus:border-[#388bfd]/50 transition-colors" 
                placeholder="Email Address" type="email"
                value={forgotForm.email} onChange={e => setForgotForm({...forgotForm, email: e.target.value})}
              />
              <button onClick={handleForgot} className="bg-[#388bfd] text-white rounded-lg py-3 font-bold text-sm mb-3 shadow-lg shadow-[#388bfd]/20 transition active:scale-95">Generate Reset Code</button>
              <button onClick={() => setMode('login')} className="text-[#8b949e] text-xs hover:text-white">Back to Login</button>
            </>
          )}

          {mode === 'reset' && (
            <>
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#e6edf3] to-[#8b949e] mb-4 text-center">New Password</h2>
              <p className="text-xs text-[#8b949e] mb-6 text-center leading-relaxed font-mono">
                CODE: {resetForm.code}
              </p>
              <input 
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm mb-3 focus:outline-none font-mono focus:border-[#388bfd]/50" 
                placeholder="Reset Code" 
                value={resetForm.code} onChange={e => setResetForm({...resetForm, code: e.target.value})}
              />
              <PasswordInput 
                placeholder="New Password"
                value={resetForm.newPassword}
                onChange={(e: any) => setResetForm({...resetForm, newPassword: e.target.value})}
                className="mb-3"
              />
              <PasswordInput 
                placeholder="Confirm Password"
                value={resetForm.confirm}
                onChange={(e: any) => setResetForm({...resetForm, confirm: e.target.value})}
                className="mb-6"
              />
              <button onClick={handleReset} className="bg-[#388bfd] text-white rounded-lg py-3 font-bold text-sm mb-3 hover:bg-[#388bfd]/90 transition shadow-lg shadow-[#388bfd]/20">Reset Password</button>
              <button onClick={() => setMode('forgot')} className="text-[#8b949e] text-xs hover:text-white transition">Back</button>
            </>
          )}

          {showBioScanner && (
            <BiometricScanner
               mode="authenticate"
               userData={scannedBioUser}
               defaultScanType={scannedBioUser?.hasFaceImage && !scannedBioUser?.credId ? 'face' : 'finger'}
               onSuccess={handleBiometricLoginSuccess}
               onCancel={() => setShowBioScanner(false)}
            />
          )}

        </div>
      </div>
    </div>
  );
}
