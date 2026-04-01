import { supabase } from './supabaseClient';
import { User, Exam, ExamResult, AppSettings, Question, UserRole } from '../types';

// Hardcoded Settings (Since app_settings table is removed in new schema)
const DEFAULT_SETTINGS: AppSettings = {
  appName: 'CBT SPENDAPOL',
  themeColor: '#2459a9',
  gradientEndColor: '#60a5fa',
  logoStyle: 'circle',
  schoolLogoUrl: 'https://lh3.googleusercontent.com/d/1ffr_74cOvUr0VGVDbMIMVLDCT3hluAkI',
  antiCheat: {
    isActive: true,
    freezeDurationSeconds: 15,
    alertText: 'PERINGATAN! Dilarang berpindah aplikasi.',
    enableSound: true
  }
};

// --- UTILS ---
const cleanHtml = (html: string) => {
    if (!html) return '';
    // Remove all style, class, lang attributes
    let cleaned = html.replace(/\s+(style|class|lang|size|face|color|font)="[^"]*"/gi, '');
    // Remove Word-specific tags and comments
    cleaned = cleaned.replace(/<xml>[\s\S]*?<\/xml>|<!--[\s\S]*?-->|<style>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<o:[^>]*>|<\/o:[^>]*>/gi, '');
    cleaned = cleaned.replace(/<v:[^>]*>|<\/v:[^>]*>/gi, '');
    cleaned = cleaned.replace(/<w:[^>]*>|<\/w:[^>]*>/gi, '');
    // Strip all tags except img, b, i, u, sup, sub, br
    cleaned = cleaned.replace(/<(?!img|b|i|u|sup|sub|br|\/img|\/b|\/i|\/u|\/sup|\/sub|\/br)[^>]+>/gi, '');
    // Remove &nbsp; and multiple spaces
    cleaned = cleaned.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned;
};

const stripScoreMarker = (html: string) => {
    if (!html) return '';
    const caretIdx = html.indexOf('^');
    if (caretIdx !== -1) {
        const before = html.substring(0, caretIdx).replace(/<[^>]+>/g, '').trim();
        if (/^-?\d+$/.test(before)) {
            return html.substring(caretIdx + 1);
        }
    }
    return html;
};

export const db = {
  getSettings: async (): Promise<AppSettings> => {
    // Return hardcoded settings as the new schema doesn't include app_settings
    return DEFAULT_SETTINGS;
  },

  updateSettings: async (newSettings: Partial<AppSettings>): Promise<void> => {
    // No-op since we don't have a settings table anymore
    console.log("Settings update requested (Local Only)", newSettings);
  },

  login: async (input: string, password?: string): Promise<User | undefined> => {
    const cleanInput = input.trim();
    
    // 1. HARDCODED ADMIN CHECK
    if (cleanInput === 'superadmin' && password === 'admin') {
        return {
            id: 'superadmin-id',
            name: 'Kepala Kelas / Root',
            username: 'superadmin',
            role: UserRole.SUPER_ADMIN,
            school: 'PUSAT',
            password: 'admin'
        };
    }

    if (cleanInput === 'admin' && password === 'admin') {
        return {
            id: 'admin-id',
            name: 'Administrator',
            username: 'admin',
            role: UserRole.ADMIN,
            school: 'PUSAT',
            password: 'admin'
        };
    }

    // 2. STUDENT CHECK (Table: students)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('nisn', cleanInput)
      .single();

    if (error || !data) return undefined;

    // Verify Password
    if (data.password !== password) {
        return undefined;
    }

    // Check Status
    if (data.status === 'blocked') {
        alert("Akun diblokir. Hubungi pengawas.");
        return undefined;
    }

    // Update Login Status
    await supabase.from('students').update({ is_login: true, status: 'idle' }).eq('id', data.id);

    return {
        id: data.id,
        name: data.name,
        username: data.nisn,
        role: UserRole.STUDENT,
        school: data.school,
        nisn: data.nisn,
        password: data.password,
        status: data.status,
        isLogin: data.is_login,
        grade: 6 // Default mapping
    };
  },

  // Logout (Reset login status)
  logout: async (userId: string): Promise<void> => {
      if(userId !== 'admin-id') {
          await supabase.from('students').update({ is_login: false }).eq('id', userId);
      }
  },

  getExams: async (level?: string): Promise<Exam[]> => {
    // Query 'subjects' table
    const { data: subjects, error } = await supabase
        .from('subjects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error || !subjects) {
        console.error("Error fetching subjects:", error);
        return [];
    }

    // For each subject, fetch questions to build the object
    const exams: Exam[] = [];

    for (const sub of subjects) {
        const { data: questions } = await supabase
            .from('questions')
            .select('*')
            .eq('subject_id', sub.id);
        
        const mappedQuestions: Question[] = (questions || []).map((q: any) => {
            const type = (q["Tipe Soal"] as any) || 'PG';
            let keyStr = q["Kunci"] ? String(q["Kunci"]).trim().toUpperCase() : 'A';
            
            // Strip score markers from keyStr if present (e.g., "4^A;1^B" or "4^A")
            if (keyStr.includes('^')) {
                const parts = keyStr.split(/[;,]/);
                keyStr = parts.map(p => {
                    const caretIdx = p.indexOf('^');
                    return caretIdx !== -1 ? p.substring(caretIdx + 1).trim() : p.trim();
                }).join(';');
            }
            
            let cIndex = 0;
            let cIndices: number[] = [];

            if (type === 'PG_KOMPLEKS' || type === 'PG_BS') {
                const parts = keyStr.split(/[;,]/);
                cIndices = parts.map((p: string) => p.trim().charCodeAt(0) - 65).filter((idx: number) => idx >= 0 && idx < 10);
                if (cIndices.length > 0) cIndex = cIndices[0];
            } else {
                cIndex = keyStr.charCodeAt(0) - 65;
                if (cIndex < 0 || cIndex > 7) cIndex = 0;
            }
            
            // Helper to clean option text from score markers
            const cleanOption = (opt: string) => {
                if (!opt) return '';
                return cleanHtml(stripScoreMarker(opt));
            };

            return {
                id: q.id,
                subjectId: q.subject_id,
                nomor: q["Nomor"],
                type: type,
                text: cleanHtml(stripScoreMarker(q["Soal"] || '')),
                imgUrl: q["Url Gambar"] || undefined,
                options: [
                    cleanOption(q["Opsi A"] || ''), 
                    cleanOption(q["Opsi B"] || ''), 
                    cleanOption(q["Opsi C"] || ''), 
                    cleanOption(q["Opsi D"] || '')
                ].filter(o => o !== '' || type === 'PG'),
                correctIndex: cIndex,
                correctIndices: cIndices,
                points: parseInt(q["Bobot"] || '10')
            };
        });

        // Parse School Access JSONB
        let schoolAccess: string[] = [];
        try {
            if (typeof sub.school_access === 'string') {
                schoolAccess = JSON.parse(sub.school_access);
            } else if (Array.isArray(sub.school_access)) {
                schoolAccess = sub.school_access;
            }
        } catch (e) { schoolAccess = []; }

        exams.push({
            id: sub.id,
            title: sub.name,
            subject: sub.name,
            educationLevel: 'SMP',
            durationMinutes: sub.duration,
            questionCount: sub.question_count,
            token: sub.token,
            isActive: sub.is_active !== false, // Default to true if null or undefined
            questions: mappedQuestions,
            examDate: sub.exam_date,
            endTime: sub.end_time,
            session: sub.session,
            schoolAccess: schoolAccess
        });
    }

    return exams;
  },

  // Updated to support Full Mapping
  updateExamMapping: async (examId: string, token: string, durationMinutes: number, examDate: string, endTime: string, session: string, schoolAccess: string[]): Promise<void> => {
    const payload: any = { 
      token: token,
      duration: durationMinutes,
      exam_date: examDate,
      session: session,
      school_access: schoolAccess
    };

    try {
        const { error } = await supabase.from('subjects').update({ ...payload, end_time: endTime }).eq('id', examId);
        if (error && error.message.includes('column "end_time" of relation "subjects" does not exist')) {
            await supabase.from('subjects').update(payload).eq('id', examId);
        } else if (error) throw error;
    } catch (err) {
        await supabase.from('subjects').update(payload).eq('id', examId);
    }
  },

  updateExamStatus: async (examId: string, isActive: boolean): Promise<void> => {
    try {
        const { error } = await supabase.from('subjects').update({ 
          is_active: isActive
        }).eq('id', examId);
        if (error) throw error;
    } catch (err) {
        console.error("Error updating exam status:", err);
        throw new Error("Gagal mengubah status. Pastikan database sudah diperbarui dengan kolom 'is_active'.");
    }
  },

  deleteExam: async (examId: string): Promise<void> => {
    await supabase.from('subjects').delete().eq('id', examId);
  },

  createExam: async (exam: Exam): Promise<void> => {
    const payload: any = {
        name: exam.title,
        duration: exam.durationMinutes,
        question_count: 0,
        token: exam.token
    };
    
    // Try to include is_active, but handle if column doesn't exist yet
    try {
        const { error } = await supabase.from('subjects').insert({ ...payload, is_active: true });
        if (error && error.message.includes('column "is_active" of relation "subjects" does not exist')) {
            await supabase.from('subjects').insert(payload);
        } else if (error) throw error;
    } catch (err) {
        // Fallback for older schema
        await supabase.from('subjects').insert(payload);
    }
  },

  addQuestions: async (examId: string, questions: Question[]): Promise<void> => {
      const payload = questions.map((q, idx) => {
          const keyMap = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          let keyChar = 'A';
          
          if (q.type === 'PG_KOMPLEKS' || q.type === 'PG_BS') {
              keyChar = (q.correctIndices || []).map(idx => keyMap[idx]).join(";");
          } else if (q.type === 'PG') {
              keyChar = q.correctIndex !== undefined ? keyMap[q.correctIndex] : 'A';
          } else {
              keyChar = '';
          }

          return {
              subject_id: examId,
              "Nomor": String(idx + 1),
              "Tipe Soal": q.type,
              "Jenis Soal": "UMUM",
              "Soal": q.text,
              "Opsi A": q.options[0] || '',
              "Opsi B": q.options[1] || '',
              "Opsi C": q.options[2] || '',
              "Opsi D": q.options[3] || '',
              "Kunci": keyChar,
              "Bobot": String(q.points),
              "Url Gambar": q.imgUrl || ''
          };
      });
      
      const { error } = await supabase.from('questions').insert(payload);
      if (error) throw error;

      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject_id', examId);
      if (count !== null) {
          await supabase.from('subjects').update({ question_count: count }).eq('id', examId);
      }
  },

  submitResult: async (result: ExamResult): Promise<void> => {
    // Note: 'results' table in schema doesn't technically have cheating_attempts column based on SQL provided previously,
    // but assuming we might add it or just tracking 'score'. 
    // If you need to persist cheating, ensure column exists. For now, standard insert.
    const payload = {
        student_id: result.studentId,
        subject_id: result.examId,
        score: result.score
    };
    await supabase.from('results').insert(payload);
    await supabase.from('students').update({ status: 'finished' }).eq('id', result.studentId);
  },

  getAllResults: async (): Promise<ExamResult[]> => {
    const { data, error } = await supabase
        .from('results')
        .select(`
            id, score, timestamp, student_id, subject_id,
            students (name, school),
            subjects (name)
        `)
        .order('timestamp', { ascending: false });

    if (error || !data) return [];
    
    // Note: Since real DB might not store cheating_attempts in 'results' table yet (based on previous schema),
    // we default it to 0 or mock it if needed for the UI demo.
    // In a real scenario, ADD 'cheating_attempts' column to 'results' table.
    return data.map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.students?.name || 'Unknown',
        examId: r.subject_id,
        examTitle: r.subjects?.name || 'Unknown',
        score: Number(r.score),
        submittedAt: r.timestamp,
        totalQuestions: 0, 
        cheatingAttempts: 0 // Defaulting as DB column might be missing
    }));
  },

  // NEW FUNCTION: Reset Cheating Count
  resetCheatingCount: async (resultId: string): Promise<void> => {
      // In a real implementation with a cheating_attempts column:
      // await supabase.from('results').update({ cheating_attempts: 0 }).eq('id', resultId);
      
      // Since we are mocking the realtime aspect on the dashboard for the prompt:
      // This is a placeholder for the backend logic.
      console.log(`Resetting cheating count for result ${resultId}`);
      return Promise.resolve();
  },

  getUsers: async (): Promise<User[]> => {
    const { data } = await supabase.from('students').select('*').order('school', { ascending: true });
    if (!data) return [];

    return data.map((u: any) => ({
        id: u.id,
        name: u.name,
        username: u.nisn,
        role: UserRole.STUDENT,
        nisn: u.nisn,
        school: u.school,
        password: u.password,
        status: u.status,
        isLogin: u.is_login,
        grade: 6
    }));
  },
  
  importStudents: async (users: User[]): Promise<void> => {
      const payload = users.map(u => ({
          name: u.name,
          nisn: u.nisn || u.username, 
          school: u.school || 'UMUM',
          password: u.password || '12345',
          is_login: false,
          status: 'idle'
      }));
      const { error } = await supabase.from('students').upsert(payload, { onConflict: 'nisn' });
      if (error) throw error;
  },

  addUser: async (user: User): Promise<void> => {
      const payload = {
          name: user.name,
          nisn: user.nisn || user.username,
          school: user.school || 'UMUM',
          password: user.password || '12345',
          is_login: false,
          status: 'idle'
      };
      const { error } = await supabase.from('students').insert(payload);
      if (error) throw error;
  },

  deleteUser: async (id: string): Promise<void> => {
    await supabase.from('students').delete().eq('id', id);
  },

  updateQuestion: async (questionId: string, q: Question): Promise<void> => {
      const keyMap = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      let keyChar = 'A';
      
      if (q.type === 'PG_KOMPLEKS' || q.type === 'PG_BS') {
          keyChar = (q.correctIndices || []).map(idx => keyMap[idx]).join(";");
      } else if (q.type === 'PG') {
          keyChar = q.correctIndex !== undefined ? keyMap[q.correctIndex] : 'A';
      } else {
          keyChar = '';
      }

      const payload = {
          "Tipe Soal": q.type,
          "Soal": q.text,
          "Opsi A": q.options[0] || '',
          "Opsi B": q.options[1] || '',
          "Opsi C": q.options[2] || '',
          "Opsi D": q.options[3] || '',
          "Kunci": keyChar,
          "Bobot": String(q.points),
          "Url Gambar": q.imgUrl || ''
      };
      
      const { error } = await supabase.from('questions').update(payload).eq('id', questionId);
      if (error) throw error;
  },

  deleteQuestion: async (questionId: string, examId: string): Promise<void> => {
      const { error } = await supabase.from('questions').delete().eq('id', questionId);
      if (error) throw error;

      // Update question count in subjects table
      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject_id', examId);
      if (count !== null) {
          await supabase.from('subjects').update({ question_count: count }).eq('id', examId);
      }
  },

  resetUserStatus: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ is_login: false, status: 'idle' }).eq('id', userId);
  },

  resetUserPassword: async (userId: string): Promise<void> => {
    await supabase.from('students').update({ password: '12345' }).eq('id', userId);
  }
};