
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  STUDENT = 'STUDENT'
}

// Mapped from 'students' table
export interface User {
  id: string;
  name: string;
  username: string; // Maps to NISN
  role: UserRole;
  school?: string;
  password?: string;
  isLogin?: boolean;
  status?: 'idle' | 'working' | 'finished' | 'blocked';
  // Virtual fields for UI compatibility
  grade?: number; 
  nisn?: string; 
  gender?: string;
  birthDate?: string;
  isLocked?: boolean;
}

export type QuestionType = 'PG' | 'PG_KOMPLEKS' | 'CHECKLIST' | 'URAIAN';

// Mapped from 'questions' table
export interface Question {
  id: string;
  subjectId?: string;
  nomor?: string;
  type: QuestionType; // Mapped from "Tipe Soal"
  category?: string; // Mapped from "Jenis Soal"
  text: string;      // Mapped from "Soal"
  imgUrl?: string;   // Mapped from "Url Gambar"
  options: string[]; // Mapped from "Opsi A"..."Opsi D"
  correctIndex?: number; // Parsed from "Kunci"
  correctIndices?: number[]; // Parsed from "Kunci" for Complex
  points: number;    // Mapped from "Bobot"
}

// Mapped from 'subjects' table
export interface Exam {
  id: string;
  title: string;     // Mapped from "name"
  subject: string;   // Mapped from "name"
  durationMinutes: number; // Mapped from "duration"
  questionCount: number;   // Mapped from "question_count"
  token: string;
  isActive: boolean; // Virtual (always true based on schema)
  questions: Question[]; // Populated via relation
  
  // Mapping Fields
  examDate?: string; // Mapped from "exam_date"
  session?: string;  // Mapped from "session"
  schoolAccess?: string[]; // Mapped from "school_access"

  // Virtual fields for UI compatibility
  educationLevel: 'SD' | 'SMP';
  startDate?: string;
  endDate?: string;
}

// Mapped from 'results' table
export interface ExamResult {
  id: string;
  studentId: string;
  studentName?: string; // Joined field
  examId: string;       // subject_id
  examTitle?: string;   // Joined field
  score: number;
  submittedAt: string;  // timestamp
  
  // Virtual fields
  totalQuestions: number;
  cheatingAttempts: number;
}

export interface AppSettings {
  appName: string;
  themeColor: string;
  gradientEndColor: string;
  schoolLogoUrl?: string;
  logoStyle: 'circle' | 'rect_4_3' | 'rect_3_4_vert'; 
  antiCheat: {
    isActive: boolean;
    freezeDurationSeconds: number;
    alertText: string;
    enableSound: boolean;
  }; 
}
