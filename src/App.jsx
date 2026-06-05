import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, X, Clock, AlertCircle, Download, RefreshCw, Cloud, Copy, Trash, Hourglass, FileSpreadsheet, Layers, Settings2, Undo, Database, AlignLeft, Sparkles, Bot, Maximize2, Minimize2, LogOut, Lock, Mail } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, arrayUnion, writeBatch, getDocs, getDoc } from 'firebase/firestore';

// ============================================================================
// ⚠️ 独立网站部署必填配置 (如果您要将其部署到自己的服务器/IP上)
// 请前往 https://console.firebase.google.com/ 免费创建一个 Web 项目，并将配置粘贴在此：
// ============================================================================
const standaloneFirebaseConfig = {
  apiKey: "AIzaSyBVeGdLXbCb8VEO5VLw9j4GH9Ynqsvol3c",
  authDomain: "smart-schedule-8945f.firebaseapp.com",
  projectId: "smart-schedule-8945f",
  storageBucket: "smart-schedule-8945f.firebasestorage.app",
  messagingSenderId: "338935726038",
  appId: "1:338935726038:web:48167f9509a81887902e77"
};

// 智能判断环境：如果在当前 AI 画布中，就用内置环境；如果部署在外部 IP 上，就用您自己的配置。
const isStandalone = typeof __firebase_config === 'undefined';
const firebaseConfig = isStandalone ? standaloneFirebaseConfig : JSON.parse(__firebase_config);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 核心锁定：彻底锁死 App ID，绑定用户私有数据路径
const FIXED_APP_ID = 'stable-schedule-private-v999';

// UI 与排版配置
const PIXELS_PER_HOUR = 90; 
const START_HOUR = 8;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 周一到周日彩虹色彩主题
const DAY_THEMES = [
  { bg: 'bg-red-50/60', text: 'text-red-600' },
  { bg: 'bg-orange-50/60', text: 'text-orange-600' },
  { bg: 'bg-amber-50/60', text: 'text-amber-600' },
  { bg: 'bg-emerald-50/60', text: 'text-emerald-600' },
  { bg: 'bg-cyan-50/60', text: 'text-cyan-600' },
  { bg: 'bg-blue-50/60', text: 'text-blue-600' },
  { bg: 'bg-rose-50/60', text: 'text-rose-600' },
];

const DURATION_OPTIONS = [
  { label: '半小时', value: 30 }, { label: '1小时', value: 60 },
  { label: '1.5小时', value: 90 }, { label: '2小时', value: 120 },
  { label: '2.5小时', value: 150 }, { label: '3小时', value: 180 },
];

const TAGS = {
  A: { label: 'A', badge: 'bg-sky-400', theme: { bg: 'bg-sky-50', text: 'text-slate-800', border: 'border-sky-300' } },
  B: { label: 'B', badge: 'bg-emerald-400', theme: { bg: 'bg-emerald-50', text: 'text-slate-800', border: 'border-emerald-300' } },
  P: { label: 'P', badge: 'bg-rose-400', theme: { bg: 'bg-rose-50', text: 'text-slate-800', border: 'border-rose-300' } },
};

// --- 工具函数 ---
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const formatDate = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const getWeekId = (mondayDate) => `${mondayDate.getFullYear()}-${formatDate(mondayDate)}`;
const timeToMinutes = (t) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24, m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const getDiffWeeks = (w1, w2) => {
  if (!w1 || !w2) return 0;
  const [y1, m1, d1] = w1.split('-').map(Number), [y2, m2, d2] = w2.split('-').map(Number);
  const date1 = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const date2 = new Date(y2, m2 - 1, d2, 12, 0, 0);
  return Math.round(Math.abs(date2 - date1) / 604800000);
};

// --- Gemini API 集成逻辑 ---
const callGeminiAPI = async (prompt) => {
  const apiKey = ""; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  let retries = 5, backoff = 1000;

  while (retries > 0) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI 无法生成内容。";
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      await delay(backoff);
      backoff *= 2;
    }
  }
};

const currentRealMonday = getMonday(new Date());
const currentWeekId = getWeekId(currentRealMonday);

// --- 初始化种子数据 ---
const INITIAL_COURSES = [
  { id: 'm1', title: '子蕙', colIndex: 0, startTime: '10:00', endTime: '11:00', value: 240, isFixed: false, weekId: currentWeekId, tag: 'A', notes: '' },
  { id: 'm2', title: '海辰数学', colIndex: 0, startTime: '17:00', endTime: '18:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'm3', title: '张恋一', colIndex: 0, startTime: '18:00', endTime: '19:00', value: 240, isFixed: false, weekId: currentWeekId, tag: 'P', notes: '' },
  { id: 'm4', title: '泽源', colIndex: 0, startTime: '19:00', endTime: '20:00', value: 300, isFixed: false, weekId: currentWeekId, tag: 'B', notes: '' },
  { id: 'm5', title: 'Ella计算机', colIndex: 0, startTime: '20:00', endTime: '21:00', value: 400, isFixed: false, weekId: currentWeekId, tag: 'P', notes: '' },
  { id: 't1', title: '晴朗', colIndex: 1, startTime: '10:00', endTime: '11:30', value: 260, isFixed: false, weekId: currentWeekId, tag: 'P', notes: '' },
  { id: 't2', title: 'Samantha', colIndex: 1, startTime: '13:00', endTime: '14:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 't3', title: 'Michael香港', colIndex: 1, startTime: '14:30', endTime: '16:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'A', notes: '' },
  { id: 't4', title: '依宸', colIndex: 1, startTime: '17:00', endTime: '18:00', value: 240, isFixed: true, weekId: null, excludedWeeks: [], tag: 'A', notes: '' },
  { id: 't5', title: '泽源', colIndex: 1, startTime: '18:00', endTime: '19:00', value: 300, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 't6', title: 'Ella计算机', colIndex: 1, startTime: '20:00', endTime: '21:00', value: 400, isFixed: false, weekId: currentWeekId, tag: 'P', notes: '' },
  { id: 'w1', title: 'Nancy cs', colIndex: 2, startTime: '19:00', endTime: '20:00', value: 300, isFixed: true, weekId: null, excludedWeeks: [], tag: 'B', notes: '' },
  { id: 'w2', title: 'Ella计算机', colIndex: 2, startTime: '20:00', endTime: '21:00', value: 400, isFixed: false, weekId: currentWeekId, tag: 'P', notes: '' },
  { id: 'th1', title: 'Michael香港', colIndex: 3, startTime: '14:00', endTime: '15:30', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'A', notes: '' },
  { id: 'th2', title: '海辰数学', colIndex: 3, startTime: '16:00', endTime: '17:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'th3', title: '海辰数学', colIndex: 3, startTime: '17:00', endTime: '18:00', value: 240, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'th4', title: 'Michael经济', colIndex: 3, startTime: '19:00', endTime: '20:00', value: 220, isFixed: true, weekId: null, excludedWeeks: [], tag: 'A', notes: '' },
  { id: 'th5', title: '子蕙', colIndex: 3, startTime: '20:00', endTime: '21:00', value: 240, isFixed: false, weekId: currentWeekId, tag: 'A', notes: '' },
  { id: 'f1', title: 'Samantha', colIndex: 4, startTime: '13:00', endTime: '14:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'f2', title: '泽源', colIndex: 4, startTime: '17:00', endTime: '18:00', value: 300, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'f4', title: '子蕙', colIndex: 4, startTime: '18:00', endTime: '20:00', value: 240, isFixed: false, weekId: currentWeekId, tag: 'A', notes: '' },
  { id: 'f3', title: 'Michael经济', colIndex: 4, startTime: '19:00', endTime: '20:00', value: 220, isFixed: true, weekId: null, excludedWeeks: [], tag: 'A', notes: '' },
  { id: 'f5', title: '哲元', colIndex: 4, startTime: '20:00', endTime: '21:00', value: 220, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 's1', title: 'Tomo', colIndex: 5, startTime: '09:00', endTime: '11:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 's2', title: '泽源', colIndex: 5, startTime: '17:00', endTime: '18:00', value: 300, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'sn1', title: 'David 商务', colIndex: 6, startTime: '11:00', endTime: '12:00', value: 220, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'sn2', title: 'Tomo', colIndex: 6, startTime: '13:00', endTime: '15:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'sn3', title: 'Louis CS', colIndex: 6, startTime: '19:00', endTime: '20:00', value: 400, isFixed: true, weekId: null, excludedWeeks: [], tag: 'P', notes: '' },
];

const getCourseTotalValue = (course, courseDate) => {
  if (!course || !course.startTime || !course.endTime) return 0;
  let durMins = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
  if (durMins < 0) durMins += 1440;
  
  let hourlyRate = Number(course.value) || 0;
  
  if (course.title && course.title.includes('David')) {
    const thresholdDate = new Date(2026, 5, 3);
    thresholdDate.setHours(0, 0, 0, 0);
    const checkDate = new Date(courseDate);
    checkDate.setHours(0, 0, 0, 0);
    if (checkDate >= thresholdDate) hourlyRate = 400;
  }

  if (courseDate && course.title && course.title.includes('芮彤')) {
    const thresholdDate = new Date(2026, 4, 10);
    thresholdDate.setHours(0, 0, 0, 0);
    const checkDate = new Date(courseDate);
    checkDate.setHours(0, 0, 0, 0);
    if (checkDate < thresholdDate) hourlyRate = 260;
  }
  
  return Math.round(hourlyRate * (durMins / 60));
};

export default function App() {
  const scheduleRef = useRef(null);
  const gridBodyRef = useRef(null); 
  const appContainerRef = useRef(null);
  
  const [courses, setCourses] = useState([]);
  const [viewWeekStart, setViewWeekStart] = useState(currentRealMonday);
  const [user, setUser] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [overlapState, setOverlapState] = useState({});
  const [hideEmptyOverlay, setHideEmptyOverlay] = useState(false);
  
  const [isZenMode, setIsZenMode] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  
  // -- Auth UI States (for standalone mode) --
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  // -- UI States --
  const [isDownloading, setIsDownloading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [formData, setFormData] = useState({ title: '', colIndex: 0, startTime: '10:00', duration: 60, value: 0, recurrence: 'temp', excludedWeeks: [], tag: 'P', notes: '' });
  const [isNameManagerOpen, setIsNameManagerOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState(null);
  const [isTitleDropdownOpen, setIsTitleDropdownOpen] = useState(false); 
  const [restoreError, setRestoreError] = useState("");
  const [editingNameState, setEditingNameState] = useState({ oldName: null, newName: '' });
  
  const [dragInfo, setDragInfo] = useState(null);
  const [moveConfirmInfo, setMoveConfirmInfo] = useState(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState(() => {
    const now = new Date();
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}` };
  });
  const [exportCourseFilter, setExportCourseFilter] = useState(''); 
  
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupText, setBackupText] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAnalyzingSchedule, setIsAnalyzingSchedule] = useState(false);
  const [scheduleAnalysisResult, setScheduleAnalysisResult] = useState("");
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);

  // --- 全屏逻辑 (原生 + CSS网页内降级) ---
  const toggleFullscreen = async () => {
    if (!isNativeFullscreen && !isCssFullscreen) {
      if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
        try {
          if (appContainerRef.current?.requestFullscreen) {
            await appContainerRef.current.requestFullscreen();
          } else if (appContainerRef.current?.webkitRequestFullscreen) {
            await appContainerRef.current.webkitRequestFullscreen();
          } else {
            setIsCssFullscreen(true);
          }
        } catch (err) {
          setIsCssFullscreen(true);
        }
      } else {
        setIsCssFullscreen(true);
      }
    } else {
      if (isNativeFullscreen) {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        } catch (e) {}
      }
      if (isCssFullscreen) {
        setIsCssFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsNativeFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleZenMode = () => setIsZenMode(!isZenMode);

  // --- 登录账号逻辑 ---
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthProcessing(true);
    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err) {
      setAuthError(err.message.includes('auth/') ? '账号或密码错误 / 账号已存在' : err.message);
    } finally {
      setIsAuthProcessing(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!isStandalone && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token); 
        } else if (!isStandalone) {
          await signInAnonymously(auth);
        }
        // 如果是 isStandalone，我们只监听状态，不自动匿名登录，以便让用户输入账号密码
      } catch (e) { console.error(e); }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthInitialized(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const coursesRef = collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses');
    const unsubscribe = onSnapshot(coursesRef, async (snap) => {
      const docs = snap.docs.filter(d => d.id !== '_metadata_');
      
      if (docs.length === 0 && !hideEmptyOverlay) {
        try {
          const templateRef = collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'saved_template');
          const tSnap = await getDocs(templateRef);
          const batch = writeBatch(db);
          const currentWId = getWeekId(getMonday(new Date()));
          
          if (!tSnap.empty) {
            tSnap.forEach(d => {
              const data = d.data();
              if (!data.isFixed) data.weekId = currentWId;
              if (data.isBiweekly) data.baseWeekId = currentWId;
              batch.set(doc(coursesRef, d.id), data);
            });
          } else {
            INITIAL_COURSES.forEach(c => {
              const data = {...c};
              if (!data.isFixed) data.weekId = currentWId;
              if (data.isBiweekly) data.baseWeekId = currentWId;
              batch.set(doc(coursesRef, data.id), data);
            });
          }
          batch.set(doc(coursesRef, '_metadata_'), { last: Date.now() });
          await batch.commit();
        } catch (e) { console.error("Auto restore failed:", e); }
      } else {
        const list = docs.map(d => ({ id: d.id, ...d.data() }));
        setCourses(list);
        setSyncing(false);
      }
    }, (err) => { 
      console.error(err);
      setSyncing(false); 
    });
    return () => unsubscribe();
  }, [user, hideEmptyOverlay]);

  const coursesRefLatest = useRef(courses);
  useEffect(() => { coursesRefLatest.current = courses; }, [courses]);

  const viewWeekId = getWeekId(viewWeekStart);

  const getCourseDisplayInfo = (course, currentWeek) => {
    let baseTitle = course.title ? course.title.replace(/\s*\(第\d+课\)/g, '') : '';
    let dynamicNote = '';
    const [y, m, d] = currentWeek.split('-').map(Number);
    const targetMon = new Date(y, m - 1, d);

    if (course.title && course.title.includes('海辰数学')) {
      let count = 0, safety = 0;
      const restartDate = new Date(2026, 4, 18);
      let iter = targetMon >= restartDate ? new Date(2026, 4, 18) : new Date(2026, 3, 20);

      while (iter <= targetMon && safety < 1000) {
        safety++;
        const iw = getWeekId(iter);
        const wc = courses.filter(c => {
          if (!c.title || !c.title.includes('海辰数学')) return false;
          if (c.isFixed) {
            const isAfterStart = c.baseWeekId ? iw >= c.baseWeekId : true;
            const isBeforeEnd = c.endWeekId ? iw < c.endWeekId : true;
            return isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(iw)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, iw) % 2 === 0);
          }
          return c.weekId === iw;
        }).sort((a,b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        
        if (iw === currentWeek) {
          for (let c of wc) {
            let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
            if (dur < 0) dur += 1440;
            count += (dur / 60);
            if (c.id === course.id) break;
          }
          break;
        } else {
          for (let c of wc) {
            let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
            if (dur < 0) dur += 1440;
            count += (dur / 60);
          }
        }
        iter.setDate(iter.getDate() + 7);
      }
      dynamicNote = `第${Number.isInteger(count) ? count : count.toFixed(1)}课`;
    }

    if (course.title && course.title.includes('芮彤')) {
      let totalMins = 0, safety = 0;
      let startMon = getMonday(new Date(2026, 4, 10)); 
      let currentIterMon = new Date(startMon);
      
      while (currentIterMon <= targetMon && safety < 1000) {
        safety++;
        const iw = getWeekId(currentIterMon);
        const wc = courses.filter(c => {
          if (!c.title || !c.title.includes('芮彤')) return false;
          if (c.isFixed) {
            const isAfterStart = c.baseWeekId ? iw >= c.baseWeekId : true;
            const isBeforeEnd = c.endWeekId ? iw < c.endWeekId : true;
            return isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(iw)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, iw) % 2 === 0);
          }
          return c.weekId === iw;
        }).sort((a,b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

        for (let c of wc) {
           const cDate = new Date(currentIterMon);
           cDate.setDate(cDate.getDate() + c.colIndex);
           if (cDate < new Date(2026, 4, 10)) continue;
           if (iw === currentWeek) {
              if (c.colIndex < course.colIndex || (c.colIndex === course.colIndex && timeToMinutes(c.startTime) <= timeToMinutes(course.startTime))) {
                 let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
                 if (dur < 0) dur += 1440;
                 totalMins += dur;
              }
           } else {
              let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
              if (dur < 0) dur += 1440;
              totalMins += dur;
           }
        }
        currentIterMon.setDate(currentIterMon.getDate() + 7);
      }
      
      if (totalMins > 0) {
        const hours = totalMins / 60;
        const ruiTongNote = `累计 ${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
        dynamicNote = dynamicNote ? `${dynamicNote} | ${ruiTongNote}` : ruiTongNote;
      }
    }

    if (course.title && course.title.includes('David')) {
      let count = 0, safety = 0;
      let startMon = getMonday(new Date(2026, 5, 3)); 
      let currentIterMon = new Date(startMon);
      
      while (currentIterMon <= targetMon && safety < 1000) {
        safety++;
        const iw = getWeekId(currentIterMon);
        const wc = courses.filter(c => {
          if (!c.title || !c.title.includes('David')) return false;
          if (c.isFixed) {
            const isAfterStart = c.baseWeekId ? iw >= c.baseWeekId : true;
            const isBeforeEnd = c.endWeekId ? iw < c.endWeekId : true;
            return isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(iw)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, iw) % 2 === 0);
          }
          return c.weekId === iw;
        }).sort((a,b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

        for (let c of wc) {
           const cDate = new Date(currentIterMon);
           cDate.setDate(cDate.getDate() + c.colIndex);
           
           if (cDate < new Date(2026, 5, 3)) continue;

           if (iw === currentWeek) {
              if (c.colIndex < course.colIndex || (c.colIndex === course.colIndex && timeToMinutes(c.startTime) <= timeToMinutes(course.startTime))) {
                 let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
                 if (dur < 0) dur += 1440;
                 count += (dur / 60);
              }
           } else {
              let dur = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
              if (dur < 0) dur += 1440;
              count += (dur / 60);
           }
        }
        currentIterMon.setDate(currentIterMon.getDate() + 7);
      }
      
      if (count > 0) {
        const davidNote = `第${Number.isInteger(count) ? count : count.toFixed(1)}课时`;
        dynamicNote = dynamicNote ? `${dynamicNote} | ${davidNote}` : davidNote;
      }
    }

    return { title: baseTitle, dynamicNote };
  };

  const visibleCourses = useMemo(() => courses.filter(c => {
    if (c.isFixed) {
      const isAfterStart = c.baseWeekId ? viewWeekId >= c.baseWeekId : true;
      const isBeforeEnd = c.endWeekId ? viewWeekId < c.endWeekId : true;
      return isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(viewWeekId)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, viewWeekId) % 2 === 0);
    }
    return c.weekId === viewWeekId;
  }), [courses, viewWeekId]);

  const groupedCoursesByCol = useMemo(() => {
    const result = Array(7).fill(null).map(() => []);
    const cols = Array(7).fill(null).map(() => []);
    visibleCourses.forEach(c => {
      let startM = timeToMinutes(c.startTime), endM = timeToMinutes(c.endTime);
      if (endM < startM) endM += 1440;
      cols[c.colIndex].push({ ...c, startM, endM });
    });
    cols.forEach((colCourses, colIdx) => {
      colCourses.sort((a, b) => a.startM - b.startM);
      let group = [], maxEnd = -1;
      colCourses.forEach(c => {
        if (group.length === 0) { group.push(c); maxEnd = c.endM; }
        else if (c.startM < maxEnd) { group.push(c); maxEnd = Math.max(maxEnd, c.endM); }
        else { result[colIdx].push(group); group = [c]; maxEnd = c.endM; }
      });
      if (group.length > 0) result[colIdx].push(group);
    });
    return result;
  }, [visibleCourses]);

  const totals = useMemo(() => {
    const daily = Array(7).fill(0);
    const dailyDuration = Array(7).fill(0); 
    let weekly = 0;
    visibleCourses.forEach(c => { 
      const cDate = new Date(viewWeekStart);
      cDate.setDate(cDate.getDate() + c.colIndex);
      const v = getCourseTotalValue(c, cDate); 
      daily[c.colIndex] += v; 
      weekly += v; 
      let durMins = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
      if (durMins < 0) durMins += 1440;
      dailyDuration[c.colIndex] += durMins;
    });
    return { daily, dailyDuration, weekly };
  }, [visibleCourses, viewWeekStart]);

  const monthlyTotal = useMemo(() => {
    const thurs = new Date(viewWeekStart); thurs.setDate(thurs.getDate() + 3);
    const y = thurs.getFullYear(), m = thurs.getMonth(), days = new Date(y, m + 1, 0).getDate(), today = new Date();
    today.setHours(0,0,0,0);
    let t = 0;
    for (let i = 1; i <= days; i++) {
      const cd = new Date(y, m, i); cd.setHours(0,0,0,0);
      if (cd > today) continue; 
      const ci = cd.getDay() === 0 ? 6 : cd.getDay() - 1, wid = getWeekId(getMonday(cd));
      courses.forEach(c => {
        if (c.colIndex === ci) {
          let active = false;
          if (c.isFixed) {
            const isAfterStart = c.baseWeekId ? wid >= c.baseWeekId : true;
            const isBeforeEnd = c.endWeekId ? wid < c.endWeekId : true;
            active = isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(wid)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, wid) % 2 === 0);
          } else {
            active = c.weekId === wid;
          }
          if (active) t += getCourseTotalValue(c, cd);
        }
      });
    }
    return { val: t, month: m + 1 };
  }, [courses, viewWeekStart]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(viewWeekStart); d.setDate(d.getDate() + i); return formatDate(d); }), [viewWeekStart]);

  const uniqueCourseNamesForExport = useMemo(() => {
    const names = new Set();
    courses.forEach(c => { if (c.title) names.add(c.title.replace(/\s*\(第\d+课\)/g, '').trim()); });
    return Array.from(names).filter(Boolean).sort();
  }, [courses]);

  const exportResult = useMemo(() => {
    if (!isExportModalOpen || !exportRange.start || !exportRange.end) return null;
    const [sy, sm, sd] = exportRange.start.split('-').map(Number);
    const [ey, em, ed] = exportRange.end.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0);
    const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const res = { totals: { A: 0, B: 0, P: 0 }, details: { A: [], B: [], P: [] }, totalAll: 0 };
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d > today) continue; 
      const cd = new Date(d), ci = cd.getDay() === 0 ? 6 : cd.getDay() - 1, wid = getWeekId(getMonday(cd));
      const active = courses.filter(c => {
        if (c.colIndex !== ci) return false;
        if (c.isFixed) {
          const isAfterStart = c.baseWeekId ? wid >= c.baseWeekId : true;
          const isBeforeEnd = c.endWeekId ? wid < c.endWeekId : true;
          return isAfterStart && isBeforeEnd && !(c.excludedWeeks?.includes(wid)) && (!c.isBiweekly || getDiffWeeks(c.baseWeekId, wid) % 2 === 0);
        }
        return c.weekId === wid;
      }).sort((a,b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      
      active.forEach(c => {
        const baseName = c.title ? c.title.replace(/\s*\(第\d+课\)/g, '').trim() : '';
        if (exportCourseFilter && baseName !== exportCourseFilter) return;

        const v = getCourseTotalValue(c, cd), tag = c.tag || 'P';
        let durMins = timeToMinutes(c.endTime) - timeToMinutes(c.startTime);
        if (durMins < 0) durMins += 1440;
        res.totals[tag] += v;
        res.totalAll += v;
        const { title: displayTitle, dynamicNote } = getCourseDisplayInfo(c, wid);
        const finalNotes = [dynamicNote, c.notes].filter(Boolean).join(' | ');
        res.details[tag].push({ date: `${cd.getFullYear()}-${formatDate(cd)}`, title: displayTitle, time: `${c.startTime}-${c.endTime}`, duration: `${durMins / 60} 小时`, value: v, notes: finalNotes });
      });
    }
    return res;
  }, [isExportModalOpen, exportRange, exportCourseFilter, courses]); 

  const saveSnapshotForUndo = () => setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(coursesRefLatest.current))]);

  const handleUndo = async () => {
    if (undoStack.length === 0 || !user) return;
    setSyncing(true);
    try {
      const previousCourses = undoStack[undoStack.length - 1];
      const batch = writeBatch(db);
      courses.forEach(c => { if (!previousCourses.find(pc => pc.id === c.id)) batch.delete(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', c.id)); });
      previousCourses.forEach(c => batch.set(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', c.id), c));
      await batch.commit();
      setUndoStack(prev => prev.slice(0, -1));
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const handleCourseMouseDown = (e, course) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (e.target.closest('button')) return;
    e.stopPropagation(); e.preventDefault(); 
    const rect = e.currentTarget.getBoundingClientRect();
    setDragInfo({ course, action: e.button === 2 ? 'copy' : 'move', startX: e.clientX, startY: e.clientY, currX: e.clientX, currY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, width: rect.width, height: rect.height });
  };

  useEffect(() => {
    if (!dragInfo) return;
    const handleMouseMove = (e) => setDragInfo(prev => ({ ...prev, currX: e.clientX, currY: e.clientY }));
    const handleMouseUp = async (e) => {
      const { course, action, startX, startY } = dragInfo;
      if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
        if (e.button === 0) openModal(course);
        setDragInfo(null); return;
      }
      if (!gridBodyRef.current || !user) { setDragInfo(null); return; }
      
      const rect = gridBodyRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left - 65; 
      let y = e.clientY - rect.top;

      if (x < 0 || x > rect.width - 65 || y < 0 || y > rect.height) { setDragInfo(null); return; }

      const colWidth = (rect.width - 65) / 7;
      const colIdx = Math.max(0, Math.min(6, Math.floor(x / colWidth)));

      let dropMins = ((e.clientY - dragInfo.offsetY - rect.top) / PIXELS_PER_HOUR) * 60 + START_HOUR * 60;
      dropMins = Math.round(dropMins / 15) * 15; 

      const durMins = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
      const actualDur = durMins > 0 ? durMins : durMins + 1440;
      
      const newStartMins = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - actualDur, dropMins));
      const newStartTime = minutesToTime(newStartMins);
      const newEndTime = minutesToTime(newStartMins + actualDur);
      
      if (colIdx !== course.colIndex || newStartTime !== course.startTime || action === 'copy') {
         if (action === 'move') {
            if (course.isFixed) {
               setMoveConfirmInfo({ course, newColIdx: colIdx, newStartTime, newEndTime });
               setDragInfo(null); return; 
            }
            saveSnapshotForUndo(); setSyncing(true);
            try { await updateDoc(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`), { colIndex: colIdx, startTime: newStartTime, endTime: newEndTime });
            } catch(err) { console.error(err); } finally { setSyncing(false); }
         } else if (action === 'copy') {
            saveSnapshotForUndo(); setSyncing(true);
            try {
               const newId = Math.random().toString(36).substr(2, 9);
               const newData = { ...course, id: newId, colIndex: colIdx, startTime: newStartTime, endTime: newEndTime };
               if (!newData.isFixed) { newData.weekId = viewWeekId; delete newData.baseWeekId; } else { newData.weekId = null; newData.baseWeekId = viewWeekId; }
               await setDoc(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${newId}`), newData);
            } catch(err) { console.error(err); } finally { setSyncing(false); }
         }
      }
      setDragInfo(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragInfo, viewWeekId, user]);

  const handleConfirmMove = async (type) => {
    if (!moveConfirmInfo || !user) return;
    saveSnapshotForUndo(); setSyncing(true);
    const { course, newColIdx, newStartTime, newEndTime } = moveConfirmInfo;
    try {
      const batch = writeBatch(db);
      if (type === 'temp') {
        const originalPath = `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`;
        batch.update(doc(db, originalPath), { excludedWeeks: arrayUnion(viewWeekId) });
        const newId = Math.random().toString(36).substr(2, 9);
        const tempCourse = { ...course, id: newId, colIndex: newColIdx, startTime: newStartTime, endTime: newEndTime, isFixed: false, isBiweekly: false, weekId: viewWeekId, recurrence: 'temp' };
        delete tempCourse.baseWeekId; delete tempCourse.excludedWeeks;
        batch.set(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${newId}`), tempCourse);
      } else if (type === 'permanent') {
        batch.update(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`), { colIndex: newColIdx, startTime: newStartTime, endTime: newEndTime });
      }
      await batch.commit();
    } catch (err) { console.error(err); } finally { setSyncing(false); setMoveConfirmInfo(null); }
  };

  const handleUpdateTemplate = async () => {
    if (!user || courses.length === 0) return;
    setIsSavingTemplate('saving');
    try {
      const backupDocRef = doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'app_state', 'latest_backup');
      await setDoc(backupDocRef, { code: JSON.stringify(courses), timestamp: Date.now() });
      setIsSavingTemplate('success');
      setTimeout(() => setIsSavingTemplate(false), 2000);
    } catch (e) { console.error(e); setIsSavingTemplate(false); }
  };

  const handleRestoreLatestBackup = async () => {
    if (!user) return;
    saveSnapshotForUndo(); setSyncing(true); setRestoreError("");
    try {
      const backupSnap = await getDoc(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'app_state', 'latest_backup'));
      if (backupSnap.exists() && backupSnap.data().code) {
        const parsed = JSON.parse(backupSnap.data().code);
        const batch = writeBatch(db);
        const coursesRef = collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses');
        const currentSnap = await getDocs(coursesRef);
        currentSnap.forEach(d => batch.delete(d.ref));
        parsed.forEach(c => batch.set(doc(coursesRef, c.id), c));
        batch.set(doc(coursesRef, '_metadata_'), { last: Date.now() });
        await batch.commit();
        setHideEmptyOverlay(true);
      } else {
        setRestoreError("云端未找到备份数据，请先尝试加载固定课表并保存一次。");
        setTimeout(() => setRestoreError(""), 3000);
      }
    } catch(e) { console.error(e); setRestoreError("恢复失败，备份数据可能已损坏。"); setTimeout(() => setRestoreError(""), 3000); } finally { setSyncing(false); }
  };

  const restoreInitialData = async () => {
    if (!user) return;
    saveSnapshotForUndo(); setSyncing(true);
    try {
      const batch = writeBatch(db);
      const coursesRef = collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses');
      const currentSnap = await getDocs(coursesRef);
      currentSnap.forEach(d => batch.delete(d.ref));
      INITIAL_COURSES.forEach(c => {
        const data = {...c};
        if (!data.isFixed) data.weekId = viewWeekId;
        if (data.isBiweekly) data.baseWeekId = viewWeekId;
        batch.set(doc(coursesRef, data.id), data);
      });
      batch.set(doc(coursesRef, '_metadata_'), { last: Date.now() });
      await batch.commit();
      setHideEmptyOverlay(true);
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const handleCopyBackup = () => {
    try {
      const textArea = document.createElement("textarea"); textArea.value = backupText; document.body.appendChild(textArea); textArea.select(); document.execCommand("copy"); document.body.removeChild(textArea);
      setBackupStatus('✅ 代码已成功复制到剪贴板'); setTimeout(() => setBackupStatus(''), 3000);
    } catch (err) { setBackupStatus('❌ 复制失败，请手动全选复制'); }
  };

  const handleImportBackup = async () => {
    if (!backupText.trim() || !user) { setBackupStatus('❌ 请先粘贴代码'); return; }
    try {
      const parsed = JSON.parse(backupText); if (!Array.isArray(parsed)) throw new Error('Invalid format');
      saveSnapshotForUndo(); setSyncing(true);
      const batch = writeBatch(db);
      const coursesRef = collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses');
      const snap = await getDocs(coursesRef);
      snap.forEach(d => batch.delete(d.ref));
      parsed.forEach(c => batch.set(doc(coursesRef, c.id), c));
      batch.set(doc(coursesRef, '_metadata_'), { last: Date.now() });
      await batch.commit();
      setBackupStatus('✅ 数据已成功恢复！');
      setTimeout(() => { setIsBackupModalOpen(false); setBackupStatus(''); setHideEmptyOverlay(true); }, 1500);
    } catch (e) { setBackupStatus('❌ 代码格式错误'); } finally { setSyncing(false); }
  };

  const handleAIAnalysis = async () => {
    setIsAIModalOpen(true); setIsAnalyzingSchedule(true);
    try {
      const courseSummary = visibleCourses.map(c => {
        const cDate = new Date(viewWeekStart); cDate.setDate(cDate.getDate() + c.colIndex);
        return `${DAYS[c.colIndex]} ${c.startTime}-${c.endTime} ${c.title} (标签:${c.tag} 收入:¥${getCourseTotalValue(c, cDate)})`;
      }).join('\n');
      const prompt = `你是一个专业的教务排课分析助手。以下是我本周的课表安排：\n${courseSummary || '本周暂无课程'}\n请根据上述课表，用简短、专业的语气分析我的排课强度、收入分布，并给出合理的建议。`;
      const result = await callGeminiAPI(prompt);
      setScheduleAnalysisResult(result);
    } catch (e) { setScheduleAnalysisResult("分析失败，请检查网络连接。"); } finally { setIsAnalyzingSchedule(false); }
  };

  const handleAIGenerateNote = async () => {
    if (!formData.title) return;
    setIsGeneratingNote(true);
    try {
      const result = await callGeminiAPI(`我是一位老师，正在记录名为"${formData.title}"的课程备忘。目前备注是："${formData.notes || '无'}"。请帮我扩写成一段专业、清晰的课后备注或教学重点提示（50字以内）。`);
      setFormData(prev => ({ ...prev, notes: result }));
    } catch (e) { console.error(e); } finally { setIsGeneratingNote(false); }
  };

  const openModal = (course = null, colIdx = 0, defaultStartTime = '10:00') => {
    setIsNameManagerOpen(false); setIsTitleDropdownOpen(false); setDeleteConfirmTitle(null);
    if (course) {
      let dur = timeToMinutes(course.endTime) - timeToMinutes(course.startTime); if (dur < 0) dur += 1440;
      setEditingCourseId(course.id); setFormData({ ...course, duration: dur, recurrence: course.isBiweekly ? 'biweekly' : (course.isFixed ? 'weekly' : 'temp'), notes: course.notes || '' });
    } else {
      setEditingCourseId(null); setFormData({ title: '', colIndex: colIdx, startTime: defaultStartTime, duration: 60, value: 400, recurrence: 'temp', excludedWeeks: [], tag: 'P', notes: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (isDuplicate = false) => {
    if (!formData.title.trim() || !user) return;
    saveSnapshotForUndo(); setSyncing(true);
    const targetId = (isDuplicate || !editingCourseId) ? Math.random().toString(36).substr(2, 9) : editingCourseId;
    const original = editingCourseId ? courses.find(c => c.id === editingCourseId) : null;
    const data = { ...formData, id: targetId, endTime: minutesToTime(timeToMinutes(formData.startTime) + Number(formData.duration)) };
    
    data.isFixed = data.recurrence !== 'temp'; data.isBiweekly = data.recurrence === 'biweekly';
    if (data.isFixed) data.baseWeekId = (isDuplicate ? viewWeekId : (original?.baseWeekId || viewWeekId)); else delete data.baseWeekId;
    data.weekId = data.isFixed ? null : (isDuplicate ? viewWeekId : (original && !original.isFixed ? original.weekId : viewWeekId));
    if (isDuplicate) data.excludedWeeks = []; delete data.duration; delete data.recurrence;
    
    await setDoc(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${targetId}`), data);
    
    const sync = [];
    courses.forEach(c => { 
      if (c.title === formData.title && c.id !== targetId && (c.value !== formData.value || c.tag !== formData.tag)) {
        sync.push(updateDoc(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', c.id), { value: formData.value, tag: formData.tag })); 
      }
    });
    if (sync.length) await Promise.all(sync);
    setIsModalOpen(false);
  };

  const performDelete = async (id, force = false) => {
    const c = courses.find(item => item.id === id); if (!c || !user) return;
    saveSnapshotForUndo(); setSyncing(true);
    const path = `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${id}`;
    
    try {
      if (c.isFixed) {
        if (!force) {
          await updateDoc(doc(db, path), { excludedWeeks: arrayUnion(viewWeekId) });
        } else {
          // 如果在这门课创建的那一周删除，则抹除数据；否则，设置结束日期以保留财务与排课历史。
          if (c.baseWeekId === viewWeekId) {
            await deleteDoc(doc(db, path));
          } else {
            await updateDoc(doc(db, path), { endWeekId: viewWeekId });
          }
        }
      } else {
        await deleteDoc(doc(db, path));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOverlapState({}); 
      setIsModalOpen(false);
      setSyncing(false);
    }
  };

  const handleBatchDeleteName = async (name) => {
    if (deleteConfirmTitle !== name) { setDeleteConfirmTitle(name); return; }
    saveSnapshotForUndo(); setSyncing(true);
    try {
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses'));
      snap.forEach(d => { if (d.data().title === name) batch.delete(d.ref); });
      await batch.commit(); setDeleteConfirmTitle(null);
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const handleBatchEditName = async (oldName, newName) => {
    const finalNewName = newName.trim(); if (!finalNewName || oldName === finalNewName) { setEditingNameState({ oldName: null, newName: '' }); return; }
    saveSnapshotForUndo(); setSyncing(true);
    try {
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses'));
      snap.forEach(d => { if (d.data().title === oldName) batch.update(d.ref, { title: finalNewName }); });
      await batch.commit(); setEditingNameState({ oldName: null, newName: '' });
      if (formData.title === oldName) setFormData({ ...formData, title: finalNewName });
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const handleDownload = async () => {
    if (!scheduleRef.current) return;
    setIsDownloading(true);
    try {
      let h2c = window.html2canvas;
      if (!h2c) {
        await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
        h2c = window.html2canvas;
      }
      const canvas = await h2c(scheduleRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `课表_${viewWeekStart.getFullYear()}_${weekDates[0]}.png`; a.click();
    } catch (e) { console.error(e); } finally { setIsDownloading(false); }
  };

  const downloadCSV = () => {
    if (!exportResult || exportResult.totalAll === 0) return;
    let csv = '\uFEFF标签,日期,课程,上课时间,时长,结算,备注\n';
    ['A', 'B', 'P'].forEach(tag => {
      if (exportResult.details[tag] && exportResult.details[tag].length > 0) {
        exportResult.details[tag].forEach(r => { 
          const safeNotes = r.notes ? `"${String(r.notes).replace(/"/g, '""')}"` : '';
          csv += `${tag},${r.date},${r.title},${r.time},${r.duration},${r.value},${safeNotes}\n`; 
        });
        csv += `${tag}总计,,,,,,${exportResult.totals[tag]}\n\n`;
      }
    });
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `财务明细导出${exportCourseFilter ? `_${exportCourseFilter}` : '_全部课程'}_${exportRange.start}_${exportRange.end}.csv`; link.click();
  };

  // --- 登录页面拦截 ---
  if (!authInitialized) {
    return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-indigo-500" size={32} /></div>;
  }

  if (!user && isStandalone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4 font-sans text-slate-800">
        <div className="bg-white p-10 rounded-[32px] shadow-2xl w-full max-w-sm border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg shadow-indigo-200">
              <Calendar size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-black text-center tracking-tight mb-2">智能课表系统</h2>
          <p className="text-center text-sm font-bold text-slate-400 mb-8">{isRegisterMode ? '创建您的专属课表账号' : '登录以跨设备同步您的课表'}</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 text-slate-400" size={18} />
                <input type="email" placeholder="邮箱账号" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
              </div>
            </div>
            <div>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-slate-400" size={18} />
                <input type="password" placeholder="密码 (至少6位)" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required minLength={6} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
              </div>
            </div>

            {authError && <div className="text-red-500 text-[12px] font-bold bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2"><AlertCircle size={14}/> {authError}</div>}
            
            <button type="submit" disabled={isAuthProcessing} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex justify-center items-center gap-2">
              {isAuthProcessing ? <RefreshCw className="animate-spin" size={18} /> : (isRegisterMode ? '立即注册' : '登录系统')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthError(''); }} className="text-[13px] font-bold text-slate-500 hover:text-indigo-600 transition-colors">
              {isRegisterMode ? '已有账号？去登录 →' : '没有账号？免费注册 →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 主界面 ---
  return (
    <div ref={appContainerRef} className={`flex flex-col text-slate-800 font-sans text-[13px] transition-all duration-300 ${isCssFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 overflow-hidden bg-white' : 'h-screen bg-white'}`}>
      
      {isZenMode && (
        <button onClick={toggleZenMode} className="fixed bottom-8 right-8 z-[100] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 hover:bg-slate-700 transition-all font-black border border-slate-600 animate-in zoom-in-50">
          <Minimize2 size={18} /> 退出极简模式
        </button>
      )}

      {!isZenMode && (
        <header className="flex-shrink-0 bg-white z-30 flex flex-col shadow-sm relative">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center space-x-4">
              <div className="bg-slate-800 p-2 text-white rounded-xl shadow-md"><Calendar size={24} /></div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                  每周固定课表
                  {syncing ? <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1"><RefreshCw size={10} className="animate-spin"/> 同步中</span> 
                  : <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1"><Cloud size={10}/> 已保存</span>}
                </h1>
                <div className="text-sm font-bold text-purple-600 flex items-center gap-4 mt-1">
                  <span>本周: ¥{String(totals.weekly)}</span>
                  <span>{String(monthlyTotal.month)}月已上: ¥{String(monthlyTotal.val)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-lg border border-slate-100 mr-2 shadow-inner">
                <button onClick={() => { const d = new Date(viewWeekStart); d.setDate(d.getDate()-7); setViewWeekStart(d); }} className="p-1.5 rounded-md hover:bg-white shadow-sm transition-all text-slate-600"><ChevronLeft size={20} /></button>
                <span className="text-sm font-bold w-32 text-center text-slate-800 tracking-wide">{String(viewWeekStart.getFullYear())}年 {String(weekDates[0])}</span>
                <button onClick={() => { const d = new Date(viewWeekStart); d.setDate(d.getDate()+7); setViewWeekStart(d); }} className="p-1.5 rounded-md hover:bg-white shadow-sm transition-all text-slate-600"><ChevronRight size={20} /></button>
              </div>
              
              <button onClick={toggleFullscreen} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="全屏显示网页">
                <Maximize2 size={16} />
              </button>
              
              <button onClick={toggleZenMode} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="隐藏菜单栏">
                <AlignLeft size={16} />
              </button>

              <button onClick={handleAIAnalysis} className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200 rounded-lg text-[13px] font-black shadow-sm hover:opacity-80 transition-all flex items-center gap-1" title="获取本周排课分析">
                <Sparkles size={16} className="text-purple-500" /> 智能顾问
              </button>

              <button onClick={handleUndo} disabled={undoStack.length === 0} className={`px-3 py-2.5 rounded-lg text-sm font-black shadow-sm transition-all flex items-center border ${undoStack.length > 0 ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'}`} title="撤销操作">
                <Undo size={16} />
              </button>
              <button onClick={handleDownload} disabled={isDownloading} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="下载图片">
                <Download size={16} className={isDownloading ? "animate-bounce" : ""} />
              </button>
              <button onClick={() => setIsExportModalOpen(true)} className="px-4 py-2.5 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-[13px] font-black shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1">
                <FileSpreadsheet size={16}/> 导出财务
              </button>
              <div className="w-[1px] h-6 bg-slate-200 mx-1"></div> 
              <button onClick={() => { setHideEmptyOverlay(false); openModal(); }} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-[14px] font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-1">
                <Plus size={18} /> 新增排课
              </button>
              {isStandalone && (
                <button onClick={() => signOut(auth)} className="px-3 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-black shadow-sm hover:bg-red-100 transition-all flex items-center gap-1 ml-1" title="退出登录">
                  <LogOut size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-50/80 backdrop-blur-md px-6 py-2.5 border-b border-slate-200 flex justify-between items-center text-[12px]">
            <div className="text-slate-500 font-bold flex items-center gap-2 tracking-wide">
              <Settings2 size={14}/> 系统数据管理中心
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => { setBackupText(JSON.stringify(coursesRefLatest.current, null, 2)); setBackupStatus(""); setIsBackupModalOpen(true); }} className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-md font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-1">
                <Database size={14} /> 手动备份代码
              </button>
              <button onClick={handleRestoreLatestBackup} className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-100 rounded-md font-bold shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1">
                <RefreshCw size={14} /> 从云端恢复备份
              </button>
              <button onClick={handleUpdateTemplate} disabled={!!isSavingTemplate || courses.length === 0} className={`px-4 py-1.5 rounded-md font-bold shadow-sm transition-all flex items-center gap-1 border ${courses.length > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'}`}>
                {isSavingTemplate === 'saving' ? <><RefreshCw size={14} className="animate-spin" /> 保存中</> : 
                 isSavingTemplate === 'success' ? <><Cloud size={14} /> 已成功覆盖备份</> : 
                 <><Cloud size={14} /> 保存当前为初始数据</>}
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={`flex-1 overflow-auto relative bg-slate-50/50 ${isZenMode || isCssFullscreen ? 'p-0' : 'p-6'}`}>
        
        {courses.length === 0 && !syncing && !hideEmptyOverlay && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white p-8 rounded-[32px] shadow-2xl text-center border border-slate-100 max-w-md w-full flex flex-col items-center">
              <Database size={64} className="text-indigo-500 mb-6" />
              <h2 className="text-2xl font-black text-slate-800 mb-3">初始化您的课表</h2>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                系统检测到当前课表为空。<br/>请选择您需要的初始化或重置方式：
              </p>

              <div className="w-full flex flex-col gap-3">
                <button onClick={handleRestoreLatestBackup} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                  <Cloud size={18} /> 1. 选择最新课表数据 (推荐)
                </button>
                <button onClick={restoreInitialData} className="w-full py-4 bg-emerald-500 text-white font-black rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2">
                  <Calendar size={18} /> 2. 初始化数据 (固定排课)
                </button>
                <button onClick={() => setHideEmptyOverlay(true)} className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <Plus size={18} /> 3. 从头手动添加 (空白课表)
                </button>
              </div>
              
              {restoreError && (
                <p className="mt-6 text-[13px] font-bold text-red-500 animate-pulse border border-red-200 bg-red-50 px-4 py-2 rounded-xl">{restoreError}</p>
              )}
            </div>
          </div>
        )}
        
        <div ref={scheduleRef} onContextMenu={e => e.preventDefault()} className="min-w-[1000px] max-w-[1400px] mx-auto bg-white shadow-sm flex flex-col relative border-t border-slate-100">
          <div className="flex border-b border-slate-100 bg-white/95 backdrop-blur-md sticky top-0 z-[40] shadow-sm">
            <div className="w-[65px] border-r border-slate-100 shrink-0"></div>
            {DAYS.map((day, idx) => (
              <div key={idx} className={`flex-1 text-center py-3 border-r border-slate-100 last:border-r-0 ${DAY_THEMES[idx].bg}`}>
                <div className={`text-[15px] font-black ${DAY_THEMES[idx].text}`}>{String(day)}</div>
                <div className="text-[10px] text-slate-400 font-bold mt-0.5 tracking-widest">{String(weekDates[idx])}</div>
                <div className="flex flex-col items-center gap-1 mt-1.5">
                  <div className="text-[11px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 inline-block shadow-sm leading-none">
                    ¥ {String(totals.daily[idx])}
                  </div>
                  {totals.dailyDuration[idx] > 0 && (
                    <div className="text-[9px] font-bold text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/80 shadow-sm flex items-center gap-0.5 leading-none">
                      <Clock size={9} /> {totals.dailyDuration[idx] / 60} h
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex relative bg-white" ref={gridBodyRef}>
            <div className="w-[65px] border-r border-slate-100 bg-white relative z-10 font-bold shrink-0">
              {HOURS.map(hour => (
                <div key={hour} className="text-[10px] text-slate-300 font-black text-center relative" style={{ height: PIXELS_PER_HOUR }}>
                  <span className="absolute -top-2.5 left-0 right-0">{String(hour).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            <div className="flex-1 flex relative">
              <div className="absolute inset-0 pointer-events-none flex flex-col">{HOURS.map(hour => (<div key={hour} className="border-b border-slate-50 w-full" style={{ height: PIXELS_PER_HOUR }}></div>))}</div>
              {DAYS.map((_, colIdx) => {
                const colGroups = groupedCoursesByCol[colIdx] || [];
                return (
                  <div key={colIdx} className="flex-1 border-r border-slate-100 relative group cursor-pointer hover:bg-slate-50/30 transition-all" 
                    onClick={(e) => { 
                      if (e.target === e.currentTarget) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        let clickMins = (y / PIXELS_PER_HOUR) * 60 + START_HOUR * 60;
                        clickMins = Math.floor(clickMins / 15) * 15;
                        clickMins = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - 60, clickMins)); 
                        openModal(null, colIdx, minutesToTime(clickMins));
                      }
                    }}>
                    {colGroups.map((group, groupIdx) => {
                      const stateKey = `${colIdx}-${groupIdx}`;
                      const rawIdx = overlapState[stateKey] || 0;
                      const activeIdx = rawIdx >= group.length ? 0 : rawIdx;
                      const course = group[activeIdx];
                      if (!course) return null;
                      
                      const theme = TAGS[course.tag || 'P']?.theme || TAGS['P'].theme;
                      const hasOverlap = group.length > 1;
                      const startPx = ((course.startM - START_HOUR * 60) / 60) * PIXELS_PER_HOUR;
                      const heightPx = ((course.endM - course.startM) / 60) * PIXELS_PER_HOUR;
                      const isCompact = heightPx <= 50;

                      return (
                        <div key={course.id} 
                          onMouseDown={(e) => handleCourseMouseDown(e, course)}
                          className={`absolute p-3 rounded-2xl cursor-grab active:cursor-grabbing transition-all duration-300 hover:scale-[1.01] flex flex-col shadow-sm group/card
                            ${theme.bg} ${theme.text}
                            ${!course.isFixed ? `border-[1.5px] border-dashed ${theme.border}` : course.isBiweekly ? `border-[1.5px] border-dotted ${theme.border}` : `border border-solid ${theme.border}`}
                          `}
                          style={{ top: `${startPx + 2}px`, height: `${heightPx - 4}px`, zIndex: 20, left: '4px', right: '4px' }}>
                          
                          {isCompact ? (
                            <>
                              <span className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full text-[8px] font-black shadow-sm text-white ${TAGS[course.tag || 'P']?.badge.split(' ')[0]}`}>{String(course.tag)}</span>
                              <span className="font-black text-[12px] truncate tracking-tight ml-1.5">{String(getCourseDisplayInfo(course, viewWeekId).title)}</span>
                              {(!course.isFixed || course.isBiweekly || hasOverlap) && (
                                <div className="flex items-center gap-0.5 ml-auto pl-1">
                                  {!course.isFixed && <span className="bg-white text-slate-800 border border-slate-200 px-1 py-0.5 rounded-[4px] text-[7px] font-black leading-none">临时</span>}
                                  {course.isBiweekly && <span className="bg-white text-slate-800 border border-slate-200 px-1 py-0.5 rounded-[4px] text-[7px] font-black leading-none">隔周</span>}
                                  {hasOverlap && <button onClick={(e) => { e.stopPropagation(); setOverlapState(prev => ({...prev, [stateKey]: (activeIdx+1)%group.length})); }} className="bg-white/90 px-1 py-0.5 rounded-[4px] text-[7px] font-black border border-black/5 flex items-center gap-0.5"><Layers size={8}/>{activeIdx+1}</button>}
                                </div>
                              )}
                              <span className="ml-auto text-[10px] font-black text-black/30 tracking-wider pr-1">¥{String(getCourseTotalValue(course, new Date(viewWeekStart.getTime() + colIdx * 86400000)))}</span>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between relative">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black text-white shadow-sm ${TAGS[course.tag || 'P']?.badge.split(' ')[0]}`}>{String(course.tag)}</span>
                                  <span className="text-[10px] font-bold opacity-60 tracking-tight">{String(course.startTime)}-{String(course.endTime)}</span>
                                </div>
                                <div className="flex flex-col items-end gap-1 relative z-30">
                                  <button onClick={(e) => { e.stopPropagation(); performDelete(course.id); }} className="opacity-0 group-hover/card:opacity-100 absolute top-0 right-0 p-0.5 text-slate-400 hover:text-red-500 transition-colors"><X size={14}/></button>
                                  <div className="group-hover/card:opacity-0 transition-opacity flex flex-col items-center leading-[1.1] text-[9px] text-slate-500 font-bold bg-white/60 px-1 py-0.5 rounded shadow-sm border border-black/5">
                                    {!course.isFixed && <><span className="block">临</span><span className="block">时</span></>}
                                    {course.isBiweekly && <><span className="block">隔</span><span className="block">周</span></>}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-1 font-black text-[14px] leading-tight truncate pr-2 pointer-events-none text-slate-900">
                                {String(getCourseDisplayInfo(course, viewWeekId).title)}
                              </div>

                              {(() => {
                                const { dynamicNote } = getCourseDisplayInfo(course, viewWeekId);
                                const finalNotes = [dynamicNote, course.notes].filter(Boolean).join(' | ');
                                return finalNotes ? (
                                  <div className="relative group/note mt-0.5 pointer-events-none">
                                    <div className="text-[10px] font-bold opacity-60 leading-tight w-fit pointer-events-auto cursor-help">
                                      {finalNotes.length > 8 ? finalNotes.slice(0, 8) + '...' : finalNotes}
                                    </div>
                                    {finalNotes.length > 8 && (
                                      <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/note:block z-[60] w-max max-w-[180px] bg-slate-800 text-white text-[11px] font-bold p-2.5 rounded-xl shadow-xl whitespace-normal break-words pointer-events-none leading-relaxed animate-in fade-in slide-in-from-bottom-1">
                                        {finalNotes}
                                        <div className="absolute -bottom-1 left-3 w-2 h-2 bg-slate-800 rotate-45"></div>
                                      </div>
                                    )}
                                  </div>
                                ) : null;
                              })()}
                              
                              <div className="absolute bottom-2 right-3 text-[10px] font-black text-black/30 tracking-wider pointer-events-none">¥ {String(getCourseTotalValue(course, new Date(viewWeekStart.getTime() + colIdx * 86400000)))}</div>
                              
                              {hasOverlap && (
                                <button onClick={(e) => { e.stopPropagation(); setOverlapState(prev => ({...prev, [stateKey]: (activeIdx+1)%group.length})); }}
                                  className="absolute bottom-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/80 hover:bg-white text-[9px] font-bold border border-black/5 shadow-sm text-slate-600 transition-colors z-30">
                                  <Layers size={10}/> {String(activeIdx+1)}/{String(group.length)}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {dragInfo && (
        <div 
          className={`fixed pointer-events-none z-[100] p-3 rounded-2xl shadow-2xl opacity-90 border-2 border-dashed
            ${TAGS[dragInfo.course.tag || 'P']?.theme.bg} 
            ${TAGS[dragInfo.course.tag || 'P']?.theme.text} 
            ${TAGS[dragInfo.course.tag || 'P']?.theme.border}
          `}
          style={{ left: dragInfo.currX - dragInfo.offsetX, top: dragInfo.currY - dragInfo.offsetY, width: dragInfo.width, height: dragInfo.height }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-3 py-1 rounded-full font-bold shadow-md whitespace-nowrap animate-bounce">
            {dragInfo.action === 'copy' ? '➕ 复制至新时间' : '✥ 移动至新时间'}
          </div>
          <div className="font-black text-[12px] opacity-70">
            {dragInfo.course.title.replace(/\s*\(第\d+课\)/g, '')}
          </div>
        </div>
      )}

      {moveConfirmInfo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-in fade-in">
          <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-sm border border-slate-100 font-sans flex flex-col overflow-hidden">
            <div className="bg-amber-50 px-6 py-5 border-b border-amber-100 flex items-center gap-3">
              <div className="bg-amber-500 text-white p-1.5 rounded-full"><AlertCircle size={18}/></div>
              <h2 className="text-[16px] font-black text-amber-800">调整固定课程</h2>
            </div>
            <div className="p-6">
              <p className="text-[13px] font-bold text-slate-600 leading-relaxed">
                您正在移动一门<span className="text-indigo-600 mx-1">固定循环</span>的课程：
                <br/><br/>
                <span className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 text-slate-800 block w-max shadow-sm">
                  {moveConfirmInfo.course.title.replace(/\s*\(第\d+课\)/g, '')} ({DAYS[moveConfirmInfo.course.colIndex]} {moveConfirmInfo.course.startTime})
                </span>
                <br/>
                请问您是要<span className="text-red-500 mx-1">永久修改</span>它以后的所有上课时间，还是仅仅在<span className="text-emerald-600 mx-1">本周临时调课</span>（其他周保持不变）？
              </p>
            </div>
            <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
              <button onClick={() => handleConfirmMove('temp')} className="w-full py-3 bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 shadow-md shadow-emerald-200 transition-all flex justify-center items-center gap-2">
                仅限本周临时调课
              </button>
              <button onClick={() => handleConfirmMove('permanent')} className="w-full py-3 bg-white border-2 border-red-100 text-red-500 font-black rounded-xl hover:bg-red-50 transition-all">
                永久修改该固定时间
              </button>
              <button onClick={() => setMoveConfirmInfo(null)} className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors mt-1">
                取消操作
              </button>
            </div>
          </div>
        </div>
      )}

      {isAIModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-100">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-5 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Bot size={22} className="text-purple-200" /> AI 排期顾问
              </h2>
              <button onClick={() => setIsAIModalOpen(false)} className="p-2 hover:bg-white/20 rounded-2xl text-white/80 transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 bg-slate-50 max-h-[60vh] overflow-y-auto">
              {isAnalyzingSchedule ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <Sparkles size={40} className="text-indigo-400 animate-pulse" />
                  <p className="font-bold text-slate-500">Gemini 正在分析您的排课数据，请稍候...</p>
                </div>
              ) : (
                <div className="prose prose-sm prose-slate text-slate-700 font-medium leading-loose">
                  {scheduleAnalysisResult.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="px-8 py-5 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsAIModalOpen(false)} className="px-6 py-2.5 rounded-2xl bg-indigo-50 text-indigo-700 font-black hover:bg-indigo-100 transition-all">确认并关闭</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[50] p-4 animate-in fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-100 font-sans flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h2 className="text-2xl font-black text-slate-800 font-sans tracking-tight">{editingCourseId ? '修改课程' : '添加课程'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-2xl text-slate-400 transition-all"><X size={20} /></button>
            </div>
            
            <div className="p-8 space-y-6 text-[15px] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[15px] font-black text-slate-700">
                  <span>课程名称</span>
                  <button onClick={() => setIsNameManagerOpen(!isNameManagerOpen)} className={`text-[15px] font-black flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-xl ${isNameManagerOpen ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-500 hover:bg-slate-100'}`}>
                    <Settings2 size={16}/> {isNameManagerOpen ? '收起管理' : '管理列表'}
                  </button>
                </div>
                
                <div className="relative">
                  <input 
                    type="text" 
                    value={formData.title} 
                    onClick={() => setIsTitleDropdownOpen(true)}
                    onFocus={() => setIsTitleDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsTitleDropdownOpen(false), 200)}
                    onChange={e => {
                      setFormData({...formData, title: e.target.value});
                      setIsTitleDropdownOpen(true);
                    }} 
                    className="w-full h-[52px] border-2 border-slate-100 rounded-2xl px-4 text-[15px] leading-none outline-none focus:border-indigo-500 font-bold transition-all bg-white" 
                    placeholder="输入或点击选取历史课程..." 
                    autoComplete="off"
                  />
                  {isTitleDropdownOpen && !isNameManagerOpen && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[70] overflow-hidden max-h-48 overflow-y-auto">
                      {Array.from(new Set(courses.map(c=>c.title))).filter(n=>n && n.toLowerCase().includes(formData.title.toLowerCase())).length > 0 ? (
                        Array.from(new Set(courses.map(c=>c.title))).filter(n=>n && n.toLowerCase().includes(formData.title.toLowerCase())).map((name, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              const existingCourse = courses.find(c => c.title === name);
                              if (existingCourse) {
                                setFormData({
                                  ...formData,
                                  title: name,
                                  value: existingCourse.value,
                                  tag: existingCourse.tag || 'P',
                                  recurrence: existingCourse.isBiweekly ? 'biweekly' : (existingCourse.isFixed ? 'weekly' : 'temp')
                                });
                              } else {
                                setFormData({...formData, title: name});
                              }
                              setIsTitleDropdownOpen(false);
                            }}
                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer font-bold text-slate-700 transition-colors border-b border-slate-50 last:border-b-0"
                          >
                            {String(name)}
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-slate-400 text-xs font-bold text-center">输入新名称直接创建新课程</div>
                      )}
                    </div>
                  )}
                  
                  {isNameManagerOpen && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[70] overflow-hidden animate-in slide-in-from-top-2">
                      <div className="p-3 bg-slate-50 border-b border-slate-200 text-[13px] font-black text-slate-500">已保存的名称库（修改将全局生效）</div>
                      <div className="max-h-[220px] overflow-y-auto">
                        {Array.from(new Set(courses.map(c=>c.title))).filter(n=>n).length > 0 ? (
                          Array.from(new Set(courses.map(c=>c.title))).filter(n=>n).map((name, i) => (
                            <div key={i} className="px-4 py-2.5 flex justify-between items-center group hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
                              {editingNameState.oldName === name ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNameState.newName}
                                    onChange={(e) => setEditingNameState({...editingNameState, newName: e.target.value})}
                                    className="flex-1 border-2 border-indigo-200 rounded-xl px-3 py-2 text-[15px] font-bold outline-none focus:border-indigo-500"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleBatchEditName(name, editingNameState.newName);
                                      if (e.key === 'Escape') setEditingNameState({oldName: null, newName: ''});
                                    }}
                                  />
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => handleBatchEditName(name, editingNameState.newName)} className="px-3 py-2 rounded-xl text-[12px] font-black bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm">保存</button>
                                    <button onClick={() => setEditingNameState({oldName: null, newName: ''})} className="px-3 py-2 rounded-xl text-[12px] font-black bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">取消</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="font-bold text-slate-700 text-[15px] truncate pr-2 flex-1">{String(name)}</span>
                                  <div className="flex gap-1.5 shrink-0 opacity-100 transition-opacity">
                                    <button onClick={() => setEditingNameState({oldName: name, newName: name})} className="px-3 py-1.5 rounded-xl text-[12px] font-black bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">改名</button>
                                    <button onClick={() => handleBatchDeleteName(name)} className={`px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${deleteConfirmTitle===name ? 'bg-red-500 text-white animate-pulse shadow-sm':'bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>{deleteConfirmTitle===name ? '确认移除?' : '移除'}</button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-slate-400 text-xs font-bold">暂无历史名称</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-bold">
                <div className="space-y-2">
                  <label className="block text-[15px] font-black text-slate-700">单价 (每小时)</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-[18px] shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all">¥</div>
                    <input
                      type="number"
                      value={formData.value}
                      onChange={e => setFormData({...formData, value: Number(e.target.value)})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-14 pr-4 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[15px] font-black text-slate-700">课程时长</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><Clock size={18} /></div>
                    <select
                      value={formData.duration}
                      onChange={e => setFormData({...formData, duration: Number(e.target.value)})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-16 pr-12 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm appearance-none"
                    >
                      {DURATION_OPTIONS.map(o=><option key={o.value} value={o.value}>{String(o.label)}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><ChevronDown size={18} /></div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-bold">
                <div className="space-y-2">
                  <label className="block text-[15px] font-black text-slate-700">开始时间</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all"><Clock size={18} /></div>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={e => setFormData({...formData, startTime: e.target.value})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-14 pr-4 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[15px] font-black text-slate-700">所在星期</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><Calendar size={18} /></div>
                    <select
                      value={formData.colIndex}
                      onChange={e => setFormData({...formData, colIndex: Number(e.target.value)})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-16 pr-12 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm appearance-none"
                    >
                      {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><ChevronDown size={18} /></div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-[15px] font-black text-slate-700">标签分类
                <div className="flex gap-4">{['A', 'B', 'P'].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                    <input type="radio" checked={formData.tag === t} onChange={() => {
                      let defaultVal = formData.value;
                      if (t === 'P') defaultVal = 400;
                      if (t === 'B') defaultVal = 300;
                      if (t === 'A') defaultVal = 240;
                      setFormData({...formData, tag: t, value: defaultVal});
                    }} className="w-4 h-4 text-indigo-600" />
                    <span className={`px-3 py-1.5 rounded-xl text-[12px] font-black shadow-sm ${TAGS[t].badge}`}>{String(t)} 类别</span>
                  </label>
                ))}</div>
              </div>
              
              <div className="space-y-3 pt-2 border-t border-slate-100 text-[15px] font-black text-slate-700">重复频率
                <div className="grid grid-cols-3 gap-3 text-[12px]">
                  {[ {v:'weekly', l:'每周固定'}, {v:'biweekly', l:'隔周循环'}, {v:'temp', l:'仅限本周'} ].map(r=>(
                    <button key={r.v} onClick={()=>setFormData({...formData, recurrence: r.v})} className={`py-3 rounded-2xl font-black border-2 transition-all ${formData.recurrence===r.v ? 'bg-slate-800 border-slate-800 text-white shadow-lg':'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>{String(r.l)}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-[15px] font-bold text-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlignLeft size={14}/>
                    <span>备注说明</span>
                  </div>
                  <button 
                    onClick={handleAIGenerateNote} 
                    disabled={isGeneratingNote || !formData.title} 
                    className={`text-[11px] flex items-center gap-1 transition-colors px-2 py-1 rounded-lg shadow-sm border ${!formData.title ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 border-indigo-200 hover:opacity-80'}`}
                  >
                    <Sparkles size={12} className={isGeneratingNote ? "animate-spin" : "text-purple-400"}/> 
                    {isGeneratingNote ? 'AI 撰写中...' : 'AI 智能扩写'}
                  </button>
                </div>
                <input 
                  type="text" 
                  value={formData.notes || ''} 
                  onChange={e => setFormData({...formData, notes: e.target.value})} 
                  className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 outline-none focus:border-indigo-500 mt-1 transition-all" 
                  placeholder="选填或点击右侧 AI 一键生成..." 
                  maxLength={100}
                />
              </div>
            </div>
            
            <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-between gap-3 font-black shrink-0">
              {editingCourseId ? <div className="flex gap-2">
                {courses.find(c=>c.id===editingCourseId)?.isFixed && <button onClick={() => performDelete(editingCourseId, false)} className="px-3 py-2.5 bg-white border border-orange-100 text-orange-600 rounded-2xl shadow-sm hover:bg-orange-50 transition-all text-[11px]">仅取消本周</button>}
                <button onClick={() => performDelete(editingCourseId, true)} className="px-3 py-2.5 bg-white border border-red-100 text-red-600 rounded-2xl shadow-sm hover:bg-red-50 transition-all text-[11px]">
                  {courses.find(c=>c.id===editingCourseId)?.isFixed && courses.find(c=>c.id===editingCourseId)?.baseWeekId !== viewWeekId ? '从此周起结束 (保留历史)' : '彻底删除'}
                </button>
              </div>: <div/>}
              <div className="flex gap-3">
                {editingCourseId && <button onClick={() => handleSave(true)} className="px-5 py-2.5 bg-white border border-indigo-100 text-indigo-600 rounded-2xl shadow-sm hover:bg-indigo-50 flex items-center gap-1 transition-all text-[12px] font-sans"><Copy size={16}/> 复制给本周</button>}
                <button onClick={() => handleSave(false)} className="px-8 py-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-[13px]">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isBackupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-in fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-100">
            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 font-sans"><Database size={20}/> 数据防丢失：手动备份</h2>
              <button onClick={() => setIsBackupModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-2xl text-slate-400 transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 flex flex-col gap-4">
              <p className="text-[13px] font-bold text-slate-500 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                ⚠️ <span className="text-slate-800">虽然系统已有“一键恢复云端备份”机制，但您依然可以手动保存代码以防万一。</span><br/>
                您可以将这串 JSON 代码复制并存放在您的本地电脑或手机备忘录中。需要时在此处粘贴并点击“粘贴并手动恢复”即可。
              </p>
              <textarea 
                value={backupText} 
                onChange={(e) => setBackupText(e.target.value)}
                className="w-full h-48 border-2 border-slate-200 rounded-2xl p-4 text-[11px] font-mono outline-none focus:border-indigo-500 text-slate-600 bg-white shadow-inner"
                placeholder="粘贴您的 JSON 备份代码..."
                spellCheck="false"
              />
              {backupStatus && <div className={`text-sm font-black text-center ${backupStatus.includes('✅') ? 'text-emerald-600' : 'text-red-500'}`}>{backupStatus}</div>}
            </div>
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button onClick={handleCopyBackup} className="px-6 py-2.5 rounded-2xl bg-slate-800 text-white font-black hover:bg-black transition-all shadow-md">复制数据代码</button>
              <button onClick={handleImportBackup} className="px-8 py-2.5 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">粘贴并手动恢复</button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-100">
            <div className="px-8 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 font-sans"><span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><FileSpreadsheet size={20}/></span> 财务报表生成</h2>
              <button onClick={() => setIsExportModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-2xl text-slate-400 transition-all"><X size={20} /></button>
            </div>
            <div className="p-6 sm:p-8 border-b border-slate-100 shrink-0 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 font-bold items-end">
                <div className="space-y-2 text-slate-700">
                  <label className="block text-[14px] font-black text-slate-700">起始日期</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><Calendar size={17} /></div>
                    <input
                      type="date"
                      value={exportRange.start}
                      onChange={e=>setExportRange({...exportRange, start: e.target.value})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-16 pr-4 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-slate-700">
                  <label className="block text-[14px] font-black text-slate-700">结束日期</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><Calendar size={17} /></div>
                    <input
                      type="date"
                      value={exportRange.end}
                      onChange={e=>setExportRange({...exportRange, end: e.target.value})}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-16 pr-4 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-slate-700">
                  <label className="block text-[14px] font-black text-slate-700">筛选课程</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><FileSpreadsheet size={17} /></div>
                    <select 
                      value={exportCourseFilter} 
                      onChange={e => setExportCourseFilter(e.target.value)} 
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-16 pr-12 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm appearance-none cursor-pointer"
                    >
                      <option value="">全部课程</option>
                      {uniqueCourseNamesForExport.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><ChevronDown size={18} /></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[14px] font-black text-transparent select-none">总计</label>
                  <div className="h-12 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 rounded-2xl flex items-center justify-center font-black text-[17px] gap-2 border border-emerald-200 shadow-sm whitespace-nowrap">
                    <span className="text-[13px] text-emerald-600">总累计</span>
                    <span>¥ {exportResult ? exportResult.totalAll : 0}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-slate-50">
              {exportResult && exportResult.totalAll > 0 ? ['A', 'B', 'P'].map(tag => {
                const rs = exportResult.details[tag]; if (!rs.length) return null;
                return ( <div key={tag} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
                  <div className={`px-6 py-4 flex justify-between items-center ${TAGS[tag].theme.bg} border-b border-gray-200`}>
                    <div className="font-black flex items-center gap-2 text-slate-800 text-[14px]"><span className={`px-2 py-0.5 rounded-lg shadow-sm text-[11px] ${TAGS[tag].badge}`}>{String(tag)} 级</span> 明细汇总</div>
                    <div className="font-black text-indigo-700 text-[16px]">累计: ¥{String(exportResult.totals[tag])}</div>
                  </div>
                  <table className="w-full text-left text-[13px]"><thead className="bg-slate-50 text-slate-400 font-black border-b border-slate-100 text-[11px] uppercase tracking-wider"><tr><th className="px-6 py-4 font-sans">日期</th><th className="px-6 py-4 font-sans">学员 / 课程</th><th className="px-6 py-4 font-sans">上课时间</th><th className="px-6 py-4 font-sans">时长</th><th className="px-6 py-4 font-sans">备注</th><th className="px-6 py-4 text-right font-sans">结算金额</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">{rs.map((r, i) => (<tr key={i} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 text-slate-500 font-bold whitespace-nowrap">{String(r.date)}</td><td className="px-6 py-4 font-black text-slate-800">{String(r.title)}</td><td className="px-6 py-4 text-slate-500 font-bold whitespace-nowrap">{String(r.time)}</td><td className="px-6 py-4 text-slate-500 font-bold whitespace-nowrap">{String(r.duration)}</td><td className="px-6 py-4 text-slate-400 max-w-[150px] truncate" title={String(r.notes)}>{String(r.notes || '-')}</td><td className="px-6 py-4 font-black text-slate-800 text-right">¥ {String(r.value)}</td></tr>))}</tbody></table>
                </div> );
              }) : <div className="text-center text-slate-400 py-20 font-black flex flex-col items-center gap-3"><FileSpreadsheet size={40} className="opacity-20"/>{exportResult ? '所选周期内没有排课数据' : '请选择结算周期并点击“统计计算”按钮'}</div>}
            </div>
            <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsExportModalOpen(false)} className="px-6 py-2.5 rounded-2xl text-slate-500 font-black hover:bg-slate-100 transition-all font-sans">返回关闭</button>
              <button onClick={downloadCSV} disabled={!exportResult || exportResult.totalAll === 0} className={`px-8 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 ${exportResult && exportResult.totalAll > 0 ? 'bg-slate-800 text-white hover:bg-black shadow-lg' : 'bg-slate-100 text-slate-300 cursor-not-allowed'} font-sans`}><Download size={16}/>下载 Excel 表格</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}