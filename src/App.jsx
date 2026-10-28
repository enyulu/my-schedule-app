import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { clampScheduleZoom, getScheduleFitPercent, getScheduleGridPoint, getScheduleStartMinutes } from './scheduleZoom';
import MonthlyReports from './MonthlyReports.jsx';
import { filterKnownOccurrences } from './monthlyReports.js';
import TimeZoneConverter, { CourseTimeZonePanel, CourseTimeZoneBadge, TimePicker } from './TimeZoneAssistant.jsx';
import { courseDateSelection } from './courseDate.js';
import { studentTimeZoneDefault } from './studentDefaults.js';
import { BEIJING_ZONE, occurrenceDate, convertBeijingLesson, beijingPlacement } from './timeZones.js';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, X, Clock, AlertCircle, Download, RefreshCw, Cloud, Copy, FileSpreadsheet, BarChart3, Globe2, Layers, Settings2, Undo, Database, AlignLeft, Sparkles, Bot, Maximize2, Minimize2, LogOut, Lock, Mail } from 'lucide-react';
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
const embeddedFirebaseConfig = globalThis.__firebase_config;
const isStandalone = typeof embeddedFirebaseConfig === 'undefined';
const firebaseConfig = isStandalone ? standaloneFirebaseConfig : JSON.parse(embeddedFirebaseConfig);

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
  { label: '半小时', value: 30 }, { label: '45分钟', value: 45 }, { label: '1小时', value: 60 },
  { label: '1.5小时', value: 90 }, { label: '2小时', value: 120 },
  { label: '2.5小时', value: 150 }, { label: '3小时', value: 180 },
];

const TAGS = {
  A: { label: 'A', badge: 'bg-sky-400', theme: { bg: 'bg-sky-50', text: 'text-slate-800', border: 'border-sky-300' } },
  B: { label: 'B', badge: 'bg-emerald-400', theme: { bg: 'bg-emerald-50', text: 'text-slate-800', border: 'border-emerald-300' } },
  P: { label: 'P', badge: 'bg-rose-400', theme: { bg: 'bg-rose-50', text: 'text-slate-800', border: 'border-rose-300' } },
  unclassified: { label: '?', badge: 'bg-slate-400', theme: { bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-300' } },
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

const getNextWeekId = (weekId) => {
  const [year, month, day] = weekId.split('-').map(Number);
  const nextWeek = new Date(year, month - 1, day);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return getWeekId(nextWeek);
};

const getOccurrenceKey = (weekId, course) => [
  weekId,
  String(course.colIndex).padStart(2, '0'),
  course.startTime,
].join('|');

const getLessonAnchorKey = (anchor) => [
  anchor.weekId,
  String(anchor.colIndex ?? -1).padStart(2, '0'),
  anchor.startTime || '00:00',
].join('|');

const isCourseVisibleInWeek = (course, weekId) => {
  if (course.isFixed) {
    const isAfterStart = course.baseWeekId ? weekId >= course.baseWeekId : true;
    const isBeforeEnd = course.endWeekId ? weekId < course.endWeekId : true;
    return isAfterStart
      && isBeforeEnd
      && !(course.excludedWeeks?.includes(weekId))
      && (!course.isBiweekly || getDiffWeeks(course.baseWeekId, weekId) % 2 === 0);
  }
  return course.weekId === weekId;
};

// 只读统计：日期字符串按本地年月日解析，不经过 UTC。
const formatLocalDate = (date) => `${date.getFullYear()}-${formatDate(date)}`;
const parseLocalDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return formatLocalDate(date) === value ? date : null;
};
const formatLessonHours = (minutes) => String(Math.round(minutes / 60 * 100) / 100);
const formatStatisticsDate = (value) => {
  const date = parseLocalDate(value);
  return date ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : '';
};
const getStatisticsRange = (preset, now = new Date()) => {
  const start = preset === 'week' ? getMonday(now) : new Date(now.getFullYear(), now.getMonth() - (preset === 'lastMonth' ? 1 : 0), 1);
  const end = preset === 'lastMonth' ? new Date(now.getFullYear(), now.getMonth(), 0) : now;
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
};
const collectCompletedLessons = (courses, range, now, { includeUnfinished = false } = {}) => {
  const start = parseLocalDate(range.start), end = parseLocalDate(range.end);
  if (!start || !end || start > end) return [];
  end.setHours(23, 59, 59, 999);
  const cutoff = Math.min(end.getTime(), now.getTime());
  const lessons = [];
  for (const day = new Date(start); day.getTime() <= cutoff; day.setDate(day.getDate() + 1)) {
    const weekday = (day.getDay() + 6) % 7;
    const weekId = getWeekId(getMonday(day));
    courses.forEach(course => {
      const status = String(course.status || '').trim().toLowerCase();
      if (course.cancelled || course.canceled || course.isCancelled || course.isCanceled || course.isSuspended || course.completed === false || course.isCompleted === false
        || ['cancelled', 'canceled', 'suspended', 'incomplete', 'unfinished', 'pending', '未完成', '取消', '已取消', '停课'].includes(status)) return;
      if (Number(course.colIndex ?? course.weekday) !== weekday || !isCourseVisibleInWeek(course, weekId)) return;
      if (!COURSE_TIME_PATTERN.test(course.startTime || '') || !COURSE_TIME_PATTERN.test(course.endTime || '')) return;
      const startMinutes = timeToMinutes(course.startTime);
      let minutes = timeToMinutes(course.endTime) - startMinutes;
      if (minutes < 0) minutes += 1440;
      if (minutes <= 0) return;
      const startsAt = new Date(day);
      startsAt.setMinutes(startMinutes);
      const endsAt = new Date(day);
      endsAt.setMinutes(startMinutes + minutes);
      if (!includeUnfinished && endsAt.getTime() > cutoff) return;
      const category = String(course.category ?? course.tag ?? '').trim().toUpperCase();
      lessons.push({
        key: `${course.id}|${formatLocalDate(day)}`, courseId: course.id, date: formatLocalDate(day), weekday,
        startsAt: startsAt.getTime(), endsAt: endsAt.getTime(), minutes, fee: getCourseTotalValue(course, day), isFixed: Boolean(course.isFixed), startTime: course.startTime, endTime: course.endTime,
        title: course.subject || course.title || course.name || '未命名课程',
        student: course.studentName || course.student || course.name || course.title || '未命名学员',
        studentKey: String(course.studentId || course.studentName || course.student || course.name || course.title || '未命名学员'),
        category: Object.hasOwn(TAGS, category) ? category : 'unclassified', originalCategory: category,
      });
    });
  }
  return lessons.sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key));
};
const summarizeCompletedLessons = (lessons) => {
  const groups = ['A', 'B', 'P', 'unclassified'].map(category => {
    const items = lessons.filter(lesson => lesson.category === category);
    const students = new Map();
    items.forEach(lesson => {
      if (!students.has(lesson.studentKey)) students.set(lesson.studentKey, { key: lesson.studentKey, name: lesson.student, minutes: 0, lessons: [] });
      const student = students.get(lesson.studentKey);
      student.minutes += lesson.minutes;
      student.lessons.push(lesson);
    });
    return { category, count: items.length, minutes: items.reduce((sum, lesson) => sum + lesson.minutes, 0), students: [...students.values()] };
  });
  return { count: lessons.length, minutes: groups.reduce((sum, group) => sum + group.minutes, 0), groups };
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
  { id: 'cs20260705', title: 'CS', colIndex: 6, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-06-29', endWeekId: '2026-07-06', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260709', title: 'CS', colIndex: 3, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-06', endWeekId: '2026-07-13', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260713', title: 'CS', colIndex: 0, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-13', endWeekId: '2026-07-20', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260715', title: 'CS', colIndex: 2, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-13', endWeekId: '2026-07-20', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260717', title: 'CS', colIndex: 4, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-13', endWeekId: '2026-07-20', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260720', title: 'CS', colIndex: 0, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-20', endWeekId: '2026-07-27', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260722', title: 'CS', colIndex: 2, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-20', endWeekId: '2026-07-27', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260724', title: 'CS', colIndex: 4, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-07-20', endWeekId: '2026-07-27', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260808', title: 'CS', colIndex: 5, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-03', endWeekId: '2026-08-10', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260810', title: 'CS', colIndex: 0, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-10', endWeekId: '2026-08-17', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260812', title: 'CS', colIndex: 2, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-10', endWeekId: '2026-08-17', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260814', title: 'CS', colIndex: 4, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-10', endWeekId: '2026-08-17', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260817', title: 'CS', colIndex: 0, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-17', endWeekId: '2026-08-24', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260819', title: 'CS', colIndex: 2, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-17', endWeekId: '2026-08-24', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260821', title: 'CS', colIndex: 4, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-17', endWeekId: '2026-08-24', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260823', title: 'CS', colIndex: 6, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-17', endWeekId: '2026-08-24', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260825', title: 'CS', colIndex: 1, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-24', endWeekId: '2026-08-31', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260902', title: 'CS', colIndex: 2, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-31', endWeekId: '2026-09-07', excludedWeeks: [], tag: 'P', notes: '' },
  { id: 'cs20260904', title: 'CS', colIndex: 4, startTime: '17:00', endTime: '18:30', value: 400, isFixed: true, weekId: null, baseWeekId: '2026-08-31', endWeekId: '2026-09-07', excludedWeeks: [], tag: 'P', notes: '' },
];

const COURSE_SCHEMA_VERSION = 4;
const COURSE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const getLegacyLessonTrackingDefaults = (name) => {
  if (name.includes('海辰数学')) {
    return { enabled: true, cycleStarts: ['2026-04-20', '2026-05-18'] };
  }
  if (name.includes('David')) {
    return { enabled: true, cycleStarts: ['2026-06-01'] };
  }
  return { enabled: false, cycleStarts: [] };
};

const normalizeCourse = (rawCourse, index, targetWeekId = currentWeekId) => {
  if (!rawCourse || typeof rawCourse !== 'object' || Array.isArray(rawCourse)) {
    throw new Error(`Course ${index + 1} is not an object`);
  }

  const id = String(rawCourse.id || `course-${index + 1}`).trim();
  const name = String(rawCourse.name || rawCourse.title || '').trim();
  const startTime = String(rawCourse.startTime || '').trim();
  const weekday = Number(rawCourse.weekday ?? rawCourse.colIndex);
  const category = String(rawCourse.category ?? rawCourse.tag ?? '').trim().toUpperCase();

  if (!id) throw new Error(`Course ${index + 1} has no id`);
  if (!name) throw new Error(`Course ${id} has no name`);
  if (!COURSE_TIME_PATTERN.test(startTime)) throw new Error(`Course ${id} has invalid startTime`);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error(`Course ${id} has invalid weekday`);
  }

  let duration = Number(rawCourse.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    const endTime = String(rawCourse.endTime || '').trim();
    if (!COURSE_TIME_PATTERN.test(endTime)) throw new Error(`Course ${id} has no valid duration or endTime`);
    duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration <= 0) duration += 1440;
  }
  duration = Math.round(duration);
  if (duration <= 0 || duration > 1440) throw new Error(`Course ${id} has invalid duration`);

  const priceCandidate = rawCourse.price ?? rawCourse.value;
  const price = priceCandidate === undefined || priceCandidate === null || priceCandidate === ''
    ? 0
    : Number(priceCandidate);
  if (!Number.isFinite(price) || price < 0) throw new Error(`Course ${id} has invalid price`);

  const isFixed = Boolean(rawCourse.isFixed);
  const isBiweekly = Boolean(rawCourse.isBiweekly);
  const legacyLessonTracking = getLegacyLessonTrackingDefaults(name);
  const lessonTrackingEnabled = typeof rawCourse.lessonTrackingEnabled === 'boolean'
    ? rawCourse.lessonTrackingEnabled
    : legacyLessonTracking.enabled;
  const lessonCycleStarts = Array.from(new Set(
    (Array.isArray(rawCourse.lessonCycleStarts)
      ? rawCourse.lessonCycleStarts
      : legacyLessonTracking.cycleStarts)
      .filter(week => typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week))
  )).sort();
  const rawLessonAnchors = Array.isArray(rawCourse.lessonTrackingAnchors)
    ? rawCourse.lessonTrackingAnchors
    : lessonCycleStarts.map(weekId => ({
        weekId,
        colIndex: -1,
        startTime: '00:00',
        courseId: '',
        lessonNumber: 0,
      }));
  const lessonTrackingAnchors = rawLessonAnchors
    .filter(anchor => anchor && typeof anchor === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(anchor.weekId || ''))
    .map(anchor => ({
      weekId: anchor.weekId,
      colIndex: Number.isInteger(Number(anchor.colIndex)) ? Number(anchor.colIndex) : -1,
      startTime: COURSE_TIME_PATTERN.test(anchor.startTime || '') ? anchor.startTime : '00:00',
      courseId: typeof anchor.courseId === 'string' ? anchor.courseId : '',
      lessonNumber: Math.max(0, Math.round(Number(anchor.lessonNumber) || 0)),
    }))
    .sort((a, b) => getLessonAnchorKey(a).localeCompare(getLessonAnchorKey(b)));
  const normalized = {
    ...rawCourse,
    id,
    name,
    title: name,
    startTime,
    duration,
    endTime: minutesToTime(timeToMinutes(startTime) + duration),
    weekday,
    colIndex: weekday,
    price,
    value: price,
    category,
    tag: category,
    isFixed,
    isBiweekly,
    weekId: isFixed ? null : String(rawCourse.weekId || targetWeekId),
    excludedWeeks: Array.isArray(rawCourse.excludedWeeks)
      ? rawCourse.excludedWeeks.filter(week => typeof week === 'string')
      : [],
    lessonTrackingEnabled,
    lessonCycleStarts,
    lessonTrackingAnchors,
    notes: typeof rawCourse.notes === 'string' ? rawCourse.notes : '',
  };

  if (isFixed && rawCourse.baseWeekId) normalized.baseWeekId = String(rawCourse.baseWeekId);
  if (isFixed && rawCourse.endWeekId) normalized.endWeekId = String(rawCourse.endWeekId);
  if (typeof rawCourse.priceEffectiveWeek === 'string') normalized.priceEffectiveWeek = rawCourse.priceEffectiveWeek;
  if (typeof rawCourse.priceEffectiveOccurrence === 'string') normalized.priceEffectiveOccurrence = rawCourse.priceEffectiveOccurrence;
  if (rawCourse.recurrence) normalized.recurrence = String(rawCourse.recurrence);
  // Optional display metadata: preserve on explicit saves, never migrate old records.
  if (typeof rawCourse.studentTimeZone === 'string' && rawCourse.studentTimeZone) {
    try {
      new Intl.DateTimeFormat('zh-CN', { timeZone: rawCourse.studentTimeZone }).format(0);
      normalized.studentTimeZone = rawCourse.studentTimeZone;
    } catch { delete normalized.studentTimeZone; }
  }
  ['pendingLessonTrackingEnabled', 'pendingLessonNumber', 'studentTimeZoneChanged'].forEach(key => delete normalized[key]);
  Object.keys(normalized).forEach(key => { if (normalized[key] === undefined) delete normalized[key]; });

  return normalized;
};

const normalizeCourseDataset = (rawData, source, targetWeekId = currentWeekId) => {
  const input = Array.isArray(rawData) ? rawData : rawData?.courses;
  if (!Array.isArray(input)) {
    throw new Error(`${source} did not contain a course array`);
  }

  const validCourses = [];
  const validationErrors = [];
  const ids = new Set();

  input.forEach((rawCourse, index) => {
    try {
      const course = normalizeCourse(rawCourse, index, targetWeekId);
      if (ids.has(course.id)) throw new Error(`Duplicate course id: ${course.id}`);
      ids.add(course.id);
      validCourses.push(course);
    } catch (error) {
      validationErrors.push(error.message);
    }
  });

  if (validationErrors.length > 0) {
    console.warn(`[schedule:${source}] rejected invalid courses`, validationErrors);
    throw new Error(`${source} 有${validationErrors.length}条课程无效，已停止整个操作以保护原数据：${validationErrors[0]}`);
  }

  console.info(`[schedule:${source}] transform complete`, {
    received: input.length,
    valid: validCourses.length,
    rejected: validationErrors.length,
  });
  return validCourses;
};

const createDefaultSchedule = (targetWeekId = currentWeekId) =>
  normalizeCourseDataset(INITIAL_COURSES, 'local-seed', targetWeekId);

const getCoursesRef = userId =>
  collection(db, 'artifacts', FIXED_APP_ID, 'users', userId, 'courses');

const logFirestoreError = (step, error) => {
  const details = {
    step,
    code: error?.code || 'unknown',
    message: error?.message || String(error),
  };
  if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
    console.error(`[schedule:${step}] Firestore permission denied. Check security rules and the signed-in user path.`, details);
  } else {
    console.error(`[schedule:${step}] Firestore operation failed`, details);
  }
};

const replaceFirestoreSchedule = async (userId, rawCourses, source, targetWeekId = currentWeekId, isCurrentUser = () => true) => {
  console.info(`[schedule:${source}] write requested`, { userId });
  const validatedCourses = normalizeCourseDataset(rawCourses, source, targetWeekId);
  const coursesRef = getCoursesRef(userId);

  try {
    console.info(`[schedule:${source}] reading existing Firestore courses`);
    const currentSnapshot = await getDocs(coursesRef);
    if (!isCurrentUser()) throw new Error('账号已改变，已取消恢复操作');
    if (currentSnapshot.metadata?.fromCache) throw new Error('无法确认云端最新课表，请联网后重试');
    if (currentSnapshot.size + validatedCourses.length + 2 > 500) throw new Error('课程数量超过一次安全恢复的限制，请先导出备份并联系维护者');
    console.info(`[schedule:${source}] existing Firestore read complete`, {
      documents: currentSnapshot.size,
    });

    const batch = writeBatch(db);
    const previousCourses = currentSnapshot.docs.filter(item => item.id !== '_metadata_').map(item => ({ ...item.data(), id: item.id }));
    batch.set(doc(db, 'artifacts', FIXED_APP_ID, 'users', userId, 'app_state', 'pre_restore_backup'), { courses: previousCourses, timestamp: Date.now(), source: `before-${source}` });
    currentSnapshot.forEach(snapshotDoc => batch.delete(snapshotDoc.ref));
    validatedCourses.forEach(course => {
      batch.set(doc(coursesRef, course.id), course);
    });
    batch.set(doc(coursesRef, '_metadata_'), {
      last: Date.now(),
      count: validatedCourses.length,
      schemaVersion: COURSE_SCHEMA_VERSION,
      source,
    });

    console.info(`[schedule:${source}] committing Firestore batch`, {
      deletes: currentSnapshot.size,
      writes: validatedCourses.length + 1,
    });
    await batch.commit();
    console.info(`[schedule:${source}] Firestore write complete`);
    return validatedCourses;
  } catch (error) {
    logFirestoreError(`${source}:write`, error);
    throw error;
  }
};

const getCourseTotalValue = (course, courseDate) => {
  if (!course || !course.startTime || !course.endTime) return 0;
  let durMins = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
  if (durMins < 0) durMins += 1440;
  let hourlyRate = Number(course.price ?? course.value) || 0;

  // 兼容升级前已存在的两条日期计价规则；新建或调价后的课程均使用保存的明确单价。
  if (!course.priceEffectiveWeek && courseDate) {
    const checkDate = new Date(courseDate);
    checkDate.setHours(0, 0, 0, 0);

    if (course.title?.includes('David') && checkDate >= new Date(2026, 5, 3)) {
      hourlyRate = 400;
    }
    if (course.title?.includes('芮彤') && checkDate < new Date(2026, 4, 10)) {
      hourlyRate = 260;
    }
  }

  return Math.round(hourlyRate * (durMins / 60));
};

export default function App() {
  const scheduleRef = useRef(null);
  const gridBodyRef = useRef(null); 
  const appContainerRef = useRef(null);
  const scheduleViewportRef = useRef(null);
  const [scheduleViewportWidth, setScheduleViewportWidth] = useState(1000);
  const [zoomPreference, setZoomPreference] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('schedule-display-zoom'));
      return { mode: saved?.mode === 'fit' ? 'fit' : 'manual', percent: clampScheduleZoom(saved?.percent) };
    } catch { return { mode: 'manual', percent: 100 }; }
  });
  const scheduleWidth = Math.max(1000, Math.min(1400, scheduleViewportWidth));
  const scheduleZoom = zoomPreference.mode === 'fit'
    ? getScheduleFitPercent(scheduleViewportWidth, scheduleWidth)
    : zoomPreference.percent;
  useEffect(() => {
    try { localStorage.setItem('schedule-display-zoom', JSON.stringify(zoomPreference)); }
    catch { /* Display controls remain usable when browser storage is unavailable. */ }
  }, [zoomPreference]);
  
  const [courses, setCourses] = useState([]);
  const [dataState, setDataState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [authAttempt, setAuthAttempt] = useState(0);
  const saveInFlightRef = useRef(false);
  const activeUserIdRef = useRef(null);
  const [statisticsSource, setStatisticsSource] = useState(null);
  const [statisticsNow, setStatisticsNow] = useState(() => new Date());
  const [isStatisticsOpen, setIsStatisticsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const closeReports = useCallback(() => setIsReportsOpen(false), []);
  const [zoneConverter, setZoneConverter] = useState(null);
  const closeZoneConverter = useCallback(() => setZoneConverter(null), []);
  const [statisticsDraft, setStatisticsDraft] = useState(() => getStatisticsRange('month'));
  const [statisticsRange, setStatisticsRange] = useState(() => getStatisticsRange('month'));
  const [statisticsError, setStatisticsError] = useState('');
  const statisticsTriggerRef = useRef(null);
  const statisticsCloseRef = useRef(null);
  useEffect(() => {
    const refresh = () => setStatisticsNow(new Date());
    let timer;
    const tick = () => {
      refresh();
      // 排课精确到分钟，在每个分钟边界刷新，避免每秒重算历史课程。
      timer = setTimeout(tick, 60000 - Date.now() % 60000);
    };
    timer = setTimeout(tick, 60000 - Date.now() % 60000);
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (!isStatisticsOpen) return;
    const trigger = statisticsTriggerRef.current;
    statisticsCloseRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') setIsStatisticsOpen(false);
      if (event.key === 'Tab') {
        const elements = [...statisticsCloseRef.current.closest('[role="dialog"]').querySelectorAll('button, input, summary')].filter(element => !element.disabled);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); trigger?.focus(); };
  }, [isStatisticsOpen]);
  const [viewWeekStart, setViewWeekStart] = useState(currentRealMonday);
  const [user, setUser] = useState(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const canEdit = Boolean(user) && !loadError && (dataState === 'ready' || (dataState === 'cached' && courses.length > 0));
  const [overlapState, setOverlapState] = useState({});
  const [hideEmptyOverlay, setHideEmptyOverlay] = useState(false);
  const [scheduleView, setScheduleView] = useState('week');
  const touchStartRef = useRef(null);
  
  const [isZenMode, setIsZenMode] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  useEffect(() => {
    const viewport = scheduleViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setScheduleViewportWidth(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [authInitialized, user, isZenMode, isCssFullscreen]);
  
  // -- Auth UI States (for standalone mode) --
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);

  // -- UI States --
  const [isDownloading, setIsDownloading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const courseDialogRef = useRef(null);
  const courseCloseRef = useRef(null);
  const initialDraftRef = useRef('');
  const latestDraftRef = useRef('');
  const closeCourseDialog = useCallback(() => {
    if (saveInFlightRef.current) return;
    if (initialDraftRef.current !== latestDraftRef.current && !window.confirm('还有未保存的修改，确认放弃并关闭？')) return;
    setIsModalOpen(false);
  }, []);
  const [courseDateError, setCourseDateError] = useState('');
  const [courseCelebration, setCourseCelebration] = useState(null);
  useEffect(() => {
    if (!courseCelebration) return;
    const timer = setTimeout(() => setCourseCelebration(null), 1000);
    return () => clearTimeout(timer);
  }, [courseCelebration]);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [formData, setFormData] = useState({ title: '', colIndex: 0, startTime: '10:00', duration: 60, value: 0, recurrence: 'temp', excludedWeeks: [], tag: 'P', notes: '' });
  const [isLessonSettingsModalOpen, setIsLessonSettingsModalOpen] = useState(false);
  useEffect(() => { latestDraftRef.current = JSON.stringify(formData); }, [formData]);
  useEffect(() => {
    if (!isModalOpen || isLessonSettingsModalOpen || zoneConverter) return;
    const previousFocus = document.activeElement;
    courseDialogRef.current?.querySelector('input')?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeCourseDialog(); }
      if (event.key !== 'Tab') return;
      const elements = [...courseDialogRef.current.querySelectorAll('button,input,select,summary')].filter(el => !el.disabled && el.getClientRects().length);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isModalOpen, isLessonSettingsModalOpen, zoneConverter, closeCourseDialog]);
  const [lessonSettingsDraft, setLessonSettingsDraft] = useState({ enabled: false, lessonNumber: 1 });
  const [lessonSettingsStatus, setLessonSettingsStatus] = useState('');
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
        } catch {
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
        } catch (error) {
          console.warn('Unable to exit native fullscreen cleanly', error);
        }
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
    let active = true, unsubscribe = () => {};
    const initAuth = async () => {
      try {
        const token = globalThis.__initial_auth_token;
        if (!isStandalone && token) await signInWithCustomToken(auth, token);
        else if (!isStandalone) await signInAnonymously(auth);
        if (!active) return;
        unsubscribe = onAuthStateChanged(auth, (u) => {
          if (!active) return;
          if (activeUserIdRef.current !== (u?.uid || null)) {
            activeUserIdRef.current = u?.uid || null;
            setUndoStack([]); setBackupText(''); setBackupStatus('');
            setIsModalOpen(false); setEditingCourseId(null);
            setFormData({ title: '', colIndex: 0, startTime: '10:00', duration: 60, value: 0, recurrence: 'temp', excludedWeeks: [], tag: 'P', notes: '' });
            setIsBackupModalOpen(false); setIsLessonSettingsModalOpen(false);
            setIsNameManagerOpen(false); setIsTitleDropdownOpen(false);
            setIsStatisticsOpen(false); setIsReportsOpen(false); setIsExportModalOpen(false);
            setIsAIModalOpen(false); setScheduleAnalysisResult('');
            setZoneConverter(null); setMoveConfirmInfo(null); setDragInfo(null);
            setCourseCelebration(null); setRestoreError(''); setOverlapState({});
          }
          setUser(u); setCourses([]); setStatisticsSource(null);
          setDataState('loading'); setLoadError(''); setAuthError('');
          setAuthInitialized(true);
        });
      } catch (error) {
        if (!active) return;
        console.error(error);
        setUser(null); setCourses([]); setStatisticsSource(null);
        setAuthError('认证连接失败，请重试或重新登录；未切换到其他用户。');
        setAuthInitialized(true);
      }
    };
    initAuth();
    return () => { active = false; unsubscribe(); };
  }, [authAttempt]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const unsubscribe = onSnapshot(getCoursesRef(user.uid), { includeMetadataChanges: true }, (snap) => {
      if (!active) return;
      const rawCourses = snap.docs.filter(item => item.id !== '_metadata_').map(item => ({ ...item.data(), id: item.id }));
      if (snap.metadata?.fromCache && rawCourses.length === 0) {
        setDataState('loading');
        setLoadError('本地缓存中暂无课表，正在等待云端确认。请联网后重试；未清空云端课程。');
        return;
      }
      try {
        // Loading is strictly read-only, including empty accounts and legacy records.
        const list = normalizeCourseDataset(rawCourses, 'firestore-snapshot', currentWeekId);
        setCourses(list);
        setStatisticsSource(rawCourses);
        setDataState(snap.metadata?.fromCache ? 'cached' : 'ready');
        setLoadError('');
        setHideEmptyOverlay(false);
      } catch (error) {
        logFirestoreError('snapshot:validation', error);
        setDataState('error');
        setLoadError(`课表读取校验失败，未修改云端数据：${error.message}`);
      }
    }, (error) => {
      if (!active) return;
      logFirestoreError('snapshot:read', error);
      setDataState('error');
      setLoadError('无法读取云端课表，已保留当前显示内容。请检查网络或权限后重试，暂不可编辑。');
    });
    return () => { active = false; unsubscribe(); };
  }, [user, loadAttempt]);

  const coursesRefLatest = useRef(courses);
  useEffect(() => { coursesRefLatest.current = courses; }, [courses]);

  const viewWeekId = getWeekId(viewWeekStart);
  const isViewingCurrentWeek = viewWeekId === getWeekId(getMonday(statisticsNow));

  const lessonSettingsByTitle = useMemo(() => {
    const settings = new Map();
    courses.forEach(course => {
      if (!course.title) return;
      const existing = settings.get(course.title) || {
        enabled: false,
        anchors: new Map(),
        settingWeek: '',
      };
      const settingWeek = course.baseWeekId || course.weekId || '';
      if (settingWeek >= existing.settingWeek) {
        existing.enabled = Boolean(course.lessonTrackingEnabled);
        existing.settingWeek = settingWeek;
      }
      (course.lessonTrackingAnchors || []).forEach(anchor => {
        existing.anchors.set(getLessonAnchorKey(anchor), anchor);
      });
      settings.set(course.title, existing);
    });
    return settings;
  }, [courses]);

  const getCourseLessonNumber = useCallback((course, currentWeek, includeDisabled = false) => {
    const trackingSettings = lessonSettingsByTitle.get(course.title);
    if (!trackingSettings || (!trackingSettings.enabled && !includeDisabled)) return null;

    const targetKey = getOccurrenceKey(currentWeek, course);
    const anchorEntries = Array.from(trackingSettings.anchors.entries())
      .filter(([key]) => key <= targetKey)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    const latestAnchorEntry = anchorEntries.at(-1);
    if (!latestAnchorEntry) return null;

    const [anchorKey, anchor] = latestAnchorEntry;
    let lessonNumber = Number(anchor.lessonNumber) || 0;
    let iterWeekId = anchor.weekId;
    let safety = 0;

    while (iterWeekId <= currentWeek && safety < 1000) {
      safety += 1;
      const weekCourses = courses
        .filter(candidate => candidate.title === course.title && isCourseVisibleInWeek(candidate, iterWeekId))
        .sort((a, b) => getOccurrenceKey(iterWeekId, a).localeCompare(getOccurrenceKey(iterWeekId, b)));

      weekCourses.forEach(candidate => {
        const occurrenceKey = getOccurrenceKey(iterWeekId, candidate);
        if (occurrenceKey > anchorKey && occurrenceKey <= targetKey) lessonNumber += 1;
      });
      iterWeekId = getNextWeekId(iterWeekId);
    }

    return lessonNumber > 0 ? lessonNumber : null;
  }, [courses, lessonSettingsByTitle]);

  const getCourseDisplayInfo = useCallback((course, currentWeek) => {
    const baseTitle = course.title ? course.title.replace(/\s*\(第\d+课\)/g, '') : '';
    let dynamicNote = '';
    const [y, m, d] = currentWeek.split('-').map(Number);
    const targetMon = new Date(y, m - 1, d);

    const lessonNumber = getCourseLessonNumber(course, currentWeek);
    if (lessonNumber) dynamicNote = `第${lessonNumber}课时`;

    if (course.title && course.title.includes('芮彤')) {
      let totalMins = 0, safety = 0;
      let startMon = getMonday(new Date(2026, 4, 10)); 
      let currentIterMon = new Date(startMon);
      
      while (currentIterMon <= targetMon && safety < 1000) {
        safety++;
        const iw = getWeekId(currentIterMon);
        const wc = courses.filter(c => c.title?.includes('芮彤') && isCourseVisibleInWeek(c, iw))
          .sort((a,b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

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

    return { title: baseTitle, dynamicNote };
  }, [courses, getCourseLessonNumber]);

  const visibleCourses = useMemo(
    () => courses.filter(course => isCourseVisibleInWeek(course, viewWeekId)),
    [courses, viewWeekId],
  );
  const courseZonePreviews = useMemo(() => {
    const previews = new Map();
    visibleCourses.forEach(course => {
      if (!course.studentTimeZone || course.studentTimeZone === BEIJING_ZONE) return;
      let duration = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
      if (duration <= 0) duration += 1440;
      previews.set(course.id, convertBeijingLesson(occurrenceDate(viewWeekId, course.colIndex), course.startTime, duration, course.studentTimeZone));
    });
    return previews;
  }, [visibleCourses, viewWeekId]);

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

  const statisticsCourses = useMemo(() => {
    const originals = new Map((statisticsSource || []).map(course => [course.id, course]));
    return courses.map(course => {
      const original = originals.get(course.id);
      return original ? { ...original, ...course, category: original.category ?? original.tag ?? '' } : course;
    });
  }, [courses, statisticsSource]);
  const completedSummary = useMemo(() => {
    const monthRange = getStatisticsRange('month', statisticsNow);
    const { lessons, undatedCount } = filterKnownOccurrences(statisticsCourses, collectCompletedLessons(statisticsCourses, monthRange, statisticsNow), statisticsNow);
    const monday = getMonday(statisticsNow).getTime();
    // 跨月的一周需要单独读取整周，不能只过滤本月记录。
    const weekLessons = parseLocalDate(monthRange.start).getTime() > monday
      ? filterKnownOccurrences(statisticsCourses, collectCompletedLessons(statisticsCourses, getStatisticsRange('week', statisticsNow), statisticsNow), statisticsNow).lessons
      : lessons.filter(lesson => lesson.startsAt >= monday);
    return { week: weekLessons.reduce((sum, lesson) => sum + lesson.minutes, 0), month: lessons.reduce((sum, lesson) => sum + lesson.minutes, 0), fee: lessons.reduce((sum, lesson) => sum + lesson.fee, 0), undatedCount };
  }, [statisticsCourses, statisticsNow]);
  const statisticsResult = useMemo(() => isStatisticsOpen
    ? summarizeCompletedLessons(filterKnownOccurrences(statisticsCourses, collectCompletedLessons(statisticsCourses, statisticsRange, statisticsNow), statisticsNow).lessons)
    : null, [statisticsCourses, statisticsRange, statisticsNow, isStatisticsOpen]);
  const queryStatistics = (event) => {
    event.preventDefault();
    const start = parseLocalDate(statisticsDraft.start), end = parseLocalDate(statisticsDraft.end);
    if (!start || !end) { setStatisticsError('请选择有效的开始日期和结束日期'); return; }
    if (start > end) { setStatisticsError('开始日期不能晚于结束日期，请重新选择'); return; }
    setStatisticsError('');
    setStatisticsNow(new Date());
    setStatisticsRange({ ...statisticsDraft });
  };

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
  }, [isExportModalOpen, exportRange, exportCourseFilter, courses, getCourseDisplayInfo]);

  const saveSnapshotForUndo = () => setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(coursesRefLatest.current))]);

  const handleUndo = async () => {
    if (!canEdit || syncing || saveInFlightRef.current) return;
    if (undoStack.length === 0 || !user) return;
    saveInFlightRef.current = true; setRestoreError(''); setSyncing(true);
    try {
      const previousCourses = undoStack[undoStack.length - 1];
      const batch = writeBatch(db);
      courses.forEach(c => { if (!previousCourses.find(pc => pc.id === c.id)) batch.delete(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', c.id)); });
      previousCourses.forEach(c => batch.set(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', c.id), c));
      await batch.commit();
      setUndoStack(prev => prev.slice(0, -1));
    } catch (e) { console.error(e); setRestoreError(`撤销未完成：${e.message}`); } finally { saveInFlightRef.current = false; setSyncing(false); }
  };

  const openModal = useCallback((course = null, colIdx = 0, defaultStartTime = '10:00') => {
    if (!canEdit || saveInFlightRef.current) { setRestoreError('请先等待课表读取或当前操作完成。'); return; }
    setCourseDateError('');
    setIsNameManagerOpen(false); setIsTitleDropdownOpen(false); setDeleteConfirmTitle(null);
    let draft;
    if (course) {
      let dur = timeToMinutes(course.endTime) - timeToMinutes(course.startTime); if (dur < 0) dur += 1440;
      setEditingCourseId(course.id); draft = { ...course, duration: dur, recurrence: course.isBiweekly ? 'biweekly' : (course.isFixed ? 'weekly' : 'temp'), notes: course.notes || '' };
    } else {
      setEditingCourseId(null); draft = { title: '', colIndex: colIdx, startTime: defaultStartTime, duration: 60, value: 400, recurrence: 'temp', excludedWeeks: [], lessonTrackingEnabled: false, lessonCycleStarts: [], lessonTrackingAnchors: [], tag: 'P', notes: '' };
    }
    initialDraftRef.current = JSON.stringify(draft);
    latestDraftRef.current = initialDraftRef.current;
    setFormData(draft);
    setIsModalOpen(true);
  }, [canEdit, setRestoreError, setCourseDateError, setIsNameManagerOpen, setIsTitleDropdownOpen, setDeleteConfirmTitle, setEditingCourseId, setFormData, setIsModalOpen]);

  const handleCourseMouseDown = (e, course) => {
    if (!canEdit || syncing || saveInFlightRef.current || (touchStartRef.current && e.timeStamp - touchStartRef.current.at < 600)) return;
    if (e.button !== 0 && e.button !== 2) return;
    if (e.target.closest('button')) return;
    e.stopPropagation(); e.preventDefault(); 
    const rect = e.currentTarget.getBoundingClientRect();
    setDragInfo({ course, action: e.button === 2 ? 'copy' : 'move', startX: e.clientX, startY: e.clientY, currX: e.clientX, currY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, width: rect.width, height: rect.height, scale: rect.width / e.currentTarget.offsetWidth });
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
      if (!gridBodyRef.current || !user || !canEdit || syncing || saveInFlightRef.current) { setDragInfo(null); return; }
      
      const rect = gridBodyRef.current.getBoundingClientRect();
      const scale = rect.width / gridBodyRef.current.offsetWidth;
      const point = getScheduleGridPoint({ clientX: e.clientX, clientY: e.clientY, rect, scale });
      if (!point) { setDragInfo(null); return; }
      const colIdx = point.colIndex;

      const durMins = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
      const actualDur = durMins > 0 ? durMins : durMins + 1440;
      
      const newStartMins = getScheduleStartMinutes(point.y - dragInfo.offsetY / scale, {
        startHour: START_HOUR, endHour: END_HOUR + 1, pixelsPerHour: PIXELS_PER_HOUR, duration: actualDur, snap: 'round',
      });
      const newStartTime = minutesToTime(newStartMins);
      const newEndTime = minutesToTime(newStartMins + actualDur);
      
      if (colIdx !== course.colIndex || newStartTime !== course.startTime || action === 'copy') {
         if (action === 'move') {
            if (course.isFixed) {
               setMoveConfirmInfo({ course, newColIdx: colIdx, newStartTime, newEndTime });
               setDragInfo(null); return; 
            }
            saveInFlightRef.current = true; setRestoreError(''); saveSnapshotForUndo(); setSyncing(true);
            try {
              await updateDoc(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`), {
                colIndex: colIdx,
                weekday: colIdx,
                startTime: newStartTime,
                endTime: newEndTime,
                duration: actualDur,
              });
            } catch (error) {
              logFirestoreError('course:move', error);
              setRestoreError(`移动未完成：${error.message}`);
            } finally {
              saveInFlightRef.current = false;
              setSyncing(false);
            }
         } else if (action === 'copy') {
            saveInFlightRef.current = true; setRestoreError(''); saveSnapshotForUndo(); setSyncing(true);
            try {
               const newId = Math.random().toString(36).substr(2, 9);
               const newData = { ...course, id: newId, colIndex: colIdx, weekday: colIdx, startTime: newStartTime, endTime: newEndTime };
               if (!newData.isFixed) { newData.weekId = viewWeekId; delete newData.baseWeekId; } else { newData.weekId = null; newData.baseWeekId = viewWeekId; }
               const validatedCopy = normalizeCourse(newData, 0, viewWeekId);
               await setDoc(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${newId}`), validatedCopy);
            } catch (error) {
              logFirestoreError('course:copy', error);
               setRestoreError(`复制未完成：${error.message}`);
            } finally {
               saveInFlightRef.current = false;
              setSyncing(false);
            }
         }
      }
      setDragInfo(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragInfo, viewWeekId, user, openModal, canEdit, syncing]);

  const handleConfirmMove = async (type) => {
    if (!moveConfirmInfo || !user || !canEdit || syncing || saveInFlightRef.current) return;
    saveInFlightRef.current = true; setRestoreError('');
    saveSnapshotForUndo(); setSyncing(true);
    const { course, newColIdx, newStartTime, newEndTime } = moveConfirmInfo;
    try {
      const batch = writeBatch(db);
      if (type === 'temp') {
        const originalPath = `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`;
        batch.update(doc(db, originalPath), { excludedWeeks: arrayUnion(viewWeekId) });
        const newId = Math.random().toString(36).substr(2, 9);
        const tempCourse = { ...course, id: newId, colIndex: newColIdx, weekday: newColIdx, startTime: newStartTime, endTime: newEndTime, isFixed: false, isBiweekly: false, weekId: viewWeekId, recurrence: 'temp' };
        delete tempCourse.baseWeekId; delete tempCourse.excludedWeeks;
        batch.set(
          doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${newId}`),
          normalizeCourse(tempCourse, 0, viewWeekId),
        );
      } else if (type === 'permanent') {
        let duration = timeToMinutes(newEndTime) - timeToMinutes(newStartTime);
        if (duration <= 0) duration += 1440;
        const past = !course.baseWeekId || course.baseWeekId < viewWeekId;
        const futureId = past ? Math.random().toString(36).slice(2, 11) : course.id;
        if (past) batch.update(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${course.id}`), { endWeekId: viewWeekId, excludedWeeks: (course.excludedWeeks || []).filter(week => week < viewWeekId) });
        batch.set(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${futureId}`), normalizeCourse({ ...course, id: futureId, colIndex: newColIdx, weekday: newColIdx, startTime: newStartTime, endTime: newEndTime, duration, baseWeekId: viewWeekId, excludedWeeks: (course.excludedWeeks || []).filter(week => week >= viewWeekId) }, 0, viewWeekId));
      }
      await batch.commit();
    } catch (error) {
      logFirestoreError('course:confirm-move', error);
      setRestoreError(`调课未完成：${error.message}`);
    } finally {
      saveInFlightRef.current = false;
      setSyncing(false);
      setMoveConfirmInfo(null);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!user || !canEdit || syncing || isSavingTemplate || saveInFlightRef.current) return;
    if (!window.confirm(`确认保存当前${courses.length}条课程为最新云端备份？这会替换上次的最新备份。`)) return;
    saveInFlightRef.current = true;
    setRestoreError('');
    setIsSavingTemplate('saving');
    try {
      console.info('[schedule:backup] validating current schedule');
      const validatedCourses = normalizeCourseDataset(courses, 'backup-save', viewWeekId);
      const backupDocRef = doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'app_state', 'latest_backup');
      console.info('[schedule:backup] writing latest backup', {
        courses: validatedCourses.length,
      });
      await setDoc(backupDocRef, {
        code: JSON.stringify(validatedCourses),
        courses: validatedCourses,
        count: validatedCourses.length,
        schemaVersion: COURSE_SCHEMA_VERSION,
        timestamp: Date.now(),
      });
      console.info('[schedule:backup] latest backup write complete');
      setIsSavingTemplate('success');
      setTimeout(() => setIsSavingTemplate(false), 2000);
    } catch (error) {
      logFirestoreError('backup:write', error);
      setIsSavingTemplate(false);
      setRestoreError(`备份保存失败，原课程未改变：${error.message}`);
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const restoreLatestSchedule = async (backupId = 'latest_backup') => {
    if (!user || !canEdit || syncing || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSyncing(true); setRestoreError('');
    try {
      const key = backupId === 'pre_restore_backup' ? 'pre_restore_backup' : 'latest_backup';
      const backupSnap = await getDoc(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'app_state', key));
      if (!backupSnap.exists()) throw new Error('找不到云端备份');
      const backupData = backupSnap.data();
      const rawCourses = Array.isArray(backupData.courses) ? backupData.courses : JSON.parse(backupData.code || 'null');
      const validatedCourses = normalizeCourseDataset(rawCourses, 'latest-backup', viewWeekId);
      if (!window.confirm(`确认用备份的${validatedCourses.length}条课程替换当前课表？当前云端记录会先原子保存为恢复前副本。`)) return;
      saveSnapshotForUndo();
      if (activeUserIdRef.current !== user.uid) return;
      const restored = await replaceFirestoreSchedule(user.uid, validatedCourses, 'latest-backup', viewWeekId, () => activeUserIdRef.current === user.uid);
      if (activeUserIdRef.current !== user.uid) return;
      setCourses(restored); setHideEmptyOverlay(true);
    } catch (error) {
      logFirestoreError('restore:latest-backup', error);
      setRestoreError(`恢复未完成，原课表保持不变：${error.message}`);
    } finally { saveInFlightRef.current = false; setSyncing(false); }
  };

  const restoreInitialData = async () => {
    if (!user || !canEdit || syncing || saveInFlightRef.current) return;
    if (!window.confirm('确认载入示例课表？这会替换当前课程，并先保存恢复前副本。日常新增无需初始化。')) return;
    saveInFlightRef.current = true; setSyncing(true); setRestoreError('');
    try {
      const localSeed = createDefaultSchedule(viewWeekId);
      saveSnapshotForUndo();
      const initialized = await replaceFirestoreSchedule(user.uid, localSeed, 'manual-local-seed', viewWeekId, () => activeUserIdRef.current === user.uid);
      if (activeUserIdRef.current !== user.uid) return;
      setCourses(initialized); setHideEmptyOverlay(true);
    } catch (error) {
      logFirestoreError('initialize:local-seed', error);
      setRestoreError(`初始化未完成，原课表保持不变：${error.message}`);
    } finally { saveInFlightRef.current = false; setSyncing(false); }
  };

  const handleCopyBackup = () => {
    try {
      const textArea = document.createElement("textarea"); textArea.value = backupText; document.body.appendChild(textArea); textArea.select(); document.execCommand("copy"); document.body.removeChild(textArea);
      setBackupStatus('✅ 代码已成功复制到剪贴板'); setTimeout(() => setBackupStatus(''), 3000);
    } catch { setBackupStatus('❌ 复制失败，请手动全选复制'); }
  };

  const handleImportBackup = async () => {
    if (!backupText.trim() || !user || !canEdit) { setBackupStatus('❌ 请先确认课表已加载并粘贴有效备份'); return; }
    if (saveInFlightRef.current || syncing) return;
    saveInFlightRef.current = true;
    try {
      console.info('[schedule:manual-import] parsing backup text');
      const parsed = JSON.parse(backupText);
      const validatedCourses = normalizeCourseDataset(parsed, 'manual-import', viewWeekId);
      if (!window.confirm(`确认用导入的${validatedCourses.length}条课程替换当前课表？原记录将先保存恢复前副本。`)) return;
      saveSnapshotForUndo();
      setSyncing(true);
      const restoredCourses = await replaceFirestoreSchedule(
        user.uid,
        validatedCourses,
        'manual-import',
        viewWeekId,
        () => activeUserIdRef.current === user.uid,
      );
      if (activeUserIdRef.current !== user.uid) return;
      setCourses(restoredCourses);
      setBackupStatus('✅ 数据已成功恢复！');
      setTimeout(() => { if (activeUserIdRef.current !== user.uid) return; setIsBackupModalOpen(false); setBackupStatus(''); setHideEmptyOverlay(true); }, 1500);
    } catch (error) {
      logFirestoreError('manual-import', error);
      setBackupStatus(`❌ 恢复失败：${error.message}`);
    } finally {
      saveInFlightRef.current = false;
      setSyncing(false);
    }
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
    } catch { setScheduleAnalysisResult("分析失败，请检查网络连接。"); } finally { setIsAnalyzingSchedule(false); }
  };

  const handleAIGenerateNote = async () => {
    if (!formData.title) return;
    setIsGeneratingNote(true);
    try {
      const result = await callGeminiAPI(`我是一位老师，正在记录名为"${formData.title}"的课程备忘。目前备注是："${formData.notes || '无'}"。请帮我扩写成一段专业、清晰的课后备注或教学重点提示（50字以内）。`);
      setFormData(prev => ({ ...prev, notes: result }));
    } catch (e) { console.error(e); } finally { setIsGeneratingNote(false); }
  };

  const getPreferredCourseTemplate = (title) => {
    const matchingCourses = courses.filter(course => course.title === title);
    const visibleMatch = matchingCourses.find(course => isCourseVisibleInWeek(course, viewWeekId));
    if (visibleMatch) return visibleMatch;

    return matchingCourses
      .filter(course => (course.baseWeekId || course.weekId || '') <= viewWeekId)
      .sort((a, b) => (b.baseWeekId || b.weekId || '').localeCompare(a.baseWeekId || a.weekId || ''))[0]
      || matchingCourses[0];
  };

  const openTimeZoneConverter = (initial = {}) => {
    const today = beijingPlacement(statisticsNow.getTime());
    setZoneConverter({ date: today.weekId === viewWeekId ? today.date : viewWeekId, time: '20:00', timeZone: BEIJING_ZONE, duration: 60, context: 'new', ...initial });
  };
  const openCourseTimeZone = (course, preview) => {
    const duration = (timeToMinutes(course.endTime) - timeToMinutes(course.startTime) + 1440) % 1440 || 1440;
    openTimeZoneConverter({ date: preview.start.date, time: preview.start.time, timeZone: course.studentTimeZone, duration, studentTimeZone: course.studentTimeZone, instant: preview.instant });
  };
  const applyConvertedTime = ({ instant, duration, studentTimeZone }) => {
    if (!canEdit || syncing || saveInFlightRef.current) return '课表尚未就绪或正在保存，请稍后再应用。';
    const placement = beijingPlacement(instant);
    if (!placement) return '换算时间无效，请重新选择。';
    const start = timeToMinutes(placement.startTime);
    if (start < START_HOUR * 60 || start + duration > (END_HOUR + 1) * 60) setScheduleView('list');
    if (zoneConverter.context === 'editor' && editingCourseId && placement.weekId !== viewWeekId) return '换算结果属于其他周。为保留当前课程，请调整日期至正在编辑的这一周，或从顶部换算入口新增课程。';
    if (zoneConverter.context !== 'editor') openModal(null, placement.colIndex, placement.startTime);
    if (placement.weekId !== viewWeekId) {
      const [year, month, day] = placement.weekId.split('-').map(Number);
      setViewWeekStart(new Date(year, month - 1, day));
    }
    setFormData(current => ({ ...current, colIndex: placement.colIndex, weekday: placement.colIndex, startTime: placement.startTime, duration, studentTimeZone, studentTimeZoneChanged: true }));
    setZoneConverter(null);
    return '';
  };

  const handleSave = async (isDuplicate = false) => {
    if (saveInFlightRef.current) return;
    if (!formData.title.trim()) { setRestoreError('请填写课程名称'); return; }
    if (!user || !canEdit) { setRestoreError('课表尚未确认加载，请先检查登录、网络或读取错误。'); return; }
    const startMinutes = timeToMinutes(formData.startTime);
    if (!COURSE_TIME_PATTERN.test(formData.startTime) || !Number.isFinite(Number(formData.duration)) || Number(formData.duration) <= 0 || Number(formData.duration) > 1440) { setRestoreError('请选择有效的开始时间和不超过24小时的课程时长。'); return; }
    saveInFlightRef.current = true;
    setRestoreError('');
    saveSnapshotForUndo(); setSyncing(true);
    const original = editingCourseId ? courses.find(c => c.id === editingCourseId) : null;
    const targetId = (isDuplicate || !editingCourseId) ? Math.random().toString(36).substr(2, 9) : editingCourseId;
    const data = { ...formData, id: targetId, endTime: minutesToTime(timeToMinutes(formData.startTime) + Number(formData.duration)) };
    data.weekday = Number(data.colIndex);
    data.name = formData.title.trim();
    data.price = Number(formData.value);
    data.category = formData.tag;
    if (formData.studentTimeZoneChanged) data.studentTimeZoneUpdatedAt = Date.now();
    const learnerLessonSettings = lessonSettingsByTitle.get(formData.title.trim());
    const nextLessonEnabled = typeof formData.pendingLessonTrackingEnabled === 'boolean'
      ? formData.pendingLessonTrackingEnabled
      : Boolean(learnerLessonSettings?.enabled);
    const lessonAnchorMap = new Map(learnerLessonSettings?.anchors || []);
    if (nextLessonEnabled && formData.pendingLessonNumber) {
      const pendingAnchor = {
        weekId: viewWeekId,
        colIndex: data.colIndex,
        startTime: data.startTime,
        courseId: targetId,
        lessonNumber: Math.max(1, Math.round(Number(formData.pendingLessonNumber) || 1)),
      };
      lessonAnchorMap.set(getLessonAnchorKey(pendingAnchor), pendingAnchor);
    }
    data.lessonTrackingEnabled = nextLessonEnabled;
    data.lessonTrackingAnchors = Array.from(lessonAnchorMap.values())
      .sort((a, b) => getLessonAnchorKey(a).localeCompare(getLessonAnchorKey(b)));
    
    data.isFixed = data.recurrence !== 'temp'; data.isBiweekly = data.recurrence === 'biweekly';
    if (data.isFixed) data.baseWeekId = (isDuplicate ? viewWeekId : (original?.baseWeekId || viewWeekId)); else delete data.baseWeekId;
    data.weekId = data.isFixed ? null : (isDuplicate ? viewWeekId : (original && !original.isFixed ? original.weekId : viewWeekId));
    if (isDuplicate) data.excludedWeeks = [];

    try {
      const priceChanged = original && Number(original.value) !== Number(data.value);
      const categoryChanged = original && (original.category ?? original.tag) !== data.category;
      const priceEffectiveOccurrence = original ? getOccurrenceKey(viewWeekId, original) : getOccurrenceKey(viewWeekId, data);
      if (isDuplicate || !original || priceChanged) {
        data.priceEffectiveWeek = viewWeekId;
        data.priceEffectiveOccurrence = priceEffectiveOccurrence;
      }
      const shouldApplyPriceFromCurrentCourse = !isDuplicate
        && original
        && original.title === data.title.trim()
        && priceChanged;
      const shouldPreserveCategoryHistory = !isDuplicate && original?.isFixed && categoryChanged;
      const shouldPreserveScheduleHistory = !isDuplicate && original?.isFixed && (
        Number(original.colIndex) !== Number(data.colIndex)
        || original.startTime !== data.startTime || original.endTime !== data.endTime
        || Boolean(original.isBiweekly) !== Boolean(data.isBiweekly) || !data.isFixed
      );

      if (shouldApplyPriceFromCurrentCourse || shouldPreserveCategoryHistory || shouldPreserveScheduleHistory) {
        const batch = writeBatch(db);
        // 调价沿用同名课程的未来计价规则；类别只改变当前选中的循环课程。
        const affectedCourses = shouldApplyPriceFromCurrentCourse
          ? courses.filter(course => course.title === original.title)
          : [original];

        affectedCourses.forEach(course => {
          const priceUpdates = shouldApplyPriceFromCurrentCourse ? {
            value: Number(data.value),
            price: Number(data.value),
            priceEffectiveWeek: viewWeekId,
            priceEffectiveOccurrence,
          } : {};
          const categoryUpdates = categoryChanged && course.id === original.id
            ? { category: data.category, tag: data.tag }
            : {};
          if (!course.isFixed) {
            const occurrenceKey = getOccurrenceKey(course.weekId, course);
            if (occurrenceKey < priceEffectiveOccurrence) return;
            if (course.id === original.id) {
              batch.set(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id), normalizeCourse(data, 0, viewWeekId));
            } else {
              batch.update(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id), {
                ...priceUpdates,
                ...categoryUpdates,
              });
            }
            return;
          }

          let futureStartWeek = course.baseWeekId && course.baseWeekId > viewWeekId
            ? course.baseWeekId
            : viewWeekId;
          let safety = 0;
          let foundFutureOccurrence = false;
          while (safety < 520) {
            safety += 1;
            if (course.endWeekId && futureStartWeek >= course.endWeekId) return;
            const occurrenceKey = getOccurrenceKey(futureStartWeek, course);
            if (isCourseVisibleInWeek(course, futureStartWeek) && occurrenceKey >= priceEffectiveOccurrence) {
              foundFutureOccurrence = true;
              break;
            }
            futureStartWeek = getNextWeekId(futureStartWeek);
          }
          if (!foundFutureOccurrence) return;

          const hasHistoricalOccurrences = !course.baseWeekId || course.baseWeekId < futureStartWeek;
          const futureExcludedWeeks = (course.excludedWeeks || []).filter(week => week >= futureStartWeek);
          const pastExcludedWeeks = (course.excludedWeeks || []).filter(week => week < futureStartWeek);
          const sourceForFuture = course.id === original.id ? data : course;
          const futureUpdates = {
            ...priceUpdates,
            ...(shouldApplyPriceFromCurrentCourse ? { priceEffectiveWeek: futureStartWeek } : {}),
            ...categoryUpdates,
          };

          if (hasHistoricalOccurrences) {
            const futureCourseId = Math.random().toString(36).substr(2, 9);
            const futureCourse = {
              ...sourceForFuture,
              id: futureCourseId,
              ...futureUpdates,
              baseWeekId: futureStartWeek,
              weekId: null,
              excludedWeeks: futureExcludedWeeks,
            };
            if (course.endWeekId) futureCourse.endWeekId = course.endWeekId;
            else delete futureCourse.endWeekId;

            batch.update(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id), {
              endWeekId: futureStartWeek,
              excludedWeeks: pastExcludedWeeks,
            });
            batch.set(
              doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', futureCourseId),
              normalizeCourse(futureCourse, 0, futureStartWeek),
            );
          } else {
            const updatedCourse = {
              ...sourceForFuture,
              id: course.id,
              ...futureUpdates,
            };
            batch.set(
              doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id),
              normalizeCourse(updatedCourse, 0, futureStartWeek),
            );
          }
        });

        await batch.commit();
        if (activeUserIdRef.current !== user.uid) return;
        if (startMinutes < 480 || startMinutes + Number(formData.duration) > 1440) setScheduleView('list');
        console.info('[schedule:course-save] exact course history update complete', {
          title: original.title,
          effectiveOccurrence: priceEffectiveOccurrence,
        });
        setIsModalOpen(false);
        return;
      }

      const validatedCourse = normalizeCourse(data, 0, viewWeekId);
      console.info('[schedule:course-save] writing validated course', {
        id: targetId,
        name: validatedCourse.name,
      });
      const batch = writeBatch(db);
      batch.set(doc(db, `artifacts/${FIXED_APP_ID}/users/${user.uid}/courses/${targetId}`), validatedCourse);
      if (typeof formData.pendingLessonTrackingEnabled === 'boolean') {
        courses.filter(course => course.title === data.title && course.id !== targetId).forEach(course => {
          batch.update(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id), {
            lessonTrackingEnabled: nextLessonEnabled,
            lessonTrackingAnchors: data.lessonTrackingAnchors,
          });
        });
      }
      await batch.commit();
      if (activeUserIdRef.current !== user.uid) return;
      if (startMinutes < 480 || startMinutes + Number(formData.duration) > 1440) setScheduleView('list');
      setIsModalOpen(false);
      if ((!editingCourseId || isDuplicate) && validatedCourse.category === 'P') {
        setCourseCelebration({ type: validatedCourse.isFixed ? 'flower' : 'ingot', id: targetId });
      }
    } catch (error) {
      logFirestoreError('course:save', error);
      if (activeUserIdRef.current === user.uid) setRestoreError(`课程保存失败：${error.message}`);
    } finally {
      saveInFlightRef.current = false;
      setSyncing(false);
    }
  };

  const performDelete = async (id, force = false) => {
    const c = courses.find(item => item.id === id); if (!c || !user || !canEdit || saveInFlightRef.current || syncing) return;
    if (!window.confirm(c.isFixed ? force ? `确认从本周结束“${c.title}”的固定排课？` : `确认取消“${c.title}”本周的这一节课？其他周不变。` : `确认删除“${c.title}”这节临时课程？`)) return;
    saveInFlightRef.current = true; setRestoreError('');
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
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
      setRestoreError(`删除未完成：${e.message}`);
    } finally {
      saveInFlightRef.current = false;
      setOverlapState({}); 
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
      snap.forEach(d => {
        if (d.data().title === oldName) batch.update(d.ref, {
          title: finalNewName,
          name: finalNewName,
        });
      });
      await batch.commit(); setEditingNameState({ oldName: null, newName: '' });
      if (formData.title === oldName) setFormData({ ...formData, title: finalNewName });
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const openLessonSettingsDialog = () => {
    const title = formData.title.trim();
    if (!title) return;
    const editingCourse = editingCourseId ? courses.find(course => course.id === editingCourseId) : null;
    const savedSettings = lessonSettingsByTitle.get(title);
    const currentLessonNumber = editingCourse
      ? getCourseLessonNumber(editingCourse, viewWeekId, true)
      : Number(formData.pendingLessonNumber) || 1;

    setLessonSettingsDraft({
      enabled: typeof formData.pendingLessonTrackingEnabled === 'boolean'
        ? formData.pendingLessonTrackingEnabled
        : Boolean(savedSettings?.enabled),
      lessonNumber: Math.max(1, currentLessonNumber || 1),
    });
    setLessonSettingsStatus('');
    setIsLessonSettingsModalOpen(true);
  };

  const saveLessonSettingsFromCurrentCourse = async (lessonNumberOverride = null) => {
    const title = formData.title.trim();
    if (!title) return;
    const lessonNumber = Math.max(1, Math.round(Number(lessonNumberOverride ?? lessonSettingsDraft.lessonNumber) || 1));
    const enabled = Boolean(lessonSettingsDraft.enabled || lessonNumberOverride !== null);
    const editingCourse = editingCourseId ? courses.find(course => course.id === editingCourseId) : null;

    if (!editingCourse) {
      setFormData(prev => ({
        ...prev,
        pendingLessonTrackingEnabled: enabled,
        pendingLessonNumber: enabled ? lessonNumber : null,
      }));
      setLessonSettingsStatus(enabled ? `保存课程后，本堂将显示为第${lessonNumber}课时` : '保存课程后将关闭课时编号');
      setTimeout(() => setIsLessonSettingsModalOpen(false), 500);
      return;
    }

    if (!user) return;
    const matchingCourses = courses.filter(course => course.title === title);
    const anchorMap = new Map(lessonSettingsByTitle.get(title)?.anchors || []);
    const currentAnchor = {
      weekId: viewWeekId,
      colIndex: editingCourse.colIndex,
      startTime: editingCourse.startTime,
      courseId: editingCourse.id,
      lessonNumber,
    };
    anchorMap.set(getLessonAnchorKey(currentAnchor), currentAnchor);
    const nextAnchors = Array.from(anchorMap.values())
      .sort((a, b) => getLessonAnchorKey(a).localeCompare(getLessonAnchorKey(b)));

    saveSnapshotForUndo();
    setSyncing(true);
    try {
      const batch = writeBatch(db);
      matchingCourses.forEach(course => {
        batch.update(doc(db, 'artifacts', FIXED_APP_ID, 'users', user.uid, 'courses', course.id), {
          lessonTrackingEnabled: enabled,
          lessonTrackingAnchors: nextAnchors,
        });
      });
      await batch.commit();
      setLessonSettingsStatus(enabled ? `已从本堂设为第${lessonNumber}课时` : '已关闭课时编号');
      setTimeout(() => setIsLessonSettingsModalOpen(false), 500);
    } catch (error) {
      logFirestoreError('lesson-tracking:save', error);
      setLessonSettingsStatus('保存失败，请重试');
    } finally {
      setSyncing(false);
    }
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

  if (!user && !isStandalone) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><section className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center shadow-sm"><Lock className="mx-auto text-indigo-500 mb-4" size={30} /><h1 className="text-xl font-black">需要验证身份</h1><p role="alert" className="text-sm text-slate-500 my-4">{authError || '尚未连接到你的账户，已暂停读取和编辑，避免显示其他用户或示例课表。'}</p><button onClick={() => { setAuthInitialized(false); setAuthError(''); setAuthAttempt(value => value + 1); }} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold">重新连接</button></section></div>;
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
      {courseCelebration && (
        <div key={courseCelebration.id} aria-hidden="true" className={`p-course-celebration p-course-celebration--${courseCelebration.type}`}>
          <svg viewBox="0 0 200 200" fill="none" className="p-course-celebration__art">
            <defs>
              <linearGradient id="p-ingot-gold" x1="70" y1="70" x2="130" y2="155" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fff6ae" /><stop offset=".4" stopColor="#facc15" /><stop offset="1" stopColor="#d97706" />
              </linearGradient>
              <radialGradient id="p-flower-purple">
                <stop stopColor="#f5d0fe" /><stop offset=".65" stopColor="#c084fc" /><stop offset="1" stopColor="#7e22ce" />
              </radialGradient>
            </defs>
            {courseCelebration.type === 'ingot' ? (
              <g className="p-course-celebration__ingot">
                <path d="M27 87 Q46 98 58 111 Q100 127 142 111 Q154 98 173 87 L153 142 Q100 172 47 142 Z" fill="url(#p-ingot-gold)" stroke="#d97706" strokeWidth="3" strokeLinejoin="round" />
                <path d="M27 87 Q53 78 72 98 Q100 109 128 98 Q147 78 173 87 Q157 121 100 129 Q43 121 27 87Z" fill="#fde047" stroke="#eab308" strokeWidth="3" />
                <ellipse cx="100" cy="104" rx="32" ry="14" fill="#d97706" />
                <path d="M72 102 Q73 69 100 68 Q127 69 128 102 Q101 117 72 102Z" fill="url(#p-ingot-gold)" stroke="#f59e0b" strokeWidth="2" />
                <path d="M81 87 Q89 77 100 77 M58 137 Q77 147 99 147" stroke="#fff7c2" strokeWidth="5" strokeLinecap="round" />
              </g>
            ) : (
              <g>
                {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
                  <g key={angle} transform={`rotate(${angle} 100 100)`}>
                    <ellipse className="p-course-celebration__petal" cx="100" cy="68" rx="18" ry="37" fill="url(#p-flower-purple)" stroke="#e9d5ff" strokeWidth="1.5" />
                  </g>
                ))}
                <circle cx="100" cy="100" r="17" fill="#fde68a" stroke="#fbbf24" strokeWidth="3" />
                <circle cx="95" cy="95" r="5" fill="#fffbeb" />
              </g>
            )}
            {[[29, 49], [156, 43], [178, 115], [30, 157], [138, 170], [99, 22]].map(([x, y], index) => (
              <g key={index} transform={`translate(${x} ${y})`}>
                <path className="p-course-celebration__sparkle" style={{ animationDelay: `${index * 35}ms` }} d="M0 -10 Q1 -1 10 0 Q1 1 0 10 Q-1 1 -10 0 Q-1 -1 0 -10Z" fill="currentColor" />
              </g>
            ))}
          </svg>
        </div>
      )}
      
      {isZenMode && (
        <button onClick={toggleZenMode} className="fixed bottom-8 right-8 z-[100] bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 hover:bg-slate-700 transition-all font-black border border-slate-600 animate-in zoom-in-50">
          <Minimize2 size={18} /> 退出极简模式
        </button>
      )}

      {!isZenMode && (
        <header className="flex-shrink-0 bg-white z-30 flex flex-col shadow-sm relative">
          <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-4 items-center justify-between border-b border-slate-100">
            <div className="flex items-center space-x-4">
              <div className="bg-slate-800 p-2 text-white rounded-xl shadow-md"><Calendar size={24} /></div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                  每周固定课表
                  <span role="status" className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 ${restoreError || loadError ? 'text-red-600 bg-red-50 border-red-100' : syncing || dataState !== 'ready' ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-teal-600 bg-teal-50 border-teal-100'}`}>{syncing ? <RefreshCw size={10} className="animate-spin" /> : <Cloud size={10} />}{restoreError || loadError ? '操作未完成' : syncing ? '等待云端确认' : dataState === 'loading' ? '正在读取' : dataState === 'cached' ? '离线缓存' : '云端已同步'}</span>
                </h1>
                <div className="text-sm font-bold text-purple-600 flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                  <span>本周排课预计: ¥{String(totals.weekly)}</span>
                  <span>本月已完成课酬: ¥{String(completedSummary.fee)}</span>
                </div>
                <div className="text-sm font-bold text-teal-700 flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                  <span>本周已上课时：{formatLessonHours(completedSummary.week)}课时</span>
                  <span>本月已上课时：{formatLessonHours(completedSummary.month)}课时</span>
                  <button ref={statisticsTriggerRef} onClick={() => {
                    const range = getStatisticsRange('month');
                    setStatisticsDraft(range); setStatisticsRange(range); setStatisticsError('');
                    setStatisticsNow(new Date()); setIsStatisticsOpen(true);
                  }} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100">
                    <Clock size={14} />课时统计
                  </button>
                  <button type="button" onClick={() => { setStatisticsNow(new Date()); setIsReportsOpen(true); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100"><BarChart3 size={14} />统计报告</button>
                  <button type="button" onClick={() => openTimeZoneConverter()} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100"><Globe2 size={14} />时区换算</button>
                </div>
                {completedSummary.undatedCount > 0 && <p className="text-[10px] text-amber-700 mt-1">部分旧固定课缺少起始日期，历史统计采用保守口径；详见统计报告。</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex items-center space-x-2 p-1 rounded-lg border mr-2 shadow-inner transition-colors ${isViewingCurrentWeek ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                <button onClick={() => { const d = new Date(viewWeekStart); d.setDate(d.getDate()-7); setViewWeekStart(d); }} className="p-1.5 rounded-md hover:bg-white shadow-sm transition-all text-slate-600"><ChevronLeft size={20} /></button>
                <span className={`text-sm font-bold w-32 text-center tracking-wide ${isViewingCurrentWeek ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {isViewingCurrentWeek && <span className="block text-[9px] leading-none mb-0.5 tracking-[0.2em]">当前周</span>}
                  {String(viewWeekStart.getFullYear())}年 {String(weekDates[0])}
                </span>
                <button onClick={() => { const d = new Date(viewWeekStart); d.setDate(d.getDate()+7); setViewWeekStart(d); }} className="p-1.5 rounded-md hover:bg-white shadow-sm transition-all text-slate-600"><ChevronRight size={20} /></button>
              </div>
              <button type="button" onClick={() => setViewWeekStart(getMonday(new Date()))} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600">回到本周</button>
              <button type="button" onClick={() => setScheduleView(value => value === 'week' ? 'list' : 'week')} className="px-3 py-2 rounded-lg border border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-600">{scheduleView === 'week' ? '列表视图' : '周视图'}</button>
              <button disabled={!canEdit || syncing} onClick={() => { setHideEmptyOverlay(true); openModal(); }} className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-black shadow-sm hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1"><Plus size={17} />新增排课</button>
              <details className="relative"><summary className="cursor-pointer list-none px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">更多操作 <ChevronDown size={12} className="inline" /></summary><div className="absolute right-0 top-full mt-2 z-[100] w-[min(340px,calc(100vw-32px))] bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-wrap gap-2">
              <button onClick={toggleFullscreen} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="全屏显示网页">
                <Maximize2 size={16} />
              </button>
              <div role="group" aria-label="课表显示比例" className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                <button type="button" aria-label="缩小课表" title="缩小10%" disabled={scheduleZoom <= 60} onClick={() => setZoomPreference({ mode: 'manual', percent: clampScheduleZoom(scheduleZoom - 10) })} className="w-9 h-9 rounded-md font-bold text-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                <button type="button" aria-label={`当前比例${scheduleZoom}%，点击恢复100%`} title="恢复100%" onClick={() => setZoomPreference({ mode: 'manual', percent: 100 })} className="min-w-14 h-9 px-1 rounded-md font-bold text-indigo-600 hover:bg-indigo-50 tabular-nums">{scheduleZoom}%</button>
                <button type="button" aria-label="放大课表" title="放大10%" disabled={scheduleZoom >= 140} onClick={() => setZoomPreference({ mode: 'manual', percent: clampScheduleZoom(scheduleZoom + 10) })} className="w-9 h-9 rounded-md font-bold text-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">＋</button>
                <button type="button" aria-pressed={zoomPreference.mode === 'fit'} title="按窗口宽度调整，最小60%；窄屏可横向滚动" onClick={() => setZoomPreference({ mode: 'fit', percent: scheduleZoom })} className={`h-9 px-2 rounded-md text-xs font-bold ${zoomPreference.mode === 'fit' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>适应窗口</button>
              </div>
              
              <button onClick={toggleZenMode} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="隐藏菜单栏">
                <AlignLeft size={16} />
              </button>

              <button onClick={handleAIAnalysis} className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200 rounded-lg text-[13px] font-black shadow-sm hover:opacity-80 transition-all flex items-center gap-1" title="获取本周排课分析">
                <Sparkles size={16} className="text-purple-500" /> 智能顾问
              </button>

              <button onClick={handleUndo} disabled={undoStack.length === 0 || syncing || !canEdit} className={`px-3 py-2.5 rounded-lg text-sm font-black shadow-sm transition-all flex items-center border ${undoStack.length > 0 ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'}`} title="撤销操作">
                <Undo size={16} />
              </button>
              <button onClick={handleDownload} disabled={isDownloading} className="px-3 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-all" title="下载图片">
                <Download size={16} className={isDownloading ? "animate-bounce" : ""} />
              </button>
              <button onClick={() => setIsExportModalOpen(true)} className="px-4 py-2.5 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-[13px] font-black shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1">
                <FileSpreadsheet size={16}/> 导出财务
              </button>
              <div className="w-[1px] h-6 bg-slate-200 mx-1"></div> 
              {isStandalone && (
                <button disabled={syncing || isSavingTemplate} onClick={() => { if (!saveInFlightRef.current) signOut(auth); }} className="px-3 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-black shadow-sm hover:bg-red-100 transition-all flex items-center gap-1 ml-1 disabled:opacity-40" title="退出登录">
                  <LogOut size={16} />
                </button>
              )}
              </div></details>
            </div>
          </div>

          <details className="bg-slate-50/80 px-4 sm:px-6 py-2.5 border-b border-slate-200 text-[12px]">
            <summary className="text-slate-500 font-bold cursor-pointer list-none tracking-wide"><Settings2 size={14} className="inline mr-1" />设置与备份 <ChevronDown size={12} className="inline ml-1" /></summary>
            
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => { setBackupText(JSON.stringify(coursesRefLatest.current, null, 2)); setBackupStatus(""); setIsBackupModalOpen(true); }} className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-md font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-1">
                <Database size={14} /> 手动备份代码
              </button>
              <button disabled={syncing || !canEdit} onClick={() => restoreLatestSchedule()} className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-100 rounded-md font-bold shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1 disabled:opacity-40">
                <RefreshCw size={14} /> 从云端恢复备份
              </button>
              <button disabled={syncing || !canEdit} onClick={() => restoreLatestSchedule('pre_restore_backup')} className="px-3 py-1.5 bg-white border border-slate-200 rounded-md font-bold disabled:opacity-40">恢复前副本</button>
              <button onClick={handleUpdateTemplate} disabled={!!isSavingTemplate || syncing || !canEdit} className={`px-4 py-1.5 rounded-md font-bold shadow-sm transition-all flex items-center gap-1 border bg-emerald-50 text-emerald-600 border-emerald-200 disabled:opacity-40`}>
                {isSavingTemplate === 'saving' ? <><RefreshCw size={14} className="animate-spin" /> 保存中</> : 
                 isSavingTemplate === 'success' ? <><Cloud size={14} /> 云端备份已保存</> :
                 <><Cloud size={14} /> 保存云端备份</>}
              </button>
            </div>
          </details>
        </header>
      )}

      {(loadError || restoreError || dataState === 'cached') && <div role="alert" className={`shrink-0 px-4 py-3 text-xs flex flex-wrap items-center gap-2 ${loadError || restoreError ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}><span className="flex-1">{loadError || restoreError || '当前为离线缓存。编辑保存需等待网络恢复；未收到服务器确认前不会显示已同步。'}</span>{loadError && <button disabled={syncing} onClick={() => { setDataState('loading'); setLoadError(''); setLoadAttempt(value => value + 1); }} className="underline font-bold">重试读取</button>}{restoreError && <button onClick={() => setRestoreError('')} className="font-bold underline">知道了</button>}</div>}

      {isReportsOpen && <MonthlyReports courses={statisticsCourses} collectLessons={collectCompletedLessons} now={statisticsNow} onClose={closeReports} />}
      {zoneConverter && <TimeZoneConverter initial={zoneConverter} onClose={closeZoneConverter} onUse={applyConvertedTime} />}
      {isStatisticsOpen && statisticsResult && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget) setIsStatisticsOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="lesson-statistics-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden">
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 id="lesson-statistics-title" className="text-lg font-black flex items-center gap-2"><Clock size={20} className="text-indigo-600" />课时统计</h2>
              <button ref={statisticsCloseRef} onClick={() => setIsStatisticsOpen(false)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100"><X size={18} />关闭</button>
            </header>
            <div className="overflow-y-auto p-4 sm:p-6 space-y-5">
              <form onSubmit={queryStatistics} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <label className="font-bold text-slate-600 space-y-1 block">开始日期<input type="date" required value={statisticsDraft.start} onChange={event => setStatisticsDraft({ ...statisticsDraft, start: event.target.value })} className="block w-full min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" /></label>
                  <label className="font-bold text-slate-600 space-y-1 block">结束日期<input type="date" required value={statisticsDraft.end} onChange={event => setStatisticsDraft({ ...statisticsDraft, end: event.target.value })} className="block w-full min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" /></label>
                  <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-indigo-700">查询</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[['week', '本周'], ['month', '本月'], ['lastMonth', '上月']].map(([preset, label]) => <button key={preset} type="button" onClick={() => { const range = getStatisticsRange(preset); setStatisticsDraft(range); setStatisticsRange(range); setStatisticsError(''); setStatisticsNow(new Date()); }} className="px-3 py-1.5 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 font-bold">{label}</button>)}
                </div>
                {statisticsError && <p role="alert" className="text-red-600 bg-red-50 p-3 rounded-lg">{statisticsError}</p>}
              </form>
              <div aria-live="polite" className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="font-bold text-slate-600">{formatStatisticsDate(statisticsRange.start)}—{formatStatisticsDate(statisticsRange.end)}</p>
                <p className="text-lg font-black text-indigo-700 mt-2">共上课{statisticsResult.count}次｜总计{formatLessonHours(statisticsResult.minutes)}课时</p>
                <p className="text-xs text-slate-500 mt-2">按本地时间统计已结束课程；1小时＝1课时。未来和进行中的课程不计入。</p>
              </div>
              {statisticsResult.count === 0 ? <p className="text-center text-slate-500 py-8">所选日期范围内暂无已完成课程</p> : statisticsResult.groups.map(group => (
                <details key={group.category} open className={`rounded-xl border ${TAGS[group.category]?.theme.border || 'border-slate-200'} ${TAGS[group.category]?.theme.bg || 'bg-slate-50'}`}>
                  <summary className="cursor-pointer p-4 font-bold">
                    <span className="text-base">{group.category === 'unclassified' ? '未分类' : `${group.category}类`}</span>
                    <span className="block text-xs text-slate-600 mt-1">{group.count}次课程｜{formatLessonHours(group.minutes)}课时｜{group.students.length}名学员</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {group.students.map(student => <details key={student.key} className="bg-white/90 border border-white rounded-lg">
                      <summary className="p-3 cursor-pointer font-bold">{student.name}<span className="block text-xs font-medium text-slate-500 mt-1">{student.lessons.length}次课程｜{formatLessonHours(student.minutes)}课时</span></summary>
                      <ol className="px-3 pb-3 divide-y divide-slate-100">
                        {student.lessons.map(lesson => <li key={lesson.key} className="py-3 space-y-1 text-slate-600">
                          <p className="font-bold">{formatStatisticsDate(lesson.date)} 星期{['一', '二', '三', '四', '五', '六', '日'][lesson.weekday]}</p>
                          <p>{lesson.startTime}—{lesson.endTime}</p>
                          <p className="break-words">{lesson.title}｜{lesson.category === 'unclassified' ? `未分类${lesson.originalCategory ? `（${lesson.originalCategory}）` : ''}` : `${lesson.category}类`}｜{formatLessonHours(lesson.minutes)}课时</p>
                        </li>)}
                      </ol>
                    </details>)}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}

      <div ref={scheduleViewportRef} className={`flex-1 min-h-0 overflow-auto relative z-0 transition-colors duration-300 ${isViewingCurrentWeek ? 'bg-indigo-50/80' : 'bg-slate-100/70'} ${isZenMode || isCssFullscreen ? 'p-0' : 'p-3 sm:p-6'}`}>
        
        {courses.length === 0 && dataState === 'ready' && !syncing && !hideEmptyOverlay && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white p-8 rounded-[32px] shadow-2xl text-center border border-slate-100 max-w-md w-full flex flex-col items-center">
              <Database size={64} className="text-indigo-500 mb-6" />
              <h2 className="text-2xl font-black text-slate-800 mb-3">你的课表还是空的</h2>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                空课表会保持为空，不会自动载入数据。<br/>可以直接新增，也可以明确选择恢复或示例：
              </p>

              <div className="w-full flex flex-col gap-3">
                <button onClick={restoreLatestSchedule} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                  <Cloud size={18} /> 1. 选择最新课表数据 (推荐)
                </button>
                <button onClick={restoreInitialData} className="w-full py-4 bg-emerald-500 text-white font-black rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2">
                  <Calendar size={18} /> 2. 初始化数据 (固定排课)
                </button>
                <button onClick={() => setHideEmptyOverlay(true)} className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <Plus size={18} /> 从空白开始新增课程
                </button>
              </div>
              
              {restoreError && (
                <p className="mt-6 text-[13px] font-bold text-red-500 animate-pulse border border-red-200 bg-red-50 px-4 py-2 rounded-xl">{restoreError}</p>
              )}
            </div>
          </div>
        )}
        
        {scheduleView === 'list' ? <div ref={scheduleRef} className="max-w-3xl mx-auto space-y-3">
          {!visibleCourses.length && <p className="text-center text-slate-500 p-8 bg-white rounded-xl">本周暂无排课</p>}
          {DAYS.map((day, colIndex) => {
            const rows = visibleCourses.filter(course => course.colIndex === colIndex).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return rows.length > 0 && <section key={day} className="bg-white border border-slate-200 rounded-2xl overflow-hidden"><h2 className="px-4 py-3 bg-slate-50 text-sm font-black text-slate-600">{occurrenceDate(viewWeekId, colIndex)} {day}</h2><div className="divide-y divide-slate-100">{rows.map(course => <div key={course.id} className="flex items-center gap-3 px-4 py-3"><button disabled={!canEdit || syncing} onClick={() => openModal(course)} className="flex-1 min-w-0 text-left"><span className="block text-xs text-indigo-600 font-bold">{course.startTime}—{course.endTime}</span><span className="block font-black text-slate-800 mt-1 truncate">{course.title}</span><span className="block text-xs text-slate-500 mt-1">{['A', 'B', 'P'].includes(course.category) ? `${course.category}类` : '未分类'} · ¥{getCourseTotalValue(course, new Date(viewWeekStart.getFullYear(), viewWeekStart.getMonth(), viewWeekStart.getDate() + colIndex))}{course.notes ? ` · ${course.notes}` : ''}</span>{courseZonePreviews.get(course.id) && <span className="block text-xs text-indigo-500 mt-1">学员当地：{courseZonePreviews.get(course.id).start.date} {courseZonePreviews.get(course.id).start.time}</span>}</button><button disabled={!canEdit || syncing} onClick={() => performDelete(course.id)} aria-label={`删除课程${course.title}`} className="w-10 h-10 shrink-0 rounded-xl border border-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 flex justify-center items-center"><X size={16} /></button></div>)}</div></section>;
          })}
        </div> : <div ref={scheduleRef} style={{ width: scheduleWidth, zoom: scheduleZoom / 100 }} onContextMenu={e => e.preventDefault()} className={`mx-auto bg-white flex flex-col relative border transition-colors ${isViewingCurrentWeek ? 'shadow-xl shadow-indigo-200/50 border-indigo-300 ring-4 ring-indigo-100' : 'shadow-sm border-slate-200'}`}>
          {isViewingCurrentWeek && (
            <div className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white text-center py-1.5 text-[11px] font-black tracking-[0.3em] sticky top-0 z-[45]">
              当前周课表
            </div>
          )}
          <div className={`flex border-b border-slate-100 bg-white/95 backdrop-blur-md sticky z-[40] shadow-sm ${isViewingCurrentWeek ? 'top-[26px]' : 'top-0'}`}>
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
                        const scale = rect.height / e.currentTarget.offsetHeight;
                        const y = (e.clientY - rect.top) / scale;
                        const clickMins = getScheduleStartMinutes(y, { startHour: START_HOUR, endHour: END_HOUR + 1, pixelsPerHour: PIXELS_PER_HOUR });
                        openModal(null, colIdx, minutesToTime(clickMins));
                      }
                    }}>
                    {colGroups.map((group, groupIdx) => {
                      const stateKey = `${colIdx}-${groupIdx}`;
                      const rawIdx = overlapState[stateKey] || 0;
                      const activeIdx = rawIdx >= group.length ? 0 : rawIdx;
                      const course = group[activeIdx];
                      if (!course) return null;
                      
                      const theme = (TAGS[course.tag] || TAGS.unclassified).theme;
                      const hasOverlap = group.length > 1;
                      const startPx = ((course.startM - START_HOUR * 60) / 60) * PIXELS_PER_HOUR;
                      const heightPx = ((course.endM - course.startM) / 60) * PIXELS_PER_HOUR;
                      const isCompact = heightPx < PIXELS_PER_HOUR;
                      const displayInfo = getCourseDisplayInfo(course, viewWeekId);
                      const finalNotes = [displayInfo.dynamicNote, course.notes].filter(Boolean).join(' | ');
                      const zonePreview = courseZonePreviews.get(course.id);

                      return (
                        <div key={course.id} role="button" tabIndex={canEdit ? 0 : -1} aria-label={`编辑课程${course.title} ${course.startTime}—${course.endTime}`}
                          onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openModal(course); } }}
                          onPointerDown={event => { if (event.pointerType === 'touch') touchStartRef.current = { id: course.id, x: event.clientX, y: event.clientY, at: event.timeStamp }; }}
                          onPointerUp={event => { const start = touchStartRef.current; if (event.pointerType === 'touch' && start?.id === course.id) { touchStartRef.current.at = event.timeStamp; if (!event.target.closest('button') && Math.abs(event.clientX - start.x) < 8 && Math.abs(event.clientY - start.y) < 8) openModal(course); } }}
                          onMouseDown={(e) => handleCourseMouseDown(e, course)}
                          title={`${displayInfo.title} · ${course.startTime}—${course.endTime}${finalNotes ? ` · ${finalNotes}` : ''}`}
                          className={`schedule-course-card absolute rounded-2xl cursor-grab active:cursor-grabbing transition-all duration-300 hover:scale-[1.01] flex flex-col shadow-sm group/card ${isCompact ? 'p-1 gap-0.5' : 'p-2 gap-0.5'}
                            ${theme.bg} ${theme.text}
                            ${!course.isFixed ? `border-[1.5px] border-dashed ${theme.border}` : course.isBiweekly ? `border-[1.5px] border-dotted ${theme.border}` : `border border-solid ${theme.border}`}
                          `}
                          style={{ top: `${startPx + 2}px`, height: `${heightPx - 4}px`, zIndex: 20, left: '4px', right: '4px' }}>
                          
                          <div className="flex items-center gap-1 shrink-0 min-w-0">
                            <span className={`shrink-0 flex items-center justify-center rounded-full font-black text-white ${isCompact ? 'w-2.5 h-2.5 text-[6px]' : 'w-3.5 h-3.5 text-[8px]'} ${(TAGS[course.tag] || TAGS.unclassified).badge.split(' ')[0]}`}>{String(course.tag)}</span>
                            <span className={`min-w-0 whitespace-nowrap font-bold text-slate-500 tracking-tight ${isCompact ? 'text-[7px] leading-[10px]' : 'text-[10px] leading-[14px]'}`}>{course.startTime}—{course.endTime}</span>
                            {(!course.isFixed || course.isBiweekly) && (!isCompact || !hasOverlap) && <span className="ml-auto shrink-0 text-[7px] leading-[10px] text-slate-500 bg-white/80 rounded px-0.5 group-hover/card:opacity-0">{course.isBiweekly ? '隔周' : '临时'}</span>}
                            {isCompact && hasOverlap && <button onClick={e => { e.stopPropagation(); setOverlapState(prev => ({ ...prev, [stateKey]: (activeIdx + 1) % group.length })); }} className="ml-auto shrink-0 flex items-center gap-0.5 rounded bg-white/80 text-[7px] leading-[10px] font-bold"><Layers size={7} />{activeIdx + 1}/{group.length}</button>}
                            {isCompact && zonePreview && <CourseTimeZoneBadge compact preview={zonePreview} zone={course.studentTimeZone} notes={finalNotes} onClick={() => openCourseTimeZone(course, zonePreview)} />}
                            <button disabled={syncing || !canEdit} aria-label={`删除课程${course.title}`} onClick={e => { e.stopPropagation(); performDelete(course.id); }} className="hidden sm:block absolute top-1 right-1 p-0.5 rounded bg-white opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto focus:opacity-100 focus:pointer-events-auto text-slate-400 hover:text-red-500"><X size={isCompact ? 10 : 12} /></button>
                          </div>
                          <div className={`flex items-center gap-1 shrink-0 min-w-0 ${isCompact ? 'mt-auto' : ''}`}>
                            <div className={`schedule-course-title min-w-0 flex-1 truncate font-black pointer-events-none text-slate-900 ${isCompact ? 'text-[10px] leading-[12px]' : 'text-[14px] leading-[18px]'}`}>{String(displayInfo.title)}</div>
                            {isCompact && <span className="schedule-course-price shrink-0 text-[8px] leading-[12px] font-bold text-slate-500">¥{getCourseTotalValue(course, new Date(viewWeekStart.getTime() + colIdx * 86400000))}</span>}
                          </div>
                          {!isCompact && (zonePreview ? <CourseTimeZoneBadge preview={zonePreview} zone={course.studentTimeZone} notes={finalNotes} onClick={() => openCourseTimeZone(course, zonePreview)} /> : finalNotes && <div className="schedule-course-notes shrink-0 min-w-0 truncate text-[10px] leading-[12px] font-bold text-slate-500">{finalNotes}</div>)}
                          {!isCompact && <div className="flex items-center justify-between gap-1 mt-auto shrink-0 min-w-0">
                            {hasOverlap ? <button onClick={e => { e.stopPropagation(); setOverlapState(prev => ({ ...prev, [stateKey]: (activeIdx + 1) % group.length })); }} className="flex items-center gap-0.5 px-1 rounded bg-white/80 border border-black/5 text-[8px] leading-[10px] font-bold text-slate-600"><Layers size={8} />{activeIdx + 1}/{group.length}</button> : <span />}
                            {!isCompact && <span className="schedule-course-price text-[10px] leading-[12px] font-black text-slate-500">¥ {getCourseTotalValue(course, new Date(viewWeekStart.getTime() + colIdx * 86400000))}</span>}
                          </div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>}
      </div>

      {dragInfo && (
        <div 
          className={`fixed pointer-events-none z-[100] p-3 rounded-2xl shadow-2xl opacity-90 border-2 border-dashed
            ${(TAGS[dragInfo.course.tag] || TAGS.unclassified).theme.bg}
            ${(TAGS[dragInfo.course.tag] || TAGS.unclassified).theme.text}
            ${(TAGS[dragInfo.course.tag] || TAGS.unclassified).theme.border}
          `}
          style={{ left: dragInfo.currX - dragInfo.offsetX, top: dragInfo.currY - dragInfo.offsetY, width: dragInfo.width, height: dragInfo.height, padding: 12 * dragInfo.scale }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-3 py-1 rounded-full font-bold shadow-md whitespace-nowrap animate-bounce">
            {dragInfo.action === 'copy' ? '➕ 复制至新时间' : '✥ 移动至新时间'}
          </div>
          <div className="font-black opacity-70" style={{ fontSize: 12 * dragInfo.scale }}>
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
          <div ref={courseDialogRef} role="dialog" aria-modal="true" aria-labelledby="course-dialog-title" className="bg-white rounded-[24px] sm:rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-100 font-sans flex flex-col max-h-[92dvh]">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h2 id="course-dialog-title" className="text-xl sm:text-2xl font-black text-slate-800 font-sans tracking-tight">{editingCourseId ? '修改课程' : '添加课程'}</h2>
              <button ref={courseCloseRef} disabled={syncing} aria-label="关闭课程编辑" onClick={closeCourseDialog} className="p-2 hover:bg-slate-200 rounded-2xl text-slate-400 transition-all"><X size={20} /></button>
            </div>
            
            <fieldset disabled={syncing} className="min-h-0 p-4 sm:p-8 space-y-5 text-[15px] overflow-y-auto">
              {restoreError && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{restoreError}</p>}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[15px] font-black text-slate-700">
                  <span>课程名称</span>
                  <button onClick={() => setIsNameManagerOpen(!isNameManagerOpen)} className={`text-[15px] font-black flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-xl ${isNameManagerOpen ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-500 hover:bg-slate-100'}`}>
                    <Settings2 size={16}/> {isNameManagerOpen ? '收起设置' : '学员设置'}
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
                      setFormData({ ...formData, title: e.target.value, ...(!editingCourseId ? { studentTimeZone: studentTimeZoneDefault(courses, e.target.value, formData) } : {}) });
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
                              const existingCourse = getPreferredCourseTemplate(name);
                              if (existingCourse) {
                                setFormData({
                                  ...formData,
                                  title: name,
                                  value: existingCourse.value,
                                  price: existingCourse.value,
                                  tag: existingCourse.tag ?? 'P',
                                  category: existingCourse.category ?? existingCourse.tag ?? '',
                                  recurrence: existingCourse.isBiweekly ? 'biweekly' : (existingCourse.isFixed ? 'weekly' : 'temp'),
                                  lessonTrackingEnabled: existingCourse.lessonTrackingEnabled || false,
                                  lessonCycleStarts: existingCourse.lessonCycleStarts || [],
                                  lessonTrackingAnchors: existingCourse.lessonTrackingAnchors || [],
                                  studentTimeZone: editingCourseId ? formData.studentTimeZone : studentTimeZoneDefault(courses, name, formData),
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
                      <div className="p-3 bg-slate-50 border-b border-slate-200 text-[13px] font-black text-slate-500">已保存的学员名称（课时设置请在备注栏右侧操作）</div>
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
                                  <span className="font-bold text-slate-700 text-[15px] truncate pr-2 flex-1 min-w-[100px]">{String(name)}</span>
                                  <div className="flex gap-1.5 shrink-0 opacity-100 transition-opacity items-center">
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
                      onChange={e => {
                        const nextValue = Number(e.target.value);
                        setFormData({...formData, value: nextValue, price: nextValue});
                      }}
                      className="w-full h-12 border-2 border-slate-100 rounded-2xl pl-14 pr-4 text-[14px] font-black outline-none focus:border-indigo-500 focus:bg-white bg-slate-50/40 transition-all shadow-sm"
                    />
                  </div>
                  {editingCourseId && (
                    <p className="text-[10px] text-indigo-500 font-bold mt-1">调价从当前这堂课精确生效；更早的课程保留原价</p>
                  )}
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
                      {!DURATION_OPTIONS.some(option => option.value === Number(formData.duration)) && <option value={formData.duration}>{formData.duration}分钟（原课程）</option>}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><ChevronDown size={18} /></div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 font-bold">
                <div className="space-y-2"><TimePicker large label="开始时间（北京时间）" value={formData.startTime} onChange={startTime => setFormData(current => ({ ...current, startTime }))} /><p className="text-[10px] text-slate-400 font-bold">结束时间：{minutesToTime(timeToMinutes(formData.startTime) + Number(formData.duration))}{timeToMinutes(formData.startTime) + Number(formData.duration) >= 1440 ? '（次日）' : ''}</p></div>
                <div className="space-y-2 min-w-0">
                  <label htmlFor="course-calendar-date" className="flex items-center gap-1 h-6 text-[15px] font-black text-slate-700">上课日期 <span className="text-xs font-normal text-indigo-500">{DAYS[formData.colIndex]}</span></label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm pointer-events-none group-focus-within:bg-indigo-100 transition-all z-10"><Calendar size={18} /></div>
                    <input id="course-calendar-date" type="date" value={occurrenceDate(viewWeekId, Number(formData.colIndex))} min={editingCourseId ? viewWeekId : '1900-01-01'} max={editingCourseId ? occurrenceDate(viewWeekId, 6) : '9998-12-31'} onChange={event => {
                      const selected = courseDateSelection(event.target.value);
                      if (!selected) { setCourseDateError('请选择有效的上课日期'); return; }
                      if (editingCourseId && selected.weekId !== viewWeekId) { setCourseDateError('修改已有课程时请选择当前课表周内的日期，跨周请新增或复制排课。'); return; }
                      setCourseDateError('');
                      if (selected.weekId !== viewWeekId) { const [year, month, day] = selected.weekId.split('-').map(Number); setViewWeekStart(new Date(year, month - 1, day)); }
                      setFormData(current => ({ ...current, colIndex: selected.colIndex, weekday: selected.colIndex }));
                    }} className="w-full min-w-0 h-12 border-2 border-slate-200 rounded-xl pl-16 pr-3 text-[14px] font-black outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white" />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold">{editingCourseId ? '修改限定在当前周；更早的固定排课保留历史。' : '选择日期后自动同步课表周与星期。'}</p>
                </div>
              </div>
              {courseDateError && <p role="alert" className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">{courseDateError}</p>}

              <CourseTimeZonePanel weekId={viewWeekId} formData={formData} onChange={studentTimeZone => setFormData(current => ({ ...current, studentTimeZone, studentTimeZoneChanged: true }))} onConvert={initial => openTimeZoneConverter({ ...initial, studentTimeZone: formData.studentTimeZone || '', context: 'editor' })} />
              <div className="space-y-3 text-[15px] font-black text-slate-700">标签分类
                <div className="flex gap-4">{['A', 'B', 'P'].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                    <input type="radio" checked={formData.tag === t} onChange={() => {
                      let defaultVal = formData.value;
                      if (t === 'P') defaultVal = 400;
                      if (t === 'B') defaultVal = 300;
                      if (t === 'A') defaultVal = 240;
                      setFormData({...formData, tag: t, category: t, value: defaultVal, price: defaultVal});
                    }} className="w-4 h-4 text-indigo-600" />
                    <span className={`px-3 py-1.5 rounded-xl text-[12px] font-black shadow-sm ${TAGS[t].badge}`}>{String(t)} 类别</span>
                  </label>
                ))}</div>
                {editingCourseId && <p className="text-[10px] font-bold text-indigo-500">类别调整从当前这堂课起生效，更早的课程保留原类别。</p>}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openLessonSettingsDialog}
                      disabled={!formData.title.trim()}
                      className={`text-[11px] flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg shadow-sm border ${!formData.title.trim() ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                    >
                      <Settings2 size={12}/>
                      课时设置
                    </button>
                    <button
                      onClick={handleAIGenerateNote}
                      disabled={isGeneratingNote || !formData.title}
                      className={`text-[11px] flex items-center gap-1 transition-colors px-2 py-1 rounded-lg shadow-sm border ${!formData.title ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 border-indigo-200 hover:opacity-80'}`}
                    >
                      <Sparkles size={12} className={isGeneratingNote ? "animate-spin" : "text-purple-400"}/>
                      {isGeneratingNote ? 'AI 撰写中...' : 'AI 智能扩写'}
                    </button>
                  </div>
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
            </fieldset>
            
            <div className="px-4 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap justify-between gap-3 font-black shrink-0">
              {editingCourseId ? <div className="flex gap-2">
                {courses.find(c=>c.id===editingCourseId)?.isFixed && <button disabled={syncing || !canEdit} onClick={() => performDelete(editingCourseId, false)} className="px-3 py-2.5 bg-white border border-orange-100 text-orange-600 rounded-2xl shadow-sm hover:bg-orange-50 transition-all text-[11px]">仅取消本周</button>}
                <button disabled={syncing || !canEdit} onClick={() => performDelete(editingCourseId, true)} className="px-3 py-2.5 bg-white border border-red-100 text-red-600 rounded-2xl shadow-sm hover:bg-red-50 transition-all text-[11px]">
                  {courses.find(c=>c.id===editingCourseId)?.isFixed && courses.find(c=>c.id===editingCourseId)?.baseWeekId !== viewWeekId ? '从此周起结束 (保留历史)' : '彻底删除'}
                </button>
              </div>: <div/>}
              <div className="flex gap-3">
                {editingCourseId && <button disabled={syncing || !canEdit} onClick={() => handleSave(true)} className="px-5 py-2.5 bg-white border border-indigo-100 text-indigo-600 rounded-2xl shadow-sm hover:bg-indigo-50 flex items-center gap-1 transition-all text-[12px] font-sans"><Copy size={16}/> 复制给本周</button>}
                <button disabled={syncing || !canEdit} onClick={() => handleSave(false)} className="px-8 py-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[13px]">{syncing ? '正在保存…' : '保存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLessonSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center z-[90] p-4 animate-in fade-in">
          <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Settings2 size={19} className="text-emerald-600"/> 课时编号设置</h2>
                <p className="text-[11px] font-bold text-slate-500 mt-1">{formData.title} · {DAYS[formData.colIndex]} {formData.startTime}</p>
              </div>
              <button onClick={() => setIsLessonSettingsModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-white hover:text-slate-600 transition-all"><X size={18}/></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <div className="text-[14px] font-black text-slate-700">显示课时编号</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-0.5">关闭后保留历史设置，但课程卡不显示编号</div>
                </div>
                <button
                  onClick={() => setLessonSettingsDraft(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative w-14 h-8 rounded-full transition-all ${lessonSettingsDraft.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${lessonSettingsDraft.enabled ? 'left-7' : 'left-1'}`}></span>
                </button>
              </div>

              <div className={`space-y-3 transition-opacity ${lessonSettingsDraft.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <label className="text-[13px] font-black text-slate-700">当前这堂课是第几课时</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLessonSettingsDraft(prev => ({ ...prev, lessonNumber: Math.max(1, prev.lessonNumber - 1) }))} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 text-xl font-black hover:bg-slate-200">−</button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={lessonSettingsDraft.lessonNumber}
                    onChange={e => setLessonSettingsDraft(prev => ({ ...prev, lessonNumber: Math.max(1, Math.round(Number(e.target.value) || 1)) }))}
                    className="flex-1 h-12 rounded-2xl border-2 border-emerald-100 text-center text-lg font-black text-emerald-700 outline-none focus:border-emerald-400"
                  />
                  <button onClick={() => setLessonSettingsDraft(prev => ({ ...prev, lessonNumber: prev.lessonNumber + 1 }))} className="h-12 px-4 rounded-2xl bg-emerald-50 text-emerald-700 text-[12px] font-black hover:bg-emerald-100 flex items-center gap-1"><Plus size={15}/> 新增一节</button>
                </div>
                <p className="text-[11px] font-bold text-slate-400 leading-relaxed">保存后从当前这堂课开始按此数字计算，之前的课程编号保持不变，后续课程自动递增。</p>
              </div>

              {lessonSettingsStatus && <div className="text-center text-[12px] font-black text-emerald-600 bg-emerald-50 rounded-xl py-2 border border-emerald-100">{lessonSettingsStatus}</div>}
            </div>

            <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex flex-col gap-2.5">
              {lessonSettingsDraft.enabled && (
                <button onClick={() => saveLessonSettingsFromCurrentCourse(1)} className="w-full py-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 font-black hover:bg-amber-100 transition-all flex items-center justify-center gap-2">
                  <RefreshCw size={15}/> 从当前这堂重置为第1课时
                </button>
              )}
              <button onClick={() => saveLessonSettingsFromCurrentCourse()} className={`w-full py-3 rounded-2xl font-black transition-all ${lessonSettingsDraft.enabled ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100' : 'bg-slate-700 text-white hover:bg-slate-800'}`}>
                {lessonSettingsDraft.enabled ? `保存：当前为第${lessonSettingsDraft.lessonNumber}课时` : '保存并关闭课时编号'}
              </button>
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
