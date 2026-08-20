import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveLanguage } from './language';
import type { Language } from './language';

export type { Language } from './language';

const LANGUAGE_STORAGE_KEY = 'sensei-panel-language';

const translations = {
  en: {
    app: {
      homeLabel: 'Sensei home',
      subtitle: 'Live learning',
      wait: 'Please wait…',
      signOut: 'Sign out',
      signIn: 'Sign in with Google',
      languageToggle: 'Switch to Chinese',
      pageTitle: 'Sensei · Live learning',
    },
    home: {
      publicLoadError: 'Public sessions are unavailable right now. Try again later, or enter a sessionId directly.',
      privateLoadError: 'Your private sessions are unavailable right now. Refresh the page to try again.',
      title: 'Live learning',
      intro: 'Follow terminal output, Sensei’s observations, and learner feedback.',
      sessionLabel: 'Have a sessionId?',
      sessionPlaceholder: 'Enter sessionId',
      openSession: 'Open session',
      recentSessions: 'Recent sessions',
      noSessions: 'No visible sessions yet',
      noSessionsDetail: 'Run `sensei start` to create one, or sign in to see private sessions linked to your email.',
      unnamedGoal: 'Untitled learning goal',
      justNow: 'Just now',
      loadingSessions: 'Loading sessions',
      sessionCount: (count: number) => `${count} ${count === 1 ? 'session' : 'sessions'}`,
      outputCount: (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`,
    },
    state: {
      active: 'Active',
      ended: 'Ended',
      compiled: 'Compiled',
    },
    status: {
      flowing: 'Flowing',
      exploring: 'Exploring',
      stuck: 'Possibly stuck',
      idle: 'Paused',
      milestone: 'Milestone reached',
      done: 'Learning complete',
    },
    session: {
      connectingTitle: 'Connecting to session',
      connectingDetail: 'Connecting to the Firestore realtime stream…',
      permissionTitle: 'This session is restricted',
      wrongOwner: 'The current account does not own this session. Switch accounts, or ask its owner to make it public.',
      signInDetail: 'Sign in with the Google account linked to this session to view it.',
      missingTitle: 'Session not found',
      unavailableTitle: 'Unable to connect',
      missingDetail: 'Check that the sessionId is complete, or return to the session list and choose another session.',
      unavailableDetail: 'The network or Firestore is temporarily unavailable. Refresh the page to try again.',
      allSessions: 'All sessions',
      liveTab: 'Live session',
      tutorialTab: 'Compiled tutorial',
      ready: 'Ready',
      tabList: 'Session content',
      reconnecting: 'Some realtime data disconnected. Waiting for Firestore to reconnect.',
      feedbackSent: 'Feedback sent',
      answerSent: 'Answer sent',
      markdownCopied: 'Markdown copied',
      tutorialReady: 'Tutorial ready',
      sessionEnded: 'Session ended',
      observing: 'Observing',
      observingStatus: (status: string) => `Observing: ${status}`,
      terminalStream: 'Terminal stream',
      live: 'Live',
      followOutput: 'Following output',
      resumeFollowing: 'Resume following',
      waitingOutput: 'Waiting for terminal output…',
      noOutput: 'This session has no terminal output',
      learner: 'You',
      questionsTitle: 'Sensei is asking',
      answerReachedTerminal: 'Answer sent to the terminal',
      answerPlaceholder: 'Enter your answer',
      answerLabel: (question: string) => `Answer: ${question}`,
      send: 'Send',
      hintsTitle: 'Sensei hints',
      noHints: 'No hints yet. Keep exploring.',
      entryNumber: (sequence: number) => `Entry ${sequence}`,
      hintNudge: 'Nudge',
      hintHint: 'Hint',
      hintExplain: 'Explanation',
      hintFix: 'Suggested fix',
      notesTitle: 'Notes and milestones',
      noNotes: 'Sensei has not recorded any key moments yet.',
      profileTitle: 'Learner profile',
      noProfile: 'The profile will take shape as feedback arrives.',
      level: 'Level',
      verbosity: 'Detail',
      style: 'Style',
      unknown: 'Pending',
      balanced: 'Balanced',
      adaptive: 'Adaptive',
      knownConcepts: 'Understands',
      weakSpots: 'Needs practice',
      tutorialTitle: 'Learning tutorial',
      copyMarkdown: 'Copy Markdown',
      feedbackTitle: 'How was this guidance?',
      sending: 'Sending…',
      helpful: 'Helpful',
      tooBasic: 'Too basic',
      confusing: 'Confusing',
      justTellMe: 'Just tell me',
      letMeTry: 'Let me try',
      backToSessions: 'Back to sessions',
      outputCount: (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`,
    },
  },
  zh: {
    app: {
      homeLabel: 'Sensei 首页',
      subtitle: '学习现场',
      wait: '请稍候…',
      signOut: '退出登录',
      signIn: '使用 Google 登录',
      languageToggle: '切换到英文',
      pageTitle: 'Sensei · 学习现场',
    },
    home: {
      publicLoadError: '公开会话暂时无法加载。请稍后重试，或直接输入 sessionId。',
      privateLoadError: '你的私有会话暂时无法加载，请刷新后重试。',
      title: '学习现场',
      intro: '查看终端输出、Sensei 的判断与反馈记录。',
      sessionLabel: '已有 sessionId',
      sessionPlaceholder: '输入 sessionId',
      openSession: '打开会话',
      recentSessions: '最近会话',
      noSessions: '还没有可见会话',
      noSessionsDetail: '运行 `sensei start` 创建会话，或登录查看与你邮箱关联的私有会话。',
      unnamedGoal: '未命名学习目标',
      justNow: '刚刚',
      loadingSessions: '正在加载会话',
      sessionCount: (count: number) => `${count} 个`,
      outputCount: (count: number) => `${count} 条`,
    },
    state: {
      active: '进行中',
      ended: '已结束',
      compiled: '已编译',
    },
    status: {
      flowing: '进展顺畅',
      exploring: '正在探索',
      stuck: '可能卡住',
      idle: '暂时停顿',
      milestone: '到达里程碑',
      done: '学习完成',
    },
    session: {
      connectingTitle: '正在接入会话',
      connectingDetail: '连接 Firestore 实时数据流…',
      permissionTitle: '这个会话需要权限',
      wrongOwner: '当前账号不是该会话的所有者。请切换账号，或让创建者将会话设为公开。',
      signInDetail: '登录与会话关联的 Google 账号后即可查看。',
      missingTitle: '没有找到这个会话',
      unavailableTitle: '暂时无法连接',
      missingDetail: '检查 sessionId 是否完整，或返回会话列表重新选择。',
      unavailableDetail: '网络或 Firestore 暂时不可用，请稍后刷新。',
      allSessions: '所有会话',
      liveTab: '实时现场',
      tutorialTab: '编译教程',
      ready: '已生成',
      tabList: '会话内容',
      reconnecting: '部分实时数据连接已中断，正在等待 Firestore 重连。',
      feedbackSent: '反馈已发送',
      answerSent: '回答已发送',
      markdownCopied: 'Markdown 已复制',
      tutorialReady: '教程已生成',
      sessionEnded: '会话已结束',
      observing: '正在观察',
      observingStatus: (status: string) => `正在观察：${status}`,
      terminalStream: '终端流',
      live: '实时',
      followOutput: '跟随输出',
      resumeFollowing: '继续跟随',
      waitingOutput: '等待终端输出…',
      noOutput: '本次会话没有终端输出',
      learner: '你',
      questionsTitle: 'Sensei 在问',
      answerReachedTerminal: '回答已进入终端',
      answerPlaceholder: '输入你的回答',
      answerLabel: (question: string) => `回答：${question}`,
      send: '发送',
      hintsTitle: 'Sensei 提示',
      noHints: '暂时没有提示，继续探索。',
      entryNumber: (sequence: number) => `第 ${sequence} 条`,
      hintNudge: '轻推一下',
      hintHint: '提示',
      hintExplain: '解释',
      hintFix: '修复建议',
      notesTitle: '笔记与里程碑',
      noNotes: 'Sensei 还没有记下关键节点。',
      profileTitle: '当前画像',
      noProfile: '画像会随反馈逐步形成。',
      level: '水平',
      verbosity: '详细度',
      style: '风格',
      unknown: '待判断',
      balanced: '适中',
      adaptive: '自适应',
      knownConcepts: '已掌握',
      weakSpots: '待加强',
      tutorialTitle: '学习教程',
      copyMarkdown: '复制 Markdown',
      feedbackTitle: '这一步讲得怎样？',
      sending: '发送中…',
      helpful: '有帮助',
      tooBasic: '太基础',
      confusing: '没看懂',
      justTellMe: '直接告诉我',
      letMeTry: '让我自己试',
      backToSessions: '返回会话列表',
      outputCount: (count: number) => `${count} 条`,
    },
  },
} as const;

export type Copy = (typeof translations)[Language];

interface I18nValue {
  language: Language;
  copy: Copy;
  toggleLanguage: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function getInitialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in privacy-restricted contexts.
  }
  return resolveLanguage(saved, window.navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const copy = translations[language];

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = copy.app.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      language === 'zh' ? 'Sensei 学习会话实时面板' : 'Sensei live learning session panel',
    );
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The toggle still works for this page even when persistence is blocked.
    }
  }, [copy.app.pageTitle, language]);

  function toggleLanguage() {
    setLanguage((current) => (current === 'en' ? 'zh' : 'en'));
  }

  return <I18nContext.Provider value={{ language, copy, toggleLanguage }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
