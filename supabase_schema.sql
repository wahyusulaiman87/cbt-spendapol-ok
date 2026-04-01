-- Supabase Schema for CBT SPENDAPOL

-- 1. Table: students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    nisn TEXT UNIQUE NOT NULL,
    school TEXT DEFAULT 'UMUM',
    password TEXT NOT NULL DEFAULT '12345',
    is_login BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'idle', -- 'idle', 'blocked', 'finished'
    cheating_attempts INTEGER DEFAULT 0,
    current_exam_id UUID REFERENCES subjects(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table: subjects (Exams)
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 90,
    question_count INTEGER DEFAULT 0,
    token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    exam_date TEXT, -- Store as string for simplicity in this app's logic
    end_time TEXT,
    session TEXT,
    school_access JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Table: questions
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    "Nomor" TEXT,
    "Tipe Soal" TEXT DEFAULT 'PG', -- 'PG', 'CHECKLIST'
    "Jenis Soal" TEXT DEFAULT 'UMUM',
    "Soal" TEXT NOT NULL,
    "Opsi A" TEXT,
    "Opsi B" TEXT,
    "Opsi C" TEXT,
    "Opsi D" TEXT,
    "Kunci" TEXT, -- 'A', 'B', 'C', 'D'
    "Bobot" TEXT DEFAULT '10',
    "Url Gambar" TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Table: results
CREATE TABLE IF NOT EXISTS results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    score NUMERIC DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for development, adjust for production)
CREATE POLICY "Public Read Access" ON students FOR SELECT USING (true);
CREATE POLICY "Public Update Access" ON students FOR UPDATE USING (true);
CREATE POLICY "Public Insert Access" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Delete Access" ON students FOR DELETE USING (true);

CREATE POLICY "Public Read Access" ON subjects FOR SELECT USING (true);
CREATE POLICY "Public Update Access" ON subjects FOR UPDATE USING (true);
CREATE POLICY "Public Insert Access" ON subjects FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Delete Access" ON subjects FOR DELETE USING (true);

CREATE POLICY "Public Read Access" ON questions FOR SELECT USING (true);
CREATE POLICY "Public Update Access" ON questions FOR UPDATE USING (true);
CREATE POLICY "Public Insert Access" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Delete Access" ON questions FOR DELETE USING (true);

CREATE POLICY "Public Read Access" ON results FOR SELECT USING (true);
CREATE POLICY "Public Update Access" ON results FOR UPDATE USING (true);
CREATE POLICY "Public Insert Access" ON results FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Delete Access" ON results FOR DELETE USING (true);
