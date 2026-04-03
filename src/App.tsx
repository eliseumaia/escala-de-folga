import React, { useState, useEffect } from 'react';
import { 
  Calendar, Printer, Users, UserPlus, 
  Trash2, Edit2, Check, X, Building, ChefHat, Utensils, MessageSquare, Send,
  CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, addDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from './lib/supabase';

// --- Types ---
type Funcionario = { id: string; nome: string; loja: string; setor: string; departamento: string };
type StatusOption = { id: string; label: string; short: string; colorClass: string; textColor: string };
type Mensagem = { id: string; texto: string; autor: string; data: string; loja?: string; mes_ano?: string };
type User = {
  id: string;
  username: string;
  password?: string;
  nome: string;
  role: 'MASTER' | 'NORMAL';
  loja?: string;
};

// --- Constants ---
const lojas = ['Do Sul', 'Porto Alegre', 'Porto Alegrense'];

const statusOpcoes: StatusOption[] = [
  { id: 'trabalha', label: 'Trabalha', short: '', colorClass: 'bg-transparent hover:bg-slate-100', textColor: 'text-slate-400' },
  { id: 'folga', label: 'Folga', short: 'F', colorClass: 'bg-indigo-100 hover:bg-indigo-200 border-indigo-200', textColor: 'text-indigo-700' },
  { id: 'banco_horas', label: 'Banco de Horas', short: 'BH', colorClass: 'bg-violet-100 hover:bg-violet-200 border-violet-200', textColor: 'text-violet-700' },
  { id: 'atestado', label: 'Atestado', short: 'AT', colorClass: 'bg-rose-100 hover:bg-rose-200 border-rose-200', textColor: 'text-rose-700' },
  { id: 'suspensao', label: 'Suspensão', short: 'SP', colorClass: 'bg-amber-100 hover:bg-amber-200 border-amber-200', textColor: 'text-amber-800' },
  { id: 'ferias', label: 'Férias', short: 'FE', colorClass: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-200', textColor: 'text-emerald-700' },
];

// --- Helper Components ---
const Avatar = ({ nome }: { nome: string }) => {
  const initials = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shadow-sm">
      {initials}
    </div>
  );
};

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Main Selections
  const [lojaSelecionada, setLojaSelecionada] = useState<string>('Do Sul');
  const [deptoSelecionado, setDeptoSelecionado] = useState<string>('SALÃO');
  const [mesSelecionado, setMesSelecionado] = useState<Date>(new Date());
  
  // Data States
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [setoresSalao, setSetoresSalao] = useState<string[]>([]);
  const [setoresCozinha, setSetoresCozinha] = useState<string[]>([]);
  const [escala, setEscala] = useState<Record<string, string>>({});
  
  // Chat States
  const [mensagens, setMensagens] = useState<Record<string, Mensagem[]>>({});
  const [novaMensagem, setNovaMensagem] = useState('');

  // Admin / Management States
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [listaUsuarios, setListaUsuarios] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newFunc, setNewFunc] = useState({ nome: '', setor: '', departamento: 'SALÃO', turno: '' });
  const [editingFunc, setEditingFunc] = useState<Funcionario | null>(null);
  const [tempUserForm, setTempUserForm] = useState({ username: '', password: '' });

  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Computed Values
  const currentMesAno = format(mesSelecionado, 'yyyy-MM');
  const currentMessageKey = `chat-${lojaSelecionada}-${currentMesAno}`;
  const threadAtual = mensagens[currentMessageKey] || [];
  const currentSetores = deptoSelecionado === 'SALÃO' ? setoresSalao : setoresCozinha;
  const setCurrentSetores = deptoSelecionado === 'SALÃO' ? setSetoresSalao : setSetoresCozinha;
  const funcionariosFiltrados = funcionarios.filter(f => f.loja === lojaSelecionada && f.departamento === deptoSelecionado);
  const diasNoMes = getDaysInMonth(mesSelecionado);
  const dias = Array.from({ length: diasNoMes }, (_, i) => addDays(startOfMonth(mesSelecionado), i));
  const lojasAcessiveis = user?.role === 'MASTER' ? lojas : lojas.filter(l => l === user?.loja);

  // --- Effects ---
  useEffect(() => {
    if (!user) return;
    loadInitialData();
    const channel = subscribeRealtime();
    
    // Automatic cleanup of messages > 7 days (Master only)
    if (user.role === 'MASTER') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      supabase.from('mensagens').delete().lt('data', sevenDaysAgo.toISOString()).then(() => {
        console.log('Mensagens antigas apagadas');
      });
    }

    return () => { channel.unsubscribe(); };
  }, [user, lojaSelecionada, currentMesAno, deptoSelecionado]);

  // --- Supabase Functions ---
  const loadInitialData = async () => {
    setIsSyncing(true);
    try {
      // 1. Funcionários
      const { data: funcs } = await supabase
        .from('funcionarios')
        .select('*')
        .eq('loja', lojaSelecionada)
        .eq('departamento', deptoSelecionado);
      if (funcs) setFuncionarios(funcs);

      // 2. Setores
      const { data: sets } = await supabase
        .from('setores')
        .select('*')
        .eq('loja', lojaSelecionada)
        .eq('departamento', deptoSelecionado);
      if (sets) {
         const nomesRaw = sets.map((s: any) => s.nome);
         if (deptoSelecionado === 'SALÃO') setSetoresSalao(nomesRaw);
         else setSetoresCozinha(nomesRaw);
      }

      // 3. Escala
      const { data: esc } = await supabase
        .from('escala')
        .select('*')
        .eq('mes_ano', currentMesAno);
      if (esc) {
         const mapped: Record<string, string> = {};
         esc.forEach((item: any) => {
           mapped[`${item.func_id}-${item.dia}`] = item.status;
         });
         setEscala(mapped);
      }

      // 4. Mensagens
      const { data: msgs } = await supabase
        .from('mensagens')
        .select('*')
        .eq('loja', lojaSelecionada)
        .eq('mes_ano', currentMesAno)
        .order('data', { ascending: true });
      if (msgs) {
        setMensagens(prev => ({ ...prev, [currentMessageKey]: msgs }));
      }

      // 5. Usuários para Gestão (Master only)
      if (user?.role === 'MASTER') {
        const { data: users } = await supabase.from('usuarios_gestao').select('*').order('username');
        if (users) setListaUsuarios(users);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const subscribeRealtime = () => {
     return supabase.channel('db-all-changes')
       .on('postgres_changes', { event: '*', schema: 'public' }, () => {
         loadInitialData(); 
       })
       .subscribe();
  };

  // --- Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setLoginError('');

    try {
      const { data: userData } = await supabase
        .from('usuarios_gestao')
        .select('*')
        .eq('username', loginForm.username)
        .eq('password', loginForm.password)
        .single();
      
      if (userData) {
        setUser(userData);
        if (userData.role === 'NORMAL' && userData.loja) {
          setLojaSelecionada(userData.loja);
        }
      } else {
        setLoginError('Usuário ou senha incorretos');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Erro de conexão ou usuário não encontrado');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => setUser(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim()) return;
    
    const msgData = {
      texto: novaMensagem.trim(),
      autor: user?.role === 'MASTER' ? 'Adm' : 'Local',
      data: new Date().toISOString(),
      loja: lojaSelecionada,
      mes_ano: currentMesAno
    };
    
    setIsSyncing(true);
    setNovaMensagem('');

    try {
      const { error } = await supabase.from('mensagens').insert(msgData);
      if (error) throw error;
    } catch (err: any) {
      console.error('Erro no chat:', err);
      setLastSyncError('Falha ao enviar mensagem');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('usuarios_gestao')
        .update({ 
          username: tempUserForm.username, 
          password: tempUserForm.password 
        })
        .eq('id', editingUser.id);
      
      if (error) throw error;
      
      setListaUsuarios(prev => prev.map(u => u.id === editingUser.id ? { ...u, username: tempUserForm.username, password: tempUserForm.password } : u));
      setEditingUser(null);
      alert('Acesso atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar acesso.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStatusClick = async (funcId: string, dia: number) => {
    const currentStatus = escala[`${funcId}-${dia}`] || 'trabalha';
    const currentIndex = statusOpcoes.findIndex(s => s.id === currentStatus);
    const nextIndex = (currentIndex + 1) % statusOpcoes.length;
    const nextStatus = statusOpcoes[nextIndex].id;

    setEscala(prev => ({ ...prev, [`${funcId}-${dia}`]: nextStatus }));
    setIsSyncing(true);

    try {
      if (nextStatus === 'trabalha') {
         await supabase.from('escala').delete()
          .eq('func_id', funcId)
          .eq('dia', dia)
          .eq('mes_ano', currentMesAno);
      } else {
         await supabase.from('escala').upsert({
           func_id: funcId,
           dia,
           mes_ano: currentMesAno,
           status: nextStatus
         }, { onConflict: 'func_id,dia,mes_ano' });
      }
    } catch (err) {
      console.error('Erro ao salvar escala:', err);
      setLastSyncError('Erro ao sincronizar escala');
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusInfo = (funcId: string, dia: number) => {
    const statusId = escala[`${funcId}-${dia}`] || 'trabalha';
    return statusOpcoes.find(s => s.id === statusId) || statusOpcoes[0];
  };

  // Setor management
  const [editingSetorIdx, setEditingSetorIdx] = useState<number | null>(null);
  const [editSetorTempName, setEditSetorTempName] = useState<string>('');

  const saveSetorName = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingSetorIdx(null);
      return;
    }
    
    setIsSyncing(true);
    try {
      await supabase.from('setores').update({ nome: trimmed })
        .eq('nome', oldName)
        .eq('loja', lojaSelecionada)
        .eq('departamento', deptoSelecionado);
      
      setCurrentSetores(prev => prev.map(s => s === oldName ? trimmed : s));
      setFuncionarios(prev => prev.map(f => 
        (f.setor === oldName && f.departamento === deptoSelecionado) ? { ...f, setor: trimmed } : f
      ));
    } finally {
      setEditingSetorIdx(null);
      setIsSyncing(false);
    }
  };

  const [newSetorName, setNewSetorName] = useState('');
  const handleAddSetor = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSetorName.trim().toUpperCase();
    if (!trimmed || currentSetores.includes(trimmed)) return;
    
    await supabase.from('setores').insert({ 
      nome: trimmed, 
      departamento: deptoSelecionado, 
      loja: lojaSelecionada 
    });
    
    setCurrentSetores(prev => [...prev, trimmed]);
    setNewSetorName('');
  };


  useEffect(() => {
     if (isManageModalOpen) {
       setNewFunc(prev => ({ 
         ...prev, 
         departamento: deptoSelecionado,
         setor: (deptoSelecionado === 'SALÃO' ? setoresSalao : setoresCozinha)[0] || ''
       }));
     }
  }, [isManageModalOpen, deptoSelecionado, setoresSalao, setoresCozinha]);

  const handleAddFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDepto = newFunc.departamento || deptoSelecionado;
    const sectors = targetDepto === 'SALÃO' ? setoresSalao : setoresCozinha;
    const targetSetor = newFunc.setor || sectors[0] || '';
    
    if (!newFunc.nome || !targetSetor) return;
    
    if (editingFunc) {
      // Update logic
      const payload = {
        nome: newFunc.nome,
        setor: targetSetor,
        departamento: targetDepto,
        turno: newFunc.turno,
        loja: lojaSelecionada
      };
      
      const { error } = await supabase.from('funcionarios').update(payload).eq('id', editingFunc.id);
      if (!error) {
        setFuncionarios(prev => prev.map(f => f.id === editingFunc.id ? { ...f, ...payload } : f));
        setEditingFunc(null);
        setNewFunc({ nome: '', setor: sectors[0] || '', departamento: targetDepto, turno: '' });
      }
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const payload = {
      id,
      nome: newFunc.nome,
      loja: lojaSelecionada,
      setor: targetSetor,
      departamento: targetDepto,
      turno: newFunc.turno
    };

    await supabase.from('funcionarios').insert(payload);
    setFuncionarios([...funcionarios, payload]);
    setNewFunc({ nome: '', setor: sectors[0] || '', departamento: targetDepto, turno: '' });
  };

  const handleDeleteFunc = async (id: string) => {
    await supabase.from('funcionarios').delete().eq('id', id);
    setFuncionarios(prev => prev.filter(f => f.id !== id));
  };
  
  const handleDeleteSetor = async (setorName: string) => {
    await supabase.from('setores').delete()
      .eq('nome', setorName)
      .eq('loja', lojaSelecionada)
      .eq('departamento', deptoSelecionado);
    
    setCurrentSetores(prev => prev.filter(s => s !== setorName));
    setFuncionarios(prev => prev.filter(f => !(f.setor === setorName && f.departamento === deptoSelecionado)));
  };

  // --- Render ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-indigo-600 p-8 text-center">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30 shadow-lg">
                <ChefHat className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">ESCALA DE FOLGA</h1>
              <p className="text-indigo-100 text-sm mt-1 font-medium opacity-80 italic">Sistema de Gestão de Equipe</p>
            </div>
            
            <form onSubmit={handleLogin} className="p-8 space-y-5">
              {loginError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-shake">
                  <X className="w-4 h-4" /> {loginError}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Usuário</label>
                <div className="relative">
                  <Users className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Seu usuário"
                    value={loginForm.username}
                    onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Senha</label>
                <div className="relative">
                  <Check className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="password" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSyncing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Acessar Sistema'}
              </button>
            </form>
          </div>
          <p className="text-center text-slate-500 text-xs mt-8">© 2024 Gestão de Escalas • Todos os direitos reservados</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans print:bg-white print:p-0">
      
      {/* Modals */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm print:hidden p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Equipe e Setores ({deptoSelecionado})
              </h2>
              <button onClick={() => setIsManageModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <form onSubmit={handleAddFuncionario} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    {editingFunc ? <Edit2 className="w-4 h-4 text-emerald-500" /> : <UserPlus className="w-4 h-4 text-indigo-500" />}
                    {editingFunc ? 'Editar Integrante' : 'Adicionar Integrante'}
                  </h3>
                  <input type="text" required placeholder="Nome Completo" className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm" value={newFunc.nome} onChange={e => setNewFunc({...newFunc, nome: e.target.value})} />
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Departamento</label>
                      <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-indigo-600" value={newFunc.departamento} onChange={e => setNewFunc({...newFunc, departamento: e.target.value, setor: (e.target.value === 'SALÃO' ? setoresSalao : setoresCozinha)[0] || ''})}>
                        <option value="SALÃO">SALÃO</option>
                        <option value="COZINHA">COZINHA</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Turno</label>
                      <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-emerald-600" value={newFunc.setor} onChange={e => setNewFunc({...newFunc, setor: e.target.value})}>
                        {(newFunc.departamento === 'SALÃO' ? setoresSalao : setoresCozinha).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button type="submit" className={`flex-1 ${editingFunc ? 'bg-emerald-600' : 'bg-indigo-600'} text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:opacity-90`}>
                      {editingFunc ? 'Salvar Alterações' : 'Cadastrar na Equipe'}
                    </button>
                    {editingFunc && (
                      <button type="button" onClick={() => { setEditingFunc(null); setNewFunc({ nome: '', setor: '', departamento: deptoSelecionado, turno: '' }); }} className="bg-slate-200 text-slate-600 px-4 py-2.5 rounded-lg text-sm font-bold">
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>

                <form onSubmit={handleAddSetor} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Building className="w-4 h-4 text-orange-500" /> Cadastrar Novo Turno</h3>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nome do Turno (Ex: MANHÃ, NOITE)</label>
                    <input type="text" required placeholder="Digite o nome do turno..." className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase font-bold" value={newSetorName} onChange={e => setNewSetorName(e.target.value)} />
                  </div>
                  <button type="submit" className="w-full bg-orange-500 text-white py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-orange-600">Criar Turno</button>
                </form>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Integrantes Cadastrados</h4>
                  <div className="border border-slate-200 rounded-xl divide-y overflow-hidden max-h-60 overflow-y-auto shadow-sm">
                    {funcionariosFiltrados.map(f => (
                      <div key={f.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Avatar nome={f.nome} />
                          <div>
                            <p className="text-sm font-bold text-slate-800">{f.nome}</p>
                            <p className="text-[10px] text-slate-500 italic uppercase font-black tracking-widest">{f.setor}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingFunc(f); setNewFunc({ nome: f.nome, setor: f.setor, departamento: f.departamento, turno: '' }); }} className="text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition" title="Editar"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteFunc(f.id)} className="text-rose-500 p-2 hover:bg-rose-50 rounded-lg transition" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Turnos Cadastrados</h4>
                  <div className="border border-slate-200 rounded-xl divide-y overflow-hidden max-h-60 overflow-y-auto">
                    {currentSetores.map(s => (
                      <div key={s} className="flex items-center justify-between p-3 bg-white hover:bg-orange-50/30">
                        <span className="text-sm font-black text-orange-600 uppercase italic">{s}</span>
                        <button onClick={() => handleDeleteSetor(s)} className="text-rose-500 p-2 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end"><button onClick={() => setIsManageModalOpen(false)} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold">Fechar</button></div>
          </div>
        </div>
      )}

      {isSettingsModalOpen && user?.role === 'MASTER' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm print:hidden p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Building className="w-5 h-5 text-indigo-600" /> Gestão de Acessos</h2>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {listaUsuarios.map(u => (
                <div key={u.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div><p className="text-sm font-bold">{u.nome}</p><p className="text-xs text-slate-500 italic">Login: {u.username} | Perfil: {u.role}</p></div>
                  {editingUser?.id === u.id ? (
                    <form onSubmit={handleUpdateCredentials} className="flex gap-2">
                      <input className="border rounded px-2 py-1 text-xs" value={tempUserForm.username} onChange={e => setTempUserForm({...tempUserForm, username: e.target.value})} placeholder="Usuário" />
                      <input className="border rounded px-2 py-1 text-xs" value={tempUserForm.password} onChange={e => setTempUserForm({...tempUserForm, password: e.target.value})} placeholder="Senha" />
                      <button type="submit" className="bg-emerald-500 text-white p-1 rounded"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setEditingUser(null)} className="bg-slate-300 p-1 rounded"><X className="w-4 h-4" /></button>
                    </form>
                  ) : (
                    <button onClick={() => { setEditingUser(u); setTempUserForm({username: u.username, password: u.password || ''}); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50"><Edit2 className="w-3.5 h-3.5" /> Editar</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isCommentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm print:hidden p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col h-[600px] max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-500" /> Mensagens</h2>
              <button onClick={() => setIsCommentsModalOpen(false)} className="text-slate-400 p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-3">
              {threadAtual.length === 0 ? <p className="text-center text-slate-400 text-sm mt-20">Sem mensagens.</p> : threadAtual.map(msg => (
                <div key={msg.id} className="bg-white border rounded-xl p-3 shadow-sm">
                  <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-indigo-600">{msg.autor}</span><span className="text-[10px] text-slate-400">{format(new Date(msg.data), "dd/MM HH:mm")}</span></div>
                  <p className="text-sm text-slate-700">{msg.texto}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
              <input type="text" className="flex-1 bg-slate-50 border rounded-xl px-4 py-2 text-sm outline-none" placeholder="Digite aqui..." value={novaMensagem} onChange={e => setNovaMensagem(e.target.value)} />
              <button type="submit" className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700"><Send className="w-4 h-4" /></button>
            </form>
          </div>
        </div>
      )}

      {/* Main Dashboard */}
      <div className="max-w-[1600px] mx-auto p-4 sm:p-8 space-y-6 print:p-0 print:m-0 w-full">
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 print:hidden">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Escala de Folga</h1>
            <p className="text-slate-500 font-medium">Controle de jornadas e folgas do time.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
            {isSyncing ? <><RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" /><span className="text-xs font-bold text-slate-600">Sincronizando...</span></> : lastSyncError ? <><AlertCircle className="w-4 h-4 text-rose-500" /><span className="text-xs font-bold text-rose-600 truncate max-w-[100px]">{lastSyncError}</span></> : <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-xs font-bold text-emerald-600">Nuvem Sincronizada</span></>}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="bg-white p-1 rounded-xl shadow-sm border flex items-center">
              <button onClick={() => setDeptoSelecionado('SALÃO')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${deptoSelecionado === 'SALÃO' ? 'bg-orange-500 text-white' : 'text-slate-500'}`}><Utensils className="w-4 h-4" /> SALÃO</button>
              <button onClick={() => setDeptoSelecionado('COZINHA')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${deptoSelecionado === 'COZINHA' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}><ChefHat className="w-4 h-4" /> COZINHA</button>
            </div>
            <div className="bg-white p-1 rounded-xl shadow-sm border flex gap-1">
              {lojasAcessiveis.map(l => <button key={l} onClick={() => setLojaSelecionada(l)} className={`px-4 py-2 rounded-lg text-sm font-bold ${lojaSelecionada === l ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{l}</button>)}
            </div>
            {user.role === 'MASTER' && (
              <button onClick={() => setIsSettingsModalOpen(true)} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 shadow-sm flex items-center gap-2 text-emerald-600"><Edit2 className="w-4 h-4" /> Acessos</button>
            )}
            <button onClick={() => setIsManageModalOpen(true)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 shadow-sm flex items-center gap-2 text-indigo-600"><Users className="w-4 h-4" /> Equipe</button>
            <button onClick={() => setIsCommentsModalOpen(true)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 shadow-sm flex items-center gap-2 relative">
              <MessageSquare className="w-4 h-4 text-indigo-600" /> Mensagens
              {threadAtual.length > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{threadAtual.length}</span>}
            </button>
            <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 flex items-center gap-2"><Printer className="w-4 h-4" /> Imprimir</button>
            <button onClick={handleLogout} className="p-2.5 bg-white border border-slate-200 text-rose-500 rounded-xl hover:bg-rose-50 shadow-sm"><X className="w-5 h-5" /></button>
          </div>
        </header>

        <div className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col xl:flex-row gap-6 print:hidden">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <input type="month" className="bg-slate-50 border rounded-lg px-3 py-1.5 text-sm font-bold" value={format(mesSelecionado, 'yyyy-MM')} onChange={e => setMesSelecionado(new Date(e.target.value + '-02'))} />
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOpcoes.filter(s => s.id !== 'trabalha').map(s => (
              <div key={s.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold ${s.colorClass.replace('hover:', '')} ${s.textColor}`}>{s.short} - {s.label}</div>
            ))}
          </div>
        </div>

        <div className="hidden print:block text-center mt-2 mb-4">
          <h2 className="text-lg font-black uppercase tracking-widest">{deptoSelecionado} • {lojaSelecionada} • {format(mesSelecionado, "MMMM / yyyy", { locale: ptBR })}</h2>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden print:border-none print:shadow-none w-full">
          <div className="overflow-x-auto w-full print:overflow-visible">
            <table className="w-full text-sm text-left print:table-auto border-collapse">
              <thead className="bg-slate-50 print:bg-white border-b">
                <tr>
                  <th className="px-5 py-4 font-bold uppercase text-[10px] tracking-wider sticky left-0 z-10 w-48 border-r bg-slate-50 print:bg-white print:relative print:border print:w-auto">NOME</th>
                  {dias.map((dia, idx) => (
                    <th key={idx} className={`min-w-[40px] p-2 border-r text-center ${dia.getDay() === 0 ? 'bg-violet-100/80 print-sunday' : dia.getDay() === 6 ? 'bg-slate-100/50' : ''}`}>
                      <div className="flex flex-col"><span className={`text-[9px] font-bold uppercase ${isToday(dia) ? 'text-indigo-600' : 'text-slate-400 print:text-black'}`}>{format(dia, 'EE', { locale: ptBR }).substring(0,1)}</span><span className={`text-sm font-black ${isToday(dia) ? 'text-indigo-600' : 'text-slate-700 print:text-black'}`}>{format(dia, 'dd')}</span></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentSetores.map((setorNome, setorIdx) => {
                  const funcs = funcionariosFiltrados.filter(f => f.setor === setorNome);
                  if (funcs.length === 0) return null;
                  return (
                    <React.Fragment key={setorIdx}>
                      <tr className="bg-slate-100/90 group print:bg-slate-50 border-y-2 border-slate-200">
                        <td colSpan={diasNoMes + 1} className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-5 bg-orange-500 rounded-full" />
                            <div className="flex flex-1 justify-between items-center">
                              {editingSetorIdx === setorIdx ? (
                                <div className="flex gap-2 w-full max-w-sm">
                                  <input autoFocus className="w-full border rounded px-2 py-1 text-sm font-black outline-none uppercase" value={editSetorTempName} onChange={e => setEditSetorTempName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') saveSetorName(setorNome, editSetorTempName); if(e.key === 'Escape') setEditingSetorIdx(null); }} />
                                  <button onClick={() => saveSetorName(setorNome, editSetorTempName)} className="text-emerald-600"><Check className="w-5 h-5" /></button>
                                  <button onClick={() => setEditingSetorIdx(null)}><X className="w-5 h-5" /></button>
                                </div>
                              ) : (
                                <>
                                  <h3 className="text-xs font-black tracking-widest text-slate-700 uppercase italic">TURNO: {setorNome}</h3>
                                  <button onClick={() => { setEditSetorTempName(setorNome); setEditingSetorIdx(setorIdx); }} className="opacity-0 group-hover:opacity-100 print:hidden absolute right-0"><Edit2 className="w-3.5 h-3.5 text-slate-400" /></button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {funcs.map(func => (
                        <tr key={func.id} className="hover:bg-slate-50/50 transition-colors group/row">
                          <td className="px-4 py-2 sticky left-0 bg-white group-hover/row:bg-slate-50/95 z-10 border-r border-l print:bg-white print:relative print:border shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center gap-2.5">
                              <div className="print:hidden">
                                <Avatar nome={func.nome} />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 print:text-black text-[12.5px] truncate max-w-[130px] print:max-w-none">
                                  {func.nome}
                                </span>
                              </div>
                            </div>
                          </td>
                          {dias.map((dia, idx) => {
                             const status = getStatusInfo(func.id, idx + 1);
                             const hasStatus = status.id !== 'trabalha';
                             const isSunday = dia.getDay() === 0;
                             return (
                               <td key={idx} className={`p-0 border-r text-center ${status.colorClass.replace('hover:', '').replace('bg-', 'print:bg-')} ${isSunday ? 'bg-violet-50/60 print-sunday' : ''}`}>
                                 <div className="hidden print:flex items-center justify-center font-black text-black text-[10px] h-8 w-full print-status-text">
                                   {hasStatus ? status.short : ''}
                                 </div>
                                 <button onClick={() => handleStatusClick(func.id, idx + 1)} className={`w-full h-10 print:hidden flex items-center justify-center font-bold text-xs ${status.textColor}`}>
                                   {hasStatus ? status.short : <span className="opacity-0 group-hover/row:opacity-100 text-lg font-light">+</span>}
                                 </button>
                               </td>
                             );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
