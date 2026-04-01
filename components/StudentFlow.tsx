import React, { useState, useEffect } from 'react';
import { User, Exam, AppSettings } from '../types';
import { db } from '../services/database'; 
import { UserCircle, RefreshCcw, Lock, CheckCircle, Play, Calendar, XCircle } from 'lucide-react';
import { BackgroundShapes } from './BackgroundShapes';

interface StudentFlowProps {
  user: User;
  onStartExam: (exam: Exam) => void;
  onLogout: () => void;
  settings: AppSettings;
}

type Step = 'DASHBOARD' | 'DATA_CONFIRM' | 'TEST_CONFIRM';

export const StudentFlow: React.FC<StudentFlowProps> = ({ user, onStartExam, onLogout, settings }) => {
  // Initialize state from sessionStorage if available
  const [step, setStep] = useState<Step>(() => {
      return (sessionStorage.getItem('das_student_flow_step') as Step) || 'DASHBOARD';
  });
  const [selectedExam, setSelectedExam] = useState<Exam | null>(() => {
      const saved = sessionStorage.getItem('das_student_flow_exam');
      return saved ? JSON.parse(saved) : null;
  });

  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [completedExams, setCompletedExams] = useState<string[]>([]);
  
  // Confirmation Form State
  const [inputName, setInputName] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadExamsAndResults();
  }, [user.id]);

  // Persist state changes
  useEffect(() => {
      sessionStorage.setItem('das_student_flow_step', step);
  }, [step]);

  useEffect(() => {
      if (selectedExam) {
          sessionStorage.setItem('das_student_flow_exam', JSON.stringify(selectedExam));
      } else {
          sessionStorage.removeItem('das_student_flow_exam');
      }
  }, [selectedExam]);

  const loadExamsAndResults = async () => {
    // 1. Get Exams (Subjects)
    const exams = await db.getExams('SMP'); 
    // Filter by isActive and school access
    const filteredExams = exams.filter(ex => ex.isActive);
    setAvailableExams(filteredExams);

    // 2. Get Results for this user
    const allResults = await db.getAllResults();
    const myResults = allResults.filter(r => r.studentId === user.id);
    const finishedExamIds = myResults.map(r => r.examId);
    setCompletedExams(finishedExamIds);
  };

  const handleSelectExam = (exam: Exam) => {
    if (completedExams.includes(exam.id)) return; 
    
    setSelectedExam(exam);
    setStep('DATA_CONFIRM');
    setInputName(''); 
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
        setIsRefreshing(false);
    }, 1000);
  };

  const handleSubmitData = () => {
    if (!selectedExam) return;
    
    // Validate Input Name
    if (inputName.trim().toLowerCase() !== user.name.toLowerCase()) {
        alert(`Nama Peserta tidak sesuai! \nHarap ketik: "${user.name}"`);
        return;
    }

    // Validate Token
    if (inputToken.toUpperCase() !== selectedExam.token) {
        alert("Token Salah! Silakan hubungi pengawas/admin untuk token yang benar.");
        return;
    }

    setStep('TEST_CONFIRM');
  };

  const handleStartTest = () => {
    if (selectedExam) {
      // Clear local flow persistence as we move to actual exam
      sessionStorage.removeItem('das_student_flow_step');
      sessionStorage.removeItem('das_student_flow_exam');
      onStartExam(selectedExam);
    }
  };

  const themeStyle = {
      background: `linear-gradient(to bottom, ${settings.themeColor}, ${settings.gradientEndColor})`
  };

  // --- VIEW 1: DASHBOARD ---
  if (step === 'DASHBOARD') {
    return (
      <div className="min-h-screen flex flex-col items-center pt-10 px-4 pb-10 overflow-hidden relative" style={themeStyle}>
        
        <BackgroundShapes />

        <div className="flex flex-col items-center mb-6 text-white animate-in slide-in-from-top-10 fade-in duration-700 z-10">
             <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 shadow-lg">
                <h1 className="text-lg font-bold tracking-wide drop-shadow-md">{settings.appName}</h1>
             </div>
             <p className="opacity-90 font-light drop-shadow-sm mt-2 text-sm">Selamat Datang, <strong>{user.name}</strong>!</p>
        </div>

        <div className="w-full max-w-5xl z-10">
            
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-8 flex flex-col md:flex-row items-center justify-between border border-white/50">
                 <div className="flex items-center gap-4">
                     <div className="bg-blue-100 p-2 rounded-full border-2 border-blue-200">
                         <UserCircle className="text-blue-600" size={32}/>
                     </div>
                     <div>
                         <p className="text-xs text-gray-500 font-bold uppercase">Peserta Ujian</p>
                         <h2 className="text-lg font-bold text-gray-800">{user.name}</h2>
                         <p className="text-xs text-gray-500 font-mono">{user.nisn} | {user.school}</p>
                     </div>
                 </div>
                 
                 <div className="mt-4 md:mt-0 flex gap-3">
                     <button onClick={onLogout} className="px-4 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100 transition">
                         Keluar
                     </button>
                 </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                {availableExams.map((exam) => {
                    const isDone = completedExams.includes(exam.id);
                    
                    // Real-time start check
                    const now = new Date();
                    const todayStr = now.toISOString().split('T')[0];
                    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                    
                    const isToday = exam.examDate === todayStr;
                    const isTimeReached = !exam.session || currentTimeStr >= exam.session;
                    const isTimeOver = exam.endTime && currentTimeStr > exam.endTime;
                    const canStart = isToday && isTimeReached && !isTimeOver;
                    const isWaiting = isToday && !isTimeReached;
                    const isExpired = isToday && isTimeOver;

                    return (
                        <div 
                            key={exam.id}
                            onClick={() => !isDone && canStart && handleSelectExam(exam)}
                            className={`
                                relative group rounded-3xl p-6 transition-all duration-300 transform flex flex-col items-center justify-between min-h-[200px] overflow-hidden
                                ${isDone 
                                    ? 'bg-white/80 border-4 border-green-200 grayscale-[0.3]' 
                                    : !canStart
                                        ? 'bg-gray-100 border-4 border-gray-200 cursor-not-allowed opacity-80'
                                        : 'bg-white border-b-[10px] border-blue-200 hover:-translate-y-3 hover:shadow-2xl cursor-pointer hover:border-blue-400'
                                }
                            `}
                        >
                             <div className="text-center w-full z-10 mt-4">
                                 <h3 className="text-xl font-extrabold text-gray-800 mb-1 leading-tight line-clamp-2">{exam.subject}</h3>
                                 <div className="flex flex-col items-center gap-1 mb-6">
                                     <div className="flex justify-center gap-2 text-xs font-bold text-gray-500 bg-gray-50 p-2 rounded-lg inline-flex">
                                         <span className="flex items-center"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1"></span>{exam.durationMinutes} Menit</span>
                                         <span className="flex items-center"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-1"></span>{exam.questions.length} Soal</span>
                                     </div>
                                     {exam.session && (
                                         <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                             Mulai: {exam.session} {exam.endTime ? ` s/d ${exam.endTime}` : ''}
                                         </span>
                                     )}
                                 </div>

                                 {isDone ? (
                                     <div className="w-full py-3 bg-green-100 text-green-700 rounded-xl font-bold text-sm flex items-center justify-center shadow-inner">
                                         <CheckCircle size={18} className="mr-2"/> Selesai
                                     </div>
                                 ) : isExpired ? (
                                     <div className="w-full py-3 bg-red-100 text-red-700 rounded-xl font-bold text-sm flex items-center justify-center shadow-inner border border-red-200">
                                         <XCircle size={18} className="mr-2"/> Waktu Habis
                                     </div>
                                 ) : isWaiting ? (
                                     <div className="w-full py-3 bg-amber-100 text-amber-700 rounded-xl font-bold text-sm flex items-center justify-center shadow-inner border border-amber-200">
                                         <Lock size={18} className="mr-2"/> Belum Dimulai
                                     </div>
                                 ) : !isToday ? (
                                     <div className="w-full py-3 bg-gray-200 text-gray-500 rounded-xl font-bold text-sm flex items-center justify-center shadow-inner">
                                         <Calendar size={18} className="mr-2"/> Bukan Hari Ini
                                     </div>
                                 ) : (
                                     <button className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-blue-300 shadow-lg group-hover:bg-blue-700 transition flex items-center justify-center transform group-hover:scale-105 active:scale-95">
                                         <Play size={18} className="mr-2 fill-current"/> Kerjakan
                                     </button>
                                 )}
                             </div>
                        </div>
                    );
                })}
            </div>

        </div>
      </div>
    );
  }

  // --- VIEW 2: DATA CONFIRM ---
  if (step === 'DATA_CONFIRM' && selectedExam) {
      return (
        <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
             <div className="h-48 w-full absolute top-0 z-0 shadow-md" style={{ backgroundColor: settings.themeColor }}></div>
             <header className="relative z-10 flex justify-between items-center p-6 text-white max-w-7xl mx-auto w-full">
                 <div className="flex items-center gap-4">
                     <div><h1 className="font-bold text-xl tracking-wide">{settings.appName}</h1><p className="text-sm opacity-90">Konfirmasi Data</p></div>
                 </div>
            </header>
            
            <main className="relative z-10 max-w-6xl mx-auto w-full mt-4 flex flex-col md:flex-row gap-6 px-4 pb-12">
                 <div className="w-full md:w-1/3 space-y-4">
                    <div className="bg-white rounded shadow-md p-4 flex items-center justify-between border-l-4 animate-in slide-in-from-left-4 duration-500" style={{ borderColor: settings.themeColor }}>
                        <div><p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Status Token</p><div className="flex items-center space-x-2"><div className={`h-2 w-2 rounded-full ${isRefreshing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div><p className="text-sm font-bold text-gray-700">{isRefreshing ? 'Memuat...' : 'Aktif'}</p></div></div>
                        <button onClick={handleRefresh} className="text-white px-3 py-1.5 text-xs font-bold rounded hover:opacity-90 transition flex items-center shadow-sm" style={{ backgroundColor: settings.themeColor }}><RefreshCcw size={12} className={`mr-1 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh</button>
                    </div>
                    <button onClick={() => setStep('DASHBOARD')} className="w-full py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 font-bold text-sm">Kembali ke Menu</button>
                 </div>
                 <div className="w-full md:w-2/3 bg-white rounded shadow-lg p-6 md:p-8 animate-in slide-in-from-right-4 duration-500 mb-8">
                      <h2 className="text-xl font-bold text-gray-700 mb-6 border-b pb-4">Konfirmasi data Peserta</h2>
                      <div className="grid grid-cols-1 gap-y-4 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-1"><label className="font-bold text-gray-700">NISN</label><div className="md:col-span-2 text-gray-600 font-mono bg-gray-50 p-2 rounded border border-gray-100">{user.nisn || '-'}</div></div>
                          <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-1"><label className="font-bold text-gray-700">Nama Peserta</label><div className="md:col-span-2 text-gray-600 font-bold uppercase bg-gray-50 p-2 rounded border border-gray-100">{user.name}</div></div>
                          <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-1"><label className="font-bold text-gray-700">Mata Ujian</label><div className="md:col-span-2 text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">{selectedExam.title}</div></div>
                          <div className="border-t my-2 border-gray-100"></div>
                          <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-1 mt-2"><label className="font-bold text-gray-700">Ketik Nama</label><input className="md:col-span-2 border rounded p-2.5 focus:ring-2 w-full outline-none transition" style={{ '--tw-ring-color': settings.themeColor } as React.CSSProperties} placeholder="Ketikkan Nama Peserta" value={inputName} onChange={e => setInputName(e.target.value)}/></div>
                          <div className="grid grid-cols-1 md:grid-cols-3 md:items-center gap-1 mt-2 bg-blue-50 p-3 rounded border border-blue-100"><label className="font-bold text-gray-700">Token</label><div className="md:col-span-2"><input className="border rounded p-2.5 focus:ring-2 w-full uppercase font-mono tracking-widest text-lg font-bold" style={{ '--tw-ring-color': settings.themeColor } as React.CSSProperties} placeholder="Ketikkan token" maxLength={6} value={inputToken} onChange={e => setInputToken(e.target.value.toUpperCase())}/><p className="text-xs text-gray-500 mt-1 italic">*Token didapat dari proktor</p></div></div>
                      </div>
                      <button onClick={handleSubmitData} className="w-full text-white font-bold py-3.5 rounded mt-8 shadow-md hover:shadow-lg transition transform active:scale-95" style={{ backgroundColor: settings.themeColor }}>Submit</button>
                 </div>
            </main>
        </div>
      );
  }

  // --- VIEW 3: TEST CONFIRM ---
  if (step === 'TEST_CONFIRM' && selectedExam) {
     return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="p-4 text-white text-center" style={{ backgroundColor: settings.themeColor }}>
                    <h3 className="font-bold tracking-wide">{settings.appName}</h3>
                  </div>
                  <div className="p-8">
                       <div className="flex justify-center mb-4"><div className="bg-red-50 p-3 rounded-full animate-pulse"><Lock className="text-red-500" size={32}/></div></div>
                       <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Konfirmasi Tes</h2>
                       <div className="space-y-4 text-sm bg-gray-50 p-4 rounded-lg border border-gray-100">
                           <div className="flex justify-between border-b border-gray-200 pb-2"><span className="font-bold text-gray-500">Nama Tes</span><span className="font-bold text-gray-800">{selectedExam.title}</span></div>
                           <div className="flex justify-between border-b border-gray-200 pb-2"><span className="font-bold text-gray-500">Durasi</span><span className="font-bold text-gray-800">{selectedExam.durationMinutes} Menit</span></div>
                           <div className="flex justify-between"><span className="font-bold text-gray-500">Token</span><span className="font-bold text-gray-800 font-mono tracking-wider">{selectedExam.token}</span></div>
                       </div>
                       <div className="flex gap-2 mt-8">
                           <button onClick={() => setStep('DATA_CONFIRM')} className="flex-1 border border-gray-300 text-gray-600 font-bold py-3.5 rounded-full shadow-sm hover:bg-gray-50">Batal</button>
                           <button onClick={handleStartTest} className="flex-1 text-white font-bold py-3.5 rounded-full shadow-lg transition transform hover:-translate-y-1 hover:shadow-xl" style={{ backgroundColor: settings.themeColor }}>Mulai</button>
                       </div>
                  </div>
             </div>
        </div>
     );
  }

  return <div>Error State</div>;
};