import React, { useState, useEffect, useMemo, useRef } from 'react';
import { analyzeProposal } from './services/geminiService';
import { useGoogleLogin } from '@react-oauth/google';

// --- Types ---
interface User {
  id: string;
  name: string;
  role: 'student' | 'admin';
  class?: string;
  email?: string;
}

interface Signature {
  userId: string;
  userName: string;
  timestamp: string;
}

interface Proposal {
  id: number;
  title: string;
  content: string;
  category: string;
  status: '受付中' | '検討中' | '先生と調整中' | '対応済';
  adminResponse: string;
  timestamp: string;
  signatures: Signature[];
}

interface NewsItem {
  id: number;
  title: string;
  content: string;
  timestamp: string;
  author: string;
}

// --- Constants ---
const STATUS_STEPS = ['受付中', '検討中', '先生と調整中', '対応済'];
const CATEGORIES = ['校則', '設備・環境', '授業', 'その他'];

// --- Helper Components ---

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    '受付中': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    '検討中': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    '先生と調整中': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    '対応済': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

// --- Main Component ---

const App: React.FC = () => {
  // State
  const [user, setUser] = useState<User | null>(null);
  // view state expanded to include 'proposals' and 'status'
  const [view, setView] = useState<'home' | 'proposals' | 'status' | 'login' | 'register'>('home');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Filters & Search
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'signatures'>('newest');

  // Modals
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);

  // Forms
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', class: '' });
  
  // Post Form State
  // Removed explicit category selection from user input, default to empty, filled by AI
  const [postForm, setPostForm] = useState({ title: '', content: '', category: '' });
  
  // Enhanced AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<{ 
      advice: string; 
      loading: boolean;
      detectedCategory?: string;
      detectedTags?: string[];
  } | null>(null);
  const [isAIApproved, setIsAIApproved] = useState(false); 

  const [newsForm, setNewsForm] = useState({ title: '', content: '' });

  // Init Data
  useEffect(() => {
    const savedProposals = localStorage.getItem('schoolProposals');
    if (savedProposals) setProposals(JSON.parse(savedProposals));
    else {
      // Seed data if empty
      const seeds: Proposal[] = [
        {
          id: 1,
          title: '靴下の色にグレーを追加して欲しい',
          content: '靴下の色は黒・白・紺のみですが、友達の学校ではグレーも良いそうです。なぜグレーがダメなのかわかりません。グレーの追加をお願いします。 #靴下',
          category: '校則',
          status: '先生と調整中',
          adminResponse: '生徒総会での議論を経て、職員会議に提案中です。',
          timestamp: new Date().toISOString(),
          signatures: []
        },
        {
          id: 2,
          title: '食堂のメニューに麺類を追加してほしい',
          content: '今はパンとおにぎりしかありません。温かい麺類（うどんやラーメン）が食べたいです。 #食堂 #ランチ #改善希望',
          category: '設備・環境',
          status: '受付中',
          adminResponse: '',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          signatures: [{ userId: 'demo', userName: 'デモ太郎', timestamp: new Date().toISOString() }]
        },
        {
          id: 3,
          title: '図書室の開館時間を延長してください',
          content: '放課後、部活の前にもう少し勉強したいのですが、すぐに閉まってしまいます。あと30分延長できませんか？',
          category: '設備・環境',
          status: '対応済',
          adminResponse: '試験期間中のみ、18:00まで延長することが決定しました。',
          timestamp: new Date(Date.now() - 172800000).toISOString(),
          signatures: []
        }
      ];
      setProposals(seeds);
      localStorage.setItem('schoolProposals', JSON.stringify(seeds));
    }

    const savedNews = localStorage.getItem('schoolNews');
    if (savedNews) setNews(JSON.parse(savedNews));
    else {
        const seedNews: NewsItem[] = [
            { id: 1, title: 'アプリ「ProPoSal」運用開始！', content: '新しいデジタル目安箱がスタートしました。', timestamp: '2025-11-22T10:00:00.000Z', author: '生徒会' }
        ];
        setNews(seedNews);
        localStorage.setItem('schoolNews', JSON.stringify(seedNews));
    }

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Google Login Logic
  const handleGoogleLoginSuccess = async (tokenResponse: any) => {
    try {
      // Fetch user details from Google UserInfo endpoint
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });
      const userInfo = await res.json();
      
      setUser({
        id: userInfo.email, // Use email as ID per request
        email: userInfo.email,
        name: userInfo.name, // Use Google account name
        role: 'student', // Default role
        class: '未設定',
      });
      setView('home');
    } catch (error) {
      console.error('Google Login Error:', error);
      alert('Googleログインに失敗しました。詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const loginWithGoogle = useGoogleLogin({
    onSuccess: handleGoogleLoginSuccess,
    onError: (errorResponse) => {
        console.error('Google Login Failed:', errorResponse);
        alert(`Googleログインに失敗しました。\n\n【開発者の方へ】\nGoogle Cloud Consoleの「承認済みの JavaScript オリジン」に、現在のURL (${window.location.origin}) が登録されているか確認してください。`);
    },
  });

  // Handlers
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulation
    if (loginForm.email) {
      const isAdmin = loginForm.email.includes('admin') || loginForm.email === 'student-council';
      setUser({
        id: loginForm.email,
        email: loginForm.email,
        name: isAdmin ? '生徒会' : '山田 太郎', // Demo name
        role: isAdmin ? 'admin' : 'student',
        class: '3-A'
      });
      setView('home');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setUser({
        id: registerForm.email,
        email: registerForm.email,
        name: registerForm.name,
        role: 'student',
        class: registerForm.class
    });
    setView('home');
  };

  const handleInputChange = (field: keyof typeof postForm, value: string) => {
      setPostForm(prev => ({ ...prev, [field]: value }));
      // Reset approval when content changes to force re-check
      setIsAIApproved(false);
      setAiAnalysis(null);
  };

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAIApproved) return;

    // Use AI detected category if available, otherwise default to "その他"
    const finalCategory = postForm.category || aiAnalysis?.detectedCategory || "その他";

    const newId = proposals.length > 0 ? Math.max(...proposals.map(p => p.id)) + 1 : 1;
    const newProposal: Proposal = {
      id: newId,
      title: postForm.title,
      content: postForm.content,
      category: finalCategory,
      status: '受付中',
      adminResponse: '',
      timestamp: new Date().toISOString(),
      signatures: []
    };
    const updated = [newProposal, ...proposals];
    setProposals(updated);
    localStorage.setItem('schoolProposals', JSON.stringify(updated));
    setPostForm({ title: '', content: '', category: '' });
    setAiAnalysis(null);
    setIsAIApproved(false);
    setIsPostModalOpen(false);
  };

  const handleAIAnalyze = async () => {
    if (!postForm.title || !postForm.content) {
        alert("タイトルと内容を入力してからAIチェックを実行してください。");
        return;
    }
    setAiAnalysis({ advice: '', loading: true });
    setIsAIApproved(false);

    // AI analyzes without user-provided category
    const result = await analyzeProposal(postForm.title, postForm.content);
    
    let displayAdvice = result.advice;
    if (!displayAdvice) {
        displayAdvice = result.isAppropriate 
            ? 'チェックが完了しました。問題ありません。' 
            : '内容に修正が必要な点が見つかりました。ガイドラインに沿って見直してください。';
    }

    setAiAnalysis({ 
        advice: displayAdvice, 
        loading: false,
        detectedCategory: result.category,
        detectedTags: result.tags
    });
    setIsAIApproved(result.isAppropriate);

    if (result.isAppropriate) {
        // Auto-update form with refined content and set category
        setPostForm(prev => ({ 
            ...prev, 
            title: result.refinedTitle || prev.title,
            content: result.refinedContent || prev.content,
            category: result.category
        }));
    }
  };

  const handleNewsSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const newId = news.length > 0 ? Math.max(...news.map(n => n.id)) + 1 : 1;
      const newItem: NewsItem = {
          id: newId,
          title: newsForm.title,
          content: newsForm.content,
          timestamp: new Date().toISOString(),
          author: user?.name || 'Admin'
      };
      const updated = [newItem, ...news];
      setNews(updated);
      localStorage.setItem('schoolNews', JSON.stringify(updated));
      setNewsForm({ title: '', content: '' });
      setIsNewsModalOpen(false);
  }

  const toggleSignature = (proposalId: number) => {
    if (!user) {
      if(confirm('賛同するにはログインが必要です。ログイン画面に移動しますか？')) {
        setView('login');
      }
      return;
    }

    const updated = proposals.map(p => {
      if (p.id === proposalId) {
        const signedIndex = p.signatures.findIndex(s => s.userId === user.id);
        if (signedIndex >= 0) {
          // Unsign
          const newSigs = [...p.signatures];
          newSigs.splice(signedIndex, 1);
          return { ...p, signatures: newSigs };
        } else {
          // Sign
          return { ...p, signatures: [...p.signatures, { userId: user.id, userName: user.name, timestamp: new Date().toISOString() }] };
        }
      }
      return p;
    });
    setProposals(updated);
    localStorage.setItem('schoolProposals', JSON.stringify(updated));
  };

  const updateAdminStatus = (proposalId: number, newStatus: Proposal['status'], response: string) => {
      const updated = proposals.map(p => {
          if (p.id === proposalId) {
              return { ...p, status: newStatus, adminResponse: response };
          }
          return p;
      });
      setProposals(updated);
      localStorage.setItem('schoolProposals', JSON.stringify(updated));
  };

  // Derived Data
  const filteredProposals = useMemo(() => {
    let res = [...proposals];
    if (categoryFilter !== 'all') {
      res = res.filter(p => p.category === categoryFilter);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      res = res.filter(p => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower));
    }
    if (sortOrder === 'newest') {
      res.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else {
      res.sort((a, b) => b.signatures.length - a.signatures.length);
    }
    return res;
  }, [proposals, categoryFilter, searchTerm, sortOrder]);

  const trendingTags = useMemo(() => {
      const counts: Record<string, number> = {};
      proposals.forEach(p => {
          const tags = p.content.match(/([#＃][^\s　]+)/g);
          if (tags) {
              tags.forEach(t => counts[t] = (counts[t] || 0) + 1);
          }
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [proposals]);

  const selectedProposal = useMemo(() => 
    proposals.find(p => p.id === selectedProposalId), 
    [proposals, selectedProposalId]
  );

  // --- Render Sections ---

  const renderSidebar = () => (
    <aside className="bg-primary-dark text-white p-5 flex flex-col h-screen sticky top-0 z-50 shadow-xl overflow-y-auto">
      <div className="flex items-center gap-3 mb-10">
        <span className="material-icons-round text-accent text-4xl">school</span>
        <h1 className="text-2xl font-extrabold tracking-wide">ProPoSal</h1>
      </div>

      <nav className="flex flex-col gap-2">
        <button 
          onClick={() => setView('home')} 
          className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-all ${view === 'home' ? 'bg-white/20 border-l-4 border-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
        >
          <span className="material-icons-round">home</span>
          ホーム
        </button>
        <button 
          onClick={() => setView('proposals')} 
          className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-all ${view === 'proposals' ? 'bg-white/20 border-l-4 border-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
        >
          <span className="material-icons-round">campaign</span>
          意見ボックス
        </button>
        <button 
          onClick={() => setView('status')} 
          className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-all ${view === 'status' ? 'bg-white/20 border-l-4 border-accent' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
        >
          <span className="material-icons-round">trending_up</span>
          進捗・ステータス
        </button>
        <button 
          onClick={toggleTheme} 
          className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/10 text-white/70 hover:text-white font-bold transition-all"
        >
          <span className="material-icons-round">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
          テーマ切替
        </button>
      </nav>

      {/* Action Buttons */}
      <div className="space-y-4 mt-8">
        <button 
            onClick={() => setView('proposals')}
            className="w-full bg-accent text-primary-dark font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 hover:-translate-y-1 transition-transform"
        >
            <span>意見を見に行く</span>
            <span className="material-icons-round">arrow_forward</span>
        </button>

        <button 
            onClick={() => setIsPostModalOpen(true)}
            className="w-full bg-white text-primary-dark font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 hover:-translate-y-1 transition-transform border-2 border-accent"
        >
            <span>意見を投稿する</span>
            <span className="material-icons-round">edit</span>
        </button>
      </div>

      <div className="mt-auto pt-6 border-t border-white/20">
        {user ? (
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white text-primary-dark rounded-full flex items-center justify-center font-bold text-lg">
               {user.name.charAt(0)}
             </div>
             <div className="flex-1 min-w-0">
               <div className="font-bold truncate">{user.name}</div>
               <div className="text-xs text-white/70 truncate">{user.class || '管理者'}</div>
             </div>
             <button onClick={() => setUser(null)} className="text-white/70 hover:text-white">
               <span className="material-icons-round">logout</span>
             </button>
           </div>
        ) : (
          <button 
            onClick={() => loginWithGoogle()}
            className="w-full border border-white/30 bg-white/10 rounded-lg py-2 flex items-center justify-center gap-2 hover:bg-white/20 transition-colors text-white font-bold shadow-sm"
          >
            <span className="material-icons-round">login</span>
            Googleアカウントでログイン
          </button>
        )}
      </div>
    </aside>
  );

  const renderHomeView = () => (
    <div className="p-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary to-primary-light rounded-2xl p-8 text-white shadow-xl mb-8 text-center">
        <h2 className="text-3xl font-extrabold mb-4">テクノロジーで、<br/>学校は変えられる。</h2>
        <p className="text-lg opacity-90">ProPoSalは、生徒一人ひとりの意見を可視化し、<br className="hidden md:inline"/>民主的な学校づくりを実現するプラットフォームです。</p>
      </div>

      {/* Rules */}
      <section className="mb-10">
        <h3 className="text-sm font-bold text-gray-500 mb-4 border-b pb-2">💡 仕組みとルール</h3>
        <div className="grid gap-4">
          <div className="bg-bg-card dark:bg-bg-cardDark p-6 rounded-xl border-l-8 border-accent shadow-sm hover:translate-x-1 transition-transform">
            <h4 className="text-xl font-bold text-primary dark:text-primary-light mb-2 flex items-center gap-2">
              <span className="material-icons-round">lock</span> 1. 完全匿名での投稿
            </h4>
            <p className="text-gray-600 dark:text-gray-300">意見を投稿する際、誰が書いたかは完全に隠されます。安心して本音を投稿してください。</p>
          </div>
          <div className="bg-bg-card dark:bg-bg-cardDark p-6 rounded-xl border-l-8 border-accent shadow-sm hover:translate-x-1 transition-transform">
            <h4 className="text-xl font-bold text-primary dark:text-primary-light mb-2 flex items-center gap-2">
              <span className="material-icons-round">verified_user</span> 2. 賛同は「実名」で
            </h4>
            <p className="text-gray-600 dark:text-gray-300">投稿された意見に「いいね（賛同）」する時はログインが必要です。信頼性を担保し、学校側への説得力を高めます。</p>
          </div>
           <div className="bg-bg-card dark:bg-bg-cardDark p-6 rounded-xl border-l-8 border-accent shadow-sm hover:translate-x-1 transition-transform">
            <h4 className="text-xl font-bold text-primary dark:text-primary-light mb-2 flex items-center gap-2">
              <span className="material-icons-round">visibility</span> 3. 透明なプロセス
            </h4>
            <p className="text-gray-600 dark:text-gray-300">集まった賛同数に応じて、ステータスが「受付中→検討中→対応済」と変化します。</p>
          </div>
        </div>
        
        <div className="text-center mt-12">
            <button 
              onClick={() => setView('proposals')}
              className="bg-primary hover:bg-primary-light text-white font-bold py-3 px-12 rounded-full shadow-lg hover:scale-105 transition-all flex items-center gap-2 mx-auto"
            >
                <span>意見一覧を見る</span>
                <span className="material-icons-round">arrow_forward</span>
            </button>
        </div>
      </section>
    </div>
  );

  const renderProposalsView = () => (
    <div className="p-6">
      {/* Proposals Feed Header */}
      <div className="flex justify-between items-center mb-6">
         <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary">campaign</span> みんなの意見
         </h2>
         <div className="flex gap-2 items-center">
           <div className="flex gap-1 mr-4">
             <button 
              onClick={() => setSortOrder('newest')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${sortOrder === 'newest' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
             >
               新着順
             </button>
             <button 
              onClick={() => setSortOrder('signatures')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${sortOrder === 'signatures' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
             >
               賛同数順
             </button>
           </div>
           
           <button 
            onClick={() => setIsPostModalOpen(true)}
            className="hidden md:flex bg-accent text-primary-dark px-6 py-3 rounded-full font-extrabold shadow-md items-center gap-2 hover:scale-105 transition-transform"
           >
             <span className="material-icons-round">edit</span>
             意見を投稿する
           </button>
         </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filteredProposals.length === 0 ? (
            <div className="text-center py-10 text-gray-400">意見がまだありません</div>
        ) : (
            filteredProposals.map(proposal => (
                <div 
                    key={proposal.id}
                    onClick={() => setSelectedProposalId(proposal.id)}
                    className="bg-bg-card dark:bg-bg-cardDark p-6 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all border border-transparent hover:border-primary border-t-4 border-t-primary relative group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 group-hover:text-primary transition-colors">{proposal.title}</h3>
                            <div className="text-xs text-gray-500">
                                {new Date(proposal.timestamp).toLocaleDateString('ja-JP')} · {proposal.category}
                            </div>
                        </div>
                        <StatusBadge status={proposal.status} />
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 line-clamp-2 mb-4 whitespace-pre-wrap leading-relaxed">
                        {proposal.content}
                    </p>
                    <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border ${proposal.signatures.length > 0 ? 'bg-pink-50 text-pink-500 border-pink-200' : 'bg-gray-50 text-gray-500 border-gray-200'} dark:bg-transparent`}>
                            <span className="material-icons-round text-sm">thumb_up</span>
                            {proposal.signatures.length} 賛同
                        </div>
                        <span className="material-icons-round text-gray-300 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                    </div>
                </div>
            ))
        )}
      </div>

      {/* Mobile FAB */}
      <button 
        onClick={() => setIsPostModalOpen(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-accent text-primary-dark rounded-full shadow-xl flex items-center justify-center z-50 hover:scale-110 transition-transform"
      >
        <span className="material-icons-round text-2xl">edit</span>
      </button>
    </div>
  );

  const renderStatusView = () => (
    <div className="p-6 h-full flex flex-col">
       <div className="mb-4">
          <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary">trending_up</span> 進捗・ステータス
          </h2>
          <p className="text-sm text-gray-500">みんなの意見がどのように実現に向かっているかを確認できます。</p>
       </div>
       
       <div className="flex-1 overflow-x-auto pb-4">
         <div className="flex gap-4 h-full min-w-max">
            {STATUS_STEPS.map(status => {
               const items = proposals.filter(p => p.status === status);
               return (
                 <div key={status} className="w-80 bg-gray-300 dark:bg-white/10 rounded-xl p-3 flex flex-col h-full shadow-inner">
                    <div className="flex items-center justify-between mb-3 px-2">
                       <StatusBadge status={status} />
                       <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{items.length}件</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                      {items.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs">なし</div>
                      ) : (
                        items.map(p => (
                          <div 
                            key={p.id}
                            onClick={() => setSelectedProposalId(p.id)}
                            className="bg-white dark:bg-bg-cardDark p-3 rounded-lg shadow-sm border border-transparent hover:border-primary cursor-pointer transition-all"
                          >
                             <div className="text-xs text-gray-400 mb-1">{p.category}</div>
                             <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-2 line-clamp-2">{p.title}</h4>
                             <div className="flex items-center gap-1 text-xs text-gray-500">
                                <span className="material-icons-round text-[10px]">thumb_up</span>
                                {p.signatures.length}
                             </div>
                          </div>
                        ))
                      )}
                    </div>
                 </div>
               );
            })}
         </div>
       </div>
    </div>
  );

  // --- Render Logic (Login/Register vs App) ---

  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-white p-6 text-center">
            <h1 className="text-2xl font-bold text-primary flex items-center justify-center gap-2 mb-2">
              <span className="material-icons-round text-3xl">auto_awesome</span>
              やる気ペン
            </h1>
            <p className="text-gray-500 text-sm">学習モチベーション改革プロジェクト</p>
          </div>
          
          <div className="flex border-b">
            <button 
              className={`flex-1 py-3 font-bold text-sm ${view === 'login' ? 'text-black border-b-2 border-primary' : 'text-gray-400 bg-gray-50'}`}
              onClick={() => setView('login')}
            >
              ログイン
            </button>
            <button 
              className={`flex-1 py-3 font-bold text-sm ${view === 'register' ? 'text-black border-b-2 border-primary' : 'text-gray-400 bg-gray-50'}`}
              onClick={() => setView('register')}
            >
              新規登録
            </button>
          </div>

          <div className="p-8">
            {view === 'login' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">➜ ログイン</h2>
                  <p className="text-gray-500 text-sm mb-4">メールアドレスとパスワードを入力してください</p>
                </div>
                
                {/* Google Login Button */}
                <button 
                  onClick={() => loginWithGoogle()}
                  className="w-full bg-white text-gray-700 font-bold py-3 rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                  Googleアカウントでログイン
                </button>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">または</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">メールアドレス</label>
                    <input 
                      type="email" 
                      className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                      placeholder="example@toda-jhs.ed.jp"
                      value={loginForm.email}
                      onChange={e => setLoginForm({...loginForm, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">パスワード</label>
                    <input 
                      type="password" 
                      className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                      value={loginForm.password}
                      onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                      required
                    />
                  </div>
                  <button type="submit" className="w-full bg-[#111] text-white font-bold py-3 rounded-lg hover:opacity-90 transition-opacity">
                    メールアドレスでログイン
                  </button>
                </form>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-6">
                 <div>
                  <h2 className="text-xl font-bold mb-1">➜ 新規登録</h2>
                  <p className="text-gray-500 text-sm mb-4">アカウント情報を入力してください</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">本名</label>
                        <input 
                            type="text" 
                            className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                            placeholder="山田 太郎"
                            value={registerForm.name}
                            onChange={e => setRegisterForm({...registerForm, name: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">メールアドレス</label>
                        <input 
                            type="email" 
                            className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                            placeholder="example@toda-jhs.ed.jp"
                            value={registerForm.email}
                            onChange={e => setRegisterForm({...registerForm, email: e.target.value})}
                            required
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">クラス</label>
                        <input 
                            type="text" 
                            className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                            placeholder="3-A"
                            value={registerForm.class}
                            onChange={e => setRegisterForm({...registerForm, class: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">パスワード</label>
                        <input 
                            type="password" 
                            className="w-full bg-gray-100 border-none rounded-lg px-4 py-3 text-black focus:ring-2 focus:ring-primary outline-none"
                            value={registerForm.password}
                            onChange={e => setRegisterForm({...registerForm, password: e.target.value})}
                            required
                        />
                    </div>
                </div>
                <button type="submit" className="w-full bg-[#111] text-white font-bold py-3 rounded-lg hover:opacity-90 transition-opacity">
                  アカウント作成
                </button>
              </form>
            )}
          </div>
          <div className="bg-gray-50 py-4 text-center">
              <button onClick={() => setView('home')} className="text-sm text-gray-500 hover:text-primary flex items-center justify-center gap-1 w-full">
                  <span className="material-icons-round text-base">visibility</span>
                  ProPoSalを見学する
              </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Layout ---

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_300px] font-sans">
      
      {/* Left Sidebar */}
      {renderSidebar()}

      {/* Main Content */}
      <main className="bg-bg-body dark:bg-bg-dark border-r border-gray-200 dark:border-gray-800 transition-colors duration-300 h-screen overflow-y-auto">
        <header className="sticky top-0 bg-bg-body/95 dark:bg-bg-dark/95 backdrop-blur z-40 px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-end">
          <h2 className="text-2xl font-bold dark:text-white hidden md:block">
             {view === 'home' && 'ようこそ'}
             {view === 'proposals' && '意見ボックス'}
             {view === 'status' && '進捗状況'}
          </h2>
        </header>

        {view === 'home' && renderHomeView()}
        {view === 'proposals' && renderProposalsView()}
        {view === 'status' && renderStatusView()}
      </main>

      {/* Right Sidebar */}
      <aside className="bg-bg-body dark:bg-bg-dark hidden lg:block p-5 h-screen sticky top-0 overflow-y-auto">
        {/* Search */}
        <div className="bg-white dark:bg-bg-cardDark rounded-full px-4 py-2 shadow-sm border-2 border-primary-light/30 flex items-center gap-2 mb-6">
            <span className="material-icons-round text-primary-light">search</span>
            <input 
                type="text" 
                placeholder="キーワード・タグで検索..." 
                className="bg-transparent outline-none w-full text-sm dark:text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>

        {/* News Widget */}
        <div className="bg-bg-card dark:bg-bg-cardDark rounded-xl p-5 shadow-sm mb-6">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">
                <h3 className="text-primary font-bold text-sm">📌 学校からのお知らせ</h3>
                {user?.role === 'admin' && (
                    <button onClick={() => setIsNewsModalOpen(true)} className="text-xs text-primary hover:underline">＋追加</button>
                )}
            </div>
            <div className="space-y-3">
                {news.map(item => (
                    <div key={item.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 p-2 rounded transition-colors" onClick={() => alert(`${item.title}\n\n${item.content}`)}>
                        <div className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleDateString()}</div>
                        <div className="text-sm font-bold dark:text-white line-clamp-2">{item.title}</div>
                    </div>
                ))}
            </div>
        </div>

        {/* Trending Widget */}
        <div className="bg-bg-card dark:bg-bg-cardDark rounded-xl p-5 shadow-sm mb-6">
            <h3 className="text-primary font-bold text-sm border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">🔥 急上昇ワード</h3>
            <div className="flex flex-wrap gap-2">
                {trendingTags.length > 0 ? trendingTags.map(([tag, count]) => (
                    <button 
                        key={tag}
                        onClick={() => {
                            setSearchTerm(tag);
                            if (view !== 'proposals') setView('proposals');
                        }}
                        className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-xs px-3 py-1 rounded-full text-gray-700 dark:text-gray-300 transition-colors"
                    >
                        {tag} <span className="text-gray-400">({count})</span>
                    </button>
                )) : <span className="text-xs text-gray-400">まだタグがありません</span>}
            </div>
        </div>

        {/* Categories */}
        <div className="bg-bg-card dark:bg-bg-cardDark rounded-xl p-5 shadow-sm">
             <h3 className="text-primary font-bold text-sm border-b border-gray-100 dark:border-gray-700 pb-2 mb-4">📂 カテゴリー絞り込み</h3>
             <div className="flex flex-wrap gap-2">
                 <button 
                    onClick={() => {
                        setCategoryFilter('all');
                        if (view !== 'proposals') setView('proposals');
                    }} 
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${categoryFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                 >
                    全て
                 </button>
                 {CATEGORIES.map(cat => (
                     <button 
                        key={cat} 
                        onClick={() => {
                            setCategoryFilter(cat);
                            if (view !== 'proposals') setView('proposals');
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${categoryFilter === cat ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                    >
                         {cat}
                     </button>
                 ))}
             </div>
        </div>
      </aside>

      {/* --- Modals --- */}

      {/* Post Modal */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-bg-cardDark w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="bg-primary text-white p-4 rounded-t-2xl flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2"><span className="material-icons-round">edit</span> 意見を投稿する</h2>
                    <button onClick={() => setIsPostModalOpen(false)} className="text-white hover:bg-white/20 rounded-full p-1"><span className="material-icons-round">close</span></button>
                </div>
                <form onSubmit={handlePostSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-start gap-2">
                        <span className="material-icons-round text-yellow-600">info</span>
                        <div>
                            安心・安全な場を保つため、投稿前に必ずAIによる内容チェックが行われます。
                            <br/>
                            カテゴリーやタグは、内容に合わせてAIが自動で設定します。
                        </div>
                    </div>

                    <input 
                        type="text" 
                        placeholder="タイトルを入力（例：体育館のボールについて）"
                        className="text-xl font-bold border-b border-gray-300 dark:border-gray-700 p-2 outline-none bg-transparent dark:text-white placeholder-gray-400"
                        value={postForm.title}
                        onChange={e => handleInputChange('title', e.target.value)}
                        required
                    />
                    
                    <textarea 
                        placeholder="ここに詳しい内容を書いてください。&#13;&#10;カテゴリーやタグは自動で設定されるので、内容だけ書けばOKです！"
                        className="flex-1 min-h-[200px] p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-none outline-none dark:text-white resize-none"
                        value={postForm.content}
                        onChange={e => handleInputChange('content', e.target.value)}
                        required
                    ></textarea>

                    {/* AI Assistant Area - Enhanced */}
                    <div className={`p-5 rounded-xl border-2 transition-all duration-300 ${
                        isAIApproved 
                            ? 'bg-green-50 border-green-500/50 dark:bg-green-900/20 dark:border-green-500/50' 
                            : aiAnalysis && !aiAnalysis.loading 
                                ? 'bg-red-50 border-red-500/50 dark:bg-red-900/20 dark:border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' // Error state
                                : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                    }`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                                <h4 className={`font-bold text-lg flex items-center gap-2 mb-1 ${
                                    isAIApproved 
                                        ? 'text-green-700 dark:text-green-400' 
                                        : aiAnalysis && !aiAnalysis.loading
                                            ? 'text-red-700 dark:text-red-400'
                                            : 'text-blue-700 dark:text-blue-400'
                                }`}>
                                    <span className="material-icons-round text-2xl">
                                        {isAIApproved ? 'check_circle' : (aiAnalysis && !aiAnalysis.loading ? 'report_problem' : 'psychology')}
                                    </span> 
                                    {isAIApproved 
                                        ? 'AIチェック完了' 
                                        : (aiAnalysis && !aiAnalysis.loading ? '内容の修正が必要です' : 'AIチェック')}
                                </h4>
                                
                                <p className="text-xs text-gray-500 dark:text-gray-400 ml-8">
                                    {isAIApproved 
                                        ? '内容、カテゴリー、タグが生成されました。'
                                        : (aiAnalysis && !aiAnalysis.loading 
                                            ? 'ガイドラインに抵触する可能性があるため、投稿できません。'
                                            : '投稿前に、内容の適切性、カテゴリー、タグをAIが自動判定します。')}
                                </p>
                            </div>

                            {!isAIApproved && (
                                <button 
                                    type="button"
                                    onClick={handleAIAnalyze}
                                    disabled={aiAnalysis?.loading}
                                    className={`shrink-0 ml-4 text-sm font-bold text-white px-5 py-2.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2 ${
                                        aiAnalysis && !aiAnalysis.loading 
                                            ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30' 
                                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                                    }`}
                                >
                                    {aiAnalysis?.loading && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                                    {aiAnalysis?.loading ? '分析中...' : (aiAnalysis ? '再チェック' : 'チェックする')}
                                </button>
                            )}
                        </div>
                        
                        {/* Auto Detected Info */}
                        {isAIApproved && aiAnalysis?.detectedCategory && (
                            <div className="ml-8 mb-3 flex flex-wrap gap-2">
                                <span className="bg-white dark:bg-black/20 text-green-800 dark:text-green-300 px-3 py-1 rounded text-xs font-bold border border-green-200 dark:border-green-800">
                                    📂 {aiAnalysis.detectedCategory}
                                </span>
                                {aiAnalysis.detectedTags?.map(tag => (
                                    <span key={tag} className="bg-white dark:bg-black/20 text-blue-800 dark:text-blue-300 px-3 py-1 rounded text-xs font-bold border border-blue-200 dark:border-blue-800">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        
                        {/* Advice Section */}
                        {aiAnalysis && !aiAnalysis.loading && (
                            <div className={`mt-3 p-4 rounded-lg text-sm leading-relaxed flex gap-3 ${
                                isAIApproved 
                                ? 'bg-green-100/50 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                : 'bg-red-100/50 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium'
                            }`}>
                                <span className="material-icons-round text-lg shrink-0 mt-0.5">
                                    {isAIApproved ? 'tips_and_updates' : 'info'}
                                </span>
                                <div>
                                    <div className="font-bold mb-1 opacity-80">AIからのアドバイス:</div>
                                    {aiAnalysis.advice}
                                </div>
                            </div>
                        )}
                        
                        {!aiAnalysis && (
                            <div className="mt-2 ml-1 text-sm text-gray-600 dark:text-gray-400 pl-7 border-l-2 border-blue-200 dark:border-blue-800">
                                タイトルと内容を入力後、チェックボタンを押してください。
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4 border-t dark:border-gray-700 min-h-[60px]">
                        {isAIApproved && (
                            <button type="submit" className="bg-primary hover:bg-primary-light text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all hover:scale-105 animate-bounce">
                                この内容で投稿する
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedProposal && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-bg-cardDark w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="bg-primary text-white p-4 flex justify-between items-center">
                      <h2 className="font-bold text-lg truncate pr-4">{selectedProposal.title}</h2>
                      <button onClick={() => setSelectedProposalId(null)} className="text-white hover:bg-white/20 rounded-full p-1"><span className="material-icons-round">close</span></button>
                  </div>
                  
                  <div className="overflow-y-auto p-6">
                      {/* Stepper */}
                      <div className="relative flex justify-between items-center mb-8 px-4">
                          <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 dark:bg-gray-700 -z-10 -translate-y-1/2"></div>
                          {STATUS_STEPS.map((step, idx) => {
                              const currentIdx = STATUS_STEPS.indexOf(selectedProposal.status);
                              const isActive = idx <= currentIdx;
                              const isCurrent = idx === currentIdx;
                              return (
                                  <div key={step} className="flex flex-col items-center bg-white dark:bg-bg-cardDark px-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 border-2 transition-colors ${isActive ? 'bg-primary border-primary text-white' : 'bg-gray-100 border-gray-300 text-gray-400'}`}>
                                          {isActive ? <span className="material-icons-round text-sm">check</span> : idx + 1}
                                      </div>
                                      <span className={`text-[10px] font-bold ${isCurrent ? 'text-primary' : 'text-gray-400'}`}>{step}</span>
                                  </div>
                              );
                          })}
                      </div>

                      <div className="flex gap-2 mb-4">
                          <StatusBadge status={selectedProposal.status} />
                          <span className="text-sm text-gray-500 flex items-center gap-1"><span className="material-icons-round text-sm">folder</span> {selectedProposal.category}</span>
                      </div>

                      <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed mb-8 text-lg">
                          {selectedProposal.content}
                      </div>

                      {/* Admin Response */}
                      {selectedProposal.adminResponse && (
                          <div className="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-primary p-4 rounded mb-6">
                              <h4 className="font-bold text-primary dark:text-primary-light flex items-center gap-2 mb-2">
                                  <span className="material-icons-round">verified</span> 生徒会からのコメント
                              </h4>
                              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedProposal.adminResponse}</p>
                          </div>
                      )}

                      {/* Admin Controls */}
                      {user?.role === 'admin' && (
                          <div className="bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-6">
                              <h4 className="font-bold text-gray-500 text-sm mb-3">🔧 管理者メニュー</h4>
                              <div className="flex flex-col gap-3">
                                  <select 
                                    className="p-2 rounded border bg-white dark:bg-gray-700 dark:text-white"
                                    value={selectedProposal.status}
                                    onChange={(e) => updateAdminStatus(selectedProposal.id, e.target.value as any, selectedProposal.adminResponse)}
                                  >
                                      {STATUS_STEPS.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <textarea 
                                    className="p-2 rounded border bg-white dark:bg-gray-700 dark:text-white h-20"
                                    placeholder="生徒会からのコメントを入力..."
                                    value={selectedProposal.adminResponse}
                                    onChange={(e) => updateAdminStatus(selectedProposal.id, selectedProposal.status, e.target.value)}
                                  />
                              </div>
                          </div>
                      )}

                      <hr className="border-gray-100 dark:border-gray-800 mb-6" />

                      {/* Signatures & Action */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="font-bold text-primary text-xl">
                            🎉 現在の賛同数: <span className="text-3xl">{selectedProposal.signatures.length}</span> 人
                        </div>
                        <button 
                            onClick={() => toggleSignature(selectedProposal.id)}
                            className={`px-6 py-3 rounded-full font-bold shadow-md transition-all flex items-center gap-2 ${
                                user && selectedProposal.signatures.some(s => s.userId === user.id)
                                ? 'bg-pink-100 text-pink-600 border border-pink-300'
                                : 'bg-primary text-white hover:bg-primary-light hover:scale-105'
                            }`}
                        >
                             {user && selectedProposal.signatures.some(s => s.userId === user.id) ? (
                                 <>✅ 賛同済み (取消)</>
                             ) : (
                                 <>👍 この意見に賛同する</>
                             )}
                        </button>
                      </div>

                      {/* Signature List */}
                      {selectedProposal.signatures.length > 0 && (
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                              <h5 className="font-bold text-gray-500 text-sm mb-2">賛同した生徒</h5>
                              <div className="flex flex-wrap gap-2">
                                  {selectedProposal.signatures.map((sig, i) => (
                                      <span key={i} className="text-xs bg-white dark:bg-gray-700 px-2 py-1 rounded border dark:border-gray-600 text-gray-600 dark:text-gray-300">
                                          {sig.userName}
                                      </span>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* News Modal (Admin) */}
      {isNewsModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-bg-cardDark w-full max-w-md rounded-xl p-6">
                  <h3 className="font-bold text-lg mb-4 dark:text-white">📢 お知らせを投稿</h3>
                  <form onSubmit={handleNewsSubmit} className="flex flex-col gap-4">
                      <input 
                        type="text" 
                        placeholder="タイトル" 
                        className="border p-2 rounded dark:bg-gray-700 dark:text-white"
                        value={newsForm.title}
                        onChange={e => setNewsForm({...newsForm, title: e.target.value})}
                        required
                      />
                      <textarea 
                        placeholder="内容" 
                        className="border p-2 rounded h-32 dark:bg-gray-700 dark:text-white"
                        value={newsForm.content}
                        onChange={e => setNewsForm({...newsForm, content: e.target.value})}
                        required
                      />
                      <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setIsNewsModalOpen(false)} className="px-4 py-2 text-gray-500">キャンセル</button>
                          <button type="submit" className="bg-primary text-white px-4 py-2 rounded font-bold">公開</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;