import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation } from 'react-router-dom';

export const PublicChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const location = useLocation();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Welcome message when opening for the first time
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { 
          role: 'assistant', 
          content: "👋 Bonjour ! Je suis l'assistant IA de Babipass.\n\nPosez-moi vos questions sur nos événements en cours, les tarifs ou les parkings. Comment puis-je vous aider ?" 
        }
      ]);
    }
  }, [isOpen]);

  // Hide on dashboard routes — MUST be after all hooks
  if (location.pathname.startsWith('/admin') || 
      location.pathname.startsWith('/organizer') || 
      location.pathname.startsWith('/agent')) {
    return null;
  }

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      let pageContext = `Le visiteur est sur la page: ${document.title} (${window.location.pathname})`;
      
      const response = await fetch('https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages.filter(m => m.role !== 'system'),
          pageContext: pageContext 
        })
      });

      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Désolé, je rencontre des difficultés techniques pour vous répondre en ce moment. Vous pouvez également nous contacter via nos réseaux sociaux." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans">
      {/* Bouton d'ouverture */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-105 hover:shadow-purple-500/50 transition-all duration-300 animate-bounce hover:animate-none"
        >
          <Sparkles className="absolute -top-1 -right-1 text-amber-300 w-5 h-5 animate-pulse" />
          <MessageCircle size={28} className="group-hover:rotate-12 transition-transform duration-300" />
        </button>
      )}

      {/* Fenêtre de Chat */}
      {isOpen && (
        <div className="w-[350px] sm:w-[400px] h-[500px] max-h-[85vh] bg-slate-900 border border-slate-700/50 shadow-2xl shadow-purple-900/20 rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300 origin-bottom-right">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-800 to-indigo-900 p-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
                  <Sparkles size={20} className="text-purple-300" />
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-indigo-900 rounded-full"></div>
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Assistant Babipass</h3>
                <p className="text-purple-200 text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  En ligne - IA Babipass
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50 overflow-x-hidden relative">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-purple-600 text-white rounded-br-sm' 
                      : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                     <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline">
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                         {msg.content}
                       </ReactMarkdown>
                     </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                   <div className="flex space-x-1">
                     <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                     <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                     <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div>
                   </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
            <form onSubmit={handleSend} className="flex items-end gap-2 bg-slate-800 border border-slate-700 rounded-2xl p-1 focus-within:border-purple-500/50 transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question..."
                className="flex-1 bg-transparent text-white text-sm border-none outline-none resize-none max-h-32 min-h-[40px] py-2.5 px-3 scrollbar-thin"
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 flex shrink-0 items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-xl disabled:opacity-50 disabled:hover:bg-purple-600 transition-colors mb-0.5 mr-0.5"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
              </button>
            </form>
            <div className="text-center mt-2">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest">Propulsé par Babipass AI</span>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
};
