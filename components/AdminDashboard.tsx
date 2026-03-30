import React, { useState, useEffect, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { User, Exam, UserRole, Question, QuestionType, ExamResult, AppSettings } from '../types';
import { db } from '../services/database'; 
import { Plus, BookOpen, Save, LogOut, Loader2, Key, RotateCcw, Clock, Upload, Download, FileText, LayoutDashboard, Settings, Printer, Filter, Calendar, FileSpreadsheet, Lock, Link, Edit, ShieldAlert, Activity, ClipboardList, Search, Unlock, Trash2, Database, School, Shuffle, X, CheckSquare, Map, CalendarDays, Flame, Volume2, AlertTriangle, UserX, Info, Check, Monitor, Users, GraduationCap, CheckCircle, XCircle, ArrowLeft, BarChart3, PieChart, Menu } from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  appName: string;
  onSettingsChange: () => void;
  themeColor: string;
  settings: AppSettings;
}

// Fixed Logo for Card Printing
const FIXED_LOGO_URL = "https://lh3.googleusercontent.com/d/1ffr_74cOvUr0VGVDbMIMVLDCT3hluAkI";

// --- ROBUST CSV PARSER ---
const parseCSV = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = cleanText.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (char === '"') {
            if (insideQuotes && cleanText[i + 1] === '"') {
                currentField += '"';
                i++; 
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !insideQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    return rows;
};

const escapeCSV = (field: any): string => {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes('"') || stringField.includes(',') || stringField.includes(';') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout, appName, onSettingsChange, themeColor, settings }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  
  // TABS
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'MONITORING' | 'HASIL_UJIAN' | 'BANK_SOAL' | 'MAPPING' | 'PESERTA' | 'CETAK_KARTU' | 'ANTI_CHEAT'>('DASHBOARD');
  
  // DASHBOARD DRILL-DOWN VIEWS
  const [dashboardView, setDashboardView] = useState<'MAIN' | 'STUDENTS_DETAIL' | 'SCHOOLS_DETAIL' | 'EXAMS_DETAIL'>('MAIN');

  // ANTI CHEAT STATE
  const [acActive, setAcActive] = useState(settings.antiCheat.isActive);
  const [acFreeze, setAcFreeze] = useState(settings.antiCheat.freezeDurationSeconds);
  const [acText, setAcText] = useState(settings.antiCheat.alertText);
  const [acSound, setAcSound] = useState(settings.antiCheat.enableSound);

  // MAPPING / SCHEDULE STATE
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editSession, setEditSession] = useState('');
  const [editSchoolAccess, setEditSchoolAccess] = useState<string[]>([]);
  const [mappingSearch, setMappingSearch] = useState(''); 
  
  // QUESTION BANK STATE
  const [viewingQuestionsExam, setViewingQuestionsExam] = useState<Exam | null>(null);
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [isWordGuideOpen, setIsWordGuideOpen] = useState(false);
  const [targetExamForAdd, setTargetExamForAdd] = useState<Exam | null>(null);
  
  // MANUAL QUESTION FORM
  const [nqType, setNqType] = useState<QuestionType>('PG');
  const [nqText, setNqText] = useState<string>('');
  const [nqImg, setNqImg] = useState<string>('');
  const [nqOptions, setNqOptions] = useState<string[]>(['', '', '', '']);
  const [nqCorrectIndex, setNqCorrectIndex] = useState<number>(0);
  const [nqCorrectIndices, setNqCorrectIndices] = useState<number[]>([]);
  const [nqPoints, setNqPoints] = useState<number>(10);

  // IMPORT REFS
  const [importTargetExamId, setImportTargetExamId] = useState<string | null>(null);
  const studentFileRef = useRef<HTMLInputElement>(null);
  const questionFileRef = useRef<HTMLInputElement>(null);
  const zipFileRef = useRef<HTMLInputElement>(null);
  
  // FILTERS & CARD PRINTING
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL'); // For Peserta & Monitoring
  const [dashboardSchoolFilter, setDashboardSchoolFilter] = useState<string>('ALL'); // For Dashboard Details
  const [resultSchoolFilter, setResultSchoolFilter] = useState<string>('ALL'); // For Results
  const [cardSchoolFilter, setCardSchoolFilter] = useState<string>('ALL'); // For Cards
  const [monitoringSearch, setMonitoringSearch] = useState<string>('');
  const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  
  // GRAPH FILTERS
  const [graphFilterMode, setGraphFilterMode] = useState<'SCHEDULED' | 'ALL'>('SCHEDULED');
  const [graphDate, setGraphDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSchoolTooltip, setSelectedSchoolTooltip] = useState<{name: string, value: number, x: number, y: number} | null>(null);

  // MONITORING BULK ACTIONS
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // MOBILE SIDEBAR STATE
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // STUDENT MANUAL ADD STATE
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [nsName, setNsName] = useState('');
  const [nsNisn, setNsNisn] = useState('');
  const [nsSchool, setNsSchool] = useState('');
  const [nsPassword, setNsPassword] = useState('12345');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoadingData(true);
    const e = await db.getExams(); 
    const u = await db.getUsers();
    const r = await db.getAllResults();
    setExams(e);
    setUsers(u); 
    setResults(r);
    setIsLoadingData(false);
  };

  // --- ACTIONS ---
  const handleSaveAntiCheat = async () => {
      await db.updateSettings({
          antiCheat: {
              isActive: acActive,
              freezeDurationSeconds: acFreeze,
              alertText: acText,
              enableSound: acSound
          }
      });
      onSettingsChange();
      alert("Pengaturan Sistem Anti-Curang berhasil diperbarui!");
  };

  const handleResetViolation = async (resultId: string) => {
      if(!confirm("Reset status pelanggaran siswa ini?")) return;
      
      await db.resetCheatingCount(resultId);
      
      // Optimistic update locally
      setResults(prev => prev.map(r => r.id === resultId ? {...r, cheatingAttempts: 0} : r));
      alert("Pelanggaran di-reset.");
  };

  const handleCreateExam = async () => {
      const title = prompt("Nama Mata Pelajaran (Contoh: Matematika):");
      if(!title) return;
      
      const newExam: Exam = {
          id: `temp`, // Will be generated by DB
          title: title,
          subject: title,
          educationLevel: 'SD',
          durationMinutes: 60,
          isActive: true,
          token: '12345',
          questions: [],
          questionCount: 0
      };
      await db.createExam(newExam);
      loadData();
  };

  // --- MAPPING LOGIC ---
  const openMappingModal = (exam: Exam) => {
      setEditingExam(exam);
      setEditToken(exam.token);
      setEditDuration(exam.durationMinutes);
      setEditDate(exam.examDate || new Date().toISOString().split('T')[0]);
      setEditSession(exam.session || 'Sesi 1');
      setEditSchoolAccess(exam.schoolAccess || []); 
      setMappingSearch('');
      setIsEditModalOpen(true);
  };

  const toggleSchoolAccess = (schoolName: string) => {
      setEditSchoolAccess(prev => {
          if (prev.includes(schoolName)) return prev.filter(s => s !== schoolName);
          return [...prev, schoolName];
      });
  };

  const addAllAvailableSchools = (available: string[]) => {
      const newAccess = [...editSchoolAccess];
      available.forEach(s => {
          if(!newAccess.includes(s)) newAccess.push(s);
      });
      setEditSchoolAccess(newAccess);
  };

  const handleSaveMapping = async () => {
      if (!editingExam) return;
      if (editToken.length < 3) return alert("Token minimal 3 karakter");
      
      await db.updateExamMapping(
          editingExam.id, 
          editToken.toUpperCase(), 
          editDuration,
          editDate,
          editSession,
          editSchoolAccess
      );
      setIsEditModalOpen(false);
      setEditingExam(null);
      loadData();
      alert("Mapping Jadwal & Akses Sekolah berhasil diperbarui!");
  };

  // --- QUESTION BANK & IMPORT/EXPORT ---
  const handleSaveQuestion = async () => {
      if (!targetExamForAdd) return;
      if (!nqText.trim()) return alert("Teks soal wajib diisi!");
      const newQuestion: Question = {
          id: `manual`,
          type: nqType,
          text: nqText,
          imgUrl: nqImg || undefined,
          points: Number(nqPoints) || 0,
          options: nqType === 'URAIAN' ? [] : nqOptions.filter(o => o.trim() !== ''),
          correctIndex: nqCorrectIndex,
          correctIndices: nqCorrectIndices,
      };
      await db.addQuestions(targetExamForAdd.id, [newQuestion]);
      setIsAddQuestionModalOpen(false);
      // Reset form
      setNqText('');
      setNqImg('');
      setNqOptions(['', '', '', '']);
      setNqCorrectIndex(0);
      setNqCorrectIndices([]);
      setNqPoints(10);
      loadData();
      alert("Soal berhasil ditambahkan!");
  };

  const downloadQuestionTemplate = () => {
      const headers = "No,Tipe,Jenis,Soal,Url Gambar,Opsi A,Opsi B,Opsi C,Opsi D,Kunci,Bobot";
      const example1 = "1,PG,UMUM,Siapa presiden pertama RI?,,Soekarno,Hatta,Habibie,Gus Dur,A,10";
      const example2 = "2,PG_KOMPLEKS,UMUM,Manakah yang merupakan buah?,,Apel,Bayam,Jeruk,Wortel,A;C,10";
      const example3 = "3,PG_BS,UMUM,Matahari terbit dari timur.,,Benar,Salah,,,A,10";
      const example4 = "4,URAIAN,UMUM,Jelaskan proses fotosintesis!,,,,,,,10";
      const blob = new Blob([headers + "\n" + example1 + "\n" + example2 + "\n" + example3 + "\n" + example4], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_SOAL_DB.csv'; link.click();
  };
  
  const downloadStudentTemplate = () => {
      const headers = "NISN,NAMA,SEKOLAH,PASSWORD";
      const example = "1234567890,Ahmad Siswa,SD NEGERI 1,12345";
      const blob = new Blob([headers + "\n" + example], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'TEMPLATE_SISWA_DB.csv'; link.click();
  };

  const downloadWordTemplate = async () => {
      const zip = new JSZip();
      
      // [Content_Types].xml
      zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

      // _rels/.rels
      zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

      // word/_rels/document.xml.rels
      zip.folder("word")!.folder("_rels")!.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

      // word/styles.xml (minimal)
      zip.folder("word")!.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`);

      // word/document.xml
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>TEMPLATE SOAL UJIAN (FORMAT MICROSOFT WORD)</w:t></w:r></w:p>
    <w:p><w:r><w:t>--------------------------------------------------</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Siapa presiden pertama Republik Indonesia?</w:t></w:r></w:p>
    <w:p><w:r><w:t>a. Soekarno</w:t></w:r></w:p>
    <w:p><w:r><w:t>b. Mohammad Hatta</w:t></w:r></w:p>
    <w:p><w:r><w:t>c. B.J. Habibie</w:t></w:r></w:p>
    <w:p><w:r><w:t>d. Abdurrahman Wahid</w:t></w:r></w:p>
    <w:p><w:r><w:t>#Kunci: A</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>2. Manakah yang merupakan buah-buahan? (Pilihan Ganda Kompleks)</w:t></w:r></w:p>
    <w:p><w:r><w:t>#Jenis: MA</w:t></w:r></w:p>
    <w:p><w:r><w:t>a. 1^Apel</w:t></w:r></w:p>
    <w:p><w:r><w:t>b. Bayam</w:t></w:r></w:p>
    <w:p><w:r><w:t>c. 1^Jeruk</w:t></w:r></w:p>
    <w:p><w:r><w:t>d. Wortel</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>3. Matahari terbit dari arah timur. (Benar/Salah)</w:t></w:r></w:p>
    <w:p><w:r><w:t>#Jenis: MTF</w:t></w:r></w:p>
    <w:p><w:r><w:t>a. 4^Benar</w:t></w:r></w:p>
    <w:p><w:r><w:t>b. Salah</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>4. Jelaskan secara singkat proses fotosintesis pada tumbuhan!</w:t></w:r></w:p>
    <w:p><w:r><w:t>#Skor: 25</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>CATATAN PENTING:</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Simpan file ini sebagai .docx</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Gunakan "Save As -> Web Page Filtered" untuk menghasilkan file .htm</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Zip file .htm tersebut (bersama foldernya jika ada gambar) sebelum diimport.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      zip.folder("word")!.file("document.xml", documentXml);
      
      const blob = await zip.generateAsync({type:"blob"});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'TEMPLATE_SOAL_WORD.docx';
      link.click();
  };

  const triggerImportQuestions = (examId: string) => { setImportTargetExamId(examId); setTimeout(() => questionFileRef.current?.click(), 100); };
  
  const triggerImportZip = (examId: string) => { setImportTargetExamId(examId); setTimeout(() => zipFileRef.current?.click(), 100); };

  const onZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !importTargetExamId) return;

      setIsProcessingImport(true);
      try {
          const zip = await JSZip.loadAsync(file);
          
          // Find HTML file
          const htmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.htm') || name.toLowerCase().endsWith('.html'));
          if (!htmlFile) throw new Error('File HTML tidak ditemukan dalam ZIP.');

          const htmlContent = await zip.files[htmlFile].async('string');
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');

          // Find images folder
          const baseName = htmlFile.replace(/\.(htm|html)$/i, '');
          const filesFolder = baseName + '_files/';
          
          // Map images to data URLs (Search all files in ZIP)
          const imgMap: Record<string, string> = {};
          const imageFiles = Object.keys(zip.files).filter(name => 
              name.toLowerCase().endsWith('.png') || 
              name.toLowerCase().endsWith('.jpg') || 
              name.toLowerCase().endsWith('.jpeg') || 
              name.toLowerCase().endsWith('.gif')
          );
          
          for (const imgPath of imageFiles) {
              const imgData = await zip.files[imgPath].async('base64');
              const ext = imgPath.split('.').pop()?.toLowerCase();
              const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/gif';
              const fileName = imgPath.split(/[/\\]/).pop() || imgPath;
              imgMap[fileName] = `data:${mimeType};base64,${imgData}`;
          }

          // Process images in HTML
          const images = doc.querySelectorAll('img');
          images.forEach(img => {
              const src = img.getAttribute('src');
              if (src) {
                  const fileName = src.split(/[/\\]/).pop();
                  if (fileName && imgMap[fileName]) {
                      img.setAttribute('src', imgMap[fileName]);
                      // Ensure images are responsive
                      img.style.maxWidth = '100%';
                      img.style.height = 'auto';
                  }
              }
          });

          // Parse questions from paragraphs
          const paragraphs = Array.from(doc.querySelectorAll('p'));
          const newQuestions: Question[] = [];
          let currentQuestion: Partial<Question> | null = null;
          let currentContext: 'QUESTION' | 'OPTION' = 'QUESTION';

          for (const p of paragraphs) {
              const text = p.textContent?.trim() || '';
              const html = p.innerHTML;

              // Skip empty paragraphs unless they contain images
              if (!text && !p.querySelector('img')) continue;

              // Question start pattern: "1. ", "2. ", etc.
              const qMatch = text.match(/^(\d+)\s*[\.\)]\s*(.*)/s);
              if (qMatch) {
                  if (currentQuestion && currentQuestion.text) {
                      newQuestions.push(currentQuestion as Question);
                  }
                  currentQuestion = {
                      id: `word-${Math.random().toString(36).substr(2, 9)}`,
                      text: html.replace(new RegExp(qMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ''),
                      type: 'PG',
                      options: [],
                      correctIndices: [],
                      points: 10
                  };
                  currentContext = 'QUESTION';
                  continue;
              }

              if (!currentQuestion) continue;

              // Option pattern: "a. ", "b. ", "a) ", etc.
              const oMatch = text.match(/^([a-e])\s*[\.\)]\s*(.*)/i);
              if (oMatch) {
                  let optionText = html.replace(new RegExp(oMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i'), '');
                  if (!optionText.trim() && oMatch[2]) optionText = oMatch[2]; // Fallback to text if HTML replace failed
                  
                  // Check for score in option (e.g., "1^Semarang" or "4^Pernyataan Benar")
                  const scoreMatch = optionText.match(/^(-?\d+)\^(.*)/);
                  if (scoreMatch) {
                      const score = parseInt(scoreMatch[1]);
                      optionText = scoreMatch[2];
                      if (score > 0) {
                          if (!currentQuestion.correctIndices) currentQuestion.correctIndices = [];
                          currentQuestion.correctIndices.push(currentQuestion.options!.length);
                      }
                  }
                  
                  currentQuestion.options?.push(optionText);
                  currentContext = 'OPTION';
                  continue;
              }

              // Metadata patterns
              if (text.startsWith('#Kunci:')) {
                  const key = text.replace('#Kunci:', '').trim().toUpperCase();
                  const idx = key.charCodeAt(0) - 65; // A=0, B=1...
                  if (idx >= 0 && idx < 10) {
                      currentQuestion.correctIndices = [idx];
                      currentQuestion.correctIndex = idx;
                  }
                  continue;
              }

              if (text.startsWith('#Skor:')) {
                  currentQuestion.type = 'URAIAN';
                  const score = parseInt(text.replace('#Skor:', '').trim());
                  if (!isNaN(score)) currentQuestion.points = score;
                  continue;
              }

              if (text.startsWith('#Jenis:')) {
                  const type = text.replace('#Jenis:', '').trim().toUpperCase();
                  if (type === 'MA') currentQuestion.type = 'PG_KOMPLEKS';
                  if (type === 'MTF') currentQuestion.type = 'PG_BS';
                  continue;
              }

              // Append to current context if it's not a new question/option/metadata
              if (currentContext === 'QUESTION') {
                  currentQuestion.text += '<br/>' + html;
              } else if (currentContext === 'OPTION' && currentQuestion.options && currentQuestion.options.length > 0) {
                  const lastIdx = currentQuestion.options.length - 1;
                  currentQuestion.options[lastIdx] += '<br/>' + html;
              }
          }

          if (currentQuestion && currentQuestion.text) {
              newQuestions.push(currentQuestion as Question);
          }

          if (newQuestions.length > 0) {
              await db.addQuestions(importTargetExamId, newQuestions);
              alert(`Berhasil mengimpor ${newQuestions.length} soal dari Word.`);
              loadData();
          } else {
              alert('Tidak ada soal yang ditemukan dalam format yang benar.');
          }

      } catch (err) {
          console.error(err);
          alert('Gagal mengimpor ZIP: ' + (err instanceof Error ? err.message : 'Format tidak didukung'));
      } finally {
          setIsProcessingImport(false);
          if (zipFileRef.current) zipFileRef.current.value = '';
      }
  };

  const handleExportQuestions = (exam: Exam) => {
      const headers = ["No", "Tipe", "Jenis", "Soal", "Url Gambar", "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Kunci", "Bobot"];
      const rows = exam.questions.map((q, idx) => {
          const options = q.options || [];
          const keyMap = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          let keyString = '';
          if (q.type === 'PG_KOMPLEKS' || q.type === 'PG_BS') {
              keyString = (q.correctIndices || []).map(idx => keyMap[idx]).join(";");
          } else if (q.type === 'PG') {
              keyString = typeof q.correctIndex === 'number' ? keyMap[q.correctIndex] : 'A';
          } else {
              keyString = '';
          }
          return [
              String(idx + 1), 
              q.type, 
              "UMUM", 
              escapeCSV(q.text), 
              escapeCSV(q.imgUrl), 
              escapeCSV(options[0] || ''), 
              escapeCSV(options[1] || ''), 
              escapeCSV(options[2] || ''), 
              escapeCSV(options[3] || ''), 
              keyString, 
              String(q.points)
          ].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `BANK_SOAL_${exam.subject}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const onQuestionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0] || !importTargetExamId) return;
      const file = e.target.files[0];
      const targetExam = exams.find(ex => ex.id === importTargetExamId);
      if (!targetExam) return;

      const processRows = (rows: any[]) => {
          const newQuestions: Question[] = rows.map((row, idx) => {
             let type, text, img, oa, ob, oc, od, key, points;
             if (Array.isArray(row)) {
                 if (row.length < 4) return null;
                 type = row[1] || 'PG';
                 text = row[3]; img = row[4]; oa = row[5]; ob = row[6]; oc = row[7]; od = row[8]; key = row[9]; points = row[10];
             } else return null;

             if (!text) return null;

             const rawKey = key ? String(key).toUpperCase().trim() : 'A';
             let cIndex = 0;
             let cIndices: number[] = [];

             if (type === 'PG_KOMPLEKS' || type === 'PG_BS') {
                 const parts = rawKey.split(/[;,]/);
                 cIndices = parts.map(p => p.trim().charCodeAt(0) - 65).filter(idx => idx >= 0 && idx < 10);
                 if (cIndices.length > 0) cIndex = cIndices[0];
             } else {
                 cIndex = rawKey.charCodeAt(0) - 65;
                 if (cIndex < 0 || cIndex > 3) cIndex = 0;
             }

             return {
                  id: `imp-${idx}-${Date.now()}`,
                  type: type as QuestionType,
                  text: text || 'Soal',
                  imgUrl: img && String(img).startsWith('http') ? img : undefined,
                  options: type === 'URAIAN' ? [] : [oa || '', ob || '', oc || '', od || ''].filter(o => o !== ''),
                  correctIndex: cIndex,
                  correctIndices: cIndices,
                  points: parseInt(points || '10')
             };
          }).filter(Boolean) as Question[];

          if (newQuestions.length) { 
              db.addQuestions(targetExam.id, newQuestions).then(() => {
                  loadData();
                  alert(`Berhasil import ${newQuestions.length} soal!`);
              }); 
          }
      };

      try {
          const fileText = await file.text();
          const rows = parseCSV(fileText).slice(1);
          processRows(rows);
      } catch (e: any) { console.error(e); alert("Format Salah atau file corrupt."); }
      e.target.value = '';
  };

  const triggerImportStudents = () => { setTimeout(() => studentFileRef.current?.click(), 100); };
  
  const onStudentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      setIsProcessingImport(true);
      try {
          const fileText = await e.target.files[0].text();
          const rows = parseCSV(fileText).slice(1); 
          
          const newUsers = rows.map((row, idx) => {
              if (!row[0] || !row[0].trim()) return null;
              
              const nisn = row[0].trim();
              const name = row[1] ? row[1].trim() : 'Siswa';
              const school = row[2] ? row[2].trim() : 'UMUM';
              const password = row[3] ? row[3].trim() : '12345';

              return {
                  id: `temp-${idx}`,
                  name: name,
                  nisn: nisn,
                  username: nisn,
                  password: password,
                  school: school,
                  role: UserRole.STUDENT
              };
          }).filter(Boolean) as User[];
          
          if (newUsers.length > 0) { 
              await db.importStudents(newUsers); 
              await loadData(); 
              alert(`Berhasil import ${newUsers.length} siswa!`); 
          } else {
              alert("File kosong atau format salah.");
          }
      } catch (e: any) { alert("Gagal import siswa. Pastikan menggunakan Template CSV yang benar."); }
      setIsProcessingImport(false);
      e.target.value = '';
  };

  const handleAddStudent = async () => {
      if (!nsName.trim() || !nsNisn.trim() || !nsSchool.trim()) {
          return alert("Semua field wajib diisi!");
      }
      
      const newStudent: User = {
          id: `manual-${Date.now()}`,
          name: nsName.trim(),
          nisn: nsNisn.trim(),
          username: nsNisn.trim(),
          password: nsPassword.trim() || '12345',
          school: nsSchool.trim(),
          role: UserRole.STUDENT
      };
      
      await db.importStudents([newStudent]);
      setIsAddStudentModalOpen(false);
      setNsName('');
      setNsNisn('');
      setNsSchool('');
      setNsPassword('12345');
      await loadData();
      alert("Peserta berhasil ditambahkan!");
  };

  const handleExportResultsExcel = () => {
      const filteredResults = results.filter(r => {
          if (resultSchoolFilter === 'ALL') return true;
          const student = users.find(u => u.id === r.studentId);
          return student?.school === resultSchoolFilter;
      });

      if (filteredResults.length === 0) return alert("Tidak ada data untuk diexport");

      const headers = ["Nama Siswa", "Sekolah", "Mata Pelajaran", "Nilai", "Waktu Submit"];
      const rows = filteredResults.map(r => {
          const student = users.find(u => u.id === r.studentId);
          return [
              escapeCSV(r.studentName),
              escapeCSV(student?.school || '-'),
              escapeCSV(r.examTitle),
              String(r.score),
              new Date(r.submittedAt).toLocaleString()
          ].join(",");
      });

      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `HASIL_UJIAN_${resultSchoolFilter}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const getMonitoringUsers = (schoolFilter: string) => {
      let filtered = users;
      if (schoolFilter !== 'ALL') filtered = filtered.filter(u => u.school === schoolFilter);
      if (monitoringSearch) filtered = filtered.filter(u => u.name.toLowerCase().includes(monitoringSearch.toLowerCase()) || u.nisn?.includes(monitoringSearch));
      return filtered;
  };

  // --- HELPER FOR STUDENT STATUS COLORS ---
  const getStudentStatusInfo = (u: User) => {
      if (u.status === 'finished') return { color: 'bg-green-100 text-green-700 border-green-200', label: 'Selesai' };
      if (u.isLogin) return { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Mengerjakan' };
      return { color: 'bg-red-100 text-red-700 border-red-200', label: 'Belum Login' };
  };
  
  // -- BULK ACTION LOGIC --
  const toggleSelectAll = (filteredUsers: User[]) => {
      if (selectedStudentIds.length === filteredUsers.length) {
          setSelectedStudentIds([]);
      } else {
          setSelectedStudentIds(filteredUsers.map(u => u.id));
      }
  };

  const toggleSelectOne = (id: string) => {
      if (selectedStudentIds.includes(id)) {
          setSelectedStudentIds(prev => prev.filter(uid => uid !== id));
      } else {
          setSelectedStudentIds(prev => [...prev, id]);
      }
  };

  const handleBulkReset = async () => {
      if (!selectedStudentIds.length) return;
      if (!confirm(`Reset login status untuk ${selectedStudentIds.length} siswa terpilih?`)) return;
      
      setIsLoadingData(true);
      for (const id of selectedStudentIds) {
          await db.resetUserStatus(id);
      }
      setSelectedStudentIds([]);
      await loadData();
      alert("Berhasil reset masal.");
  };

  // Derived Values
  const schools = (Array.from(new Set(users.map(u => u.school || 'Unknown'))).filter(Boolean) as string[]).sort();
  const totalSchools = schools.length;

  // Responsive Nav Item (Icons on Mobile, Full on Desktop)
  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
      <button 
        onClick={() => { setActiveTab(id); setDashboardView('MAIN'); }} 
        className={`w-full flex items-center justify-center md:justify-start md:space-x-3 p-3 md:px-4 md:py-3 rounded-lg transition mb-1 text-sm font-medium ${activeTab === id ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/20' : 'text-blue-100 hover:bg-white/5'}`}
        title={label}
      >
          <Icon size={20} className="flex-shrink-0" />
          <span className="hidden md:block truncate">{label}</span>
      </button>
  );
  
  // Monitoring Filtered Users
  const filteredMonitoringUsers = getMonitoringUsers('ALL').filter(u => u.isLogin);

  // --- Calculate Available Schools for Mapping (Filtering Logic) ---
  const getSchoolsAvailability = () => {
      const busySchools = new Set<string>();
      
      exams.forEach(ex => {
          if (editingExam && ex.id === editingExam.id) return;
          if (ex.examDate === editDate && ex.session === editSession && ex.schoolAccess) {
              ex.schoolAccess.forEach(s => busySchools.add(s));
          }
      });

      const assigned = editSchoolAccess.sort();
      const available = schools.filter(s => 
          !assigned.includes(s) && 
          !busySchools.has(s) && 
          s.toLowerCase().includes(mappingSearch.toLowerCase())
      );
      const busyCount = busySchools.size;
      return { assigned, available, busyCount };
  };

  const { assigned: assignedSchools, available: availableSchools, busyCount } = isEditModalOpen ? getSchoolsAvailability() : { assigned: [], available: [], busyCount: 0 };

  // --- AGGREGATION FOR "JUMLAH SEKOLAH" DASHBOARD VIEW ---
  const getSchoolStats = (schoolName: string) => {
      const studentsInSchool = users.filter(u => u.school === schoolName);
      const notLogin = studentsInSchool.filter(u => !u.isLogin && u.status !== 'finished').length;
      const working = studentsInSchool.filter(u => u.isLogin && u.status !== 'finished').length;
      const finished = studentsInSchool.filter(u => u.status === 'finished').length;
      
      // Get exam mapping for today
      const today = new Date().toISOString().split('T')[0];
      const todayExam = exams.find(e => e.examDate === today && e.schoolAccess?.includes(schoolName));
      
      return { notLogin, working, finished, total: studentsInSchool.length, todayExamTitle: todayExam?.title || '-' };
  };

  const handleDownloadSchoolStats = () => {
      const headers = ["Nama Sekolah", "Total Siswa", "Belum Login", "Mengerjakan", "Selesai", "Mapel Hari Ini"];
      const rows = schools.map(s => {
          const stats = getSchoolStats(s);
          return [escapeCSV(s), stats.total, stats.notLogin, stats.working, stats.finished, escapeCSV(stats.todayExamTitle)].join(",");
      });
      const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.setAttribute('download', `REKAP_SEKOLAH_HARI_INI.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // --- RENDER CONTENT BASED ON DASHBOARD VIEW ---
  const renderDashboardContent = () => {
    if (dashboardView === 'STUDENTS_DETAIL') {
        const filteredSchools = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];
        
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Detail Status Siswa (Realtime)</h3>
                    </div>
                    <select className="border rounded p-2 text-sm min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                        <option value="ALL">Semua Sekolah</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSchools.map(school => {
                        const students = users.filter(u => u.school === school);
                        return (
                            <div key={school} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                <div className="p-3 bg-gray-50 border-b font-bold text-gray-700 text-sm truncate" title={school}>{school}</div>
                                <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                                    {students.map(u => {
                                        const status = getStudentStatusInfo(u);
                                        return (
                                            <div key={u.id} className={`flex items-center justify-between p-2 rounded border text-xs ${status.color}`}>
                                                <span className="font-bold truncate w-2/3">{u.name}</span>
                                                <span className="font-bold whitespace-nowrap">{status.label}</span>
                                            </div>
                                        )
                                    })}
                                    {students.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Tidak ada siswa.</p>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    }

    if (dashboardView === 'SCHOOLS_DETAIL') {
        const filteredSchoolsList = dashboardSchoolFilter === 'ALL' ? schools : [dashboardSchoolFilter];

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                        <h3 className="font-bold text-lg text-gray-800">Rekap Mapping & Status Sekolah</h3>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                         <select className="border rounded p-2 text-sm flex-1 md:min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                            <option value="ALL">Semua Sekolah</option>
                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={handleDownloadSchoolStats} className="bg-green-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center hover:bg-green-700"><Download size={16} className="md:mr-2"/><span className="hidden md:inline">CSV</span></button>
                    </div>
                </div>

                <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 font-bold border-b text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="p-4">Nama Sekolah</th>
                                <th className="p-4 text-center">Total Siswa</th>
                                <th className="p-4 text-center text-red-600">Belum Login</th>
                                <th className="p-4 text-center text-blue-600">Mengerjakan</th>
                                <th className="p-4 text-center text-green-600">Selesai</th>
                                <th className="p-4">Jadwal Mapel Hari Ini</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredSchoolsList.map(school => {
                                const stats = getSchoolStats(school);
                                return (
                                    <tr key={school} className="hover:bg-gray-50">
                                        <td className="p-4 font-bold text-gray-700">{school}</td>
                                        <td className="p-4 text-center font-mono">{stats.total}</td>
                                        <td className="p-4 text-center font-mono text-red-600 font-bold bg-red-50">{stats.notLogin}</td>
                                        <td className="p-4 text-center font-mono text-blue-600 font-bold bg-blue-50">{stats.working}</td>
                                        <td className="p-4 text-center font-mono text-green-600 font-bold bg-green-50">{stats.finished}</td>
                                        <td className="p-4 text-xs font-bold text-gray-500">{stats.todayExamTitle}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (dashboardView === 'EXAMS_DETAIL') {
        const relevantUsers = users.filter(u => {
             const hasAccess = exams.some(e => e.schoolAccess?.includes(u.school || ''));
             return hasAccess && (dashboardSchoolFilter === 'ALL' || u.school === dashboardSchoolFilter);
        });

        const finishedUsers = relevantUsers.filter(u => u.status === 'finished');
        const unfinishedUsers = relevantUsers.filter(u => u.status !== 'finished');

        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                         <button onClick={() => setDashboardView('MAIN')} className="p-2 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20}/></button>
                         <h3 className="font-bold text-lg text-gray-800">Detail Status Penyelesaian</h3>
                    </div>
                    <select className="border rounded p-2 text-sm min-w-[200px]" value={dashboardSchoolFilter} onChange={e => setDashboardSchoolFilter(e.target.value)}>
                        <option value="ALL">Semua Sekolah Termapping</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                            <h4 className="font-bold text-green-800 flex items-center"><CheckCircle size={18} className="mr-2"/> Sudah Selesai ({finishedUsers.length})</h4>
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Sekolah</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {finishedUsers.map(u => (
                                        <tr key={u.id}>
                                            <td className="p-3 font-medium">{u.name}</td>
                                            <td className="p-3 text-gray-500">{u.school}</td>
                                        </tr>
                                    ))}
                                    {finishedUsers.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
                             <h4 className="font-bold text-red-800 flex items-center"><XCircle size={18} className="mr-2"/> Belum Selesai ({unfinishedUsers.length})</h4>
                        </div>
                        <div className="p-0 overflow-y-auto max-h-[500px]">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-50 font-bold border-b text-gray-500">
                                    <tr><th className="p-3">Nama</th><th className="p-3">Sekolah</th><th className="p-3">Status</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {unfinishedUsers.map(u => {
                                        const st = getStudentStatusInfo(u);
                                        return (
                                            <tr key={u.id}>
                                                <td className="p-3 font-medium">{u.name}</td>
                                                <td className="p-3 text-gray-500">{u.school}</td>
                                                <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.color}`}>{st.label}</span></td>
                                            </tr>
                                        )
                                    })}
                                    {unfinishedUsers.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- LINE CHART DATA PREPARATION (ENHANCED LOGIC) ---
    // 1. Determine Target Schools based on Filter (Scheduled vs All)
    let targetSchools: string[] = [];
    if (graphFilterMode === 'SCHEDULED') {
        const activeExamsOnDate = exams.filter(e => e.examDate === graphDate);
        const scheduledSet = new Set<string>();
        activeExamsOnDate.forEach(e => {
            if (e.schoolAccess && Array.isArray(e.schoolAccess)) {
                e.schoolAccess.forEach(s => scheduledSet.add(s));
            }
        });
        targetSchools = Array.from(scheduledSet).sort();
    } else {
        targetSchools = schools;
    }

    // 2. Calculate Stats for each target school
    const chartData = targetSchools.map(school => {
        // Students enrolled in this school
        const schoolStudents = users.filter(u => u.school === school);
        const total = schoolStudents.length;

        // Finished: Strictly checked against Results table for the specific date
        const finishedCount = results.filter(r => {
            const rDate = r.submittedAt ? r.submittedAt.split('T')[0] : '';
            const student = users.find(u => u.id === r.studentId);
            return rDate === graphDate && student?.school === school;
        }).length;

        // Working: Snapshot of currently login students who haven't finished
        const workingCount = schoolStudents.filter(u => u.isLogin && u.status !== 'finished').length;

        // Not Login: Remaining students (Total - FinishedToday - WorkingNow)
        // Note: Use Math.max(0, ...) to prevent negative numbers if data is slightly out of sync
        const notLoginCount = Math.max(0, total - workingCount - finishedCount);

        return {
            name: school,
            notLogin: notLoginCount,
            working: workingCount,
            finished: finishedCount
        };
    });

    // Chart Dimensions
    const svgHeight = 400; // Increased height
    const svgWidth = 800; // Aspect ratio ~2.66
    const paddingX = 50;
    const paddingTop = 40;
    const paddingBottom = 120; // Increased bottom padding for rotated text
    const chartAreaWidth = svgWidth - paddingX * 2;
    const chartAreaHeight = svgHeight - paddingTop - paddingBottom;

    // Determine Y Axis Max Value (Rounded up to next 10 for cleaner grid)
    const maxVal = Math.max(10, ...chartData.map(d => Math.max(d.notLogin, d.working, d.finished)));
    const yMax = Math.ceil(maxVal / 10) * 10; 

    // Generate Points string for Polyline
    const getPoints = (key: 'notLogin' | 'working' | 'finished') => {
        return chartData.map((d, i) => {
            const x = paddingX + (i * (chartAreaWidth / (chartData.length - 1 || 1)));
            const y = (svgHeight - paddingBottom) - (d[key] / yMax) * chartAreaHeight;
            return `${x},${y}`;
        }).join(' ');
    };

    // --- DEFAULT MAIN DASHBOARD VIEW ---
    return (
        <div className="animate-in fade-in">
            {/* Top Cards Grid - 1 Col on Mobile, 4 Col on Large */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Mapel */}
                <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition border-l-4 border-l-blue-500 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Mapel</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{exams.length}</h3>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg group-hover:scale-110 transition"><BookOpen className="text-blue-500" size={24}/></div>
                    </div>
                </div>

                {/* Siswa Terdaftar */}
                <div 
                    onClick={() => setDashboardView('STUDENTS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-green-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Siswa Terdaftar</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{users.length}</h3>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg group-hover:scale-110 transition"><Users className="text-green-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-green-600 mt-4 font-bold flex items-center">Lihat Detail Status <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>

                {/* Jumlah Sekolah */}
                <div 
                    onClick={() => setDashboardView('SCHOOLS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-purple-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Jumlah Sekolah</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{schools.length}</h3>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg group-hover:scale-110 transition"><School className="text-purple-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-purple-600 mt-4 font-bold flex items-center">Lihat Mapping & Status <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>

                {/* Ujian Selesai */}
                <div 
                    onClick={() => setDashboardView('EXAMS_DETAIL')}
                    className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg hover:-translate-y-1 transition border-l-4 border-l-orange-500 cursor-pointer group"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Ujian Selesai</p>
                            <h3 className="text-4xl font-bold text-gray-800 mt-2">{results.length}</h3>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg group-hover:scale-110 transition"><GraduationCap className="text-orange-500" size={24}/></div>
                    </div>
                    <p className="text-xs text-orange-600 mt-4 font-bold flex items-center">Lihat Rekap Pengerjaan <ArrowLeft size={12} className="rotate-180 ml-1"/></p>
                </div>
            </div>

            {/* REALTIME 2D LINE CHART SECTION */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500 mb-8">
                {/* FILTER HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div className="flex items-center">
                        <Activity className="mr-2 text-blue-600" size={24}/>
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">Grafik Statistik Realtime</h3>
                            <p className="text-xs text-gray-500">Pantau progres ujian berdasarkan sekolah dan jadwal.</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 bg-gray-50 p-2 rounded-lg border">
                        {/* Toggle Filter Mode */}
                        <div className="flex bg-white rounded-md shadow-sm border overflow-hidden">
                            <button 
                                onClick={() => setGraphFilterMode('SCHEDULED')}
                                className={`px-3 py-1.5 text-xs font-bold transition ${graphFilterMode === 'SCHEDULED' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Terjadwal
                            </button>
                            <button 
                                onClick={() => setGraphFilterMode('ALL')}
                                className={`px-3 py-1.5 text-xs font-bold transition ${graphFilterMode === 'ALL' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Semua
                            </button>
                        </div>

                        {/* Date Filter */}
                        <div className="flex items-center bg-white border rounded-md px-2 py-1 shadow-sm">
                            <Calendar size={14} className="text-gray-400 mr-2"/>
                            <input 
                                type="date" 
                                className="text-xs font-bold text-gray-700 outline-none"
                                value={graphDate}
                                onChange={(e) => setGraphDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                
                <div className="w-full h-auto overflow-x-auto relative">
                    {chartData.length === 0 ? (
                        <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                            <CalendarDays size={48} className="mb-2 opacity-50"/>
                            <p className="font-bold text-sm">Tidak ada jadwal ujian pada tanggal ini.</p>
                            <p className="text-xs">Ubah filter tanggal atau pilih mode "Semua".</p>
                        </div>
                    ) : (
                        <div className="min-w-[600px] h-[400px]">
                            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" preserveAspectRatio="none">
                                {/* Gridlines & Y-Axis Labels */}
                                {Array.from({ length: 6 }).map((_, i) => {
                                    const y = (svgHeight - paddingBottom) - (i * (chartAreaHeight / 5));
                                    const val = Math.round(i * (yMax / 5));
                                    return (
                                        <g key={i}>
                                            <line x1={paddingX} y1={y} x2={svgWidth - paddingX} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 2" />
                                            <text x={paddingX - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">{val}</text>
                                        </g>
                                    );
                                })}

                                {/* X-Axis Labels - Rotated for Visibility */}
                                {chartData.map((d, i) => {
                                    const x = paddingX + (i * (chartAreaWidth / (chartData.length - 1 || 1)));
                                    return (
                                        <text 
                                            key={i} 
                                            x={0} 
                                            y={0} 
                                            transform={`translate(${x}, ${svgHeight - paddingBottom + 20}) rotate(45)`} 
                                            textAnchor="start" 
                                            fontSize="10" 
                                            fill="#374151" 
                                            className="font-bold"
                                        >
                                            {d.name}
                                        </text>
                                    );
                                })}

                                {/* Axes Lines */}
                                <line x1={paddingX} y1={paddingTop} x2={paddingX} y2={svgHeight - paddingBottom} stroke="#9ca3af" strokeWidth="2" />
                                <line x1={paddingX} y1={svgHeight - paddingBottom} x2={svgWidth - paddingX} y2={svgHeight - paddingBottom} stroke="#9ca3af" strokeWidth="2" />

                                {/* Data Lines */}
                                {/* Not Login (Red) */}
                                <polyline points={getPoints('notLogin')} fill="none" stroke="#dc2626" strokeWidth="3" />
                                {chartData.map((d, i) => {
                                    const x = paddingX + (i * (chartAreaWidth / (chartData.length - 1 || 1)));
                                    const y = (svgHeight - paddingBottom) - (d.notLogin / yMax) * chartAreaHeight;
                                    return (
                                        <g key={`nl-${i}`} className="group">
                                            <circle cx={x} cy={y} r="4" fill="#dc2626" className="group-hover:r-6 transition-all"/>
                                            <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fill="#dc2626" className="opacity-0 group-hover:opacity-100 font-bold">{d.notLogin}</text>
                                        </g>
                                    );
                                })}

                                {/* Working (Blue) */}
                                <polyline points={getPoints('working')} fill="none" stroke="#2563eb" strokeWidth="3" />
                                {chartData.map((d, i) => {
                                    const x = paddingX + (i * (chartAreaWidth / (chartData.length - 1 || 1)));
                                    const y = (svgHeight - paddingBottom) - (d.working / yMax) * chartAreaHeight;
                                    return (
                                        <g key={`wk-${i}`} className="group">
                                            <circle cx={x} cy={y} r="4" fill="#2563eb" className="group-hover:r-6 transition-all"/>
                                            <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fill="#2563eb" className="opacity-0 group-hover:opacity-100 font-bold">{d.working}</text>
                                        </g>
                                    );
                                })}

                                {/* Finished (Green) with Click Interaction */}
                                <polyline points={getPoints('finished')} fill="none" stroke="#16a34a" strokeWidth="3" />
                                {chartData.map((d, i) => {
                                    const x = paddingX + (i * (chartAreaWidth / (chartData.length - 1 || 1)));
                                    const y = (svgHeight - paddingBottom) - (d.finished / yMax) * chartAreaHeight;
                                    return (
                                        <g key={`fn-${i}`} className="group" onClick={() => setSelectedSchoolTooltip({name: d.name, value: d.finished, x, y})}>
                                            <circle cx={x} cy={y} r="6" fill="#16a34a" className="group-hover:r-8 transition-all cursor-pointer stroke-white stroke-2 shadow-lg"/>
                                        </g>
                                    );
                                })}

                                {/* Legend */}
                                <g transform={`translate(${svgWidth - 120}, ${paddingTop})`}>
                                    <rect width="110" height="70" fill="white" stroke="#e5e7eb" rx="4" />
                                    
                                    <circle cx="15" cy="15" r="4" fill="#dc2626" />
                                    <text x="25" y="19" fontSize="10" fill="#374151">Belum Login</text>

                                    <circle cx="15" cy="35" r="4" fill="#2563eb" />
                                    <text x="25" y="39" fontSize="10" fill="#374151">Mengerjakan</text>

                                    <circle cx="15" cy="55" r="4" fill="#16a34a" />
                                    <text x="25" y="59" fontSize="10" fill="#374151">Selesai</text>
                                </g>

                                {/* Tooltip Overlay */}
                                {selectedSchoolTooltip && (
                                    <g transform={`translate(${selectedSchoolTooltip.x}, ${selectedSchoolTooltip.y - 50})`}>
                                        <defs>
                                            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                                                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.3"/>
                                            </filter>
                                        </defs>
                                        <rect x="-100" y="-30" width="200" height="50" rx="8" fill="white" stroke="#16a34a" strokeWidth="2" filter="url(#shadow)" />
                                        <text x="0" y="-12" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#374151">
                                            {selectedSchoolTooltip.name}
                                        </text>
                                        <text x="0" y="5" textAnchor="middle" fontSize="10" fill="#16a34a" fontWeight="bold">
                                            Total Selesai: {selectedSchoolTooltip.value} Siswa
                                        </text>
                                        <polygon points="-6,20 6,20 0,26" fill="#16a34a" transform="translate(0, 0)" />
                                        
                                        {/* Close Trigger */}
                                        <circle cx="90" cy="-20" r="8" fill="#f3f4f6" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedSchoolTooltip(null); }} />
                                        <text x="90" y="-17" textAnchor="middle" fontSize="10" fill="#9ca3af" pointerEvents="none">x</text>
                                    </g>
                                )}
                            </svg>
                        </div>
                    )}
                </div>
            </div>

            {/* VIOLATION HISTORY WIDGET (Riwayat Pelanggaran) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <ShieldAlert className="mr-2 text-red-600" size={20}/> Riwayat Pelanggaran Siswa (Realtime)
                    </h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-red-50 text-red-900 font-bold border-b border-red-100">
                            <tr>
                                <th className="p-3 rounded-tl-lg">Nama Siswa</th>
                                <th className="p-3">Sekolah</th>
                                <th className="p-3">Mapel</th>
                                <th className="p-3 text-center">Jml Pelanggaran</th>
                                <th className="p-3 rounded-tr-lg text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {results.filter(r => r.cheatingAttempts > 0).length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                                        Tidak ada pelanggaran terdeteksi saat ini.
                                    </td>
                                </tr>
                            ) : (
                                results
                                .filter(r => r.cheatingAttempts > 0)
                                .sort((a, b) => b.cheatingAttempts - a.cheatingAttempts)
                                .map(r => (
                                    <tr key={r.id} className="hover:bg-red-50/30 transition">
                                        <td className="p-3 font-bold text-gray-800">{r.studentName}</td>
                                        <td className="p-3 text-gray-600">{users.find(u => u.id === r.studentId)?.school || '-'}</td>
                                        <td className="p-3 text-gray-600">{r.examTitle}</td>
                                        <td className="p-3 text-center">
                                            <span className="inline-flex items-center justify-center px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs border border-red-200 shadow-sm animate-pulse">
                                                {r.cheatingAttempts}x
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <button 
                                                onClick={() => handleResetViolation(r.id)}
                                                className="bg-white border border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-400 px-3 py-1 rounded text-xs font-bold flex items-center justify-center mx-auto transition shadow-sm"
                                                title="Reset Status Pelanggaran"
                                            >
                                                <RotateCcw size={12} className="mr-1"/> Reset
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden print:h-auto print:overflow-visible">
      <input type="file" ref={studentFileRef} className="hidden" accept=".csv" onChange={onStudentFileChange} />
      <input type="file" ref={questionFileRef} className="hidden" accept=".csv" onChange={onQuestionFileChange} />
      <input type="file" ref={zipFileRef} className="hidden" accept=".zip" onChange={onZipFileChange} />

      {/* RESPONSIVE SIDEBAR: w-16 on Mobile (Icon only), w-64 on Desktop */}
      <aside className="w-16 md:w-64 flex-shrink-0 text-white flex flex-col shadow-xl z-20 transition-all duration-300 print:hidden" style={{ backgroundColor: themeColor }}>
          <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-center md:justify-start md:space-x-3">
              <BookOpen size={28} className="text-white drop-shadow-md flex-shrink-0" />
              <div className="hidden md:block overflow-hidden whitespace-nowrap">
                  <h1 className="font-bold text-lg tracking-wide">Admin Ujian</h1>
                  <p className="text-xs text-blue-100 opacity-80">Dashboard Admin</p>
              </div>
          </div>
          <nav className="flex-1 p-2 md:p-4 overflow-y-auto custom-scrollbar">
              <NavItem id="DASHBOARD" label="Dashboard" icon={LayoutDashboard} />
              <NavItem id="MONITORING" label="Monitoring Ujian" icon={Activity} />
              <NavItem id="HASIL_UJIAN" label="Hasil Ujian" icon={ClipboardList} />
              <div className="my-2 border-t border-white/10"></div>
              <NavItem id="BANK_SOAL" label="Bank Soal" icon={Database} />
              <NavItem id="MAPPING" label="Mapping Kelas" icon={Map} />
              <NavItem id="PESERTA" label="Data Peserta" icon={RotateCcw} />
              <NavItem id="CETAK_KARTU" label="Cetak Kartu" icon={Printer} />
              <div className="my-2 border-t border-white/10"></div>
              <NavItem id="ANTI_CHEAT" label="Sistem Anti-Curang" icon={ShieldAlert} />
          </nav>
          <div className="p-2 md:p-4 border-t border-white/10 bg-black/10">
               <button onClick={onLogout} className="w-full flex items-center justify-center md:space-x-2 bg-red-500/20 hover:bg-red-500/40 text-red-100 p-2 md:py-2 rounded text-xs font-bold transition border border-red-500/30" title="Keluar">
                   <LogOut size={16} /> <span className="hidden md:inline">Keluar</span>
               </button>
          </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50 print:overflow-visible print:h-auto print:absolute print:top-0 print:left-0 print:w-full print:m-0 print:p-0 print:bg-white">
          {/* HEADER */}
          <header className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:hidden gap-4">
               <h2 className="text-2xl font-bold text-gray-800 flex items-center">{activeTab.replace('_', ' ')}</h2>
               {isLoadingData && <span className="text-xs text-blue-500 animate-pulse flex items-center"><Loader2 size={12} className="animate-spin mr-1"/> Memuat Data...</span>}
          </header>

          {/* DASHBOARD (Main & Sub-views handled by renderDashboardContent) */}
          {activeTab === 'DASHBOARD' && renderDashboardContent()}

          {/* MONITORING - UPDATED WITH COLOR CODING */}
          {activeTab === 'MONITORING' && (
               <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6 animate-in fade-in print:hidden">
                   <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                       <h3 className="font-bold text-lg flex items-center"><Activity size={20} className="mr-2 text-blue-600"/> Live Status Siswa</h3>
                       {selectedStudentIds.length > 0 && (
                           <button onClick={handleBulkReset} className="bg-orange-500 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center shadow-md animate-in fade-in hover:bg-orange-600">
                               <Flame size={16} className="mr-1"/> Reset {selectedStudentIds.length} Siswa Terpilih
                           </button>
                       )}
                   </div>
                   
                   <div className="overflow-x-auto border rounded bg-white">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 font-bold border-b">
                                <tr>
                                    <th className="p-3 w-10 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 rounded cursor-pointer"
                                            checked={filteredMonitoringUsers.length > 0 && selectedStudentIds.length === filteredMonitoringUsers.length}
                                            onChange={() => toggleSelectAll(filteredMonitoringUsers)}
                                        />
                                    </th>
                                    <th className="p-3">Nama</th>
                                    <th className="p-3">NISN</th>
                                    <th className="p-3">Sekolah</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-center">Kontrol</th>
                                </tr>
                           </thead>
                           <tbody className="divide-y">
                               {filteredMonitoringUsers.map(u => {
                                   const statusInfo = getStudentStatusInfo(u);
                                   return (
                                       <tr key={u.id} className="hover:bg-gray-50">
                                           <td className="p-3 text-center">
                                               <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded cursor-pointer"
                                                    checked={selectedStudentIds.includes(u.id)}
                                                    onChange={() => toggleSelectOne(u.id)}
                                               />
                                           </td>
                                           <td className="p-3">{u.name}</td>
                                           <td className="p-3 font-mono">{u.nisn}</td>
                                           <td className="p-3">{u.school}</td>
                                           <td className="p-3">
                                               <span className={`px-2 py-1 rounded text-xs font-bold border ${statusInfo.color}`}>
                                                   {statusInfo.label}
                                               </span>
                                           </td>
                                           <td className="p-3 text-center">
                                               <button 
                                                    title="Buka Freeze (Reset Status)" 
                                                    onClick={async () => { await db.resetUserStatus(u.id); alert('Status siswa di-reset (Unfreeze).'); loadData(); }} 
                                                    className="text-orange-600 bg-orange-50 border border-orange-200 p-1.5 rounded hover:bg-orange-100 transition"
                                                >
                                                    <Flame size={16} />
                                               </button>
                                           </td>
                                       </tr>
                                   )
                               })}
                               {filteredMonitoringUsers.length === 0 && (
                                   <tr><td colSpan={6} className="p-4 text-center text-gray-500">Tidak ada siswa yang sedang online.</td></tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>
          )}
          
          {/* ... Rest of existing tabs ... */}
          {/* BANK SOAL */}
          {activeTab === 'BANK_SOAL' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg">Bank Soal & Materi</h3>
                      <button onClick={handleCreateExam} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-blue-700 flex items-center shadow-sm"><Plus size={16} className="mr-2"/> Tambah Mapel Baru</button>
                  </div>
                  {viewingQuestionsExam ? (
                      <div className="bg-white p-6 rounded-xl shadow-sm border">
                          <button onClick={() => setViewingQuestionsExam(null)} className="text-blue-600 mb-4 text-sm font-bold flex items-center hover:underline">← Kembali ke Daftar</button>
                          <h4 className="text-xl font-bold mb-4 border-b pb-2 flex justify-between items-center">
                              <span>{viewingQuestionsExam.title}</span>
                              <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{viewingQuestionsExam.questions.length} Soal</span>
                          </h4>
                          <div className="flex flex-wrap gap-2 mb-6 bg-gray-50 p-4 rounded-lg border">
                               <button onClick={() => {setTargetExamForAdd(viewingQuestionsExam); setIsAddQuestionModalOpen(true);}} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-green-700 transition"><Plus size={16} className="mr-2"/> Input Manual</button>
                               <div className="h-8 w-px bg-gray-300 mx-2"></div>
                               <button onClick={() => setIsWordGuideOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-indigo-700 transition"><FileText size={16} className="mr-2"/> Panduan Word</button>
                               <button onClick={downloadWordTemplate} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-700 transition"><FileText size={16} className="mr-2"/> Template Word</button>
                               <button onClick={downloadQuestionTemplate} className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-gray-700 transition"><FileText size={16} className="mr-2"/> Template CSV</button>
                               <button onClick={() => triggerImportQuestions(viewingQuestionsExam.id)} className="bg-orange-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-orange-600 transition"><Upload size={16} className="mr-2"/> Import CSV</button>
                               <button onClick={() => triggerImportZip(viewingQuestionsExam.id)} className="bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-800 transition"><Upload size={16} className="mr-2"/> Import Word (ZIP)</button>
                               <button onClick={() => handleExportQuestions(viewingQuestionsExam)} className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-600 transition"><Download size={16} className="mr-2"/> Export CSV</button>
                          </div>
                          <div className="space-y-3">
                              {viewingQuestionsExam.questions.map((q, i) => (
                                  <div key={q.id} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition flex justify-between items-start shadow-sm">
                                      <div className="flex-1 pr-4">
                                          <div className="flex items-center gap-2 mb-1">
                                              <span className="font-bold bg-gray-200 w-8 h-8 flex items-center justify-center rounded-full text-sm">{i+1}</span>
                                              <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{q.type}</span>
                                          </div>
                                          <div className="text-gray-800 mt-2 text-sm q-content" dangerouslySetInnerHTML={{ __html: q.text }}></div>
                                          
                                          {q.options && q.options.length > 0 && (
                                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                  {q.options.map((opt, idx) => (
                                                      <div key={idx} className={`text-xs p-2 rounded border flex items-start gap-2 ${q.correctIndex === idx || (q.correctIndices && q.correctIndices.includes(idx)) ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                                                          <span className="font-bold">{String.fromCharCode(65+idx)}.</span>
                                                          <div dangerouslySetInnerHTML={{ __html: opt }}></div>
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <>
                          <div className="flex flex-wrap gap-2 mb-6 bg-white p-4 rounded-xl border shadow-sm">
                               <button onClick={() => setIsWordGuideOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-indigo-700 transition"><FileText size={16} className="mr-2"/> Panduan Word</button>
                               <button onClick={downloadWordTemplate} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-700 transition"><FileText size={16} className="mr-2"/> Template Word</button>
                               <button onClick={downloadQuestionTemplate} className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center hover:bg-gray-700 transition"><FileText size={16} className="mr-2"/> Template CSV</button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {exams.map(ex => (
                              <div key={ex.id} className="bg-white p-5 rounded-xl border hover:shadow-lg transition cursor-pointer group" onClick={() => setViewingQuestionsExam(ex)}>
                                  <div className="flex justify-between items-start mb-4">
                                      <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition"><Database size={24} className="text-blue-600"/></div>
                                      <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{ex.questionCount} Items</span>
                                  </div>
                                  <h4 className="font-bold text-gray-800 text-lg mb-1">{ex.subject}</h4>
                                  <p className="text-sm text-gray-500 line-clamp-1">Token: {ex.token}</p>
                              </div>
                          ))}
                      </div>
                  </>
                  )}
              </div>
          )}

          {/* MAPPING SEKOLAH */}
          {activeTab === 'MAPPING' && (
              <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                  <h3 className="font-bold text-lg mb-4 flex items-center"><Map size={20} className="mr-2 text-blue-600"/> Mapping Jadwal & Akses Sekolah</h3>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 font-bold border-b">
                            <tr>
                                <th className="p-3">Mapel</th>
                                <th className="p-3">Tanggal & Sesi</th>
                                <th className="p-3">Durasi</th>
                                <th className="p-3">Token</th>
                                <th className="p-3">Akses Sekolah</th>
                                <th className="p-3">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                              {exams.map(ex => (
                                  <tr key={ex.id}>
                                      <td className="p-3 font-medium">{ex.title}</td>
                                      <td className="p-3">
                                          <div className="flex flex-col">
                                              <span className="font-bold">{ex.examDate ? new Date(ex.examDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</span>
                                              <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded w-fit mt-1">{ex.session || 'Sesi 1'}</span>
                                          </div>
                                      </td>
                                      <td className="p-3">{ex.durationMinutes} Menit</td>
                                      <td className="p-3 font-mono bg-yellow-50 font-bold">{ex.token}</td>
                                      <td className="p-3">
                                          {ex.schoolAccess && ex.schoolAccess.length > 0 ? (
                                              <div className="flex flex-wrap gap-1">
                                                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">{ex.schoolAccess.length} Sekolah</span>
                                                  {ex.schoolAccess.slice(0, 2).map(s => <span key={s} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] truncate max-w-[100px]">{s}</span>)}
                                                  {ex.schoolAccess.length > 2 && <span className="text-[10px] text-gray-400 self-center">...</span>}
                                              </div>
                                          ) : (
                                              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">Belum di-set</span>
                                          )}
                                      </td>
                                      <td className="p-3"><button onClick={() => openMappingModal(ex)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold text-xs hover:bg-blue-100 transition flex items-center"><Edit size={12} className="mr-1"/> Mapping</button></td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* PESERTA */}
          {activeTab === 'PESERTA' && (
               <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="font-bold text-lg">Data Peserta</h3>
                       <div className="flex gap-2">
                           <button onClick={() => setIsAddStudentModalOpen(true)} className="bg-orange-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center hover:bg-orange-700 shadow-sm transition transform active:scale-95"><Plus size={16} className="mr-2"/> Tambah Peserta</button>
                            <button onClick={downloadStudentTemplate} className="bg-green-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center"><FileText size={16} className="mr-2"/> Template CSV</button>
                           <button onClick={triggerImportStudents} className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-bold flex items-center hover:bg-blue-700"><Upload size={16} className="mr-2"/> Import Data</button>
                       </div>
                   </div>
                   <div className="mb-4 flex gap-4 bg-gray-50 p-4 rounded-lg border">
                       <div className="flex-1 relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input placeholder="Cari nama atau NISN..." className="border rounded pl-9 pr-3 py-2 text-sm w-full" value={monitoringSearch} onChange={e => setMonitoringSearch(e.target.value)} />
                       </div>
                       <select className="border rounded p-2 text-sm min-w-[200px]" value={selectedSchoolFilter} onChange={e => setSelectedSchoolFilter(e.target.value)}>
                           <option value="ALL">Semua Sekolah</option>
                           {schools.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                   </div>
                   <div className="overflow-x-auto border rounded bg-white">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 font-bold border-b"><tr><th className="p-3">Nama</th><th className="p-3">NISN</th><th className="p-3">Sekolah</th><th className="p-3 text-center">Kontrol</th></tr></thead>
                           <tbody className="divide-y">
                               {getMonitoringUsers(selectedSchoolFilter).map(u => (
                                   <tr key={u.id} className="hover:bg-gray-50">
                                       <td className="p-3">{u.name}</td><td className="p-3 font-mono">{u.nisn}</td><td className="p-3">{u.school}</td>
                                       <td className="p-3 text-center flex justify-center gap-2">
                                           <button title="Reset Login (Unlock)" onClick={async () => { await db.resetUserStatus(u.id); alert('Status login siswa di-reset (Unlock).'); loadData(); }} className="text-yellow-600 bg-yellow-50 border border-yellow-200 p-1.5 rounded hover:bg-yellow-100 transition"><Unlock size={14}/></button>
                                           <button title="Reset Password (12345)" onClick={async () => { if(confirm('Reset password jadi 12345?')) { await db.resetUserPassword(u.id); alert('Password di-reset menjadi 12345'); } }} className="text-blue-600 bg-blue-50 border border-blue-200 p-1.5 rounded hover:bg-blue-100 transition"><Key size={14}/></button>
                                           <button title="Hapus Siswa" onClick={() => {if(confirm('Hapus siswa?')) {db.deleteUser(u.id); loadData();}}} className="text-red-600 bg-red-50 border border-red-200 p-1.5 rounded hover:bg-red-100 transition"><Trash2 size={14}/></button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>
          )}

          {/* HASIL UJIAN */}
          {activeTab === 'HASIL_UJIAN' && (
              <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg">Rekap Hasil Ujian</h3>
                      <button onClick={handleExportResultsExcel} className="bg-green-600 text-white px-4 py-2 rounded font-bold text-sm flex items-center hover:bg-green-700 shadow-sm"><FileSpreadsheet size={16} className="mr-2"/> Export Excel (.csv)</button>
                  </div>
                  
                  <div className="mb-4 bg-gray-50 p-4 rounded-lg border flex items-center gap-4">
                      <Filter size={18} className="text-gray-500"/>
                      <span className="text-sm font-bold text-gray-700">Filter Lembaga:</span>
                      <select className="border rounded p-2 text-sm min-w-[250px]" value={resultSchoolFilter} onChange={e => setResultSchoolFilter(e.target.value)}>
                           <option value="ALL">Semua Lembaga/Sekolah</option>
                           {schools.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                  </div>

                  <div className="overflow-x-auto border rounded">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 font-bold border-b"><tr><th className="p-3">Nama</th><th className="p-3">Sekolah</th><th className="p-3">Mapel</th><th className="p-3">Nilai</th><th className="p-3">Waktu Submit</th></tr></thead>
                          <tbody className="divide-y">
                              {results
                                .filter(r => {
                                    if(resultSchoolFilter === 'ALL') return true;
                                    const st = users.find(u => u.id === r.studentId);
                                    return st?.school === resultSchoolFilter;
                                })
                                .map(r => {
                                  const student = users.find(u => u.id === r.studentId);
                                  return (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium">{r.studentName}</td>
                                        <td className="p-3 text-gray-600">{student?.school || '-'}</td>
                                        <td className="p-3">{r.examTitle}</td>
                                        <td className="p-3 font-bold text-blue-600">{r.score}</td>
                                        <td className="p-3 text-gray-500">{new Date(r.submittedAt).toLocaleString()}</td>
                                    </tr>
                                  );
                                })
                              }
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* CETAK KARTU - "JOS JIS" MODE A4 PRECISE */}
          {activeTab === 'CETAK_KARTU' && (
              <div className="bg-white rounded-xl shadow-sm border p-6 animate-in fade-in print:shadow-none print:border-none print:p-0">
                  {/* Toolbar - Hidden when Printing */}
                  <div className="flex flex-col md:flex-row justify-between items-center mb-6 no-print gap-4 print:hidden">
                      <h3 className="font-bold text-lg">Cetak Kartu Peserta</h3>
                      <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-lg border">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Filter Sekolah</label>
                              <select className="border rounded p-1.5 text-sm w-48" value={cardSchoolFilter} onChange={e => setCardSchoolFilter(e.target.value)}>
                                  <option value="ALL">Semua Sekolah</option>
                                  {schools.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Tanggal Cetak</label>
                              <input type="date" className="border rounded p-1.5 text-sm" value={printDate} onChange={e => setPrintDate(e.target.value)}/>
                          </div>
                          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm flex items-center hover:bg-blue-700 h-full mt-4 md:mt-0 shadow-lg transform active:scale-95 transition-all">
                              <Download size={16} className="mr-2"/> Download PDF / Cetak
                          </button>
                      </div>
                  </div>

                  {/* Printable Area - ID used in CSS to show ONLY this */}
                  <div id="printable-area">
                    <div className="print-grid">
                        {getMonitoringUsers(cardSchoolFilter).map(u => (
                            <div key={u.id} className="card-container bg-white relative flex overflow-hidden">
                                
                                {/* Watermark Background */}
                                <div className="absolute inset-0 opacity-5 flex items-center justify-center pointer-events-none z-0">
                                     <img src={FIXED_LOGO_URL} className="w-32 h-32 object-contain grayscale" />
                                </div>
                                
                                <div className="z-10 flex w-full h-full relative">
                                    {/* Left Column: Logo & Photo & Signature */}
                                    <div className="w-[30%] border-r-2 border-dashed border-gray-400 flex flex-col items-center justify-between p-2 text-center bg-gray-50/30">
                                        <div className="mt-1">
                                            <img src={FIXED_LOGO_URL} className="w-10 h-10 object-contain mix-blend-multiply" alt="Logo"/>
                                        </div>
                                        
                                        <div className="w-full flex-1 flex flex-col items-center justify-center my-1">
                                            <div className="w-[20mm] h-[25mm] border border-gray-400 bg-white flex items-center justify-center shadow-inner">
                                                <span className="text-[8px] text-gray-300 font-bold transform -rotate-12 whitespace-nowrap">FOTO 3x4</span>
                                            </div>
                                        </div>

                                        <div className="mb-1 w-full border-t border-gray-400 pt-1">
                                            <div className="h-4"></div> {/* Space for signature */}
                                            <p className="text-[7px] font-bold text-gray-500 uppercase">Tanda Tangan</p>
                                        </div>
                                    </div>

                                    {/* Right Column: Details */}
                                    <div className="flex-1 p-2 flex flex-col justify-between">
                                        {/* Header */}
                                        <div className="border-b-2 border-gray-800 pb-1 mb-1">
                                            <h2 className="font-black text-sm text-gray-900 leading-none mb-0.5 uppercase">KARTU PESERTA</h2>
                                            <p className="text-[8px] font-bold text-gray-600 tracking-widest uppercase">CBT SPENDAPOL</p>
                                        </div>

                                        {/* Info Table */}
                                        <div className="flex-1 space-y-0.5 text-[9px] text-gray-900 font-medium mt-0.5">
                                            <div className="flex items-start">
                                                <span className="w-14 font-bold text-gray-500">NAMA</span>
                                                <span className="font-bold uppercase flex-1 leading-tight truncate">: {u.name}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="w-14 font-bold text-gray-500">NISN</span>
                                                <span className="font-mono font-bold">: {u.nisn || u.username}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="w-14 font-bold text-gray-500">PASS</span>
                                                <span className="font-mono font-bold bg-gray-100 px-1 border border-gray-200 rounded">: {u.password}</span>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="w-14 font-bold text-gray-500">SEKOLAH</span>
                                                <span className="flex-1 truncate leading-tight">: {u.school || '-'}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="w-14 font-bold text-gray-500">SESI</span>
                                                <span>: 1 (07.30 - 09.30)</span>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="mt-1 pt-1 border-t border-gray-200 flex justify-between items-end">
                                            <div className="text-[7px] text-gray-400 italic max-w-[100px] leading-tight">
                                                *Bawa kartu saat ujian.
                                            </div>
                                            <div className="text-center min-w-[80px]">
                                                <p className="text-[7px] text-gray-600 mb-2 leading-none">
                                                    Pasuruan, {new Date(printDate).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', day: 'numeric' })}
                                                </p>
                                                <p className="text-[7px] font-bold underline">Panitia Pelaksana</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>
              </div>
          )}

          {/* SYSTEM ANTI CHEAT PANEL */}
          {activeTab === 'ANTI_CHEAT' && (
              <div className="space-y-6 animate-in fade-in print:hidden">
                  <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><ShieldAlert size={24} className="mr-2 text-red-600"/> Konfigurasi Sistem Anti-Curang</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Configuration Card */}
                      <div className="bg-white rounded-xl shadow-sm border p-6">
                          <h4 className="font-bold text-gray-800 mb-4 border-b pb-2">Pengaturan Deteksi & Alert</h4>
                          <div className="space-y-4">
                              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                                  <div>
                                      <p className="font-bold text-sm text-gray-700">Status Sistem</p>
                                      <p className="text-xs text-gray-500">Aktifkan deteksi pindah tab/window.</p>
                                  </div>
                                  <button 
                                      onClick={() => setAcActive(!acActive)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${acActive ? 'bg-green-500' : 'bg-gray-300'}`}
                                  >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${acActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                  </button>
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center"><Clock size={14} className="mr-2"/> Durasi Freeze (Detik)</label>
                                  <input 
                                      type="number" 
                                      min="0"
                                      value={acFreeze}
                                      onChange={(e) => setAcFreeze(parseInt(e.target.value))}
                                      className="w-full border rounded-lg p-2 text-sm"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center"><AlertTriangle size={14} className="mr-2"/> Pesan Peringatan</label>
                                  <textarea 
                                      value={acText}
                                      onChange={(e) => setAcText(e.target.value)}
                                      className="w-full border rounded-lg p-2 text-sm h-20"
                                      placeholder="Pesan yang muncul saat layar dikunci..."
                                  />
                              </div>

                              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border">
                                  <Volume2 size={18} className="text-gray-600"/>
                                  <label className="flex-1 text-sm font-bold text-gray-700 cursor-pointer select-none" htmlFor="acSound">
                                      Bunyi Alert (Beep)
                                  </label>
                                  <input 
                                      type="checkbox" 
                                      id="acSound"
                                      checked={acSound}
                                      onChange={(e) => setAcSound(e.target.checked)}
                                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                              </div>
                              
                              <button onClick={handleSaveAntiCheat} className="w-full bg-slate-800 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-slate-900 transition flex items-center justify-center">
                                  <Save size={16} className="mr-2"/> Simpan Konfigurasi
                              </button>
                          </div>
                      </div>

                      {/* Cheating Recap Card */}
                      <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col h-full">
                          <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center text-red-600"><UserX size={18} className="mr-2"/> Riwayat Pelanggaran Siswa</h4>
                          <div className="flex-1 overflow-y-auto">
                               {results.filter(r => r.cheatingAttempts > 0).length === 0 ? (
                                   <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                       <ShieldAlert size={48} className="mb-2 opacity-50"/>
                                       <p className="text-sm">Belum ada data pelanggaran.</p>
                                   </div>
                               ) : (
                                   <table className="w-full text-sm text-left">
                                       <thead className="bg-red-50 text-red-800 font-bold">
                                           <tr>
                                               <th className="p-2 rounded-tl-lg">Nama Siswa</th>
                                               <th className="p-2">Mapel</th>
                                               <th className="p-2 text-center">Pelanggaran</th>
                                               <th className="p-2 rounded-tr-lg text-right">Nilai</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y">
                                           {results
                                              .filter(r => r.cheatingAttempts > 0)
                                              .sort((a, b) => b.cheatingAttempts - a.cheatingAttempts)
                                              .map(r => (
                                                  <tr key={r.id} className="hover:bg-red-50/50">
                                                      <td className="p-2">
                                                          <div className="font-bold text-gray-800">{r.studentName}</div>
                                                          <div className="text-xs text-gray-500">{users.find(u => u.id === r.studentId)?.school || '-'}</div>
                                                      </td>
                                                      <td className="p-2 text-xs text-gray-600">{r.examTitle}</td>
                                                      <td className="p-2 text-center">
                                                          <span className="inline-flex items-center justify-center px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs">
                                                              {r.cheatingAttempts}x
                                                          </span>
                                                      </td>
                                                      <td className="p-2 text-right font-bold text-gray-700">{r.score}</td>
                                                  </tr>
                                              ))
                                           }
                                       </tbody>
                                   </table>
                               )}
                          </div>
                      </div>
                  </div>
              </div>
          )}

      </main>

      {/* EDIT MODAL FOR MAPPING / SCHEDULE */}
      {/* MODAL PANDUAN WORD */}
      {isWordGuideOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b flex justify-between items-center bg-indigo-50">
                      <div className="flex items-center">
                          <FileText className="text-indigo-600 mr-3" size={24}/>
                          <h3 className="text-xl font-bold text-indigo-900">Panduan Template Microsoft Word</h3>
                      </div>
                      <button onClick={() => setIsWordGuideOpen(false)} className="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-100 rounded-full"><X size={24}/></button>
                  </div>
                  <div className="p-8 overflow-y-auto space-y-6">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 leading-relaxed">
                          <p className="font-bold mb-2">Kenapa Menggunakan Template Word?</p>
                          Template Ms.Word merupakan kombinasi strategi import Ms. Word + kapabilitas software Microsoft Word untuk mengkonversi dokumen ke format HTML. Dengan mode import ini, Anda dapat membuat soal dengan lebih bebas menggunakan Ms. Word (Formula/Equation, tabel, gambar, basic formatting seperti tebal, miring, dsb).
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                              <h4 className="font-bold text-gray-800 border-b pb-2">Langkah-langkah:</h4>
                              <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
                                  <li>
                                      Unduh template resmi: 
                                      <button onClick={downloadWordTemplate} className="ml-2 text-indigo-600 font-bold hover:underline flex-inline items-center">
                                          <Download size={14} className="inline mr-1"/> Download Template Word
                                      </button>
                                  </li>
                                  <li>Buat file soal menggunakan Microsoft Word sesuai format contoh di atas.</li>
                                  <li>Simpan soal dalam bentuk <span className="font-bold">DOCX</span> terlebih dahulu (sebagai backup).</li>
                                  <li>Lakukan konversi ke HTML: <span className="font-bold">Save As {"->"} Web Page Filtered</span>.</li>
                                  <li>Mohon simpan dengan nama file <span className="font-bold">tanpa spasi</span>.</li>
                                  <li>Proses ini akan menghasilkan file <span className="font-bold">.htm</span> dan folder (bila terdapat gambar/persamaan).</li>
                                  <li>Pilih file HTML dan foldernya {"->"} Klik kanan {"->"} <span className="font-bold">Compress to ZIP</span>.</li>
                                  <li>Unggah file ZIP yang dihasilkan menggunakan tombol <span className="font-bold">Import Word (ZIP)</span>.</li>
                              </ol>
                          </div>
                          <div className="bg-gray-100 p-4 rounded-lg border flex items-center justify-center">
                              <img src="https://lh3.googleusercontent.com/d/1X_m-f_8_h-v_8_h-v_8_h-v_8_h-v_8" alt="Contoh Format" className="max-w-full rounded shadow-sm" onError={(e) => { (e.target as any).src = 'https://picsum.photos/seed/word-format/400/600'; }} />
                          </div>
                      </div>

                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 space-y-2">
                          <h4 className="font-bold text-yellow-800 text-sm">Format Penulisan:</h4>
                          <ul className="list-disc list-inside text-xs text-yellow-700 space-y-1">
                              <li><span className="font-bold">PG:</span> Gunakan <span className="font-mono">#Kunci: A</span> di akhir soal.</li>
                              <li><span className="font-bold">Essay:</span> Gunakan <span className="font-mono">#Skor: 30</span> di akhir soal.</li>
                              <li><span className="font-bold">PG Kompleks (MA):</span> Gunakan <span className="font-mono">#Jenis: MA</span>. Opsi benar diawali <span className="font-mono">1^</span> (misal: <span className="font-mono">a. 1^Opsi Benar</span>).</li>
                              <li><span className="font-bold">Benar/Salah (MTF):</span> Gunakan <span className="font-mono">#Jenis: MTF</span>. Opsi diawali skor (misal: <span className="font-mono">a. 4^Pernyataan Benar</span> atau <span className="font-mono">b. -4^Pernyataan Salah</span>).</li>
                          </ul>
                      </div>
                  </div>
                  <div className="p-6 border-t bg-gray-50 flex justify-end">
                      <button onClick={() => setIsWordGuideOpen(false)} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">Saya Mengerti</button>
                  </div>
              </div>
          </div>
      )}

      {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-0 animate-in zoom-in-95 max-h-[90vh] overflow-hidden flex flex-col">
                  {/* Modal Header - Jos Jis Gradient */}
                  <div className="p-5 text-white flex justify-between items-center" style={{ background: `linear-gradient(to right, ${themeColor}, #60a5fa)` }}>
                        <div>
                            <h3 className="font-bold text-xl flex items-center"><Map className="mr-2" size={24}/> Mapping Jadwal & Akses</h3>
                            <p className="text-white/80 text-sm">{editingExam?.title}</p>
                        </div>
                        <button onClick={() => setIsEditModalOpen(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"><X size={20}/></button>
                  </div>

                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                      {/* Token & Schedule Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                           {/* Left Column: Token */}
                           <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Token Ujian</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                        <input 
                                            className="border-2 border-gray-300 rounded-lg py-2 pl-9 pr-2 w-full font-mono uppercase font-bold text-lg tracking-wider focus:border-blue-500 focus:outline-none transition text-center" 
                                            value={editToken} 
                                            onChange={e => setEditToken(e.target.value.toUpperCase())}
                                        />
                                    </div>
                                    <button onClick={() => setEditToken(Math.random().toString(36).substring(2,8).toUpperCase())} className="bg-white border-2 border-gray-300 hover:border-blue-400 hover:text-blue-600 px-3 rounded-lg transition"><Shuffle size={20}/></button>
                                </div>
                           </div>

                           {/* Right Column: Date & Session */}
                           <div className="space-y-3">
                                <div className="flex gap-3">
                                     <div className="flex-1">
                                         <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Tanggal</label>
                                         <input type="date" className="border rounded-lg p-2 w-full text-sm font-medium" value={editDate} onChange={e => setEditDate(e.target.value)}/>
                                     </div>
                                     <div className="w-24">
                                         <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Durasi</label>
                                         <div className="relative">
                                             <input type="number" className="border rounded-lg p-2 w-full text-sm font-medium pr-8" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))}/>
                                             <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">m</span>
                                         </div>
                                     </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Sesi</label>
                                    <select className="border rounded-lg p-2 w-full text-sm font-medium bg-white" value={editSession} onChange={e => setEditSession(e.target.value)}>
                                        <option value="Sesi 1">Sesi 1 (Pagi)</option>
                                        <option value="Sesi 2">Sesi 2 (Siang)</option>
                                        <option value="Sesi 3">Sesi 3 (Sore)</option>
                                    </select>
                                </div>
                           </div>
                      </div>

                      {/* --- JOS JIS MAPPING UI --- */}
                      
                      {/* 1. Indicators Dashboard */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-blue-400">Total Akses</p>
                              <p className="text-2xl font-extrabold text-blue-600 leading-none mt-1">{editSchoolAccess.length}</p>
                          </div>
                          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-green-400">Tersedia</p>
                              <p className="text-2xl font-extrabold text-green-600 leading-none mt-1">{availableSchools.length}</p>
                          </div>
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                              <p className="text-[10px] uppercase font-bold text-orange-400">Sibuk/Bentrok</p>
                              <p className="text-2xl font-extrabold text-orange-600 leading-none mt-1">{busyCount}</p>
                          </div>
                      </div>

                      {/* 2. Selected Schools Area (Chips) */}
                      <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                               <label className="text-sm font-bold text-gray-700 flex items-center">
                                   <CheckSquare size={16} className="mr-2 text-blue-600"/> Sekolah Terpilih (Akses Diberikan)
                               </label>
                               {editSchoolAccess.length > 0 && (
                                   <button onClick={() => setEditSchoolAccess([])} className="text-xs text-red-500 font-bold hover:underline">Hapus Semua</button>
                               )}
                          </div>
                          <div className="bg-white border-2 border-blue-100 rounded-xl p-3 min-h-[80px] flex flex-wrap gap-2 content-start shadow-inner">
                               {editSchoolAccess.length === 0 && (
                                   <p className="text-sm text-gray-400 italic w-full text-center py-4">Belum ada sekolah yang dipilih.</p>
                               )}
                               {editSchoolAccess.map(s => (
                                   <div key={s} className="group bg-blue-600 text-white pl-3 pr-1 py-1 rounded-full text-xs font-bold flex items-center shadow-sm animate-in zoom-in duration-200">
                                       <span>{s}</span>
                                       <button onClick={() => toggleSchoolAccess(s)} className="ml-2 p-1 hover:bg-white/20 rounded-full transition">
                                           <X size={12}/>
                                       </button>
                                   </div>
                               ))}
                          </div>
                      </div>

                      {/* 3. Available Schools Area (List) */}
                      <div>
                           <div className="flex justify-between items-center mb-2">
                               <label className="text-sm font-bold text-gray-700 flex items-center">
                                   <Plus size={16} className="mr-2 text-green-600"/> Tambah Akses (Tersedia Sesi Ini)
                               </label>
                               {availableSchools.length > 0 && (
                                   <button onClick={() => addAllAvailableSchools(availableSchools)} className="text-xs text-blue-600 font-bold hover:underline">Pilih Semua ({availableSchools.length})</button>
                               )}
                           </div>
                           
                           {/* Filter Search */}
                           <div className="relative mb-2">
                               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                               <input 
                                   className="w-full border rounded-lg py-2 pl-9 pr-3 text-xs bg-gray-50 focus:bg-white transition outline-none focus:ring-1 focus:ring-blue-400"
                                   placeholder="Cari nama sekolah..."
                                   value={mappingSearch}
                                   onChange={e => setMappingSearch(e.target.value)}
                               />
                           </div>

                           <div className="border rounded-xl bg-gray-50 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                               {availableSchools.length === 0 ? (
                                   <div className="p-6 text-center text-gray-400 text-xs">
                                       <Info size={24} className="mx-auto mb-2 opacity-50"/>
                                       <p>Tidak ada sekolah tersedia untuk ditambahkan.</p>
                                       {busyCount > 0 && <p className="mt-1 text-orange-400">({busyCount} sekolah sedang ujian mapel lain)</p>}
                                   </div>
                               ) : (
                                   availableSchools.map(s => (
                                       <div 
                                            key={s} 
                                            onClick={() => toggleSchoolAccess(s)}
                                            className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-blue-50 cursor-pointer transition group bg-white"
                                       >
                                           <div className="flex items-center space-x-3">
                                               <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs group-hover:bg-blue-200 group-hover:text-blue-700 transition">
                                                   <School size={14}/>
                                               </div>
                                               <span className="text-sm font-medium text-gray-700 group-hover:text-blue-800">{s}</span>
                                           </div>
                                           <div className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center group-hover:border-blue-500">
                                               <Plus size={12} className="text-white group-hover:text-blue-600"/>
                                           </div>
                                       </div>
                                   ))
                               )}
                           </div>

                           {/* Busy Warning Footer */}
                           {busyCount > 0 && (
                               <div className="mt-2 bg-orange-50 border border-orange-100 rounded-lg p-2 flex items-center gap-2 text-xs text-orange-700">
                                   <AlertTriangle size={14} className="flex-shrink-0"/>
                                   <span><strong>{busyCount} Sekolah</strong> disembunyikan karena sudah ada jadwal ujian lain di sesi ini.</span>
                               </div>
                           )}
                      </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 bg-gray-50 border-t flex gap-3">
                      <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-3 text-gray-500 font-bold text-sm hover:bg-gray-200 rounded-xl transition">Batal</button>
                      <button onClick={handleSaveMapping} className="flex-[2] py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-lg hover:shadow-xl transition transform active:scale-95 flex items-center justify-center">
                          <Save size={18} className="mr-2"/> Simpan Perubahan
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ADD MANUAL QUESTION MODAL */}
      {isAddQuestionModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 h-[90vh] overflow-y-auto animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Tambah Soal Manual</h3><button onClick={() => setIsAddQuestionModalOpen(false)}><X/></button></div>
                  <div className="space-y-4">
                      <select className="border rounded p-2 w-full" value={nqType} onChange={e => {
                          const type = e.target.value as QuestionType;
                          setNqType(type);
                          if (type === 'URAIAN') {
                              setNqOptions([]);
                          } else if (nqOptions.length === 0) {
                              setNqOptions(['', '', '', '']);
                          }
                      }}>
                          <option value="PG">Pilihan Ganda (Single)</option>
                          <option value="PG_KOMPLEKS">Pilihan Ganda Kompleks (MCMA)</option>
                          <option value="PG_BS">Pilihan Ganda Kompleks (Benar/Salah)</option>
                          <option value="URAIAN">Essay / Uraian</option>
                      </select>
                      <textarea className="border rounded p-2 w-full h-24" placeholder="Teks Soal..." value={nqText} onChange={e => setNqText(e.target.value)}></textarea>
                      
                      {nqType !== 'URAIAN' && (
                          <div className="grid grid-cols-1 gap-2">
                              <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-bold">Opsi Jawaban & Kunci:</span>
                                  <button onClick={() => setNqOptions([...nqOptions, ''])} className="text-blue-600 text-xs font-bold">+ Tambah Opsi</button>
                              </div>
                              {nqOptions.map((opt, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                      <span className="font-bold w-6">{String.fromCharCode(65+i)}.</span>
                                      <input className="border rounded p-2 flex-1" value={opt} onChange={e => {const n = [...nqOptions]; n[i] = e.target.value; setNqOptions(n);}} placeholder={`Opsi ${String.fromCharCode(65+i)}`}/>
                                      
                                      {nqType === 'PG' && (
                                          <input type="radio" name="correct" checked={nqCorrectIndex === i} onChange={() => setNqCorrectIndex(i)}/>
                                      )}
                                      
                                      {nqType === 'PG_KOMPLEKS' && (
                                          <input type="checkbox" checked={nqCorrectIndices.includes(i)} onChange={() => {
                                              if (nqCorrectIndices.includes(i)) {
                                                  setNqCorrectIndices(nqCorrectIndices.filter(idx => idx !== i));
                                              } else {
                                                  setNqCorrectIndices([...nqCorrectIndices, i]);
                                              }
                                          }}/>
                                      )}

                                      {nqType === 'PG_BS' && (
                                          <div className="flex gap-1">
                                              <button 
                                                  onClick={() => {
                                                      if (!nqCorrectIndices.includes(i)) setNqCorrectIndices([...nqCorrectIndices, i]);
                                                  }}
                                                  className={`px-2 py-1 text-[10px] rounded font-bold ${nqCorrectIndices.includes(i) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                                              >
                                                  B
                                              </button>
                                              <button 
                                                  onClick={() => {
                                                      setNqCorrectIndices(nqCorrectIndices.filter(idx => idx !== i));
                                                  }}
                                                  className={`px-2 py-1 text-[10px] rounded font-bold ${!nqCorrectIndices.includes(i) ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                                              >
                                                  S
                                              </button>
                                          </div>
                                      )}

                                      <button onClick={() => setNqOptions(nqOptions.filter((_, idx) => idx !== i))} className="text-red-500"><X size={16}/></button>
                                  </div>
                              ))}
                          </div>
                      )}
                      
                      <div className="flex items-center gap-4">
                          <div className="flex-1">
                              <label className="block text-xs font-bold text-gray-500 mb-1">Bobot Nilai</label>
                              <input type="number" className="border rounded p-2 w-full" value={nqPoints} onChange={e => setNqPoints(parseInt(e.target.value) || 0)}/>
                          </div>
                      </div>
                      <button onClick={handleSaveQuestion} className="bg-green-600 text-white w-full py-3 rounded font-bold">Simpan Soal</button>
                  </div>
              </div>
          </div>
      )}

      {/* ADD MANUAL STUDENT MODAL */}
      {isAddStudentModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                  <div className="p-5 text-white flex justify-between items-center" style={{ background: `linear-gradient(to right, ${themeColor}, #60a5fa)` }}>
                      <h3 className="font-bold text-xl flex items-center"><Plus className="mr-2" size={24}/> Tambah Peserta Baru</h3>
                      <button onClick={() => setIsAddStudentModalOpen(false)} className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nama Lengkap Siswa</label>
                          <input 
                              className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-medium focus:border-blue-400 focus:outline-none transition bg-gray-50 focus:bg-white" 
                              placeholder="Contoh: Ahmad Fauzi" 
                              value={nsName} 
                              onChange={e => setNsName(e.target.value)}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">NISN / Username</label>
                              <input 
                                  className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-mono font-bold focus:border-blue-400 focus:outline-none transition bg-gray-50 focus:bg-white" 
                                  placeholder="12345678" 
                                  value={nsNisn} 
                                  onChange={e => setNsNisn(e.target.value)}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Password Default</label>
                              <input 
                                  className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-mono focus:border-blue-400 focus:outline-none transition bg-gray-50 focus:bg-white" 
                                  placeholder="12345" 
                                  value={nsPassword} 
                                  onChange={e => setNsPassword(e.target.value)}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Lembaga / Kelas</label>
                          <input 
                              className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-medium focus:border-blue-400 focus:outline-none transition bg-gray-50 focus:bg-white" 
                              placeholder="Contoh: KELAS 9A" 
                              value={nsSchool} 
                              onChange={e => setNsSchool(e.target.value)}
                          />
                          <p className="text-[10px] text-gray-400 mt-1 italic">* Digunakan untuk filter mapping jadwal ujian.</p>
                      </div>
                  </div>
                  <div className="p-4 bg-gray-50 border-t flex gap-3">
                      <button onClick={() => setIsAddStudentModalOpen(false)} className="flex-1 py-3 text-gray-500 font-bold text-sm hover:bg-gray-200 rounded-xl transition">Batal</button>
                      <button onClick={handleAddStudent} className="flex-[2] py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-lg hover:shadow-xl transition transform active:scale-95 flex items-center justify-center">
                          <Save size={18} className="mr-2"/> Simpan Peserta
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};